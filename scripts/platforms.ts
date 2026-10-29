/**
 * Writes the optional dependencies of `@zerolith/cli`: one platform package
 * per directory under packages/cli/platforms, at the command line's own
 * version. The committed manifest leaves them out so a workspace install
 * never looks for packages that exist only on the registry; the release
 * workflow runs this right before publishing `@zerolith/cli`.
 */
import { readFile, readdir, writeFile } from "node:fs/promises";

interface Manifest
{
    version: string;
    optionalDependencies?: Record<string, string>;
}

const manifestUrl = new URL("../packages/cli/package.json", import.meta.url);
const manifest = JSON.parse(await readFile(manifestUrl, "utf8")) as Manifest;
const platforms = (await readdir(new URL("../packages/cli/platforms/", import.meta.url))).toSorted();
manifest.optionalDependencies = Object.fromEntries(platforms.map((name) => [`@zerolith/cli-${name}`, manifest.version]));
await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 4)}\n`);
