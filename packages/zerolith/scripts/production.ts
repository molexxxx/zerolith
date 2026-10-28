/**
 * Builds dist/production: the compiled modules with the diagnostic catalog
 * replaced by the empty production catalog. Source map comments are
 * dropped because the maps are not copied.
 */
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const production = dist + "production/";

await rm(production, { recursive: true, force: true });
await mkdir(production, { recursive: true });

for (const name of await readdir(dist))
{
    if (!name.endsWith(".js") || name === "catalog.production.js")
    {
        continue;
    }
    const source = name === "catalog.js" ? dist + "catalog.production.js" : dist + name;
    const text = (await readFile(source, "utf8")).replace(/^\/\/# sourceMappingURL=.*$/m, "");
    await writeFile(production + name, text);
}
await copyFile(dist + "index.d.ts", production + "index.d.ts");
