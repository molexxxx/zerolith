# Support window and release channels

This policy took effect with 1.0.0 on 2026-11-05. Before it the packages were alpha versions, where a fix shipped in the next alpha and nothing was backported.

## Channels

| Channel | npm dist-tag | What it is | Who should use it |
| --- | --- | --- | --- |
| Latest | `latest` | Stable releases that follow semantic versioning | Everyone in production |
| Alpha | `alpha` | Pre-release versions of the next major, API not frozen | Early adopters evaluating what comes next |
| Canary | `canary` | Builds from the default branch that passed the full CI matrix | Projects that want the next fix early, and ecosystem maintainers testing compatibility |
| Experimental | `experimental` | Builds from an accepted RFC branch, API not yet frozen | Reviewers of that RFC |

Pre-release channels can change without notice and are not covered by the support window.

## Support window

While the project has one maintainer with release rights, the newest major line with a stable release is the supported line: fixes ship in its next patch or minor release, pre-releases of the next major run beside it under the `alpha` tag, and an older line gets no releases once a newer stable major is out. Once the project has two maintainers with release rights, every major line published from then on is supported for 24 months from its first stable version:

| Months after major release | Phase | What ships on that line |
| --- | --- | --- |
| 0 to 12 | Active | New minor releases with features, fixes, and security patches |
| 12 to 24 | Maintenance | Patch releases with security fixes and fixes for regressions and data-loss bugs |
| After 24 | End of life | Nothing; a final advisory is posted if a known vulnerability exists |

## Platforms

- Browsers: the current and previous major version of Chrome, Edge, Firefox, and Safari, and every version since Chrome and Edge 118, Firefox 146, and Safari 17.4, the first with `@scope`, which scoped styles are built on, as well as import maps, `adoptedStyleSheets`, and `<template>`. The runtime does not polyfill, and the command line lowers CSS for those versions.
- Node: every LTS line from 24 on that has not reached end of life, for server rendering and tooling, each tested in CI; a new line joins when it enters LTS. Node 22 is not supported: the packages require Node 24 or newer.
- Electron: the current stable major and the one before it, for the dev tools and the transport adapters.

A platform leaving this list is announced one minor release ahead and is a minor change, not a major one, because the runtime emits standard JavaScript and the loss is of testing coverage, not of code paths.

## Third-party ranges

The core has no dependencies, and the other packages depend on zerolith packages only, with two exceptions declared as peer dependencies: Vite for `@zerolith/vite` and `@opentelemetry/api` for `@zerolith/otel`. The supported range of each is its peer range, tested in CI against the version the repository pins; widening or narrowing a range is a minor release.
