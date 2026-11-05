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

Every major release line is supported for 12 months from the day its first stable version is published while the project has one maintainer with release rights, and for 24 months once it has two; the window a line was published under is the one it keeps.

| Months after major release | Phase | What ships on that line |
| --- | --- | --- |
| 0 to 6, or 0 to 12 with two maintainers | Active | New minor releases with features, fixes, and security patches |
| 6 to 12, or 12 to 24 with two maintainers | Maintenance | Patch releases with security fixes and fixes for regressions and data-loss bugs |
| After the window | End of life | Nothing; a final advisory is posted if a known vulnerability exists |

Until the project has at least two maintainers with release rights, only one major line is maintained at a time; the 12-month window still applies to that line, which means a new major cannot be published less than 6 months after the previous one without extending the previous line's maintenance to meet its promise. This limitation is recorded here so it is never a surprise.

## Platforms

- Browsers: the current and previous major version of Chrome, Edge, Firefox, and Safari, plus any version that supports import maps, `adoptedStyleSheets`, and `<template>`. The runtime does not polyfill.
- Node: every release line in active or maintenance LTS at the time of a zerolith release, for server rendering and tooling.
- Electron: the current stable major and the one before it, for the dev tools and the transport adapters.

A platform leaving this list is announced one minor release ahead and is a minor change, not a major one, because the runtime emits standard JavaScript and the loss is of testing coverage, not of code paths.

## Third-party ranges

The core has no dependencies, and the other packages depend on zerolith packages only, with two exceptions declared as peer dependencies: Vite for `@zerolith/vite` and `@opentelemetry/api` for `@zerolith/otel`. The supported range of each is its peer range, tested in CI against the version the repository pins; widening or narrowing a range is a minor release.
