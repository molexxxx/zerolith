# Release process

## Cadence

- Patch releases ship whenever a fix is ready.
- Minor releases ship when there is something to release, with a target of at least one per month during the active phase of a line.
- Major releases ship at most once every 12 months and only when a deprecation cycle has completed; see [versioning.md](versioning.md).

## Versions and tags

Every package in the repository, the crate included, carries the same version and is released together. A release commit sets that version in every `packages/*/package.json`, in the ranges the packages declare on each other, in the root `package.json`, and in `Cargo.toml`, refreshes both lockfiles, and adds the `CHANGELOG.md` entry.

The platform packages under `packages/cli/platforms` are not workspaces, since npm refuses to install a workspace whose `os` and `cpu` do not match the machine; the workflow publishes each from its directory with the binary built for it, then runs `scripts/platforms.ts` to add them as optional dependencies of `@zerolith/cli` and publishes that.

Tags select what the release workflow publishes:

- `<package>@<version>` publishes that npm package (for example `zerolith@1.4.0` or `@zerolith/router@1.4.0`).
- `crate@<version>` publishes the `zerolith` crate to crates.io.
- A manual run of the workflow publishes the package named in its input, or every package in dependency order with `all`, and the crate when asked; a dry run performs everything but the upload.

## Before 1.0.0

Alpha and beta versions (`0.1.0-alpha.1` and on) are published under the `alpha` or `beta` dist-tag. npm also gives the first version of a new package the `latest` tag, so `latest` points at `0.1.0-alpha.1` until a stable version takes it; install with `@alpha` (`npm install zerolith@alpha`) to get the newest pre-release. The changelog marks breaking changes between pre-releases the same way it does between minors.

## Steps for a stable release

1. The release manager opens a release pull request that updates package versions and `CHANGELOG.md` entries, generated from the merged pull requests since the last release.
2. CI runs the full matrix on the pull request, including the size and benchmark assertions for runtime packages.
3. After merge, the release manager pushes the tags.
4. The release workflow builds from the tag, runs the full check again, publishes to npm with provenance through trusted publishing, attaches the CycloneDX SBOM to the run, and publishes the crate to crates.io when it changed.
5. The release workflow rebuilds the documentation site from the commit it published and deploys it to GitHub Pages, so the docs always describe what the registry serves; the API reference and the agent index (`llms.txt`, the API manifest) are regenerated from that build, never hand-edited. Pushes to the default branch do not redeploy the site, and a manual run of the docs workflow redeploys a given ref.

No step publishes from a developer machine. Publishing credentials do not exist outside the workflow.

## Credentials

The release workflow publishes to npm with provenance and to crates.io, and the credentials for both exist only as secrets of this repository. npm trusted publishing (repository `zerolith`, workflow `release.yml`) replaces the npm token package by package, since a package has to exist on the registry before it can have a trusted publisher; the crate moves to crates.io trusted publishing the same way.

## Canary releases

Once the canary channel opens (see the [roadmap](../ROADMAP.md)), every merge to the default branch that passes CI publishes a canary version (`0.0.0-canary.<sha>` style) under the `canary` dist-tag. Canary versions are retained for 90 days.

## Security releases

Security fixes follow the same steps on an accelerated schedule and are published for every supported line at once. The advisory is published through GitHub Security Advisories with a CVE requested, and the changelog entry links it.

## Yanking

A published version is deprecated on npm (not unpublished) when it contains a security defect or a data-loss bug, with the deprecation message naming the fixed version.
