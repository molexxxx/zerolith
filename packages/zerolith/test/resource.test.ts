import { describe, expect, it, vi } from "vitest";
import { effect, resource, scope, signal } from "zerolith";

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
