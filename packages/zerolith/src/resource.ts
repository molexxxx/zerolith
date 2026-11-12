/**
 * Async values in the reactive graph. A resource re-runs its loader when
 * the signals read by `params` change, aborts the previous request, ignores
 * stale results, runs a failed loader again when asked, and exposes the
 * outcome as signals.
 */
import { ZerolithError, diagnostic } from "./diagnostics.js";
import { type ReadableSignal, batch, computed, effect, signal, untracked } from "./signals.js";

/** The longest delay a timer holds; browsers and Node fire a longer one at once. */
const LONGEST_TIMER = 2_147_483_647;

/** The wait between retries that doubling stops at, unless the first wait is longer. */
const LONGEST_BACKOFF = 30_000;

/** The lifecycle of a resource's current request. */
export type ResourceStatus = "idle" | "pending" | "resolved" | "error";

/** What the loader receives. */
export interface LoaderContext<P>
{
    /** The value `params` returned; never undefined, because undefined skips loading. */
    params: P;
    /** Aborted when the params change, on reload, when the owning scope is disposed, when this run passes `timeout`, and when this run failed and a retry takes over. A run that succeeds keeps it live until the request ends, so a body still streaming or a listener tied to it ends with the request. */
    abort: AbortSignal;
}

/** What `resource()` takes: a tracked params function, an untracked loader, and how patient to be with it. */
export interface ResourceOptions<P, T>
{
    /** Tracked: the signals it reads decide when the loader re-runs. Returning undefined puts the resource in the idle state. */
    params: () => P | undefined;
    /** Untracked: fetches the value for the given params. A retry or a reload runs it outside any owner, so it ties cleanup to `abort`, not `onDispose`. */
    loader: (context: LoaderContext<P>) => Promise<T>;
    /** How many milliseconds one run of the loader may take: when it passes, the run fails with `resource_timed_out` and its abort signal fires with that error. No limit by default, nor for a value that is not positive or that a timer cannot hold, about 24.8 days. */
    timeout?: number;
    /** How many more runs follow a failed run before the resource reports the error: none by default, `Infinity` to keep trying, and a fraction rounds down. */
    retry?: number;
    /** How many milliseconds pass before the first retry, 250 by default and for a value that is negative or not a number; the wait doubles for each retry after it until it reaches 30 seconds. */
    backoff?: number;
    /** Whether a failed run is worth another, given what it threw and its number: true runs the loader again while `retry` allows, and every failure is by default. What it throws is reported as the error. */
    retryIf?: (error: unknown, attempt: number) => boolean;
}

/** An async value and its request state. */
export interface Resource<T> extends ReadableSignal<T | undefined>
{
    /** The last resolved value; kept while a newer request is pending. */
    get(): T | undefined;
    /** The latest request's state: `idle` while `params` returns `undefined`, `pending` while the loader runs or waits to retry, then `resolved` or `error`. */
    readonly status: ReadableSignal<ResourceStatus>;
    /** True while a request is in flight or waits to retry. */
    readonly pending: ReadableSignal<boolean>;
    /** The rejection of the latest request, or undefined. */
    readonly error: ReadableSignal<unknown>;
    /** The number of the current request's latest run: 1 for the first, one more as each retry starts, and 0 while idle or while `params` throws. */
    readonly attempt: ReadableSignal<number>;
    /** Runs the loader again with the current params, untracked; does nothing once the owner is disposed or while `params` throws. */
    reload(): void;
}

/**
 * Creates a resource owned by the current effect or scope. The resource is
 * a read-only signal of its value, so it binds in a template and drives
 * `when` and `each` like any other signal, with its request state beside it.
 */
export function resource<P, T>(options: ResourceOptions<P, T>): Resource<T>
{
    const value = signal<T | undefined>(undefined);
    const error = signal<unknown>(undefined);
    const status = signal<ResourceStatus>("idle");
    const attempt = signal(0);
    const { timeout, retryIf } = options;
    const limit = timeout !== undefined && timeout > 0 && timeout <= LONGEST_TIMER ? timeout : 0;
    const retries = options.retry ?? 0;
    const backoff = options.backoff !== undefined && options.backoff >= 0 ? options.backoff : 250;
    let controller: AbortController | undefined;
    let generation = 0;
    let current: P | undefined;

    const load = (params: P | undefined): void =>
    {
        controller?.abort();
        controller = undefined;
        generation++;
        if (params === undefined)
        {
            batch(() =>
            {
                status.set("idle");
                error.set(undefined);
                attempt.set(0);
            });
            return;
        }
        const run = generation;
        const request = new AbortController();
        controller = request;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let own: AbortController | undefined;
        const separate = limit > 0 || retries > 0;
        if (separate)
        {
            request.signal.addEventListener("abort", () =>
            {
                clearTimeout(timer);
                own?.abort(request.signal.reason);
            }, { once: true });
        }
        const start = (n: number): void =>
        {
            attempt.set(n);
            let settled = false;
            const settle = (ok: boolean, outcome: unknown): void =>
            {
                if (settled)
                {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                if (run !== generation)
                {
                    return;
                }
                if (ok)
                {
                    batch(() =>
                    {
                        value.set(outcome as T);
                        status.set("resolved");
                    });
                    return;
                }
                let again = n <= retries;
                if (again && retryIf !== undefined)
                {
                    try
                    {
                        again = retryIf(outcome, n);
                    }
                    catch (thrown)
                    {
                        again = false;
                        outcome = thrown;
                    }
                }
                if (again)
                {
                    own?.abort(outcome);
                }
                if (run !== generation)
                {
                    return;
                }
                if (again)
                {
                    timer = setTimeout(() => batch(() => start(n + 1)), Math.min(backoff * 2 ** (n - 1), Math.max(backoff, LONGEST_BACKOFF), LONGEST_TIMER));
                    return;
                }
                batch(() =>
                {
                    error.set(outcome);
                    status.set("error");
                });
            };
            let abort = request.signal;
            if (separate)
            {
                const mine = new AbortController();
                own = mine;
                abort = mine.signal;
                if (limit > 0)
                {
                    timer = setTimeout(() =>
                    {
                        const failure = new ZerolithError(diagnostic("resource_timed_out", "error", { ms: limit }));
                        settle(false, failure);
                        mine.abort(failure);
                    }, limit);
                }
            }
            let running: Promise<T>;
            try
            {
                running = Promise.resolve(options.loader({ params, abort }));
            }
            catch (thrown)
            {
                running = Promise.reject(thrown);
            }
            running.then((result) => settle(true, result), (reason: unknown) => settle(false, reason));
        };
        batch(() =>
        {
            status.set("pending");
            error.set(undefined);
            start(1);
        });
    };

    let live = false;
    const stop = (): void =>
    {
        live = false;
        generation++;
        controller?.abort();
        controller = undefined;
    };
    effect(() =>
    {
        let params: P | undefined;
        try
        {
            params = options.params();
        }
        catch (thrown)
        {
            generation++;
            controller?.abort();
            controller = undefined;
            untracked(() =>
            {
                batch(() =>
                {
                    error.set(thrown);
                    status.set("error");
                    attempt.set(0);
                });
            });
            return stop;
        }
        live = true;
        current = params;
        untracked(() =>
        {
            load(params);
        });
        return stop;
    });

    return Object.assign(computed(() => value.get()), {
        status,
        pending: computed(() => status.get() === "pending"),
        error,
        attempt,
        reload: (): void =>
        {
            if (live)
            {
                untracked(() =>
                {
                    load(current);
                });
            }
        }
    });
}
