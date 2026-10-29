/**
 * Builds dist/production: the compiled modules with every `x.js` that has
 * an `x.production.js` sibling replaced by that sibling (the diagnostic
 * catalog and the devtools instrumentation). Source map comments are
 * dropped because the maps are not copied.
 */
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const production = dist + "production/";

await rm(production, { recursive: true, force: true });
await mkdir(production, { recursive: true });

const all = await readdir(dist);
const replacements = new Set(all.filter((name) => name.endsWith(".production.js")));

async function copyModule(name: string): Promise<void>
{
    const replacement = name.replace(/\.js$/, ".production.js");
    const source = replacements.has(replacement) ? dist + replacement : dist + name;
    const text = (await readFile(source, "utf8")).replace(/^\/\/# sourceMappingURL=.*$/m, "");
    await writeFile(production + name, text);
}

const names = all.filter((name) => name.endsWith(".js") && !replacements.has(name));
await Promise.all(names.map(copyModule));
await copyFile(dist + "index.d.ts", production + "index.d.ts");
await copyFile(dist + "ssr.d.ts", production + "ssr.d.ts");
