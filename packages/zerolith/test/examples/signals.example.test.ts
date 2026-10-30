// Executed examples for the signals guide. Each region is included in the
// documentation verbatim and runs as a test, so the docs cannot drift.
import { describe, expect, it } from "vitest";
import { DIAGNOSTIC_URL, type ZerolithError, batch, computed, effect, onDiagnostic, onDispose, resource, scope, signal } from "zerolith";

describe("signals guide", () =>
{
    it("basics", () =>
    {
        // #region basics
        const count = signal(0);
        count.set(count.get() + 1);
        expect(count.get()).toBe(1);

        const point = signal({ x: 1 }, { equals: (a, b) => a.x === b.x });
        point.set({ x: 1 });                // ignored: equal by the custom comparison
        // #endregion basics
    });

    it("computed", () =>
    {
        // #region computed
        const price = signal(10);
        const quantity = signal(2);
        const total = computed(() => price.get() * quantity.get());

        expect(total.get()).toBe(20);
        quantity.set(3);
        expect(total.get()).toBe(30);
        // #endregion computed
    });

    it("effects", () =>
    {
        // #region effects
        const name = signal("ann");
        const log: string[] = [];

        const dispose = effect(() =>
        {
            const current = name.get();
            log.push(`hello ${current}`);
            return () => log.push(`goodbye ${current}`);
        });

        name.set("bob");
        dispose();
        expect(log).toEqual(["hello ann", "goodbye ann", "hello bob", "goodbye bob"]);
        // #endregion effects
    });

    it("batch", () =>
    {
        // #region batch
        const first = signal("a");
        const last = signal("b");
        let runs = 0;
        effect(() =>
        {
            first.get();
            last.get();
            runs++;
        });

        batch(() =>
        {
            first.set("c");
            last.set("d");
        });
        expect(runs).toBe(2);                // one run at creation, one for the batch
        // #endregion batch
    });

    it("scope", () =>
    {
        // #region scope
        const tick = signal(0);
        const seen: number[] = [];

        const handle = scope(() =>
        {
            effect(() =>
            {
                seen.push(tick.get());
            });
            onDispose(() => seen.push(-1));
        });

        tick.set(1);
        handle.dispose();
        tick.set(2);                         // nothing runs: the scope is gone
        expect(seen).toEqual([0, 1, -1]);
        // #endregion scope
    });

    it("resource", async () =>
    {
        // #region resource
        const userId = signal<number | undefined>(undefined);
        const user = resource({
            params: () => userId.get(),
            loader: async ({ params, abort }) =>
            {
                abort.throwIfAborted();
                return { id: params, name: `user ${params}` };
            }
        });

        expect(user.status.get()).toBe("idle");
        userId.set(7);
        expect(user.pending.get()).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(user.get()?.name).toBe("user 7");
        // #endregion resource
    });

    it("diagnostics", () =>
    {
        // #region diagnostics
        const reported: string[] = [];
        const stop = onDiagnostic((diagnostic) => reported.push(diagnostic.code));

        try
        {
            onDispose(() => undefined);      // outside any effect or scope
        }
        catch (error)
        {
            const { diagnostic } = error as ZerolithError;
            expect(diagnostic.code).toBe("on_dispose_outside_scope");
            expect(diagnostic.url).toBe(DIAGNOSTIC_URL + "on_dispose_outside_scope");
        }
        stop();
        // #endregion diagnostics
    });
});
