/**
 * Measures the compressed size of the zerolith runtime entries and fails
 * when the production entry exceeds the budget. Runs after `npm run build`;
 * the production bundle is what a consumer who imports everything ships.
 */
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { rolldown } from "rolldown";

const BUDGET_GZIP_BYTES = 10240;

interface Measurement
{
    raw: number;
    gzip: number;
    brotli: number;
}

async function measure(entry: string): Promise<Measurement>
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

const development = await measure(fileURLToPath(new URL("../packages/zerolith/dist/index.js", import.meta.url)));
const production = await measure(fileURLToPath(new URL("../packages/zerolith/dist/production/index.js", import.meta.url)));

console.log(`zerolith development: ${development.raw} B minified, ${development.gzip} B gzip, ${development.brotli} B brotli`);
console.log(`zerolith production:  ${production.raw} B minified, ${production.gzip} B gzip, ${production.brotli} B brotli (budget ${BUDGET_GZIP_BYTES} B gzip)`);
if (production.gzip > BUDGET_GZIP_BYTES)
{
    console.error(`size budget exceeded by ${production.gzip - BUDGET_GZIP_BYTES} B gzip`);
    process.exitCode = 1;
}
