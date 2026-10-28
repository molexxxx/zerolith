import { describe, expect, it } from "vitest";
import { effect, signal } from "zerolith";

describe("browser test environment", () =>
{
    it("runs in a real document", () =>
    {
        expect(typeof document).toBe("object");
        expect(document.createElement("template")).toBeInstanceOf(HTMLTemplateElement);
    });

    it("runs the reactivity core in the browser", () =>
    {
        const count = signal(1);
        const seen: number[] = [];
        effect(() =>
        {
            seen.push(count.get());
        });
        count.set(2);
        expect(seen).toEqual([1, 2]);
    });
});
