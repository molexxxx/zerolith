import { describe, expect, it } from "vitest";
import { type DevtoolsEvent, type DevtoolsHook, computed, effect, onDispose, signal } from "zerolith";

function hook(): DevtoolsHook
{
    const found = (globalThis as { __ZEROLITH_DEVTOOLS__?: DevtoolsHook }).__ZEROLITH_DEVTOOLS__;
    if (found === undefined)
    {
        throw new Error("the development build publishes the hook");
    }
    return found;
}

describe("devtools hook", () =>
{
    it("tracks signals, computed values, and effects with names, values, and observers", () =>
    {
        const count = signal(2, { name: "count" });
        const doubled = computed(() => count.get() * 2, { name: "doubled" });
        effect(function watch()
        {
            doubled.get();
        });
        const nodes = hook().nodes();
        const state = nodes.find((node) => node.name === "count");
        const derived = nodes.find((node) => node.name === "doubled");
        const watcher = nodes.find((node) => node.name === "watch");
        expect(state).toMatchObject({ kind: "state", value: 2, observers: 1, internal: false });
        expect(derived).toMatchObject({ kind: "computed", value: 4, observers: 1 });
        expect(watcher).toMatchObject({ kind: "effect", observers: 0 });
    });

    it("announces nodes, flushes, and diagnostics to subscribers", () =>
    {
        const events: DevtoolsEvent[] = [];
        const stop = hook().subscribe((event) => events.push(event));
        const a = signal(1);
        effect(() =>
        {
            a.get();
        });
        a.set(2);
        try
        {
            onDispose(() => undefined);
        }
        catch
        {
            // Recorded in the feed.
        }
        stop();
        expect(events.map((event) => event.type)).toEqual(["node", "node", "flush", "diagnostic"]);
        expect(hook().diagnostics().at(-1)?.code).toBe("on_dispose_outside_scope");
    });
});
