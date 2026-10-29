import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { CARGO_HINT, PLATFORMS, binaryName, locate, platformPackage } from "../src/index.ts";

interface PlatformManifest
{
    name: string;
    os: string[];
    cpu: string[];
    files: string[];
}

const platformsUrl = new URL("../platforms/", import.meta.url);

const resolved = (specifier: string): string => `/node_modules/${specifier}`;
const missing = (): string =>
{
    throw new Error("Cannot find module");
};

describe("platformPackage", () =>
{
    it("names one package per supported platform", () =>
    {
        for (const [key, name] of Object.entries(PLATFORMS))
        {
            const [platform, arch] = key.split("-");
            expect(platformPackage(platform ?? "", arch ?? "")).toBe(name);
            expect(name).toBe(`@zerolith/cli-${key}`);
        }
        expect(platformPackage("freebsd", "x64")).toBeUndefined();
    });

    it("uses the .exe name on Windows only", () =>
    {
        expect(binaryName("win32")).toBe("zerolith.exe");
        expect(binaryName("linux")).toBe("zerolith");
    });

    it("has a platform package directory per entry, constrained to that platform", async () =>
    {
        expect((await readdir(platformsUrl)).toSorted()).toEqual(Object.keys(PLATFORMS).toSorted());
        for (const [key, name] of Object.entries(PLATFORMS))
        {
            const [platform, arch] = key.split("-");
            const manifest = JSON.parse(
                await readFile(new URL(`${key}/package.json`, platformsUrl), "utf8"),
            ) as PlatformManifest;
            expect(manifest.name).toBe(name);
            expect(manifest.os).toEqual([platform]);
            expect(manifest.cpu).toEqual([arch]);
            expect(manifest.files).toContain(binaryName(platform ?? ""));
        }
    });
});

describe("locate", () =>
{
    it("resolves the binary inside the platform package", () =>
    {
        expect(locate({ platform: "linux", arch: "x64", resolve: resolved })).toBe(
            "/node_modules/@zerolith/cli-linux-x64/zerolith",
        );
        expect(locate({ platform: "win32", arch: "arm64", resolve: resolved })).toBe(
            "/node_modules/@zerolith/cli-win32-arm64/zerolith.exe",
        );
    });

    it("prefers the override and never resolves then", () =>
    {
        expect(locate({ platform: "freebsd", arch: "x64", override: "/opt/zerolith", resolve: missing })).toBe(
            "/opt/zerolith",
        );
    });

    it("names the missing platform package and the alternatives", () =>
    {
        expect(() => locate({ platform: "darwin", arch: "arm64", resolve: missing })).toThrow(
            /@zerolith\/cli-darwin-arm64.*--omit=optional.*cargo install zerolith/s,
        );
    });

    it("explains unsupported platforms and musl", () =>
    {
        expect(() => locate({ platform: "freebsd", arch: "x64", resolve: resolved })).toThrow(
            `zerolith has no prebuilt binary for freebsd-x64. ${CARGO_HINT}`,
        );
        expect(() => locate({ platform: "linux", arch: "x64", musl: true, resolve: resolved })).toThrow(
            /linux-x64 \(musl\)/,
        );
    });
});
