import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { build, compile, match } from "../src/match.js";

describe("path patterns", () =>
{
    it("matches static paths with or without a trailing slash", () =>
    {
        const pattern = compile("/features/batch");
        expect(match(pattern, "/features/batch")).toEqual({});
        expect(match(pattern, "/features/batch/")).toEqual({});
        expect(match(pattern, "/features")).toBeUndefined();
        expect(match(pattern, "/features/batch/x")).toBeUndefined();
    });

    it("captures and decodes parameters", () =>
    {
        const pattern = compile("/releases/:tag/notes/:id");
        expect(match(pattern, "/releases/v1.3%2B1/notes/7")).toEqual({ tag: "v1.3+1", id: "7" });
        expect(match(pattern, "/releases/v1")).toBeUndefined();
    });

    it("captures the remainder with a star", () =>
    {
        const pattern = compile("/docs/*path");
        expect(match(pattern, "/docs/guide/intro")).toEqual({ path: "guide/intro" });
        expect(match(pattern, "/docs/")).toEqual({ path: "" });
    });

    it("matches the root", () =>
    {
        const pattern = compile("/");
        expect(match(pattern, "/")).toEqual({});
        expect(match(pattern, "")).toEqual({});
        expect(match(pattern, "/x")).toBeUndefined();
    });

    it("builds paths with encoded parameters", () =>
    {
        expect(build("/releases/:tag", { tag: "v1.3 beta" })).toBe("/releases/v1.3%20beta");
        expect(build("/docs/*path", { path: "a/b" })).toBe("/docs/a%2Fb");
    });
});

describe("@zerolith/router package manifest", () =>
{
    it("depends only on zerolith", async () =>
    {
        const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> };
        expect(manifest.dependencies).toBeUndefined();
        expect(Object.keys(manifest.peerDependencies ?? {})).toEqual(["zerolith"]);
    });
});
