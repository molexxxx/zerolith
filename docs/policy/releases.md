# Release process

## Cadence

- Patch releases ship whenever a fix is ready.
- Minor releases ship when there is something to release, with a target of at least one per month during the active phase of a line.
- A major release ships when a milestone or a breaking change warrants it, a breaking change only after the deprecation cycle in [versioning.md](versioning.md), which is one release long while the project has one maintainer; once it has two, majors ship at most once every 12 months.

## Lines

Every release comes from `main`, a stable version under `latest` and a pre-release under a tag of its own. A branch named after the newest stable line, such as `1.x`, follows `main` by fast-forward after each release, so it holds no commit `main` does not. When `main` starts the next major, the branch stops following it and carries the line's fixes: a fix lands on `main` and is cherry-picked to the branch with `git cherry-pick -x`, and the branch releases its patches with the release workflow run on the branch and its `tag` input naming the line, so `latest` stays with the newest major. CI runs on `main` and on every line branch.

## Versions and tags

Every package in the repository, the crate included, carries the same version and is released together. A release commit sets that version with `node scripts/version.ts <version>`, which writes every `packages/*/package.json`, the platform packages of the command line, the ranges the packages declare on each other, caret ranges as carets and the exact ranges of the packages that use `zerolith/internal` as exact versions, the version constants in `packages/*/src/version.ts`, the root `package.json`, and `Cargo.toml`; `npm install` and `cargo update --workspace` refresh the lockfiles, and the commit adds the version's `CHANGELOG.md` section. A test fails CI while any of these disagree, and while the release workflow's package lists miss a package.

The platform packages under `packages/cli/platforms` are not workspaces, since npm refuses to install a workspace whose `os` and `cpu` do not match the machine; the workflow publishes each from its directory with the binary built for it, waits until every one downloads from the registry, since npm installs `@zerolith/cli` without an optional dependency it cannot fetch yet and npx keeps that install in its cache, then runs `scripts/platforms.ts` to add them as optional dependencies of `@zerolith/cli` and publishes that.

Tags select what the release workflow publishes:

- `<package>@<version>` publishes that npm package (for example `zerolith@1.4.0` or `@zerolith/router@1.4.0`).
- `crate@<version>` publishes the `zerolith` crate to crates.io.
- A manual run of the workflow publishes the package named in its input, or every package in dependency order with `all`, and the crate when asked; a dry run performs everything but the upload.

## Before 1.0.0

Alpha and beta versions (`0.1.0-alpha.1` and on) are published under the `alpha` or `beta` dist-tag. npm also gives the first version of a new package the `latest` tag, so until a stable version takes it, the release workflow moves `latest` to each new pre-release as well, and `npm install zerolith` never stays behind `npm install zerolith@alpha`; the docs install with `@alpha` to make the pre-release explicit. Once a stable version exists, `latest` names only stable versions and a pre-release moves only its own tag. With its `tag` input left empty, the workflow publishes a stable version under `latest`, moving no other tag, and a pre-release under its own word, such as `beta` for `2.0.0-beta.1`; it refuses `latest` for a pre-release. The changelog lists breaking changes between pre-releases under their own heading, the same way it does between minors.

## Steps for a stable release

1. A commit on `main` sets the version with `node scripts/version.ts <version>` and moves the changelog's unreleased entries into the version's `CHANGELOG.md` section, dated the day the release runs.
2. CI runs the full matrix on that push, including the size budget and the benchmark comparison against `benchmarks/baseline`.
3. The release manager runs the release workflow on `main` for every package with the crate selected, first as a dry run, or pushes a `<package>@<version>` tag to release one package. The tag's version has to be the manifests' own, and a single package moves only its own dist-tag, so `latest` always names a set released together.
4. The release workflow builds from the commit it runs on, which is the release commit unless a fix landed after it, in which case the fix's changelog entry joins the version's section; it runs each binary it built, runs the full check again and packs every npm package in a job that holds no publishing credential, publishes those tarballs to npm with provenance from a job that installs nothing but the pinned npm, without install scripts, so no dependency's code runs beside the credentials, checks the crate and builds it as packaged the same way before a job that compiles nothing publishes it to crates.io once npm has the version, and creates a GitHub release tagged `zerolith@<version>` on that commit, whose notes are the version's changelog section, with the CycloneDX SBOM attached.
5. The release workflow then runs the docs workflow on `main`, which deploys the documentation site to GitHub Pages: the newest stable release at the root, built from `main` while `main` carries the stable line, from the line's branch once `main` moves on, and from its tag otherwise, so the docs always describe what `latest` serves, and a newer pre-release under `/next/`, built from its tag, with a switch in the header between the two, on each side whose build renders it, and the root pointing at the diagnostic pages only the pre-release has; the API reference and the agent index (`llms.txt`, the API manifest) are regenerated from that build, never hand-edited. Every push to `main` deploys the site too, so a change to it goes live with its push, and a manual run of the docs workflow deploys from a given ref. One deploy runs at a time and only the newest waits, so an older build never replaces a newer one.

6. Once the GitHub release exists, the release workflow starts the benchmarks workflow on the release's tag, which measures the release on js-framework-benchmark, with the release before it, the newest `zerolith@` tag below it, in the same session on the same machine, next to every framework `benchmarks/frameworks.json` lists, on a GitHub-hosted runner, in a job that can write nothing. A second job checks the run's file and commits it to `benchmarks/results/` with the results section of the benchmarks README, which `npm run bench:report` writes from the runs, the newest release first; the same commit pins the js-framework-benchmark entry to the release and moves `benchmarks/baseline` to the release's tag, so CI measures every later push against what users installed, unless the baseline names a faster commit the release does not hold. The workflow then runs the docs workflow on `main` again, and since the docs workflow takes the benchmark runs from main, the site's benchmarks page shows the new run. One benchmark run goes at a time and only the newest waits, so of two releases made while a run is underway, only the later is measured. A manual run of the benchmarks workflow measures a published version again, and the pin never moves back to an earlier release.
7. The line's branch, such as `1.x`, fast-forwards to the release commit while it follows `main`.

No step publishes from a developer machine. Publishing credentials do not exist outside the workflow.

## Credentials

The release workflow publishes to npm with provenance and to crates.io, and no credential for either exists outside this repository. An npm package publishes through trusted publishing once it has a trusted publisher on npmjs.com, which names the owner `molexxxx`, the repository `zerolith`, and the workflow `release.yml`, with no environment, and allows `npm publish` and dist-tag operations, both of which npm leaves off by default. The workflow moves `latest` while no stable version exists, and it pins npm 11.21.1, since dist-tags through trusted publishing need npm 11.21.0 or later. A package has to exist on the registry before it can have a trusted publisher, so the repository keeps a granular token in the `NPM_TOKEN` secret, and npm falls back to it for a package with no trusted publisher, as every new package is until its first publish and until its trusted publisher is added after that. A release that includes a name npm has never published checks that npm accepts the token and publishes that name before any other package, so a token that cannot create it stops the release before any package moves. A trusted publisher added after September 2026 leaves direct publishing off until it is turned on, and the workflow runs `npm publish`, so a new trusted publisher needs it on. The crate publishes through crates.io trusted publishing: its trusted publisher names the same owner, repository, and workflow, with no environment, and `rust-lang/crates-io-auth-action` trades the job's OIDC token for a crates.io token that lasts 30 minutes and is revoked when the job ends, so no crates.io token is stored anywhere.

## Canary releases

Every night the release workflow publishes a canary of every npm package from the default branch, under the `canary` dist-tag, when the packages, the crate, or the lockfiles changed since the last canary; a manual run with `canary` publishes one at once. `npm install zerolith@canary` installs the newest, and `npx @zerolith/cli@canary new my-app` starts a project on it.

A canary's version is `0.0.0-canary.<yyyymmdd>.g<commit>`, naming the day and the commit, as `0.0.0-canary.20261101.g1a2b3c4`. It sorts below every release, so no range that names a release, such as `^0.1.0-alpha.6`, matches it, and a package manager that takes the highest match never installs a canary in place of a release; only the `canary` dist-tag installs one. It runs the same full check as a release and publishes through the same trusted publisher with provenance, but it never moves `latest` or `alpha`, never publishes the crate, and creates no GitHub release or docs deployment. A canary leaves out a package npm has never published, since npm gives a package's first version the `latest` tag, so that first version comes from a release. Publishing at most once a day, and only after a change, keeps the version list short: npm keeps every published version, and one that other packages depend on cannot be removed after 72 hours.

## Security releases

Security fixes follow the same steps on an accelerated schedule and are published for every supported line at once. The advisory is published through GitHub Security Advisories with a CVE requested, and the changelog entry links it.

## Yanking

A published version is deprecated on npm (not unpublished) when it contains a security defect or a data-loss bug, with the deprecation message naming the fixed version.
