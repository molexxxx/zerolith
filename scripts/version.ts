/**
 * Sets one version on every package, on the command line's platform
 * packages, on the ranges the packages declare on each other, on the
 * version constants in the packages' sources, and on the crate:
 * `node scripts/version.ts 0.1.0-alpha.2`. The lockfiles and the
 * changelog section follow in the same release commit, and the release
 * test fails until every one of them agrees.
 */
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import process from "node:process";
import { checkVersion, withCrateVersion, withFirstPartyRanges, withPackageVersion, withSourceVersion } from "./release.ts";

const version = checkVersion(process.argv[2] ?? "");
const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8")) as { workspaces: string[] };
const platforms = await readdir(new URL("packages/cli/platforms/", root));
const files = [
    "package.json",
    ...manifest.workspaces.map((workspace) => `${workspace}/package.json`),
    ...platforms.map((platform) => `packages/cli/platforms/${platform}/package.json`)
];
await Promise.all(files.map(async (file) =>
{
    const url = new URL(file, root);
    await writeFile(url, withFirstPartyRanges(withPackageVersion(await readFile(url, "utf8"), version), version));
}));
const sources = (await Promise.all(manifest.workspaces.map(async (workspace) =>
{
    const url = new URL(`${workspace}/src/version.ts`, root);
    return access(url).then(() => [url], () => []);
}))).flat();
await Promise.all(sources.map(async (url) => writeFile(url, withSourceVersion(await readFile(url, "utf8"), version))));
const cargo = new URL("Cargo.toml", root);
await writeFile(cargo, withCrateVersion(await readFile(cargo, "utf8"), version));
process.stdout.write(`${version}: ${files.length} manifests, ${sources.length} version constants, and Cargo.toml. Next: npm install, cargo update --workspace, and the CHANGELOG.md section.\n`);
