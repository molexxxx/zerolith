---
title: Diagnostics
description: The one record every error and warning uses, stable codes, documentation URLs, listeners, and production builds.
order: 8
---

# Diagnostics

Every error and warning zerolith emits is the same record: a stable snake_case code, one sentence naming the cause, one sentence naming the fix, a documentation URL with the arguments in its query string, and optionally a location and a suggestion with an applicability grade. Errors are thrown as `ZerolithError` with the record on `.diagnostic`; warnings go to `onDiagnostic` listeners.

@include packages/zerolith/test/examples/signals.example.test.ts#diagnostics

The code and the URL are public API and never change meaning. The message text is not: production builds ship an empty catalog, so an error carries only the code and the URL, and the page behind the URL carries the explanation. The [diagnostics index](/e/) lists every code.
