import { describe, expect, it } from "vitest";
import { compareVersions, isStable, labelOf, pickVersions, resolveShown, versionsOfTags } from "../versions.ts";

describe("the versions the docs site shows", () =>
{
    it("orders versions as semantic versioning does", () =>
    {
        const ordered = ["1.0.0-alpha.1", "1.0.0-alpha.10", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.0.1", "1.1.0", "2.0.0-alpha.1", "2.0.0"];
        expect(ordered.toReversed().toSorted(compareVersions)).toEqual(ordered);
        expect(compareVersions("0.1.0-alpha.10", "0.1.0-alpha.9")).toBeGreaterThan(0);
        expect(compareVersions("nonsense", "1.0.0")).toBeLessThan(0);
        expect(isStable("1.0.0")).toBe(true);
        expect(isStable("2.0.0-alpha.1")).toBe(false);
    });

    it("shows the newest stable release at the root and a newer pre-release under /next/", () =>
    {
        expect(pickVersions(["0.1.0-alpha.10", "1.0.0", "0.1.0-alpha.9"])).toEqual({ stable: { version: "1.0.0", base: "/" } });
        expect(pickVersions(["1.0.0", "2.0.0-alpha.1", "0.1.0-alpha.10", "2.0.0-alpha.2"])).toEqual({
            stable: { version: "1.0.0", base: "/" },
            next: { version: "2.0.0-alpha.2", base: "/next/" }
        });
        expect(pickVersions(["1.0.0", "1.0.1", "2.0.0-alpha.1", "2.0.0"])).toEqual({ stable: { version: "2.0.0", base: "/" } });
    });

    it("shows the newest pre-release at the root while no stable release exists, and nothing without tags", () =>
    {
        expect(pickVersions(["0.1.0-alpha.9", "0.1.0-alpha.10"])).toEqual({ stable: { version: "0.1.0-alpha.10", base: "/" } });
        expect(pickVersions([])).toBeUndefined();
        expect(pickVersions(["not-a-version"])).toBeUndefined();
    });

    it("reads the versions from the release tags alone", () =>
    {
        expect(versionsOfTags(["zerolith@1.0.0", "crate@1.0.0", "@zerolith/cli@1.0.0", " zerolith@2.0.0-alpha.1 ", "v3"])).toEqual(["1.0.0", "2.0.0-alpha.1"]);
    });

    it("builds the stable release from its line branch when origin has one, and a newer pre-release from its tag, under the Pages base", () =>
    {
        expect(resolveShown(["zerolith@1.0.0", "zerolith@2.0.0-alpha.1"], ["1.x", "main"], "/")).toEqual({
            versions: { stable: { version: "1.0.0", base: "/" }, next: { version: "2.0.0-alpha.1", base: "/next/" } },
            stableRef: "origin/1.x",
            nextRef: "zerolith@2.0.0-alpha.1"
        });
        expect(resolveShown(["zerolith@1.0.0"], [], "/zerolith/")).toEqual({
            versions: { stable: { version: "1.0.0", base: "/zerolith/" } },
            stableRef: "zerolith@1.0.0"
        });
        expect(resolveShown(["zerolith@0.1.0-alpha.10"], ["0.x"], "/")).toEqual({
            versions: { stable: { version: "0.1.0-alpha.10", base: "/" } },
            stableRef: "zerolith@0.1.0-alpha.10"
        });
        expect(resolveShown(["crate@1.0.0"], [], "/")).toBeUndefined();
    });

    it("builds the stable release from main while main carries its line, and from its line branch or tag otherwise", () =>
    {
        expect(resolveShown(["zerolith@1.1.0"], ["1.x"], "/", "1.1.0")).toEqual({
            versions: { stable: { version: "1.1.0", base: "/" } },
            stableRef: "origin/main"
        });
        expect(resolveShown(["zerolith@1.0.1"], ["1.x"], "/", "1.1.0")?.stableRef).toBe("origin/main");
        expect(resolveShown(["zerolith@1.1.0"], ["1.x"], "/", "2.0.0-alpha.1")?.stableRef).toBe("origin/1.x");
        expect(resolveShown(["zerolith@1.1.0"], [], "/", "2.0.0")?.stableRef).toBe("zerolith@1.1.0");
        expect(resolveShown(["zerolith@1.1.0"], ["1.x"], "/", "1.0.0")?.stableRef).toBe("origin/1.x");
        expect(resolveShown(["zerolith@1.1.0", "zerolith@2.0.0-alpha.1"], ["1.x"], "/", "1.1.0")).toEqual({
            versions: { stable: { version: "1.1.0", base: "/" }, next: { version: "2.0.0-alpha.1", base: "/next/" } },
            stableRef: "origin/main",
            nextRef: "zerolith@2.0.0-alpha.1"
        });
    });

    it("labels a stable version by its major and minor and a pre-release by its major and channel", () =>
    {
        expect(labelOf("1.0.0")).toBe("1.0");
        expect(labelOf("1.2.3")).toBe("1.2");
        expect(labelOf("2.0.0-alpha.3")).toBe("2.0 alpha");
        expect(labelOf("2.0.0-rc.1")).toBe("2.0 rc");
        expect(labelOf("1.1.0-beta.1")).toBe("1.1 beta");
        expect(labelOf("2.0.0-1")).toBe("2.0 pre");
        expect(labelOf("odd")).toBe("odd");
    });
});
