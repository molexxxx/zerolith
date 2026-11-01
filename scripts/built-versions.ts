/**
 * Checks that every package's built version constant, in
 * `dist/version.js`, is the version its manifest publishes:
 * `node scripts/built-versions.ts`. The release workflow runs it before
 * publishing, since a canary sets its version after the full check and the
 * constants are what `package_version_mismatch` compares.
 */
import { access, readFile } from "node:fs/promises";
import process from "node:process";
import { builtVersion } from "./release.ts";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8")) as { workspaces: string[] };
const problems: string[] = [];
let checked = 0;
for (const workspace of manifest.workspaces)
{
    const built = new URL(`${workspace}/dist/version.js`, root);
    if (!await access(new URL(`${workspace}/src/version.ts`, root)).then(() => true, () => false))
    {
        continue;
    }
    const { name, version } = JSON.parse(await readFile(new URL(`${workspace}/package.json`, root), "utf8")) as { name: string; version: string };
    const found = await readFile(built, "utf8").then(builtVersion, () => undefined);
    checked++;
    if (found !== version)
    {
        problems.push(`${name}: dist/version.js holds ${found ?? "no version"}, and the manifest ${version}; build again`);
    }
}
if (problems.length > 0)
{
    process.stderr.write(`${problems.join("\n")}\n`);
    process.exit(1);
}
process.stdout.write(`${checked} built version constants match their manifests.\n`);
