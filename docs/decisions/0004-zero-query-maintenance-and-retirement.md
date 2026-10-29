# 0004: zero-query goes into maintenance, then retires behind gates

Date: 2026-10-28. Status: accepted.

## Context

zero-query 1.3.1 is published on npm and has three dependents worth naming: the zquery-vs-code extension (1.0.6), which exists only for zero-query; the documentation website kept in the zero-query repository; and molex-media-electron, which lists the package but never imports it. About a third of zero-query's source and 45 of its exports are the WebRTC stack, and the research report deliberately leaves WebRTC out of zerolith's core.

zerolith is pre-alpha with nothing published. Retiring the package people can install today before its successor is usable would leave a gap, and retiring it without a decision on WebRTC would delete the only home that code has.

## Decision

zero-query is not retired when zerolith is "done". It moves through two separate steps with explicit gates.

### Step 1: maintenance mode

zero-query enters maintenance mode the day zerolith's core, templates, and router are usable together (the research report's stage 3). From then on:

- Security and correctness fixes only, shipped as patch releases. No new features, no API changes.
- Feature requests are answered with a pointer to zerolith, not with zero-query work.
- The zquery-vs-code extension follows the same rule: fixes only.

### Step 2: retirement

Retirement is a later decision, taken when all three gates are met:

1. zerolith has reached 1.0 with its API frozen and published.
2. The WebRTC outcome is recorded in an ADR: either a `@zerolith/webrtc` package exists, or the capability is dropped on purpose.
3. The known dependents are settled: molex-media-electron has removed the unused dependency, and zquery-vs-code has either been retargeted at zerolith or marked for archiving.

When the gates pass, retirement means:

- Deprecate the `zero-query` npm package with a message that names zerolith and links the migration guide. The published versions stay installable; nothing is unpublished.
- Archive the zero-query and zquery-vs-code repositories so they remain readable but frozen.
- Put a notice on the zero-query documentation website pointing at zerolith.
- Write the migration guide in zerolith's docs before the deprecation, not after.

## Consequences

- Patch releases keep flowing from zero-query for as long as it is in maintenance; the release process there does not change.
- zerolith's roadmap gains two items before 1.0: the WebRTC ADR and the migration guide.
- No repository is deleted at any step; the history and the published packages stay available.
