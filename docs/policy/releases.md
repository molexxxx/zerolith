# Release process

## Cadence

- Patch releases ship whenever a fix is ready.
- Minor releases ship when there is something to release, with a target of at least one per month during the active phase of a line.
- Major releases ship at most once every 12 months and only when a deprecation cycle has completed; see [versioning.md](versioning.md).

## Versions and tags

Every package in the repository, the crate included, carries the same version and is released together. A release commit sets that version in every `packages/*/package.json`, in the ranges the packages declare on each other, in the root `package.json`, and in `Cargo.toml`, refreshes both lockfiles, and adds the `CHANGELOG.md` entry.

Tags select what the release workflow publishes:

- `<package>@<version>` publishes that npm package (for example `zerolith@1.4.0` or `@zerolith/router@1.4.0`).
- `crate@<version>` publishes the `zerolith` crate to crates.io.
- A manual run of the workflow publishes the package named in its input, or every package in dependency order with `all`, and the crate when asked; a dry run performs everything but the upload.

## Before 1.0.0

Alpha and beta versions (`0.1.0-alpha.1` and on) are published under the `alpha` or `beta` dist-tag, never `latest`, so `npm install zerolith` resolves to nothing until a stable version exists and `npm install zerolith@alpha` opts in. The changelog marks breaking changes between pre-releases the same way it does between minors.

## Steps for a stable release

1. The release manager opens a release pull request that updates package versions and `CHANGELOG.md` entries, generated from the merged pull requests since the last release.
2. CI runs the full matrix on the pull request, including the size and benchmark assertions for runtime packages.
3. After merge, the release manager pushes the tags.
4. The release workflow builds from the tag, runs the full check again, publishes to npm with provenance through trusted publishing, attaches the CycloneDX SBOM to the run, and publishes the crate to crates.io when it changed.
5. The documentation site is rebuilt from the tag; the API reference and the agent index (`llms.txt`, the API manifest) are regenerated from the published build, never hand-edited.

No step publishes from a developer machine. Publishing credentials do not exist outside the workflow.

## Credentials

npm trusted publishing is configured per package on npmjs.com (owner `molexxxx`, repository `zerolith`, workflow `release.yml`, no environment), and provenance is attached from the public repository. A package that does not exist on the registry yet cannot have a trusted publisher, so its first publish uses a granular access token stored as the `NPM_TOKEN` repository secret; the secret is deleted once every package has a trusted publisher, and the workflow ignores its absence. The crate publishes with the `CRATES_IO_TOKEN` secret until crates.io trusted publishing is configured for it.

## Canary releases

Every merge to the default branch that passes CI publishes a canary version (`0.0.0-canary.<sha>` style) under the `canary` dist-tag. Canary versions are retained for 90 days.

## Security releases

Security fixes follow the same steps on an accelerated schedule and are published for every supported line at once. The advisory is published through GitHub Security Advisories with a CVE requested, and the changelog entry links it.

## Yanking

A published version is deprecated on npm (not unpublished) when it contains a security defect or a data-loss bug, with the deprecation message naming the fixed version.
