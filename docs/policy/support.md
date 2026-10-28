# Support window and release channels

This policy takes effect with the first stable release and is published beforehand so adopters can plan against it.

## Channels

| Channel | npm dist-tag | What it is | Who should use it |
| --- | --- | --- | --- |
| Latest | `latest` | Stable releases that follow semantic versioning | Everyone in production |
| Canary | `canary` | Builds from the default branch that passed the full CI matrix | Projects that want the next fix early, and ecosystem maintainers testing compatibility |
| Experimental | `experimental` | Builds from an accepted RFC branch, API not yet frozen | Reviewers of that RFC |

Pre-release channels can change without notice and are not covered by the support window.

## Support window

Every major release line is supported for 24 months from the day its first stable version is published.

| Months after major release | Phase | What ships on that line |
| --- | --- | --- |
| 0 to 12 | Active | New minor releases with features, fixes, and security patches |
| 12 to 24 | Maintenance | Patch releases with security fixes and fixes for regressions and data-loss bugs |
| After 24 | End of life | Nothing; a final advisory is posted if a known vulnerability exists |

Until the project has at least two maintainers with release rights, only one major line is maintained at a time; the 24-month window still applies to that line, which means a new major cannot be published less than 12 months after the previous one without extending the previous line's maintenance to meet its promise. This limitation is recorded here so it is never a surprise.

## Platforms

- Browsers: the current and previous major version of Chrome, Edge, Firefox, and Safari, plus any version that supports import maps, `adoptedStyleSheets`, and `<template>`. The runtime does not polyfill.
- Node: every release line in active or maintenance LTS at the time of a zerolith release, for server rendering and tooling.
- Electron: the current stable major and the one before it, for the dev tools and the transport adapters.

A platform leaving this list is announced one minor release ahead and is a minor change, not a major one, because the runtime emits standard JavaScript and the loss is of testing coverage, not of code paths.

## Dependencies of the toolchain

Dev tooling packages (`@zerolith/cli`, `@zerolith/vite`, `@zerolith/test`) may depend on third-party packages. Their supported range of Vite, Vitest, and TypeScript is listed in each package's README and tested in CI; a bump of that range is a minor release.
