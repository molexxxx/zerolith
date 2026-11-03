# Release process

## Cadence

- Patch releases ship whenever a fix is ready.
- Minor releases ship when there is something to release, with a target of at least one per month during the active phase of a line.
- Major releases ship at most once every 12 months and only when a deprecation cycle has completed; see [versioning.md](versioning.md).

## Versions and tags

Every package in the repository, the crate included, carries the same version and is released together. A release commit sets that version with `node scripts/version.ts <version>`, which writes every `packages/*/package.json`, the platform packages of the command line, the ranges the packages declare on each other, caret ranges as carets and the exact ranges of the packages that use `zerolith/internal` as exact versions, the version constants in `packages/*/src/version.ts`, the root `package.json`, and `Cargo.toml`; `npm install` and `cargo update --workspace` refresh the lockfiles, and the commit adds the version's `CHANGELOG.md` section. A test fails CI while any of these disagree, and while the release workflow's package lists miss a package.

The platform packages under `packages/cli/platforms` are not workspaces, since npm refuses to install a workspace whose `os` and `cpu` do not match the machine; the workflow publishes each from its directory with the binary built for it, waits until every one downloads from the registry, since npm installs `@zerolith/cli` without an optional dependency it cannot fetch yet and npx keeps that install in its cache, then runs `scripts/platforms.ts` to add them as optional dependencies of `@zerolith/cli` and publishes that.

Tags select what the release workflow publishes:

- `<package>@<version>` publishes that npm package (for example `zerolith@1.4.0` or `@zerolith/router@1.4.0`).
- `crate@<version>` publishes the `zerolith` crate to crates.io.
- A manual run of the workflow publishes the package named in its input, or every package in dependency order with `all`, and the crate when asked; a dry run performs everything but the upload.

## Before 1.0.0

Alpha and beta versions (`0.1.0-alpha.1` and on) are published under the `alpha` or `beta` dist-tag. npm also gives the first version of a new package the `latest` tag, so until a stable version takes it, the release workflow moves `latest` to each new pre-release as well, and `npm install zerolith` never stays behind `npm install zerolith@alpha`; the docs install with `@alpha` to make the pre-release explicit. Once a stable version exists, `latest` names only stable versions and a pre-release moves only its own tag. The changelog lists breaking changes between pre-releases under their own heading, the same way it does between minors.

## Steps for a stable release

1. The release manager opens a release pull request that updates package versions and `CHANGELOG.md` entries, generated from the merged pull requests since the last release.
2. CI runs the full matrix on the pull request, including the size budget and the benchmark comparison against `benchmarks/baseline`.
3. After merge, the release manager runs the release workflow for every package with the crate selected, first as a dry run, or pushes a `<package>@<version>` tag to release one package. The tag's version has to be the manifests' own, and a single package moves only its own dist-tag, so `latest` always names a set released together.
4. The release workflow builds from the release commit, runs each binary it built, runs the full check again, publishes to npm with provenance through trusted publishing, publishes the crate to crates.io once npm has the version, and creates a GitHub release tagged `zerolith@<version>` whose notes are the version's changelog section, with the CycloneDX SBOM attached.
5. The release workflow rebuilds the documentation site from the commit it published and deploys it to GitHub Pages, so the docs always describe what the registry serves; the API reference and the agent index (`llms.txt`, the API manifest) are regenerated from that build, never hand-edited. Pushes to the default branch do not redeploy the site, and a manual run of the docs workflow redeploys a given ref.

6. Once the GitHub release exists, the release workflow starts the benchmarks workflow, which measures the release on js-framework-benchmark next to every framework `benchmarks/frameworks.json` lists, on a GitHub-hosted runner, in a job that can write nothing. A second job checks the run's file and commits it to `benchmarks/results/` with the results section of the benchmarks README, which `npm run bench:report` writes from the runs, the newest release first; the same commit moves `benchmarks/baseline` to the release's tag, so CI measures every later push against what users installed, and pins the js-framework-benchmark entry to the release. A manual run of the benchmarks workflow measures a published version again, and the pin never moves back to an earlier release.

No step publishes from a developer machine. Publishing credentials do not exist outside the workflow.

## Credentials

The release workflow publishes to npm with provenance and to crates.io, and no credential for either exists outside this repository. Every npm package publishes through trusted publishing: its trusted publisher on npmjs.com names the owner `molexxxx`, the repository `zerolith`, and the workflow `release.yml`, with no environment, and allows `npm publish` and dist-tag operations, both of which npm leaves off by default. The workflow moves `latest` while no stable version exists, and it pins npm 11.21.1, since dist-tags through trusted publishing need npm 11.21.0 or later. A package has to exist on the registry before it can have a trusted publisher, so a new package's first publish reads a short-lived granular token from the `NPM_TOKEN` secret, which is deleted once its trusted publisher is set; without that secret the workflow holds no npm token at all. The crate publishes through crates.io trusted publishing: its trusted publisher names the same owner, repository, and workflow, with no environment, and `rust-lang/crates-io-auth-action` trades the job's OIDC token for a crates.io token that lasts 30 minutes and is revoked when the job ends. No registry token is stored anywhere.

## Canary releases

Every night the release workflow publishes a canary of every npm package from the default branch, under the `canary` dist-tag, when the packages, the crate, or the lockfiles changed since the last canary; a manual run with `canary` publishes one at once. `npm install zerolith@canary` installs the newest, and `npx @zerolith/cli@canary new my-app` starts a project on it.

A canary's version is `0.0.0-canary.<yyyymmdd>.g<commit>`, naming the day and the commit, as `0.0.0-canary.20261101.g1a2b3c4`. It sorts below every release, so no range that names a release, such as `^0.1.0-alpha.6`, matches it, and a package manager that takes the highest match never installs a canary in place of a release; only the `canary` dist-tag installs one. It runs the same full check as a release and publishes through the same trusted publisher with provenance, but it never moves `latest` or `alpha`, never publishes the crate, and creates no GitHub release or docs deployment. Publishing at most once a day, and only after a change, keeps the version list short: npm keeps every published version, and one that other packages depend on cannot be removed after 72 hours.

## Security releases

Security fixes follow the same steps on an accelerated schedule and are published for every supported line at once. The advisory is published through GitHub Security Advisories with a CVE requested, and the changelog entry links it.

## Yanking

A published version is deprecated on npm (not unpublished) when it contains a security defect or a data-loss bug, with the deprecation message naming the fixed version.
