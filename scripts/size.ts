/**
 * Measures the compressed size of the zerolith runtime entry and fails when
 * it exceeds the budget. Runs after `npm run build`; the bundle it measures
 * is what a consumer who imports everything would ship.
 */
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { rolldown } from "rolldown";

const BUDGET_GZIP_BYTES = 10240;

const entry = fileURLToPath(new URL("../packages/zerolith/dist/index.js", import.meta.url));
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
    throw new Error("rolldown produced no entry chunk");
}

const raw = Buffer.byteLength(code);
const gzip = gzipSync(code, { level: 9 }).byteLength;
const brotli = brotliCompressSync(code, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).byteLength;

console.log(`zerolith minified: ${raw} B, gzip: ${gzip} B, brotli: ${brotli} B (budget ${BUDGET_GZIP_BYTES} B gzip)`);
if (gzip > BUDGET_GZIP_BYTES)
{
    console.error(`size budget exceeded by ${gzip - BUDGET_GZIP_BYTES} B gzip`);
    process.exitCode = 1;
}
