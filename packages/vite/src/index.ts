/**
 * The Vite plugin: the JSX lowering of RFC 0001 ahead of every other
 * transform, hot module replacement for zerolith applications in
 * development, and the checks ADR 0005 puts on production output.
 */
import { type Plugin, parseSync } from "vite";
import { type JsxOutput, lowerJsx } from "./jsx.js";
import { lintModule, position } from "./lint.js";
import { type ModuleParser, transformModule } from "./transform.js";

export type { AstNode, Edit, IdentityMap } from "./ast.js";
export type { JsxOutput } from "./jsx.js";
export { JsxError, lowerJsx } from "./jsx.js";
export type { Finding, LintCode } from "./lint.js";
export { lintModule, position } from "./lint.js";
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
}

const DEFAULT_INCLUDE = /\.[cm]?[jt]sx?$/;
const DEFAULT_EXCLUDE = /\/node_modules\//;
const JSX_FILES = /\.[jt]sx$/;

/** Packages served as they are so the application and the plugin's runtime share one copy of each. */
const UNOPTIMIZED: readonly string[] = ["zerolith", "zerolith/ssr", "zerolith/element", "zerolith/jsx-runtime", "@zerolith/router", "@zerolith/forms", "@zerolith/client", "@zerolith/a11y", "@zerolith/i18n", "@zerolith/devtools", "@zerolith/vite/runtime"];

/** A module of the development build of the core: anything under `zerolith/dist/` that is not under `production/`. */
const DEVELOPMENT_MODULE = /[\\/]zerolith[\\/]dist[\\/](?!production[\\/])/;

const parse: ModuleParser = (filename, code) => parseSync(filename, code, { sourceType: "module", lang: "js" });

/** Parses a JSX file as the extension says, so the lowering sees the tree before any other transform. */
const parseJsx: ModuleParser = (filename, code) => parseSync(filename, code, { sourceType: "module", lang: filename.endsWith(".tsx") ? "tsx" : "jsx" });

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
 * of dependency pre-bundling. In a production build the code is left
 * alone, and the build fails if a module of the development build of the
 * core reached the output of a build in production mode, which means the
 * `production` export condition did not apply.
 */
export function zerolith(options: ZerolithPluginOptions = {}): Plugin[]
{
    const include = options.include ?? DEFAULT_INCLUDE;
    const exclude = options.exclude ?? DEFAULT_EXCLUDE;
    let production = false;
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
                        this.warn({ message: `${finding.code}: ${finding.message} https://zerolith.dev/e/${finding.code}`, pos: finding.offset, loc: { file: id, line, column } });
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
