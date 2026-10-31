import { describe, expect, it } from "vitest";
import { canaryCommit, canaryVersion } from "../canary.ts";

describe("canary versions", () =>
{
    it("follow the release they build on and name the day and the commit", () =>
    {
        expect(canaryVersion("0.1.0-alpha.4", "20261031", "1a2b3c4d5e6f")).toBe("0.1.0-alpha.4.canary.20261031.g1a2b3c4");
        expect(canaryVersion("1.2.0", "20261031", "1a2b3c4")).toBe("1.2.1-canary.20261031.g1a2b3c4");
        expect(canaryVersion("0.1.0-alpha.4", "20261031", "0000000")).toBe("0.1.0-alpha.4.canary.20261031.g0000000");
    });

    it("refuse what they cannot name", () =>
    {
        expect(() => canaryVersion("0.1", "20261031", "1a2b3c4")).toThrow();
        expect(() => canaryVersion("0.1.0", "2026-10-31", "1a2b3c4")).toThrow();
        expect(() => canaryVersion("0.1.0", "20261031", "xyz")).toThrow();
    });

    it("give back the commit they were built from", () =>
    {
        expect(canaryCommit("0.1.0-alpha.4.canary.20261031.g1a2b3c4")).toBe("1a2b3c4");
        expect(canaryCommit("1.2.1-canary.20261031.gabcdef0")).toBe("abcdef0");
        expect(canaryCommit("0.1.0-alpha.4")).toBeUndefined();
    });
});
