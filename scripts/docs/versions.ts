/**
 * Which releases the docs site shows: the newest stable release at the root
 * and, when a newer pre-release exists, that pre-release under /next/, so a
 * 2.0 alpha's docs are published without replacing the docs the stable
 * release's users read. The choice is made from the release tags alone,
 * `zerolith@<version>`, so every deploy comes out the same whatever ref
 * runs it.
 */

import { normalizeBase } from "./base.ts";

/** One release the site shows: its version and the base path its build is served under. */
export interface Shown
{
    version: string;
    base: string;
}

/** The releases the site shows: the stable one at the root, and a newer pre-release under `/next/` when there is one. */
export interface Versions
{
    stable: Shown;
    next?: Shown;
}

/** The parts of a version, for ordering: the numbers, and the pre-release identifiers or none. */
interface Parsed
{
    numbers: [number, number, number];
    prerelease: string[] | undefined;
}

const PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

function parse(version: string): Parsed | undefined
{
    const match = PATTERN.exec(version);
    if (match === null)
    {
        return undefined;
    }
    return {
        numbers: [Number(match[1]), Number(match[2]), Number(match[3])],
        prerelease: match[4] === undefined ? undefined : match[4].split(".")
    };
}

/** Orders two pre-release identifier lists as semantic versioning does: numbers before words, numbers by value, words by text, and the shorter list first when one is a prefix of the other. */
function compareIdentifiers(a: string[], b: string[]): number
{
    for (let index = 0; index < Math.max(a.length, b.length); index++)
    {
        const left = a[index];
        const right = b[index];
        if (left === undefined)
        {
            return -1;
        }
        if (right === undefined)
        {
            return 1;
        }
        const leftNumber = /^\d+$/.test(left);
        const rightNumber = /^\d+$/.test(right);
        if (leftNumber && rightNumber)
        {
            if (Number(left) !== Number(right))
            {
                return Number(left) - Number(right);
            }
        }
        else if (leftNumber !== rightNumber)
        {
            return leftNumber ? -1 : 1;
        }
        else if (left !== right)
        {
            return left < right ? -1 : 1;
        }
    }
    return 0;
}

/** Orders two versions as semantic versioning 2.0.0 does; a version the pattern cannot read sorts first. */
export function compareVersions(a: string, b: string): number
{
    const left = parse(a);
    const right = parse(b);
    if (left === undefined || right === undefined)
    {
        return left === undefined ? (right === undefined ? 0 : -1) : 1;
    }
    for (let index = 0; index < 3; index++)
    {
        const difference = (left.numbers[index] ?? 0) - (right.numbers[index] ?? 0);
        if (difference !== 0)
        {
            return difference;
        }
    }
    if (left.prerelease === undefined || right.prerelease === undefined)
    {
        return left.prerelease === undefined ? (right.prerelease === undefined ? 0 : 1) : -1;
    }
    return compareIdentifiers(left.prerelease, right.prerelease);
}

/** True for a version without pre-release identifiers. */
export function isStable(version: string): boolean
{
    return parse(version)?.prerelease === undefined;
}

/**
 * Picks what the site shows from the versions the release tags name: the
 * newest stable version at the root, and under `/next/` the newest
 * pre-release when it is newer than that stable version. With no stable
 * version yet, the newest pre-release is the root site, as before 1.0.0.
 * Returns undefined when no tag names a version.
 */
export function pickVersions(versions: readonly string[]): Versions | undefined
{
    const known = versions.filter((version) => parse(version) !== undefined).toSorted(compareVersions);
    const stable = known.findLast(isStable);
    const newest = known.at(-1);
    if (newest === undefined)
    {
        return undefined;
    }
    if (stable === undefined)
    {
        return { stable: { version: newest, base: "/" } };
    }
    const shown: Versions = { stable: { version: stable, base: "/" } };
    if (newest !== stable && compareVersions(newest, stable) > 0)
    {
        shown.next = { version: newest, base: "/next/" };
    }
    return shown;
}

/** The versions the release tags of a repository name, from `git tag` output: every `zerolith@<version>` tag. */
export function versionsOfTags(tags: readonly string[]): string[]
{
    return tags.map((tag) => tag.trim()).filter((tag) => tag.startsWith("zerolith@")).map((tag) => tag.slice("zerolith@".length));
}

/** The label the header's version selector shows for a version: its major and minor, with the pre-release channel for a pre-release, as `1.0`, `1.1 beta`, and `2.0 alpha`. */
export function labelOf(version: string): string
{
    const parsed = parse(version);
    if (parsed === undefined)
    {
        return version;
    }
    const [major, minor] = parsed.numbers;
    if (parsed.prerelease === undefined)
    {
        return `${major}.${minor}`;
    }
    const channel = parsed.prerelease.find((part) => !/^\d+$/.test(part)) ?? "pre";
    return `${major}.${minor} ${channel}`;
}

/** What the docs workflow builds: the shown versions with their bases under the Pages base, and the git ref each is built from. */
export interface Resolved
{
    versions: Versions;
    stableRef: string;
    nextRef?: string;
}

/**
 * Resolves what to build from the release tags and the line branches on
 * origin: the stable release from its line branch, `origin/1.x` for 1.0.0,
 * when that branch exists, so a fix to the stable docs deploys without a
 * release, and otherwise from its tag; a newer pre-release from its tag.
 * The bases sit under `pagesBase`, the path the Pages configuration names.
 */
export function resolveShown(tags: readonly string[], branches: readonly string[], pagesBase = "/"): Resolved | undefined
{
    const picked = pickVersions(versionsOfTags(tags));
    if (picked === undefined)
    {
        return undefined;
    }
    const under = (base: string): string => `${normalizeBase(pagesBase)}${base.slice(1)}`;
    const major = parse(picked.stable.version)?.numbers[0] ?? 0;
    const line = `${major}.x`;
    const resolved: Resolved = {
        versions: { stable: { version: picked.stable.version, base: under(picked.stable.base) } },
        stableRef: branches.includes(line) && isStable(picked.stable.version) ? `origin/${line}` : `zerolith@${picked.stable.version}`
    };
    if (picked.next !== undefined)
    {
        resolved.versions.next = { version: picked.next.version, base: under(picked.next.base) };
        resolved.nextRef = `zerolith@${picked.next.version}`;
    }
    return resolved;
}
