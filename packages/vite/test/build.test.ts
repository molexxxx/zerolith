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

let valueFolder: string;

const INDEX = "<!doctype html><html><body><div id=\"app\"></div><script type=\"module\" src=\"/main.js\"></script></body></html>";

beforeAll(async () =>
{
    folder = await mkdtemp(join(tmpdir(), "zerolith-build-"));
    await writeFile(join(folder, "index.html"), INDEX);
    await writeFile(join(folder, "main.js"), "import { html, render } from \"zerolith\";\nrender(html`<p>built</p>`, \"#app\");\n");
    valueFolder = await mkdtemp(join(tmpdir(), "zerolith-build-value-"));
    await writeFile(join(valueFolder, "index.html"), INDEX);
    await writeFile(join(valueFolder, "main.js"), "import { html, render } from \"zerolith\";\nconst tag = html;\nrender(tag`<p>built</p>`, \"#app\");\n");
});

afterAll(async () =>
{
    await rm(folder, { recursive: true, force: true });
    await rm(valueFolder, { recursive: true, force: true });
});

interface Built
{
    output: { type: string; code?: string }[];
}

function run(entry: string, mode: string, options: Parameters<typeof zerolith>[0] = {}, root = folder): Promise<unknown>
{
    return build({
        root,
        configFile: false,
        envFile: false,
        logLevel: "silent",
        mode,
        plugins: [zerolith(options)],
        resolve: { alias: { zerolith: entry } },
        build: { write: false, minify: false }
    });
}

/** The code of every chunk a build produced, joined. */
async function built(entry: string, mode: string, options: Parameters<typeof zerolith>[0] = {}): Promise<string>
{
    const result = await run(entry, mode, options);
    const builds = (Array.isArray(result) ? result : [result]) as Built[];
    return builds.flatMap((item) => item.output).map((item) => item.code ?? "").join("\n");
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

describe("the prepare pass", () =>
{
    it("prepares every template and drops the scanner", { timeout: 60000 }, async () =>
    {
        const code = await built(productionEntry, "production");
        expect(code).toContain("[\"<p>built</p>\"], \"<p>built</p>\", []");
        expect(code).not.toContain("html`<p>built</p>`");
        expect(code).toContain("template_not_prepared");
        expect(code).not.toContain("binding_in_comment");
    });

    it("keeps the scanner and the literals with prepare: false", { timeout: 60000 }, async () =>
    {
        const code = await built(productionEntry, "production", { prepare: false });
        expect(code).toContain("html`<p>built</p>`");
        expect(code).toContain("binding_in_comment");
        expect(code).not.toContain("template_not_prepared");
    });

    it("fails when html is used other than as a tag", { timeout: 60000 }, async () =>
    {
        await expect(run(productionEntry, "production", {}, valueFolder)).rejects.toThrow(/other than as a template tag/);
    });
});
