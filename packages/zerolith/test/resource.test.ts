import { describe, expect, it, vi } from "vitest";
import { type View, effect, html, resource, scope, signal, when } from "zerolith";
import { renderToString } from "zerolith/ssr";

function deferred<T>(): PromiseWithResolvers<T>
{
    return Promise.withResolvers<T>();
}

async function settle(): Promise<void>
{
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    await new Promise<void>((resolve) => queueMicrotask(resolve));
}

describe("resource", () =>
{
    it("loads when params are available and exposes value, status, and pending", async () =>
    {
        const id = signal<number | undefined>(undefined);
        const pending = deferred<string>();
        const loader = vi.fn(() => pending.promise);
        const user = resource({ params: () => id.get(), loader });
        expect(user.status.get()).toBe("idle");
        expect(loader).not.toHaveBeenCalled();

        id.set(1);
        expect(user.status.get()).toBe("pending");
        expect(user.pending.get()).toBe(true);
        expect(loader).toHaveBeenCalledWith(expect.objectContaining({ params: 1 }));

        pending.resolve("ann");
        await settle();
        expect(user.get()).toBe("ann");
        expect(user.status.get()).toBe("resolved");
        expect(user.pending.get()).toBe(false);
    });

    it("fails the request when the loader throws before returning a promise", async () =>
    {
        const user = resource<number, string>({
            params: () => 1,
            loader: () =>
            {
                throw new Error("no network");
            }
        });
        await settle();
        expect(user.status.get()).toBe("error");
        expect((user.error.get() as Error).message).toBe("no network");
        expect(user.pending.get()).toBe(false);
    });

    it("is a read-only signal of its value that templates and when read", async () =>
    {
        const pending = deferred<string>();
        const user = resource({ params: () => 1, loader: () => pending.promise });
        const view = (): View => html`<p>${user}</p>${when(user, () => "loaded", () => "loading")}`;
        expect("set" in user).toBe(false);
        expect(renderToString(view()).replace(/<!--\/?zl:p-->/g, "")).toBe("<p></p>loading");

        pending.resolve("ann");
        await settle();
        expect(renderToString(view()).replace(/<!--\/?zl:p-->/g, "")).toBe("<p>ann</p>loaded");
    });

    it("aborts the previous request and ignores its late result when params change", async () =>
    {
        const id = signal(1);
        const first = deferred<string>();
        const second = deferred<string>();
        const aborts: number[] = [];
        const user = resource<number, string>({
            params: () => id.get(),
            loader: ({ params, abort }) =>
            {
                abort.addEventListener("abort", () => aborts.push(params));
                return params === 1 ? first.promise : second.promise;
            }
        });
        id.set(2);
        expect(aborts).toEqual([1]);
        first.resolve("stale");
        await settle();
        expect(user.get()).toBeUndefined();
        expect(user.status.get()).toBe("pending");
        second.resolve("fresh");
        await settle();
        expect(user.get()).toBe("fresh");
    });

    it("records errors and recovers on reload", async () =>
    {
        let attempt = 0;
        const user = resource<number, string>({
            params: () => 1,
            loader: () =>
            {
                attempt++;
                return attempt === 1 ? Promise.reject(new Error("down")) : Promise.resolve("up");
            }
        });
        await settle();
        expect(user.status.get()).toBe("error");
        expect((user.error.get() as Error).message).toBe("down");
        user.reload();
        expect(user.status.get()).toBe("pending");
        expect(user.error.get()).toBeUndefined();
        await settle();
        expect(user.get()).toBe("up");
        expect(user.status.get()).toBe("resolved");
    });

    it("keeps the previous value while a newer request is pending", async () =>
    {
        const id = signal(1);
        const second = deferred<string>();
        const user = resource<number, string>({
            params: () => id.get(),
            loader: ({ params }) => (params === 1 ? Promise.resolve("one") : second.promise)
        });
        await settle();
        expect(user.get()).toBe("one");
        id.set(2);
        expect(user.get()).toBe("one");
        expect(user.pending.get()).toBe(true);
        second.resolve("two");
        await settle();
        expect(user.get()).toBe("two");
    });

    it("fails the load when params throw, and recovers when they stop throwing", async () =>
    {
        const broken = signal(true);
        const loader = vi.fn(async ({ params }: { params: number }) => params * 2);
        const result = scope(() =>
            resource({
                params: () =>
                {
                    if (broken.get())
                    {
                        throw new Error("no params");
                    }
                    return 21;
                },
                loader
            })).value;
        expect(result.status.get()).toBe("error");
        expect((result.error.get() as Error).message).toBe("no params");
        expect(loader).not.toHaveBeenCalled();
        broken.set(false);
        await settle();
        expect(result.status.get()).toBe("resolved");
        expect(result.get()).toBe(42);
        expect(result.error.get()).toBeUndefined();
        broken.set(true);
        expect(result.status.get()).toBe("error");
        expect(result.get()).toBe(42);
    });

    it("does nothing on reload once its owner is disposed, and aborts the request a reload replaces", async () =>
    {
        const loader = vi.fn(({ abort }: { params: number; abort: AbortSignal }) =>
            new Promise<number>((resolve, reject) =>
            {
                abort.addEventListener("abort", () => reject(new Error("aborted")));
                setTimeout(() => resolve(1), 0);
            }));
        const owner = scope(() => resource({ params: () => 1, loader }));
        const result = owner.value;
        const first = loader.mock.calls[0]?.[0].abort;
        result.reload();
        expect(first?.aborted).toBe(true);
        expect(loader).toHaveBeenCalledTimes(2);
        owner.dispose();
        expect(loader.mock.calls[1]?.[0].abort.aborted).toBe(true);
        result.reload();
        expect(loader).toHaveBeenCalledTimes(2);
        expect(result.status.get()).toBe("pending");
        await settle();
        expect(result.get()).toBeUndefined();
    });

    it("keeps the previous value after a failed load and goes idle when params become undefined", async () =>
    {
        const ready = signal<number | undefined>(1);
        let fails = false;
        const result = scope(() =>
            resource({
                params: () => ready.get(),
                loader: async ({ params }: { params: number }) =>
                {
                    if (fails)
                    {
                        throw new Error("failed");
                    }
                    return params;
                }
            })).value;
        await settle();
        expect(result.get()).toBe(1);
        fails = true;
        ready.set(2);
        await settle();
        expect(result.status.get()).toBe("error");
        expect(result.get()).toBe(1);
        ready.set(undefined);
        expect(result.status.get()).toBe("idle");
        expect(result.get()).toBe(1);
        expect(result.error.get()).toBeUndefined();
    });

    it("is reactive as a whole and aborts when its scope is disposed", async () =>
    {
        const id = signal(1);
        let aborted = false;
        const seen: Array<string | undefined> = [];
        const handle = scope(() =>
        {
            const user = resource<number, string>({
                params: () => id.get(),
                loader: ({ abort }) =>
                {
                    abort.addEventListener("abort", () =>
                    {
                        aborted = true;
                    });
                    return new Promise<string>(() => undefined);
                }
            });
            effect(() =>
            {
                seen.push(user.get());
            });
            return user;
        });
        expect(seen).toEqual([undefined]);
        handle.dispose();
        expect(aborted).toBe(true);
        await settle();
    });
});
