// Executed examples for the signals and diagnostics guides. Each region is
// application code the documentation shows with its imports, and its
// comments say what it prints; the checks after it compare what it printed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DIAGNOSTIC_URL, type ZerolithError, batch, computed, effect, onDiagnostic, onDispose, resource, scope, signal, untracked } from "zerolith";

let printed: unknown[][] = [];

beforeEach(() =>
{
    printed = [];
    vi.spyOn(console, "log").mockImplementation((...values: unknown[]) =>
    {
        printed.push(values);
    });
});

afterEach(() =>
{
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("signals guide", () =>
{
    it("basics", () =>
    {
        // #region basics
        const count = signal(0);
        count.set(count.get() + 1);
        console.log(count.get());               // 1

        const point = signal({ x: 1 }, { equals: (a, b) => a.x === b.x });
        point.set({ x: 1 });                    // ignored: `equals` says it is equal
        // #endregion basics
        expect(printed).toEqual([[1]]);
        const kept = point.get();
        point.set({ x: 1 });
        expect(point.get()).toBe(kept);
    });

    it("computed", () =>
    {
        // #region computed
        const price = signal(10);
        const quantity = signal(2);
        const total = computed(() => price.get() * quantity.get());

        console.log(total.get());               // 20
        quantity.set(3);
        console.log(total.get());               // 30
        // #endregion computed
        expect(printed).toEqual([[20], [30]]);
    });

    it("effects", () =>
    {
        // #region effects
        const name = signal("Ada");

        const dispose = effect(() =>
        {
            const current = name.get();
            console.log(`hello ${current}`);
            return () => console.log(`goodbye ${current}`);
        });                                     // prints "hello Ada" right away

        name.set("Grace");                      // prints "goodbye Ada", "hello Grace"
        dispose();                              // prints "goodbye Grace"
        // #endregion effects
        expect(printed).toEqual([["hello Ada"], ["goodbye Ada"], ["hello Grace"], ["goodbye Grace"]]);
    });

    it("untracked", () =>
    {
        // #region untracked
        const query = signal("zerolith");
        const page = signal(1);

        effect(() =>
        {
            const from = untracked(() => page.get());
            console.log(`search ${query.get()} from page ${from}`);
        });                                     // prints "search zerolith from page 1"

        page.set(2);                            // prints nothing: page is untracked
        query.set("signals");                   // prints "search signals from page 2"
        // #endregion untracked
        expect(printed).toEqual([["search zerolith from page 1"], ["search signals from page 2"]]);
    });

    it("batch", () =>
    {
        // #region batch
        const first = signal("Ada");
        const last = signal("Lovelace");
        // Prints "Ada Lovelace" now, and again after each change:
        effect(() => console.log(`${first.get()} ${last.get()}`));

        batch(() =>
        {
            first.set("Grace");
            last.set("Hopper");
        });                                     // prints "Grace Hopper", once
        // #endregion batch
        expect(printed).toEqual([["Ada Lovelace"], ["Grace Hopper"]]);
    });

    it("scope", () =>
    {
        // #region scope
        const tick = signal(0);

        const handle = scope(() =>
        {
            effect(() => console.log(`tick ${tick.get()}`));
            onDispose(() => console.log("disposed"));
        });                                     // prints "tick 0"

        tick.set(1);                            // prints "tick 1"
        handle.dispose();                       // prints "disposed"
        tick.set(2);                            // prints nothing: the effect is gone
        // #endregion scope
        expect(printed).toEqual([["tick 0"], ["tick 1"], ["disposed"]]);
    });

    it("resource", async () =>
    {
        const requested: string[] = [];
        vi.stubGlobal("fetch", (url: string) =>
        {
            requested.push(url);
            return Promise.resolve(Response.json({ id: 7, name: "Ada" }));
        });
        // #region resource
        const userId = signal<number | undefined>(undefined);
        const user = resource({
            params: () => userId.get(),
            loader: async ({ params, abort }) =>
            {
                const response = await fetch(`/api/users/${params}`, { signal: abort });
                return (await response.json()) as { id: number; name: string };
            }
        });

        console.log(user.status.get());         // "idle": params returned undefined
        userId.set(7);
        console.log(user.status.get());         // "pending"
        // Once the loader settles, the status is "resolved" and user.get() is the user.
        // #endregion resource
        expect(printed).toEqual([["idle"], ["pending"]]);
        await vi.waitFor(() => expect(user.status.get()).toBe("resolved"));
        expect(user.get()).toEqual({ id: 7, name: "Ada" });
        expect(requested).toEqual(["/api/users/7"]);
    });

    it("resource-retry", async () =>
    {
        const requested: string[] = [];
        vi.stubGlobal("fetch", (url: string) =>
        {
            requested.push(url);
            return requested.length === 1 ? Promise.reject(new TypeError("Failed to fetch")) : Promise.resolve(Response.json({ id: 7, name: "Ada" }));
        });
        // #region resource-retry
        class HttpError extends Error
        {
            readonly status: number;

            constructor(status: number)
            {
                super(`HTTP ${status}`);
                this.status = status;
            }
        }

        const userId = signal<number | undefined>(7);
        const user = resource({
            params: () => userId.get(),
            loader: async ({ params, abort }) =>
            {
                const response = await fetch(`/api/users/${params}`, { signal: abort });
                if (!response.ok)
                {
                    throw new HttpError(response.status);
                }
                return (await response.json()) as { id: number; name: string };
            },
            timeout: 5000,
            retry: 2,
            backoff: 500,
            retryIf: (error) => !(error instanceof HttpError) || error.status >= 500
        });

        console.log(user.attempt.get());        // 1: the first run is in flight
        // #endregion resource-retry
        expect(printed).toEqual([[1]]);
        await vi.waitFor(() => expect(user.status.get()).toBe("resolved"), { timeout: 3000 });
        expect([user.attempt.get(), user.get()]).toEqual([2, { id: 7, name: "Ada" }]);
        expect(requested).toEqual(["/api/users/7", "/api/users/7"]);
    });

    it("diagnostics", () =>
    {
        // #region diagnostics
        // Warnings go to every listener, such as one that reports them:
        const stop = onDiagnostic((diagnostic) => console.warn(diagnostic.code));

        // Errors are thrown, carrying the same record:
        try
        {
            onDispose(() => undefined);         // outside any effect or scope
        }
        catch (error)
        {
            const { diagnostic } = error as ZerolithError;
            console.log(diagnostic.code);       // "on_dispose_outside_scope"
            console.log(diagnostic.url);        // ".../e/on_dispose_outside_scope"
        }
        stop();
        // #endregion diagnostics
        expect(printed).toEqual([["on_dispose_outside_scope"], [`${DIAGNOSTIC_URL}on_dispose_outside_scope/`]]);
    });
});
