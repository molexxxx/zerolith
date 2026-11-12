import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type LoaderContext, type ResourceStatus, ZerolithError, effect, resource, scope, signal } from "zerolith";

/** Lets the promise reactions of a settled run happen. */
async function settle(): Promise<void>
{
    for (let turn = 0; turn < 4; turn += 1)
    {
        await new Promise<void>((resolve) => queueMicrotask(resolve));
    }
}

/** A loader whose runs fail with the given messages, in order, then resolve with `result`. */
function failingThen(messages: string[], result: string): ReturnType<typeof vi.fn<() => Promise<string>>>
{
    const failures = [...messages];
    return vi.fn(() =>
    {
        const message = failures.shift();
        return message === undefined ? Promise.resolve(result) : Promise.reject(new Error(message));
    });
}

/** A loader that never settles on its own, recording each run's signal. */
function hanging(signals: AbortSignal[]): (context: LoaderContext<unknown>) => Promise<string>
{
    return ({ abort }) =>
    {
        signals.push(abort);
        return new Promise<string>(() => undefined);
    };
}

/** The fake times, from now, at which each run of `loader` starts within the next `ms` milliseconds, counting one already made as 0. */
async function startsWithin(loader: ReturnType<typeof vi.fn>, ms: number): Promise<number[]>
{
    const starts: number[] = [];
    let seen = loader.mock.calls.length;
    if (seen > 0)
    {
        starts.push(0);
    }
    for (let now = 1; now <= ms; now += 1)
    {
        await vi.advanceTimersByTimeAsync(1);
        await settle();
        while (loader.mock.calls.length > seen)
        {
            seen += 1;
            starts.push(now);
        }
    }
    return starts;
}

beforeEach(() =>
{
    vi.useFakeTimers();
});

afterEach(() =>
{
    vi.useRealTimers();
});

describe("resource retry", () =>
{
    it("runs the loader again after a failure, after a wait that doubles, counting the runs", async () =>
    {
        const loader = failingThen(["one", "two", "three"], "four");
        const value = resource({ params: () => 1, loader, retry: 3, backoff: 100 });
        expect([value.status.get(), value.attempt.get()]).toEqual(["pending", 1]);
        expect(await startsWithin(loader, 800)).toEqual([0, 100, 300, 700]);
        expect([value.status.get(), value.attempt.get(), value.get(), value.error.get()]).toEqual(["resolved", 4, "four", undefined]);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("waits 250 milliseconds before the first retry by default", async () =>
    {
        const loader = failingThen(["one"], "two");
        resource({ params: () => 1, loader, retry: 1 });
        expect(await startsWithin(loader, 300)).toEqual([0, 250]);
    });

    it("stops doubling at 30 seconds, and keeps a first wait longer than that as it is", async () =>
    {
        const short = failingThen(["1", "2", "3", "4"], "done");
        resource({ params: () => 1, loader: short, retry: 4, backoff: 10_000 });
        const long = failingThen(["1", "2"], "done");
        resource({ params: () => 1, loader: long, retry: 2, backoff: 60_000 });
        await settle();
        for (const [ms, shortRuns, longRuns] of [[9_999, 1, 1], [1, 2, 1], [20_000, 3, 1], [29_999, 3, 1], [1, 4, 2], [29_999, 4, 2], [1, 5, 2], [29_999, 5, 2], [1, 5, 3]] as const)
        {
            await vi.advanceTimersByTimeAsync(ms);
            await settle();
            expect([short.mock.calls.length, long.mock.calls.length]).toEqual([shortRuns, longRuns]);
        }
    });

    it("reports the last failure once the retries are used up, and runs no more", async () =>
    {
        const loader = failingThen(["one", "two", "three"], "never");
        const value = resource({ params: () => 1, loader, retry: 1, backoff: 10 });
        await vi.advanceTimersByTimeAsync(10);
        await settle();
        expect([value.status.get(), value.attempt.get(), (value.error.get() as Error).message]).toEqual(["error", 2, "two"]);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(loader).toHaveBeenCalledTimes(2);
    });

    it("asks retryIf whether a failure is worth another run, and reports what it throws", async () =>
    {
        const notFound = Object.assign(new Error("not found"), { status: 404 });
        const asked: [unknown, number][] = [];
        const errors = [new Error("busy"), notFound];
        const value = resource({
            params: () => 1,
            loader: () => Promise.reject(errors.shift() ?? new Error("never")),
            retry: 5,
            backoff: 10,
            retryIf: (error, attempt) =>
            {
                asked.push([error, attempt]);
                return (error as { status?: number }).status !== 404;
            }
        });
        await vi.advanceTimersByTimeAsync(100);
        await settle();
        expect(asked.map(([error, attempt]) => [(error as Error).message, attempt])).toEqual([["busy", 1], ["not found", 2]]);
        expect([value.status.get(), value.attempt.get(), value.error.get()]).toEqual(["error", 2, notFound]);
        const broken = new Error("predicate broke");
        const thrown = resource({
            params: () => 1,
            loader: () => Promise.reject(new Error("one")),
            retry: 3,
            retryIf: () =>
            {
                throw broken;
            }
        });
        await settle();
        expect([thrown.status.get(), thrown.error.get()]).toEqual(["error", broken]);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("asks retryIf only while the retry count allows", async () =>
    {
        const retryIf = vi.fn(() => true);
        resource({ params: () => 1, loader: () => Promise.reject(new Error("one")), retryIf });
        await settle();
        expect(retryIf).not.toHaveBeenCalled();
    });

    it("keeps trying when retry is Infinity, and counts a fraction down and a negative or missing number as none", async () =>
    {
        const persistent = failingThen(Array.from({ length: 12 }, (_, index) => `failure ${index}`), "finally");
        const forever = resource({ params: () => 1, loader: persistent, retry: Number.POSITIVE_INFINITY, backoff: 0 });
        await vi.advanceTimersByTimeAsync(100);
        await settle();
        expect([forever.status.get(), forever.attempt.get(), forever.get()]).toEqual(["resolved", 13, "finally"]);
        for (const [retry, runs] of [[2.7, 3], [-1, 1], [Number.NaN, 1], [Number.NEGATIVE_INFINITY, 1]] as const)
        {
            const loader = failingThen(["1", "2", "3", "4"], "never");
            const value = resource({ params: () => 1, loader, retry, backoff: 0 });
            await vi.advanceTimersByTimeAsync(100);
            await settle();
            expect([retry, loader.mock.calls.length, value.status.get()]).toEqual([retry, runs, "error"]);
        }
    });

    it("holds a wait longer than a timer can at the timer's limit instead of firing at once", async () =>
    {
        const loader = failingThen(["one"], "two");
        resource({ params: () => 1, loader, retry: 1, backoff: 3e9 });
        await settle();
        await vi.advanceTimersByTimeAsync(2_147_483_646);
        expect(loader).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(loader).toHaveBeenCalledTimes(2);
    });

    it("waits 250 milliseconds for a backoff that is negative or not a number", async () =>
    {
        for (const backoff of [Number.NaN, -5])
        {
            const loader = failingThen(["one"], "two");
            resource({ params: () => 1, loader, retry: 1, backoff });
            expect(await startsWithin(loader, 260)).toEqual([0, 250]);
        }
    });

    it("drops a waiting retry when the params change, on reload, and when the owner is disposed", async () =>
    {
        const id = signal(1);
        const loader = failingThen(["one", "two"], "fine");
        const value = resource({ params: () => id.get(), loader, retry: 2, backoff: 100 });
        await settle();
        expect(vi.getTimerCount()).toBe(1);
        id.set(2);
        expect(vi.getTimerCount()).toBe(0);
        expect(loader).toHaveBeenLastCalledWith(expect.objectContaining({ params: 2 }));
        expect(value.attempt.get()).toBe(1);
        await settle();
        expect(vi.getTimerCount()).toBe(1);
        value.reload();
        expect(vi.getTimerCount()).toBe(0);
        expect(value.attempt.get()).toBe(1);
        await settle();
        expect(value.get()).toBe("fine");
        const later = failingThen(["one"], "fine");
        const handle = scope(() => resource({ params: () => 1, loader: later, retry: 1, backoff: 100 }));
        await settle();
        handle.dispose();
        expect(vi.getTimerCount()).toBe(0);
        await vi.advanceTimersByTimeAsync(1000);
        expect(later).toHaveBeenCalledTimes(1);
    });

    it("ignores the failure of a run that newer params replaced, retrying nothing for it", async () =>
    {
        const id = signal(1);
        const seen: number[] = [];
        const statuses: ResourceStatus[] = [];
        const value = resource({
            params: () => id.get(),
            loader: ({ params, abort }) =>
            {
                seen.push(params);
                return params === 1 ? new Promise<string>((_, reject) => abort.addEventListener("abort", () => reject(abort.reason))) : Promise.resolve("two");
            },
            retry: 2,
            backoff: 100
        });
        effect(() =>
        {
            statuses.push(value.status.get());
        });
        id.set(2);
        await vi.advanceTimersByTimeAsync(1000);
        await settle();
        expect(seen).toEqual([1, 2]);
        expect([value.attempt.get(), value.get()]).toEqual([1, "two"]);
        expect(statuses).toEqual(["pending", "resolved"]);
    });

    it("starts a retry before observers of attempt run, so one that replaces the request aborts it and one that throws does not stop it", async () =>
    {
        const endpoint = signal("primary");
        const signals: [string, AbortSignal][] = [];
        const replaced = resource({
            params: () => endpoint.get(),
            loader: ({ params, abort }) =>
            {
                signals.push([params, abort]);
                return params === "primary" ? Promise.reject(new Error("down")) : new Promise<string>(() => undefined);
            },
            retry: 3,
            backoff: 10
        });
        effect(() =>
        {
            if (replaced.attempt.get() === 2 && endpoint.get() === "primary")
            {
                endpoint.set("backup");
            }
        });
        await vi.advanceTimersByTimeAsync(10);
        await settle();
        expect(signals.map(([params, abort]) => [params, abort.aborted])).toEqual([["primary", true], ["primary", true], ["backup", false]]);
        const loader = failingThen(["one"], "two");
        const value = resource({ params: () => 1, loader, retry: 1, backoff: 10 });
        effect(() =>
        {
            if (value.attempt.get() === 2)
            {
                throw new Error("observer broke");
            }
        });
        await settle();
        await expect(vi.advanceTimersByTimeAsync(10)).rejects.toThrow("observer broke");
        await settle();
        expect([loader.mock.calls.length, value.status.get(), value.get()]).toEqual([2, "resolved", "two"]);
    });

    it("resolves a loader that returns a plain value, on the first run and on a retry", async () =>
    {
        let runs = 0;
        const loader = (): Promise<string> =>
        {
            runs += 1;
            if (runs === 1)
            {
                return Promise.reject(new Error("one"));
            }
            return "cached" as unknown as Promise<string>;
        };
        const retried = resource({ params: () => 1, loader, retry: 1, backoff: 10 });
        const plain = resource({ params: () => 1, loader: () => "now" as unknown as Promise<string> });
        await vi.advanceTimersByTimeAsync(10);
        await settle();
        expect([retried.status.get(), retried.get(), plain.status.get(), plain.get()]).toEqual(["resolved", "cached", "resolved", "now"]);
    });

    it("counts attempts from 0 while idle or while params throw, and from 1 again on reload", async () =>
    {
        const id = signal<number | undefined>(undefined);
        const broken = signal(false);
        const loader = failingThen(["one"], "two");
        const value = resource({
            params: () =>
            {
                if (broken.get())
                {
                    throw new Error("no id");
                }
                return id.get();
            },
            loader,
            retry: 1,
            backoff: 10
        });
        expect(value.attempt.get()).toBe(0);
        id.set(1);
        await vi.advanceTimersByTimeAsync(10);
        await settle();
        expect([value.attempt.get(), value.get()]).toEqual([2, "two"]);
        value.reload();
        expect(value.attempt.get()).toBe(1);
        broken.set(true);
        expect([value.status.get(), value.attempt.get()]).toEqual(["error", 0]);
        broken.set(false);
        expect([value.status.get(), value.attempt.get()]).toEqual(["pending", 1]);
        id.set(undefined);
        expect([value.status.get(), value.attempt.get()]).toEqual(["idle", 0]);
    });
});

describe("resource timeout", () =>
{
    it("fails a run that passes the timeout with resource_timed_out, the reason its signal aborts with, and gives each run its own", async () =>
    {
        const signals: AbortSignal[] = [];
        const loader = vi.fn(hanging(signals));
        const value = resource({ params: () => 1, loader, timeout: 50, retry: 1, backoff: 10 });
        await vi.advanceTimersByTimeAsync(49);
        expect(signals[0]?.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(signals[0]?.aborted).toBe(true);
        expect(value.status.get()).toBe("pending");
        await vi.advanceTimersByTimeAsync(9);
        expect(loader).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect([loader.mock.calls.length, value.attempt.get()]).toEqual([2, 2]);
        await vi.advanceTimersByTimeAsync(49);
        expect(signals[1]?.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await settle();
        expect(signals[1]?.aborted).toBe(true);
        const failure = value.error.get() as ZerolithError;
        expect(failure).toBeInstanceOf(ZerolithError);
        expect([value.status.get(), failure.diagnostic.code, failure.diagnostic.args]).toEqual(["error", "resource_timed_out", { ms: 50 }]);
        expect(failure).toBe(signals[1]?.reason);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("fails with resource_timed_out even when the loader settles in its own abort listener", async () =>
    {
        const rejecting = resource({
            params: () => 1,
            loader: ({ abort }) => new Promise<string>((_, reject) => abort.addEventListener("abort", () => reject(new Error("aborted")))),
            timeout: 50
        });
        const resolving = resource({
            params: () => 1,
            loader: ({ abort }) => new Promise<string>((resolve) => abort.addEventListener("abort", () => resolve("fallback"))),
            timeout: 50
        });
        await vi.advanceTimersByTimeAsync(50);
        await settle();
        expect((rejecting.error.get() as ZerolithError).diagnostic.code).toBe("resource_timed_out");
        expect([resolving.status.get(), resolving.get(), (resolving.error.get() as ZerolithError).diagnostic.code]).toEqual(["error", undefined, "resource_timed_out"]);
    });

    it("ignores a result that arrives after its run timed out", async () =>
    {
        const first = Promise.withResolvers<string>();
        let runs = 0;
        const value = resource({
            params: () => 1,
            loader: () =>
            {
                runs += 1;
                return runs === 1 ? first.promise : Promise.resolve("second");
            },
            timeout: 50,
            retry: 1,
            backoff: 10
        });
        await vi.advanceTimersByTimeAsync(60);
        await settle();
        expect([value.status.get(), value.get()]).toEqual(["resolved", "second"]);
        first.resolve("first, late");
        await settle();
        expect(value.get()).toBe("second");
        expect(vi.getTimerCount()).toBe(0);
    });

    it("arms a run's timeout before the loader runs, so a loader that replaces its own request leaves no timer behind", async () =>
    {
        const id = signal(1);
        const value = resource({
            params: () => id.get(),
            loader: ({ params }) =>
            {
                if (params === 1)
                {
                    id.set(2);
                }
                return new Promise<string>(() => undefined);
            },
            timeout: 1000
        });
        await settle();
        expect([value.attempt.get(), vi.getTimerCount()]).toEqual([1, 1]);
        value.reload();
        expect(vi.getTimerCount()).toBe(1);
    });

    it("clears the timeout of a run in flight when the owner is disposed, even when the loader ignores its signal", () =>
    {
        const handle = scope(() => resource({ params: () => 1, loader: () => new Promise<string>(() => undefined), timeout: 5000 }));
        expect(vi.getTimerCount()).toBe(1);
        handle.dispose();
        expect(vi.getTimerCount()).toBe(0);
    });

    it("sets no limit for a timeout that is not positive, not a number, or longer than a timer holds", async () =>
    {
        for (const timeout of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER])
        {
            const pending = Promise.withResolvers<string>();
            const value = resource({ params: () => 1, loader: () => pending.promise, timeout });
            expect([timeout, vi.getTimerCount()]).toEqual([timeout, 0]);
            pending.resolve("late but fine");
            await settle();
            expect(value.get()).toBe("late but fine");
        }
    });
});

describe("resource reload and timing", () =>
{
    it("settles as soon as the loader's promise does, in the next microtask", async () =>
    {
        const value = resource({ params: () => 1, loader: () => Promise.resolve("now") });
        await Promise.resolve();
        expect([value.status.get(), value.get()]).toEqual(["resolved", "now"]);
    });

    it("does nothing on reload while params throws, rather than load the last params that did not", async () =>
    {
        const broken = signal(false);
        const loader = vi.fn(() => Promise.resolve("value"));
        const value = resource({
            params: () =>
            {
                if (broken.get())
                {
                    throw new Error("no id");
                }
                return 7;
            },
            loader
        });
        await settle();
        broken.set(true);
        value.reload();
        await settle();
        expect([loader.mock.calls.length, value.status.get()]).toEqual([1, "error"]);
        broken.set(false);
        await settle();
        expect([loader.mock.calls.length, value.status.get()]).toEqual([2, "resolved"]);
    });

    it("runs the loader untracked on reload, so an effect that reloads does not follow what the loader reads", async () =>
    {
        const token = signal("a");
        const refresh = signal(0);
        const value = resource({ params: () => 1, loader: () => Promise.resolve(token.get()) });
        let runs = 0;
        effect(() =>
        {
            runs += 1;
            if (refresh.get() > 0)
            {
                value.reload();
            }
        });
        refresh.set(1);
        await settle();
        token.set("b");
        await settle();
        expect([runs, value.get()]).toEqual([2, "a"]);
    });
});

describe("resource abort signal", () =>
{
    it("keeps a settled run's signal live until the params change, a reload, or disposal, with or without the options", async () =>
    {
        for (const options of [{}, { timeout: 1000 }, { retry: 2 }, { timeout: 1000, retry: 2 }])
        {
            const id = signal(1);
            const closed: number[] = [];
            const handle = scope(() => resource({
                params: () => id.get(),
                loader: ({ params, abort }) =>
                {
                    abort.addEventListener("abort", () => closed.push(params));
                    return Promise.resolve(`value ${params}`);
                },
                ...options
            }));
            await settle();
            expect(closed).toEqual([]);
            id.set(2);
            await settle();
            handle.value.reload();
            await settle();
            handle.dispose();
            expect([options, closed]).toEqual([options, [1, 2, 2]]);
        }
    });

    it("aborts a failed run's signal when its retry takes over, and the last run's when the request ends, with or without a timeout", async () =>
    {
        const timed: AbortSignal[] = [];
        resource({
            params: () => 1,
            loader: ({ abort }) =>
            {
                timed.push(abort);
                return Promise.reject(new Error("down"));
            },
            timeout: 1000,
            retry: 1,
            backoff: 10
        });
        await settle();
        expect(timed[0]?.aborted).toBe(true);
        const id = signal(1);
        const shared: AbortSignal[] = [];
        resource({
            params: () => id.get(),
            loader: ({ abort }) =>
            {
                shared.push(abort);
                return Promise.reject(new Error("down"));
            },
            retry: 1,
            backoff: 10
        });
        await vi.advanceTimersByTimeAsync(10);
        await settle();
        expect(shared.map((abort) => abort.aborted)).toEqual([true, false]);
        id.set(2);
        expect(shared.slice(0, 2).map((abort) => abort.aborted)).toEqual([true, true]);
    });

    it("forwards a replaced request's abort to the run in flight", () =>
    {
        const id = signal(1);
        const signals: AbortSignal[] = [];
        resource({ params: () => id.get(), loader: hanging(signals), timeout: 1000, retry: 1 });
        id.set(2);
        expect([signals[0]?.aborted, signals[1]?.aborted]).toEqual([true, false]);
    });
});

describe("resource request replaced as a run fails", () =>
{
    it("retries nothing for a request a retryIf replaced by changing the params", async () =>
    {
        const id = signal(1);
        const seen: number[] = [];
        const handle = scope(() => resource({
            params: () => id.get(),
            loader: ({ params }) =>
            {
                seen.push(params);
                return params === 1 ? Promise.reject(new Error("one")) : new Promise<string>(() => undefined);
            },
            retry: 2,
            backoff: 100,
            retryIf: () =>
            {
                id.set(2);
                return true;
            }
        }));
        await settle();
        await vi.advanceTimersByTimeAsync(1000);
        await settle();
        expect([seen, handle.value.attempt.get(), handle.value.status.get()]).toEqual([[1, 2], 1, "pending"]);
        handle.dispose();
        expect(vi.getTimerCount()).toBe(0);
    });

    it("reports no error for a request a retryIf replaced before ending the retries", async () =>
    {
        const id = signal(1);
        const handle = scope(() => resource({
            params: () => id.get(),
            loader: ({ params }) => params === 1 ? Promise.reject(new Error("one")) : new Promise<string>(() => undefined),
            retry: 2,
            retryIf: () =>
            {
                id.set(2);
                return false;
            }
        }));
        await settle();
        expect([handle.value.status.get(), handle.value.error.get()]).toEqual(["pending", undefined]);
        handle.dispose();
    });

    it("retries nothing for a request the failed run's abort listener replaced, by new params or a reload", async () =>
    {
        for (const replace of ["params", "reload"] as const)
        {
            const id = signal(1);
            const seen: number[] = [];
            let runs = 0;
            let value: ReturnType<typeof resource<number, string>> | undefined;
            const handle = scope(() =>
            {
                value = resource({
                    params: () => id.get(),
                    loader: ({ abort }) =>
                    {
                        runs += 1;
                        const run = runs;
                        seen.push(run);
                        abort.addEventListener("abort", () =>
                        {
                            if (run === 1)
                            {
                                if (replace === "params")
                                {
                                    id.set(2);
                                }
                                else
                                {
                                    value?.reload();
                                }
                            }
                        });
                        return run === 1 ? Promise.reject(new Error("first")) : new Promise<string>(() => undefined);
                    },
                    retry: 3,
                    backoff: 50
                });
                return value;
            });
            await settle();
            await vi.advanceTimersByTimeAsync(500);
            await settle();
            expect([replace, seen, handle.value.attempt.get()]).toEqual([replace, [1, 2], 1]);
            handle.dispose();
            expect(vi.getTimerCount()).toBe(0);
        }
    });
});
