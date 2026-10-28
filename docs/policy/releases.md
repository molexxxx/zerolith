# Release process

## Cadence

- Patch releases ship whenever a fix is ready.
- Minor releases ship when there is something to release, with a target of at least one per month during the active phase of a line.
- Major releases ship at most once every 12 months and only when a deprecation cycle has completed; see [versioning.md](versioning.md).

## Steps for a stable release

1. The release manager opens a release pull request that updates package versions and `CHANGELOG.md` entries, generated from the merged pull requests since the last release.
2. CI runs the full matrix on the pull request, including the size and benchmark assertions for runtime packages.
3. After merge, the release manager pushes a tag of the form `<package>@<version>` (for example `zerolith@1.4.0`).
4. The release workflow builds from the tag, runs the full check again, publishes to npm with provenance through trusted publishing, attaches the CycloneDX SBOM and the build log to the GitHub release, and publishes the Rust toolchain crate to crates.io when it changed.
5. The documentation site is rebuilt from the tag; the API reference and the agent index (`llms.txt`, the API manifest) are regenerated from the published build, never hand-edited.

No step publishes from a developer machine. Publishing credentials do not exist outside the workflow.

## Canary releases

Every merge to the default branch that passes CI publishes a canary version (`0.0.0-canary.<sha>` style) under the `canary` dist-tag. Canary versions are retained for 90 days.

## Security releases

Security fixes follow the same steps on an accelerated schedule and are published for every supported line at once. The advisory is published through GitHub Security Advisories with a CVE requested, and the changelog entry links it.

## Yanking

A published version is deprecated on npm (not unpublished) when it contains a security defect or a data-loss bug, with the deprecation message naming the fixed version.
