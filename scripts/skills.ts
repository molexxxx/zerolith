/**
 * Writes the generated references of the zerolith Agent Skill from the
 * guides and the diagnostic catalog:
 *   npm run skills
 * Run it after changing a guide; a test fails while the files are stale.
 */
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { referencesFolder, skillReferences } from "./skills/generate.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = await skillReferences(root);
const folder = join(root, referencesFolder);
await mkdir(folder, { recursive: true });
for (const name of await readdir(folder))
{
    if (!files.has(`${referencesFolder}/${name}`))
    {
        await rm(join(folder, name));
    }
}
for (const [path, content] of files)
{
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
}
console.log(`skills: ${files.size} reference files written to ${referencesFolder}`);
