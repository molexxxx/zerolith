import { describe, expect, it } from "vitest";
import { inView, online, size, visible, windowSize } from "@zerolith/browser";

describe("@zerolith/browser on the server", () =>
{
    it("gives still values where there is no window: online, visible, and no size", () =>
    {
        expect(online().get()).toBe(true);
        expect(online()).toBe(online());
        expect(visible().get()).toBe(true);
        expect(windowSize().get()).toEqual({ width: 0, height: 0 });
        expect(size({} as Element).get()).toEqual({ width: 0, height: 0 });
        expect(inView({} as Element).get()).toBe(false);
    });
});
