import { describe, expect, it } from "vitest";
import { canaryCommit, canaryVersion } from "../canary.ts";

describe("canary versions", () =>
{
    it("name the day and the commit, and sort below every release", () =>
    {
        expect(canaryVersion("20261101", "1a2b3c4d5e6f")).toBe("0.0.0-canary.20261101.g1a2b3c4");
        expect(canaryVersion("20261101", "0000000")).toBe("0.0.0-canary.20261101.g0000000");
    });

    it("refuse what they cannot name", () =>
    {
        expect(() => canaryVersion("2026-11-01", "1a2b3c4")).toThrow();
        expect(() => canaryVersion("20261101", "xyz")).toThrow();
    });

    it("give back the commit they were built from, in this form and the earlier one", () =>
    {
        expect(canaryCommit("0.0.0-canary.20261101.g1a2b3c4")).toBe("1a2b3c4");
        expect(canaryCommit("0.1.0-alpha.6.canary.20261101.g301d419")).toBe("301d419");
        expect(canaryCommit("1.2.1-canary.20261031.gabcdef0")).toBe("abcdef0");
        expect(canaryCommit("0.1.0-alpha.6")).toBeUndefined();
    });
});
