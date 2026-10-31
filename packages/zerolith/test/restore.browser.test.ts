import { describe, expect, it } from "vitest";
import { signal } from "zerolith";
import { devtoolsSaveRestore } from "zerolith/internal";

describe("named state across a development reload", () =>
{
    it("restores saved values into signals created later with the same name, once", () =>
    {
        devtoolsSaveRestore({ count: 7, draft: { text: "kept" } });
        const count = signal(0, { name: "count" });
        const draft = signal<{ text: string } | undefined>(undefined, { name: "draft" });
        const other = signal(1, { name: "other" });
        expect(count.get()).toBe(7);
        expect(draft.get()).toEqual({ text: "kept" });
        expect(other.get()).toBe(1);

        const again = signal(0, { name: "count" });
        expect(again.get()).toBe(0);
        expect(sessionStorage.getItem("zerolith:restore")).toBeNull();
    });
});
