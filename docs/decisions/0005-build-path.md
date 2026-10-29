# 0005: The build path

Date: 2026-10-29. Status: accepted.

## Context

zerolith runs unbuilt from an import map, and that stays the documented first form. Most applications ship through a bundler all the same, and the project needs the built form to be as good as any framework's: small output, dead code gone, routes and locales split, and the same program whether a project uses Vite, another bundler, or the Rust command line. The research report set the direction: Vite 8 on Rolldown and Oxc is where the industry went, "the build is an optimizer, not a requirement", and an ahead-of-time template prepare pass plus JSX sugar lower to the same tagged-template calls the runtime accepts.

## Decision

1. **Vite 8 is the reference bundler.** `@zerolith/vite` is the one plugin the project maintains for a bundler, and it targets Vite 8's Rolldown-backed build. Production output is measured in CI the way the runtime is: a size budget for the core, and a built example (`examples/tasks`) whose output size is recorded on every change.
2. **The optimizer passes live in the plugin's build mode, not in the runtime.** In order of delivery:
   - *Template prepare pass.* Every `html` literal is scanned at build time: the marker-bearing HTML string and the part table are emitted next to the literal, so the browser never scans, the static markup is one string the engine parses once, and the scanner itself leaves the production bundle when every template in the bundle is prepared.
   - *Dead development code.* The `production` export condition already swaps the diagnostic catalog and the dev tools for empty modules; the pass asserts that no module from `zerolith/dist/` outside `production/` reached the output.
   - *Static hoisting.* Templates with no bindings, and the static prefixes of templates with bindings, are hoisted to module scope so they are created once.
   - *Route and locale splitting.* Route views declared with `lazy()` and message modules from `zerolith-i18n` are their own chunks by construction; the pass checks that no eager import pulls a lazy route into the entry.
   - *JSX lowering* (RFC 0001), which produces the same `html` calls the prepare pass then optimizes.
3. **The transforms are pure functions, so other bundlers get adapters, not rewrites.** The plugin's `transformModule`, the prepare pass, and the JSX lowering take source text and return source text with a source map. An adapter for Rolldown used directly, esbuild, Rspack, or webpack is a thin binding of those functions to that tool's hook API, and the project publishes them as they are asked for, under `@zerolith/vite`'s sibling names, each tested against the same fixture application.
4. **The Rust command line covers the buildless path and grows the same passes.** `zerolith dev` serves sources as they are; `zerolith build` will apply type stripping, JSX lowering, and the template prepare pass through `oxc_transformer` and emit an import map with integrity hashes, so a project that never adopts a bundler still ships optimized modules. Bundling itself stays Vite's job: the command line does not grow a module bundler.
5. **JavaScript and TypeScript are equal citizens.** Every pass accepts `.js`, `.ts`, `.jsx`, and `.tsx`; type stripping is Oxc's in Vite and in the command line; nothing requires a `tsconfig` to build, and type checking stays `tsc`'s job in `npm run typecheck`.

## Consequences

- The runtime does not grow build-only concerns; the prepare pass has to produce exactly the structures `prepare()` produces at run time, and a parity test asserts it for every template in the examples.
- Output size joins the CI gate: the built example's compressed size is printed and a regression over a threshold fails the build.
- Adapters for other bundlers are additive and share one test fixture, so supporting a tool costs a binding, not a port.
- The Rust crate gains `build` after the prepare pass exists in TypeScript, so the two implementations can be checked against each other.
