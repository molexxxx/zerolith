import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const packageRoot = new URL("../", import.meta.url);

interface Manifest
{
    name: string;
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
}

async function readManifest(): Promise<Manifest>
{
    const text = await readFile(new URL("package.json", packageRoot), "utf8");
    return JSON.parse(text) as Manifest;
}

describe("zerolith package manifest", () =>
{
    it("declares no runtime, peer, or optional dependencies", async () =>
    {
        const manifest = await readManifest();
        expect(manifest.name).toBe("zerolith");
        expect(manifest.dependencies).toBeUndefined();
        expect(manifest.peerDependencies).toBeUndefined();
        expect(manifest.optionalDependencies).toBeUndefined();
    });

    it("declares no install scripts", async () =>
    {
        const manifest = await readManifest();
        const scripts = Object.keys(manifest.scripts ?? {});
        for (const hook of ["preinstall", "install", "postinstall", "prepare"])
        {
            expect(scripts).not.toContain(hook);
        }
    });
});

describe("zerolith built output", () =>
{
    it("imports only its own modules at runtime", async () =>
    {
        const built = await readFile(new URL("dist/index.js", packageRoot), "utf8");
        const specifiers = [...built.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
        expect(specifiers.length).toBeGreaterThan(0);
        for (const specifier of specifiers)
        {
            expect(specifier).toMatch(/^\.\.?\//);
        }
        expect(built).not.toMatch(/\brequire\s*\(/);
        expect(built).not.toMatch(/\bimport\s*\(/);
    });
});
