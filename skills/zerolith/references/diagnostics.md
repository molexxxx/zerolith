<!-- Generated from docs/guide/diagnostics.md by npm run skills. Edit the guide, then regenerate. -->

# Diagnostics

Every error and warning zerolith emits is the same record: a stable snake_case code, one sentence naming the cause, one sentence naming the fix, a documentation URL with the arguments in its query string, and optionally a location and a suggestion with an applicability grade. Errors are thrown as `ZerolithError` with the record on `.diagnostic`; warnings go to `onDiagnostic` listeners.

```ts
import { type ZerolithError, onDiagnostic, onDispose } from "zerolith";

// Warnings go to every listener, such as one that reports them:
const stop = onDiagnostic((diagnostic) => console.warn(diagnostic.code));

// Errors are thrown, carrying the same record:
try
{
    onDispose(() => undefined);         // outside any effect or scope
}
catch (error)
{
    const { diagnostic } = error as ZerolithError;
    console.log(diagnostic.code);       // "on_dispose_outside_scope"
    console.log(diagnostic.url);        // ".../zerolith/e/on_dispose_outside_scope"
}
stop();
```

The code and the URL are public API and never change meaning. The message text is not: production builds ship an empty catalog, so an error carries only the code and the URL, and the page behind the URL carries the explanation. The [diagnostics index](https://molexxxx.github.io/zerolith/e/) lists every code.
