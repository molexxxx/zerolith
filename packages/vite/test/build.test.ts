import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zerolith } from "@zerolith/vite";

/**
 * Builds a one-file application for production with the built core aliased
 * to its production entry, then to its development entry: the first passes
 * and the second fails with the plugin's message, and a development-mode
 * build with the development entry passes because nothing is asserted there.
 */

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const productionEntry = join(repoRoot, "packages/zerolith/dist/production/index.js");
const developmentEntry = join(repoRoot, "packages/zerolith/dist/index.js");

let folder: string;

beforeAll(async () =>
{
    folder = await mkdtemp(join(tmpdir(), "zerolith-build-"));
    await writeFile(join(folder, "index.html"), "<!doctype html><html><body><div id=\"app\"></div><script type=\"module\" src=\"/main.js\"></script></body></html>");
    await writeFile(join(folder, "main.js"), "import { html, render } from \"zerolith\";\nrender(html`<p>built</p>`, document.getElementById(\"app\"));\n");
});

afterAll(async () =>
{
    await rm(folder, { recursive: true, force: true });
});

function run(entry: string, mode: string): Promise<unknown>
{
    return build({
        root: folder,
        configFile: false,
        envFile: false,
        logLevel: "silent",
        mode,
        plugins: [zerolith()],
        resolve: { alias: { zerolith: entry } },
        build: { write: false, minify: false }
    });
}

describe("the build check", () =>
{
    it("passes a production build on the production entry", { timeout: 60000 }, async () =>
    {
        await expect(run(productionEntry, "production")).resolves.toBeDefined();
    });

    it("fails a production build that bundled the development entry", { timeout: 60000 }, async () =>
    {
        await expect(run(developmentEntry, "production")).rejects.toThrow(/development build of zerolith reached the production output/);
    });

    it("leaves a development-mode build alone", { timeout: 60000 }, async () =>
    {
        await expect(run(developmentEntry, "development")).resolves.toBeDefined();
    });
});
