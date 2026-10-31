/**
 * Measures a module entry the way a consumer ships it: bundled with
 * Rolldown, minified, then compressed. The size check and the docs site's
 * characteristics table both read the core's size from here.
 */
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { rolldown } from "rolldown";

/** The most the core's production entry may weigh, in bytes after gzip. */
export const CORE_BUDGET_GZIP_BYTES = 10240;

export interface Measurement
{
    raw: number;
    gzip: number;
    brotli: number;
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
    return {
        raw: Buffer.byteLength(code),
        gzip: gzipSync(code, { level: 9 }).byteLength,
        brotli: brotliCompressSync(code, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).byteLength
    };
}
