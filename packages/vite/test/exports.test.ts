import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { type Logger, type ViteDevServer, createLogger, createServer, parseSync } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ModuleParser, lintModule, zerolith } from "@zerolith/vite";
import type { ModuleReader } from "../src/exports.ts";
import { namesAFunction } from "../src/exports.ts";
import type { AstNode } from "../src/ast.ts";

const parse: ModuleParser = (filename, code) => parseSync(filename, code, { sourceType: "module", lang: "js" });

/** The project the CLI's own test uses: constants, a view in a const, functions, re-exports under new names, `export *`, a default export, and a package. */
const files: Record<string, string> = {
    "/src/config.ts": "import { html } from \"zerolith\";\nexport const APP_NAME = \"Tips\";\nexport const Logo = html`<b>Tips</b>`;\nexport function Footer() { return html`<p></p>`; }\n",
    "/src/parts/index.ts": "export { Footer as Bottom, Logo as Mark } from \"../config.ts\";\nexport * from \"./more.js\";\n",
    "/src/parts/more.ts": "import { html } from \"zerolith\";\nexport const Side = () => html`<aside></aside>`;\n",
    "/src/card.ts": "import { html } from \"zerolith\";\nconst Card = () => html`<div></div>`;\nexport default Card;\n",
    "/src/loop-a.ts": "export { Loop } from \"./loop-b.ts\";\n",
    "/src/loop-b.ts": "export { Loop } from \"./loop-a.ts\";\n",
    "/src/shapes.tsx": "import { html } from \"zerolith\";\nexport class Panel {}\nexport enum Mode { On }\nexport const Grid = function () { return html``; };\nconst Local = () => html``;\nexport { Local as Renamed, Local as \"Quoted\", type Local as TypeOnly };\nexport type { Mode as ModeType };\n",
    "/src/default-fn.ts": "export default function () { return null; }\n",
    "/src/default-arrow.ts": "export default () => null;\n",
    "/src/default-value.ts": "export default { title: \"x\" };\n",
    "/src/default-local.ts": "const Value = 3;\nexport default Value;\n",
    "/src/default-class.mts": "export default class {}\n",
    "/src/view.jsx": "export const View = () => <p></p>;\n",
    "/src/bundle.ts": "export * as Shapes from \"./shapes.tsx\";\nexport * from \"./missing.ts\";\nexport * from \"./broken.ts\";\nexport type * from \"./shapes.tsx\";\n",
    "/src/broken.ts": "export const = ;\n",
    "/src/through.ts": "import type { Mode } from \"./shapes.tsx\";\nimport { type Mode as Other, Panel } from \"./shapes.tsx\";\nexport { Panel as Through };\n",
    "/src/namespaced.ts": "import * as All from \"./shapes.tsx\";\nexport { All };\n"
};

/** The names the component lint reports in `code`, a module at `/src/page.js`, once each finding's import is followed. */
async function reportedIn(code: string): Promise<string[]>
{
    const body = parse("/src/page.js", code).program.body as AstNode[];
    const findings = lintModule(code, "/src/page.js", parse).filter((each) => each.code === "template_component_uncalled");
    const kept = await Promise.all(findings.map((finding) => namesAFunction(reader, "/src/page.js", code, body, finding.offset)));
    return findings.filter((_finding, index) => kept[index]).map((finding) => /^\w+/.exec(code.slice(finding.offset))?.[0] ?? "");
}

/** Resolves a relative specifier as Vite does in a TypeScript project: as written, a `.js` that stands for `.ts`, with an extension, or a folder's index. */
const reader: ModuleReader = {
    resolve: async (specifier, importer) =>
    {
        if (!specifier.startsWith("."))
        {
            return undefined;
        }
        const base = posix.join(posix.dirname(importer), specifier);
        return [base, base.replace(/\.js$/, ".ts"), `${base}.ts`, `${base}/index.ts`].find((candidate) => candidate in files);
    },
    read: async (id) => files[id],
    parse: (id, code, lang) =>
    {
        const parsed = parseSync(id, code, { sourceType: "module", lang });
        return parsed.errors.length > 0 ? undefined : parsed.program.body as AstNode[];
    }
};

describe("namesAFunction", () =>
{
    it("reports an imported name only when its project module exports a function or a class, as zerolith lint does", async () =>
    {
        const line = "export const page = html`${APP_NAME}${Logo}${Footer}${Bottom}${Mark}${Side}${Card}${Widget}${Local}${Loop}`;";
        const code = [
            "import { html } from \"zerolith\";",
            "import { APP_NAME, Footer, Logo } from \"./config.ts\";",
            "import { Bottom, Mark, Side } from \"./parts\";",
            "import Card from \"./card.js\";",
            "import { Widget } from \"some-package\";",
            "import { Loop } from \"./loop-a.ts\";",
            "function Local() { return html``; }",
            line
        ].join("\n");
        expect(await reportedIn(code)).toEqual(["Footer", "Bottom", "Side", "Card", "Local"]);
    });

    it("reads classes, enums, namespaces, every default export, local and quoted renames, and type-only exports as zerolith lint does", async () =>
    {
        const code = [
            "import { html } from \"zerolith\";",
            "import { Panel, Mode, Grid, Renamed, Quoted } from \"./shapes.tsx\";",
            "import DefaultFunction from \"./default-fn.ts\";",
            "import DefaultArrow from \"./default-arrow.ts\";",
            "import DefaultValue from \"./default-value.ts\";",
            "import DefaultLocal from \"./default-local.ts\";",
            "import DefaultClass from \"./default-class.mts\";",
            "import { View } from \"./view.jsx\";",
            "import { Shapes, Absent } from \"./bundle.ts\";",
            "import { Through } from \"./through.ts\";",
            "import { All } from \"./namespaced.ts\";",
            "import * as Icons from \"./shapes.tsx\";",
            "import { Gone } from \"./nowhere.ts\";",
            "export const page = html`${Panel}${Mode}${Grid}${Renamed}${Quoted}${DefaultFunction}${DefaultArrow}${DefaultValue}${DefaultLocal}${DefaultClass}${View}${Shapes}${Absent}${Through}${All}${Icons}${Gone}`;"
        ].join("\n");
        expect(await reportedIn(code)).toEqual(["Panel", "Grid", "Renamed", "Quoted", "DefaultFunction", "DefaultArrow", "DefaultClass", "View", "Through", "Icons"]);
    });
});

describe("the dev server's component lint", () =>
{
    const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
    let folder: string;
    let server: ViteDevServer;
    const warnings: string[] = [];

    beforeAll(async () =>
    {
        folder = await mkdtemp(join(tmpdir(), "zerolith-lint-imports-"));
        await mkdir(join(folder, "src"));
        await writeFile(join(folder, "src/config.ts"), files["/src/config.ts"] ?? "");
        await writeFile(join(folder, "src/page.ts"), "import { html } from \"zerolith\";\nimport { APP_NAME, Footer, Logo } from \"./config.js\";\nexport const page = html`${APP_NAME}${Logo}${Footer}`;\n");
        const logger: Logger = { ...createLogger("silent"), warn: (message) => warnings.push(message), warnOnce: (message) => warnings.push(message) };
        server = await createServer({
            root: folder,
            configFile: false,
            envFile: false,
            customLogger: logger,
            clearScreen: false,
            plugins: [zerolith()],
            resolve: { alias: { "zerolith/internal": join(repoRoot, "packages/zerolith/src/internal.ts"), zerolith: join(repoRoot, "packages/zerolith/src/index.ts") } },
            optimizeDeps: { noDiscovery: true, include: [] },
            server: { middlewareMode: true, fs: { allow: [repoRoot, folder] } }
        });
    }, 60000);

    afterAll(async () =>
    {
        await server?.close();
        if (folder !== undefined)
        {
            await rm(folder, { recursive: true, force: true });
        }
    });

    it("warns for an imported component bound uncalled, and not for an imported constant or view", { timeout: 60000 }, async () =>
    {
        await server.transformRequest("/src/page.ts");
        const uncalled = warnings.map((warning) => stripVTControlCharacters(warning)).filter((warning) => warning.includes("template_component_uncalled"));
        expect(uncalled).toHaveLength(1);
        expect(uncalled[0]).toContain("page.ts:3:45");
    });
});
