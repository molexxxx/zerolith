/**
 * Finds the native `zerolith` binary for the running platform. `@zerolith/cli`
 * carries no binary itself: one optional dependency per platform does, and
 * npm installs only the one whose `os` and `cpu` match, so this module
 * resolves that package or says what is missing and how to get a binary.
 */

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
    "Alternatively install the crate with `cargo install zerolith` and point ZEROLITH_BINARY_PATH at the binary.";

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
