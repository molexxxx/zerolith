/**
 * The Vite plugin: hot module replacement for zerolith applications in
 * development, and the checks ADR 0005 puts on production output.
 */
import { type Plugin, parseSync } from "vite";
import { type ModuleParser, transformModule } from "./transform.js";

export type { AstNode, ModuleParser, ParsedModule, TransformOutput } from "./transform.js";
export { transformModule } from "./transform.js";

/** Options for `zerolith()`. */
export interface ZerolithPluginOptions
{
    /** Module ids to rewrite, tested with path separators normalized to `/`. Defaults to JavaScript and TypeScript modules. */
    include?: RegExp;
    /** Module ids to leave alone even when `include` matches. Defaults to anything under `node_modules`. */
    exclude?: RegExp;
}

const DEFAULT_INCLUDE = /\.[cm]?[jt]sx?$/;
const DEFAULT_EXCLUDE = /\/node_modules\//;

/** Packages served as they are so the application and the plugin's runtime share one copy of each. */
const UNOPTIMIZED: readonly string[] = ["zerolith", "zerolith/ssr", "zerolith/element", "@zerolith/router", "@zerolith/forms", "@zerolith/client", "@zerolith/a11y", "@zerolith/i18n", "@zerolith/devtools", "@zerolith/vite/runtime"];

/** A module of the development build of the core: anything under `zerolith/dist/` that is not under `production/`. */
const DEVELOPMENT_MODULE = /[\\/]zerolith[\\/]dist[\\/](?!production[\\/])/;

const parse: ModuleParser = (filename, code) => parseSync(filename, code, { sourceType: "module", lang: "js" });

/**
 * Creates the plugin. In development it rewrites each module so exported
 * functions with capitalized names become stable proxies, `render` and
 * `hydrate` calls are recorded with the expression they rendered, and a
 * changed module accepts its own update: named signals are saved before the
 * module is replaced, every root renders again, and the saved values flow
 * back into signals created with the same names. It also keeps the zerolith
 * packages out of dependency pre-bundling. In a production build it leaves
 * the code alone and fails the build if a module of the development build
 * of the core reached the output, which means the `production` export
 * condition did not apply.
 */
export function zerolith(options: ZerolithPluginOptions = {}): Plugin[]
{
    const include = options.include ?? DEFAULT_INCLUDE;
    const exclude = options.exclude ?? DEFAULT_EXCLUDE;
    let production = false;
    return [
        {
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
                    return transformModule(code, id, parse);
                }
            }
        },
        {
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
        }
    ];
}
