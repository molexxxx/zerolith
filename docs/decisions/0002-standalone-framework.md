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

## Consequences

- The build plan's "zero-server pair" stage becomes "typed client over a neutral contract" plus "server rendering on WinterTC", with no dependency on another repository's release schedule.
- The pitch drops the pair: zerolith is the framework that runs from an import map or a bundle with no second-class path, with executed documentation and dev tools that work wherever the app is served.
- Package names stay neutral (`@zerolith/client` rather than `@zerolith/server`).
