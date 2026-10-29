# 0006: Command line distribution

Date: 2026-10-29. Status: accepted.

## Context

The `zerolith` command line is a Rust binary. Until now it existed only as a crate built from the repository, which asks every user of the buildless path, and everyone who wants `zerolith new`, to install a Rust toolchain first. A JavaScript project expects its tools to arrive through npm with the rest of its dependencies, and to run with `npx` before anything is installed. The projects whose tools are native, such as esbuild, oxlint, Biome, and Rolldown, ship them the same way: a thin npm package with one optional dependency per platform, each carrying a prebuilt binary and constrained with `os` and `cpu`, so npm installs only the one that matches the machine.

## Decision

1. **`@zerolith/cli` is the npm form of the command line.** It carries no binary and no dependencies of its own: a shim resolves the binary inside the platform package for `process.platform` and `process.arch`, runs it with the arguments and standard streams passed through, and exits with its status. `ZEROLITH_BINARY_PATH` names a binary built elsewhere, which the shim runs instead.
2. **One platform package per target**, named `@zerolith/cli-<platform>-<arch>`: Linux (glibc) and Windows on x64 and arm64, and macOS on arm64 and x64. The release workflow builds each on a runner of that platform, Linux on Ubuntu 22.04 so the binaries link against glibc 2.35, and publishes each from its directory with the binary it built. The platform directories are not npm workspaces, since npm refuses to install a workspace whose `os` and `cpu` do not match the machine; the optional dependencies of `@zerolith/cli` are written at publish time by `scripts/platforms.ts`, pinned exactly to the same version.
3. **The crate stays published** on crates.io for Rust users and for every platform without a prebuilt binary, musl systems such as Alpine among them. `cargo install zerolith` and `ZEROLITH_BINARY_PATH` are the documented route there.
4. **The scaffold depends on `@zerolith/cli`**, so `npm run dev`, `npm run build`, and `npx zerolith doctor` work in a new project without a global install, and `npx @zerolith/cli new my-app` is the documented first command.

## Consequences

- Every release carries seven more packages. They share the version of everything else and need no changelog entries of their own.
- A musl build, and a WebAssembly fallback for platforms with no runner, are open; the shim already names the gap and the alternative in its error.
- A release of the command line costs six native builds; the workflow runs them only when `@zerolith/cli` or every package is selected.
