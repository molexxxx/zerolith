import { describe, expect, it } from "vitest";
import { version as core } from "zerolith/internal";
import { checkCoreVersion, version } from "../src/version.js";

describe("the version check", () =>
{
    it("passes on the zerolith the plugin was released with", () =>
    {
        expect(version).toBe(core);
        expect(() => checkCoreVersion()).not.toThrow();
    });

    it("names both versions and both ways to align them", () =>
    {
        expect(() => checkCoreVersion("0.1.0-alpha.6", "0.1.0-alpha.5")).toThrow("zerolith: package_version_mismatch: @zerolith/vite 0.1.0-alpha.6 requires zerolith 0.1.0-alpha.6, and zerolith 0.1.0-alpha.5 is installed. Install one version of both, with npm install @zerolith/vite@0.1.0-alpha.5 or npm install zerolith@0.1.0-alpha.6. https://molexxxx.github.io/zerolith/e/package_version_mismatch");
    });
});
