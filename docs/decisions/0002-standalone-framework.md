# 0002: zerolith is a standalone framework

Date: 2026-10-28. Status: accepted. Supersedes the "zero-server pair" positioning in the research report and in ADR 0001's context.

## Context

The research report framed zerolith as "the front end of the zero-server pair" and planned a generated route contract, server-pushed signals, and CSRF rules derived from zero-server's route table as the framework's moat. zero-server is itself under development, and tying the framework's shape and schedule to it would narrow the audience to one backend and inherit that backend's timeline.

## Decision

zerolith is a standalone frontend framework. It works with any backend over plain HTTP and makes no assumption about what serves the page or the API.

- The core, the router, and every first-party runtime package stay backend-agnostic. Nothing in them imports, references, or special-cases zero-server.
- The typed client work targets a neutral contract: a generated TypeScript surface from an OpenAPI or JSON Schema document. zero-server is one possible producer of such a document, like any other server.
- Server rendering and hydration are designed against the WinterTC `Request` and `Response` surface so they run in Node, Deno, Bun, workers, or inside any server that can host JavaScript.
- Integration with zero-server, if it happens, is an optional package in its own right, built after the framework stands on its own, and it is not part of the positioning.

## What this gives up

The research report named the generated server contract (typed routes, server-pushed signals, and CSRF rules derived from zero-server's route table) as the framework's main advantage, and listed losing it among the signs the direction is wrong, because the framework would then compete on runtime merits against Solid 2 and Vue Vapor. That is accepted knowingly: a typed client over OpenAPI or JSON Schema is table stakes, not a differentiator, and the project does not claim it as one.

## The pitch

What remains unique, and what the project is positioned on:

1. Buildless and bundled are equals: the same files run from an import map or through a bundler, and the compiler is an optimizer, not a requirement. No compiled framework offers this.
2. Documentation that cannot drift: every example in the docs is a test that runs in CI, and the reference is generated from the source.
3. Dev tools that work wherever the app is served, independent of any dev server.
4. An API small enough to fit an agent's always-on context, with one way to do each thing and coded, fix-suggesting diagnostics.

A zero-server integration can appear later as an optional showcase of the typed-client layer; it is not the identity of the project.

## Consequences

- The build plan's "zero-server pair" stage becomes "typed client over a neutral contract" plus "server rendering on WinterTC", with no dependency on another repository's release schedule.
- Package names stay neutral (`@zerolith/client` rather than `@zerolith/server`).
