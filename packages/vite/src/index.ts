/**
 * The Vite plugin: the JSX lowering ahead of every other transform, hot
 * module replacement for zerolith applications in development, and the
 * template prepare pass and the checks on build output.
 */
import { relative } from "node:path";
import { type Plugin, parseSync, perEnvironmentState } from "vite";
import { DIAGNOSTIC_URL } from "zerolith";
import { scan } from "zerolith/internal";
import { type JsxOutput, lowerJsx } from "./jsx.js";
import { lintModule, position } from "./lint.js";
import { PrepareError, prepareModule } from "./prepare.js";
import { type SplitImport, splitImports } from "./split.js";
import { type ModuleParser, transformModule } from "./transform.js";

export type { AstNode, Edit, IdentityMap } from "./ast.js";
export type { JsxOutput } from "./jsx.js";
export { JsxError, lowerJsx } from "./jsx.js";
export type { Finding, LintCode } from "./lint.js";
export { lintModule, position } from "./lint.js";
export type { PrepareOutput, ScannedPart, TemplateScanner } from "./prepare.js";
export { PREPARED_BINDING, PrepareError, TEMPLATE_BINDING, VIEW_BINDING, prepareModule } from "./prepare.js";
export type { SplitImport } from "./split.js";
export { MESSAGES_HEADER, splitImports } from "./split.js";
export type { ModuleParser, ParsedModule, TransformOutput } from "./transform.js";
export { transformModule } from "./transform.js";

/** Options for `zerolith()`. */
export interface ZerolithPluginOptions
{
    /** Module ids to rewrite, tested with path separators normalized to `/`. Defaults to JavaScript and TypeScript modules. */
    include?: RegExp;
    /** Module ids to leave alone even when `include` matches. Defaults to anything under `node_modules`. */
    exclude?: RegExp;
    /** Lowers JSX in `.jsx` and `.tsx` files to `html` calls. Defaults to true. */
    jsx?: boolean;
    /** Warns in the terminal about a `.get()` read bound in a template and about static accessibility defects. Defaults to true. */
    lint?: boolean;
    /** In `vite build`, scans every `html` literal ahead of time and drops the scanner from the bundle. Defaults to true. */
    prepare?: boolean;
}

const DEFAULT_INCLUDE = /\.[cm]?[jt]sx?$/;
const DEFAULT_EXCLUDE = /\/node_modules\//;
const JSX_FILES = /\.[jt]sx$/;
/** The core module that imports the scanner; the prepare pass points it at the stand-in that reports an unprepared template. */
const SCANNER_IMPORTER = /[\\/]zerolith[\\/]dist[\\/](?:production[\\/])?template\.js$/;

/** Packages served as they are so the application and the plugin's runtime share one copy of each. */
const UNOPTIMIZED: readonly string[] = ["zerolith", "zerolith/ssr", "zerolith/element", "zerolith/jsx-runtime", "@zerolith/router", "@zerolith/forms", "@zerolith/client", "@zerolith/a11y", "@zerolith/i18n", "@zerolith/devtools", "@zerolith/vite/runtime"];

/** A module of the development build of the core: anything under `zerolith/dist/` that is not under `production/`. */
const DEVELOPMENT_MODULE = /[\\/]zerolith[\\/]dist[\\/](?!production[\\/])/;

const parse: ModuleParser = (filename, code) => parseSync(filename, code, { sourceType: "module", lang: "js" });

/** Parses a JSX file as the extension says, so the lowering sees the tree before any other transform. */
const parseJsx: ModuleParser = (filename, code) => parseSync(filename, code, { sourceType: "module", lang: filename.endsWith(".tsx") ? "tsx" : "jsx" });

/** Parses a module as its extension says, for the passes that run before Vite's own transform. */
function parseFor(id: string): ModuleParser
{
    let lang: "js" | "jsx" | "ts" | "tsx" = "js";
    if (id.endsWith(".tsx"))
    {
        lang = "tsx";
    }
    else if (/\.[cm]?ts$/.test(id))
    {
        lang = "ts";
    }
    else if (id.endsWith(".jsx"))
    {
        lang = "jsx";
    }
    return (filename, code) => parseSync(filename, code, { sourceType: "module", lang });
}

/** A module id as messages show it: relative to the project root, with forward slashes. */
function shown(root: string, id: string): string
{
    return relative(root, id).replaceAll("\\", "/");
}

/** Lowers one file's JSX, turning a refusal into a Vite error with its position. */
function lower(code: string, id: string): JsxOutput | null
{
    return lowerJsx(code, id, parseJsx);
}

/**
 * Creates the plugins. Ahead of every other transform, JSX in `.jsx` and
 * `.tsx` files is lowered to the `html` calls it stands for. In
 * development each module is rewritten so exported functions with
 * capitalized names become stable proxies, `render` and `hydrate` calls
 * are recorded with the expression they rendered, and a changed module
 * accepts its own update: named signals are saved before the module is
 * replaced, every root renders again, and the saved values flow back into
 * signals created with the same names. The zerolith packages are kept out
 * of dependency pre-bundling. In `vite build` every `html` literal is
 * scanned ahead of time and the scanner leaves the bundle. A client build
 * fails when a view loaded with the router's `lazy()`, or a locale module
 * of a compiled message index, is also imported statically, which would
 * put it in the importing chunk, and a build in production mode fails if
 * a module of the development build of the core reached the output, which
 * means the `production` export condition did not apply.
 */
export function zerolith(options: ZerolithPluginOptions = {}): Plugin[]
{
    const include = options.include ?? DEFAULT_INCLUDE;
    const exclude = options.exclude ?? DEFAULT_EXCLUDE;
    let production = false;
    const splitsOf = perEnvironmentState(() => new Map<string, { importer: string; kind: SplitImport["kind"] }>());
    const plugins: Plugin[] = [];
    if (options.jsx !== false)
    {
        plugins.push({
            name: "zerolith:jsx",
            enforce: "pre",
            transform: {
                filter: { id: { include: JSX_FILES, exclude } },
                handler(code, id)
                {
                    if (id.startsWith("\0"))
                    {
                        return null;
                    }
                    return lower(code, id);
                }
            }
        });
    }
    if (options.prepare !== false)
    {
        plugins.push({
            name: "zerolith:prepare",
            enforce: "pre",
            apply: "build",
            resolveId(source, importer)
            {
                if (source === "./scan.js" && importer !== undefined && SCANNER_IMPORTER.test(importer))
                {
                    return importer.replace(/template\.js$/, "scan.unprepared.js");
                }
                return null;
            },
            transform: {
                filter: { id: { include: DEFAULT_INCLUDE } },
                handler(code, id)
                {
                    if (id.startsWith("\0") || !code.includes("zerolith"))
                    {
                        return null;
                    }
                    try
                    {
                        return prepareModule(code, id, parseFor(id), scan);
                    }
                    catch (error)
                    {
                        if (error instanceof PrepareError)
                        {
                            const { line, column } = position(code, error.offset);
                            this.error({ message: error.message, pos: error.offset, loc: { file: id, line, column } });
                        }
                        throw error;
                    }
                }
            }
        });
    }
    plugins.push({
        name: "zerolith:split",
        enforce: "pre",
        apply: "build",
        buildStart()
        {
            splitsOf(this).clear();
        },
        transform: {
            filter: { id: { include, exclude } },
            async handler(code, id)
            {
                if (id.startsWith("\0") || this.environment.config.consumer !== "client")
                {
                    return null;
                }
                const found = splitImports(code, id, parseFor(id));
                const targets = await Promise.all(found.map((split) => this.resolve(split.specifier, id)));
                const splits = splitsOf(this);
                for (const [index, split] of found.entries())
                {
                    const target = targets[index];
                    if (target !== null && target !== undefined && !target.external)
                    {
                        splits.set(target.id, { importer: id, kind: split.kind });
                    }
                }
                return null;
            }
        }
    });
    plugins.push({
        name: "zerolith",
        apply: "serve",
        enforce: "post",
        config()
        {
            return { optimizeDeps: { exclude: [...UNOPTIMIZED] } };
        },
        transform: {
            filter: { id: { include, exclude } },
            handler(code, id, meta)
            {
                if (meta?.ssr === true || id.startsWith("\0"))
                {
                    return null;
                }
                if (options.lint !== false)
                {
                    for (const finding of lintModule(code, id, parse))
                    {
                        const { line, column } = position(code, finding.offset);
                        this.warn({ message: `${finding.code}: ${finding.message} ${DIAGNOSTIC_URL}${finding.code}`, pos: finding.offset, loc: { file: id, line, column } });
                    }
                }
                return transformModule(code, id, parse);
            }
        }
    });
    plugins.push({
        name: "zerolith:build",
        apply: "build",
        configResolved(config)
        {
            production = config.mode === "production";
        },
        generateBundle(_options, bundle)
        {
            const { consumer, root } = this.environment.config;
            if (consumer === "client")
            {
                const merged: string[] = [];
                for (const [id, split] of splitsOf(this))
                {
                    const importers = this.getModuleInfo(id)?.importers ?? [];
                    if (importers.length > 0)
                    {
                        const what = split.kind === "route" ? "a route view loaded with lazy()" : "a locale of a compiled message index";
                        merged.push(`${shown(root, id)} is ${what} in ${shown(root, split.importer)} but is also imported statically by ${importers.map((importer) => shown(root, importer)).join(" and ")}`);
                    }
                }
                if (merged.length > 0)
                {
                    this.error(`zerolith: lazy_module_not_split: ${merged.join("; ")}. The bundler puts such a module in the importing chunk instead of a chunk of its own; import only its types with import type, or remove the static import. ${DIAGNOSTIC_URL}lazy_module_not_split`);
                }
            }
            if (!production)
            {
                return;
            }
            for (const output of Object.values(bundle))
            {
                if (output.type !== "chunk")
                {
                    continue;
                }
                const leaked = Object.keys(output.modules).find((id) => DEVELOPMENT_MODULE.test(id));
                if (leaked !== undefined)
                {
                    this.error(`zerolith: the development build of zerolith reached the production output through ${leaked}. The "production" export condition did not apply; check resolve.conditions and any alias that points at zerolith/dist/.`);
                }
            }
        }
    });
    return plugins;
}
