/**
 * The Vite plugin: hot module replacement for zerolith applications in
 * development, with no effect on production builds.
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
const UNOPTIMIZED: readonly string[] = ["zerolith", "zerolith/ssr", "@zerolith/router", "@zerolith/devtools", "@zerolith/vite/runtime"];

const parse: ModuleParser = (filename, code) => parseSync(filename, code, { sourceType: "module", lang: "js" });

/**
 * Creates the plugin. In development it rewrites each module so exported
 * functions with capitalized names become stable proxies, `render` and
 * `hydrate` calls are recorded with the expression they rendered, and a
 * changed module accepts its own update: named signals are saved before the
 * module is replaced, every root renders again, and the saved values flow
 * back into signals created with the same names. It also keeps the zerolith
 * packages out of dependency pre-bundling. During `vite build` it does nothing.
 */
export function zerolith(options: ZerolithPluginOptions = {}): Plugin
{
    const include = options.include ?? DEFAULT_INCLUDE;
    const exclude = options.exclude ?? DEFAULT_EXCLUDE;
    return {
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
    };
}
