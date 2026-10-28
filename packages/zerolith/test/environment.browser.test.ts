import { describe, expect, it } from "vitest";
import * as zerolith from "zerolith";

describe("browser test environment", () =>
{
    it("runs in a real document", () =>
    {
        expect(typeof document).toBe("object");
        expect(document.createElement("template")).toBeInstanceOf(HTMLTemplateElement);
    });

    it("loads the runtime entry as an ES module", () =>
    {
        expect(Object.keys(zerolith)).toEqual([]);
    });
});
