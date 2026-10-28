# Versioning and deprecation

All packages in this repository follow semantic versioning 2.0.0. Before 1.0.0, minor versions may contain breaking changes and are announced as such in the changelog.

## What is public API

The public API of a package is:

- Every export reachable from the package's `exports` map that is documented in the generated API reference.
- The behavior those exports have as described in the reference and in the executed examples.
- The diagnostic codes the package emits (their identifiers and meaning, not their message text).
- The shape of files the package generates for users (for example `routes.ts`) and the data formats it exchanges with zero-server.

The following are not public API and may change in a minor or patch release:

- Anything exported from a path containing `internal` or `labs`, and anything in the `@zerolith-labs` scope.
- Exact message text, stack traces, and the HTML or CSS structure of dev tools.
- The compiled output format of the optional compiler, as long as the runtime accepts both the old and the new format within the same major.

## Breaking changes

A breaking change is any change that can make a correct program fail to type-check, fail at runtime, or render differently. Breaking changes ship only in a major release and only after the deprecation cycle below.

## Deprecation cycle

1. The replacement ships in a minor release, alongside the old API.
2. In the same or the next minor release, the old API emits a coded deprecation diagnostic in development builds that names the replacement and links the migration page. The diagnostic is machine-readable and surfaces in the dev tools, the editor, and the `doctor` command.
3. A codemod for the change is published under `zerolith migrate` before the major release that removes the API.
4. The API is removed in the next major release, which is at least 12 months after step 2.

The deprecation diagnostic is part of the public API: a release cannot remove an API without having first shipped the diagnostic.

## Node, TypeScript, and tooling ranges

- Dropping a Node release line is a minor change once that line is end of life upstream; dropping it earlier is a major change.
- Raising the minimum TypeScript version required to consume the published types is a minor change if the new minimum has been stable for at least six months; otherwise it waits.
- The Vite, Vitest, and Electron ranges supported by the tooling packages are documented per package and widened or narrowed in minor releases.
