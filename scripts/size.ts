/**
 * Measures the compressed size of the zerolith runtime entries and of the
 * tasks example built for production, and fails when either exceeds its
 * budget. Runs after `npm run build`; the production bundle is what a
 * consumer who imports everything ships, and the example is what an
 * application that uses every package ships.
 */
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { build } from "vite";
import { CORE_BUDGET_GZIP_BYTES as BUDGET_GZIP_BYTES, measure } from "./measure.ts";

const development = await measure(fileURLToPath(new URL("../packages/zerolith/dist/index.js", import.meta.url)));
const production = await measure(fileURLToPath(new URL("../packages/zerolith/dist/production/index.js", import.meta.url)));

console.log(`zerolith development: ${development.raw} B minified, ${development.gzip} B gzip, ${development.brotli} B brotli`);
console.log(`zerolith production:  ${production.raw} B minified, ${production.gzip} B gzip, ${production.brotli} B brotli (budget ${BUDGET_GZIP_BYTES} B gzip)`);
if (production.gzip > BUDGET_GZIP_BYTES)
{
    console.error(`size budget exceeded by ${production.gzip - BUDGET_GZIP_BYTES} B gzip`);
    process.exitCode = 1;
}

const exampleRoot = fileURLToPath(new URL("../examples/tasks/", import.meta.url));
const EXAMPLE_BUDGET_GZIP_BYTES = 24576;

/** Builds the tasks example for production and sums the compressed size of its JavaScript. */
async function exampleSize(): Promise<{ chunks: number; gzip: number; brotli: number }>
{
    const result = await build({ root: exampleRoot, configFile: `${exampleRoot}vite.config.ts`, logLevel: "silent", build: { write: false, minify: true } });
    const outputs = Array.isArray(result) ? result : [result];
    let chunks = 0;
    let gzip = 0;
    let brotli = 0;
    for (const bundle of outputs)
    {
        if (!("output" in bundle))
        {
            continue;
        }
        for (const item of bundle.output)
        {
            if (item.type === "chunk")
            {
                chunks++;
                gzip += gzipSync(item.code, { level: 9 }).byteLength;
                brotli += brotliCompressSync(item.code, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).byteLength;
            }
        }
    }
    return { chunks, gzip, brotli };
}

const example = await exampleSize();
console.log(`examples/tasks built:  ${example.gzip} B gzip, ${example.brotli} B brotli over ${example.chunks} chunk(s) (budget ${EXAMPLE_BUDGET_GZIP_BYTES} B gzip)`);
if (example.gzip > EXAMPLE_BUDGET_GZIP_BYTES)
{
    console.error(`example size budget exceeded by ${example.gzip - EXAMPLE_BUDGET_GZIP_BYTES} B gzip`);
    process.exitCode = 1;
}
