/**
 * Finds the native `zerolith` binary for the running platform. `@zerolith/cli`
 * carries no binary itself: one optional dependency per platform does, and
 * npm installs only the one whose `os` and `cpu` match, so this module
 * resolves that package or says what is missing and how to get a binary.
 * It also chooses whether a command runs here or in the project's own copy
 * of the command line, which a global install hands it to.
 */
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** The platform packages, keyed by `${platform}-${arch}` as Node reports them. */
export const PLATFORMS: Readonly<Record<string, string>> = {
    "darwin-arm64": "@zerolith/cli-darwin-arm64",
    "darwin-x64": "@zerolith/cli-darwin-x64",
    "linux-arm64": "@zerolith/cli-linux-arm64",
    "linux-x64": "@zerolith/cli-linux-x64",
    "win32-arm64": "@zerolith/cli-win32-arm64",
    "win32-x64": "@zerolith/cli-win32-x64",
};

/** The route around a missing binary, appended to every error. */
export const CARGO_HINT =
    "Alternatively install the crate with `cargo install zerolith --locked` and point ZEROLITH_BINARY_PATH at the binary.";

/** What locating needs from the host. */
export interface Host
{
    readonly platform: string;
    readonly arch: string;
    /** True on a Linux without glibc (Alpine and other musl systems), where the prebuilt binaries do not run. */
    readonly musl?: boolean;
    /** `ZEROLITH_BINARY_PATH`: a binary the user built or installed elsewhere, used as is. */
    readonly override?: string | undefined;
    /** `require.resolve` from the shim's location. */
    readonly resolve: (specifier: string) => string;
}

/** The binary's file name on a platform. */
export function binaryName(platform: string): string
{
    return platform === "win32" ? "zerolith.exe" : "zerolith";
}

/** The platform package for a platform and architecture, if one is built. */
export function platformPackage(platform: string, arch: string): string | undefined
{
    return PLATFORMS[`${platform}-${arch}`];
}

/** The commands that came after 1.0.0, each with the first version that has it, so a project's copy older than a command is not handed it. */
export const COMMANDS_SINCE: ReadonlyMap<string, string> = new Map([
    ["lint", "1.6.0"],
    ["add", "1.12.0"],
    ["upgrade", "1.12.0"],
]);

/** Set by a copy that hands a command to the project's own copy, which then runs it rather than look for another. */
export const HANDED_OFF = "ZEROLITH_HANDED_OFF";

/** What choosing the copy that runs a command needs from the host. */
export interface Project
{
    /** The arguments after the program's name. */
    readonly args: readonly string[];
    /** The folder the command runs in; the nearest `node_modules/@zerolith/cli` at it or above it is the project's copy. */
    readonly cwd: string;
    /** This copy: its package folder and its version. */
    readonly own: { readonly folder: string; readonly version: string };
    /** True when another copy handed this one the command. */
    readonly handedOff: boolean;
    /** A file's text, or undefined when it cannot be read. */
    readonly read: (path: string) => string | undefined;
    /** The real path of a file or folder, with every link resolved, or undefined when there is none. */
    readonly real: (path: string) => string | undefined;
}

/** The project's own copy of the command line: the launcher to run with Node, and its version. */
export interface Copy
{
    readonly launcher: string;
    readonly version: string;
}

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;

/** The three numbers of a version, or none when it is not one. */
function parts(text: string): number[]
{
    return (VERSION.exec(text) ?? []).slice(1, 4).map(Number);
}

/** Whether `version` comes before `since`, a release, counting a pre-release of `since` as before it. */
function before(version: string, since: string): boolean
{
    const [ours, theirs] = [parts(version), parts(since)];
    for (let index = 0; index < 3; index++)
    {
        const difference = (ours[index] ?? 0) - (theirs[index] ?? 0);
        if (difference !== 0)
        {
            return difference < 0;
        }
    }
    return version.includes("-");
}

/** Whether `path` is `folder` or inside it. */
function inside(folder: string, path: string): boolean
{
    const rest = relative(folder, path);
    return rest !== ".." && !rest.startsWith(`..${sep}`) && !isAbsolute(rest);
}

/** The copy a project's `node_modules/@zerolith/cli` holds, when it is one to hand `command` to. */
function trusted(project: Project, candidate: string, text: string, command: string | undefined): Copy | undefined
{
    let manifest: unknown;
    try
    {
        manifest = JSON.parse(text);
    }
    catch
    {
        return undefined;
    }
    if (typeof manifest !== "object" || manifest === null)
    {
        return undefined;
    }
    const { name, version, bin } = manifest as { name?: unknown; version?: unknown; bin?: unknown };
    const entry = typeof bin === "object" && bin !== null ? (bin as { zerolith?: unknown }).zerolith : undefined;
    if (name !== "@zerolith/cli" || typeof version !== "string" || !VERSION.test(version) || typeof entry !== "string" || !/\.[cm]?js$/.test(entry))
    {
        return undefined;
    }
    const since = command === undefined ? undefined : COMMANDS_SINCE.get(command);
    if (version === project.own.version || (since !== undefined && before(version, since)))
    {
        return undefined;
    }
    const folder = project.real(candidate);
    const own = project.real(project.own.folder) ?? resolve(project.own.folder);
    if (folder === undefined || relative(folder, own) === "" || isAbsolute(entry))
    {
        return undefined;
    }
    const launcher = project.real(resolve(folder, entry));
    return launcher !== undefined && inside(folder, launcher) ? { launcher, version } : undefined;
}

/**
 * The project's own copy of the command line to run a command with in place
 * of this one, as Angular's `ng` hands a command to the project's
 * `@angular/cli`: the nearest `node_modules/@zerolith/cli` at the working
 * folder or above it, when it is another copy, at another version, that has
 * the command. `new` always runs here, since it starts a project rather than
 * working on one, and so does a command another copy handed over, which
 * keeps two copies from handing it back and forth.
 */
export function projectCopy(project: Project): Copy | undefined
{
    const first = project.args[0];
    const command = first !== undefined && !first.startsWith("-") ? first : undefined;
    if (project.handedOff || command === "new")
    {
        return undefined;
    }
    for (let folder = resolve(project.cwd); ; folder = dirname(folder))
    {
        const candidate = join(folder, "node_modules", "@zerolith", "cli");
        const text = project.read(join(candidate, "package.json"));
        if (text !== undefined)
        {
            return trusted(project, candidate, text, command);
        }
        if (dirname(folder) === folder)
        {
            return undefined;
        }
    }
}

/** The path of the binary to run, or an error whose message says how to get one. */
export function locate(host: Host): string
{
    if (host.override)
    {
        return host.override;
    }
    const name = platformPackage(host.platform, host.arch);
    if (name === undefined || host.musl)
    {
        const key = `${host.platform}-${host.arch}${host.musl ? " (musl)" : ""}`;
        throw new Error(`zerolith has no prebuilt binary for ${key}. ${CARGO_HINT}`);
    }
    try
    {
        return host.resolve(`${name}/${binaryName(host.platform)}`);
    }
    catch
    {
        throw new Error(
            `${name}, the package that carries the zerolith binary for this platform, is not installed. Install @zerolith/cli without --omit=optional (its optional dependencies hold the binaries), or install ${name} directly. When npx ran this from a copy it cached before ${name} reached the registry, that copy lacks it: delete the _npx folder in npm's cache, which \`npm config get cache\` prints, and run the command again. ${CARGO_HINT}`,
        );
    }
}
