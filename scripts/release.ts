/**
 * What a release reads and writes: the one version every package and the
 * crate share, the ranges the packages declare on each other, and the
 * changelog section a GitHub release carries as its notes. Text edits keep
 * each manifest's formatting, so a version bump diffs as one line per field.
 */

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * A range on a first-party package, as the packages declare on each other:
 * a caret range, or the exact version a package that uses
 * `zerolith/internal` requires.
 */
const FIRST_PARTY_RANGE = /("(?:zerolith|@zerolith\/[a-z0-9-]+)": "\^?)\d[^"]*(")/g;

/** The version constant of a package's `src/version.ts`. */
const SOURCE_VERSION = /^(export const version: string = ")[^"]*(";)$/m;

/** Returns `version` when it is a full semantic version, and throws otherwise. */
export function checkVersion(version: string): string
{
    if (!SEMVER.test(version))
    {
        throw new Error(`not a semantic version: "${version}"`);
    }
    return version;
}

/** Sets the top-level `version` of a package.json text. */
export function withPackageVersion(text: string, version: string): string
{
    const pattern = /^(    "version": ")[^"]*(")/m;
    if (!pattern.test(text))
    {
        throw new Error("no top-level version field");
    }
    return text.replace(pattern, `$1${version}$2`);
}

/** Points every first-party range at `version`, keeping caret ranges caret and exact versions exact. */
export function withFirstPartyRanges(text: string, version: string): string
{
    return text.replace(FIRST_PARTY_RANGE, `$1${version}$2`);
}

/** Sets the version constant of a package's `src/version.ts`. */
export function withSourceVersion(text: string, version: string): string
{
    if (!SOURCE_VERSION.test(text))
    {
        throw new Error("no version constant");
    }
    return text.replace(SOURCE_VERSION, `$1${version}$2`);
}

/** Sets the workspace version in the root Cargo.toml. */
export function withCrateVersion(text: string, version: string): string
{
    const pattern = /^(version = ")[^"]*(")/m;
    if (!pattern.test(text))
    {
        throw new Error("no workspace version in Cargo.toml");
    }
    return text.replace(pattern, `$1${version}$2`);
}

/** The body of the changelog section for `version`, or undefined when there is none. */
export function changelogSection(changelog: string, version: string): string | undefined
{
    const lines = changelog.split("\n");
    const start = lines.findIndex((line) => line === `## ${version}` || line.startsWith(`## ${version} (`));
    if (start === -1)
    {
        return undefined;
    }
    const next = lines.findIndex((line, index) => index > start && line.startsWith("## "));
    return lines.slice(start + 1, next === -1 ? lines.length : next).join("\n").trim();
}

/** The notes of the GitHub release for `version`: its changelog section and how to install it. */
export function releaseNotes(changelog: string, version: string): string
{
    const section = changelogSection(changelog, version);
    if (section === undefined || section === "")
    {
        throw new Error(`CHANGELOG.md has no section for ${version}`);
    }
    return [
        section,
        "",
        "## Install",
        "",
        "```sh",
        `npm install zerolith@${version}`,
        `npx @zerolith/cli@${version} new my-app`,
        `cargo install zerolith --version ${version}`,
        "```",
        "",
        "Every npm package is published with provenance, and the CycloneDX SBOM of the release is attached.",
        ""
    ].join("\n");
}
