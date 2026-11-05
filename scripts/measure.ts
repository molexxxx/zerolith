/**
 * Measures a module entry the way a consumer ships it: bundled with
 * Rolldown, minified, then compressed, or as a page behind an import map
 * loads it, one module at a time. The size check and the docs site's
 * characteristics table both read the core's size from here.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { rolldown } from "rolldown";
import { parseSync } from "rolldown/utils";

/** The most the core's production entry may weigh, in bytes after gzip. */
export const CORE_BUDGET_GZIP_BYTES = 11264;

/** The most the modules the core's production entry loads behind an import map may weigh together, each compressed on its own, in bytes after gzip. */
export const CORE_BUILDLESS_BUDGET_GZIP_BYTES = 14848;

export interface Measurement
{
    raw: number;
    gzip: number;
    brotli: number;
}

/** The size of code as sent, raw and at the strongest gzip and brotli levels, which every size measurement uses. */
export function compressed(code: string | Buffer): Measurement
{
    return {
        raw: Buffer.byteLength(code),
        gzip: gzipSync(code, { level: 9 }).byteLength,
        brotli: brotliCompressSync(code, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).byteLength
    };
}

/** Bundles and minifies `entry` and returns the size of the entry chunk, raw and compressed. */
export async function measure(entry: string): Promise<Measurement>
{
    const bundle = await rolldown({ input: entry });
    const { output } = await bundle.generate({ format: "esm", minify: true });
    await bundle.close();
    let code = "";
    for (const item of output)
    {
        if (item.type === "chunk" && item.isEntry)
        {
            code = item.code;
        }
    }
    if (code === "")
    {
        throw new Error(`rolldown produced no entry chunk for ${entry}`);
    }
    return compressed(code);
}

/** The files `entry` loads through static relative imports and re-exports, itself included, with the text of each: everything a page loads before the entry runs. The packages load nothing through `import()`, which the production build test holds them to, so this is also every module the docs site serves. */
export function moduleGraph(entry: string): Map<string, string>
{
    const seen = new Map<string, string>();
    const queue = [entry];
    while (queue.length > 0)
    {
        const file = queue.pop() as string;
        if (seen.has(file))
        {
            continue;
        }
        const text = readFileSync(file, "utf8");
        seen.set(file, text);
        const { program, errors } = parseSync(file, text, { sourceType: "module" });
        if (errors.length > 0)
        {
            throw new Error(`${file}: ${errors.map((error) => error.message).join("; ")}`);
        }
        for (const statement of program.body)
        {
            const source = "source" in statement ? statement.source : null;
            if (source !== null && source !== undefined && typeof source.value === "string" && source.value.startsWith("."))
            {
                queue.push(join(dirname(file), source.value));
            }
        }
    }
    return seen;
}

/** Measures `entry` as a page behind an import map loads it: every module it reaches through static imports, as published, each compressed on its own as a server sends it. */
export function measureBuildless(entry: string): Measurement & { modules: number }
{
    const graph = moduleGraph(entry);
    const total = { raw: 0, gzip: 0, brotli: 0, modules: graph.size };
    for (const text of graph.values())
    {
        const size = compressed(text);
        total.raw += size.raw;
        total.gzip += size.gzip;
        total.brotli += size.brotli;
    }
    return total;
}
