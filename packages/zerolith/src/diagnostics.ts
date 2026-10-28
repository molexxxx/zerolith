/**
 * The one record shape every zerolith diagnostic uses, whether it comes from
 * the runtime, the compiler, the CLI, or the dev tools. Tools consume it as
 * data: the overlay renders it, the editor surfaces it, the MCP endpoint
 * returns it, and a terminal prints it.
 */

/**
 * How safely a suggestion can be applied without a human reading it,
 * following the grades rustc uses for its own suggestions.
 */
export type Applicability =
    | "machine_applicable"
    | "maybe_incorrect"
    | "has_placeholders"
    | "unspecified";

/** The weight of a diagnostic. Deprecations are their own class so tooling can count them separately. */
export type DiagnosticSeverity = "error" | "warning" | "deprecation" | "info";

/** Where a diagnostic points. Source positions are 1-based; `selector` locates a DOM node at runtime. */
export interface DiagnosticLocation
{
    file?: string;
    line?: number;
    column?: number;
    selector?: string;
}

/** A concrete change that would resolve the diagnostic. */
export interface DiagnosticSuggestion
{
    /** One sentence describing the change. */
    description: string;
    /** The replacement source text, when the change is textual. */
    replacement?: string;
    applicability: Applicability;
}

/** Values interpolated into a diagnostic's text, kept separately so tools can render their own. */
export type DiagnosticArgs = Readonly<Record<string, string | number | boolean>>;

/** A diagnostic as emitted by any part of zerolith. */
export interface Diagnostic
{
    /** Stable snake_case identifier, for example `signal_written_inside_computed`. Codes are public API; message text is not. */
    code: string;
    severity: DiagnosticSeverity;
    /** One sentence naming what happened. */
    cause: string;
    /** One sentence naming what to do about it. */
    fix: string;
    /** Documentation page for the code, with the arguments encoded in the query string. */
    url: string;
    location?: DiagnosticLocation;
    suggestion?: DiagnosticSuggestion;
    args?: DiagnosticArgs;
}

/** The text of one catalog entry. */
export interface DiagnosticText
{
    cause: string;
    fix: string;
}

/** Base of every diagnostic URL; the code is appended as the path. */
export const DIAGNOSTIC_URL: string = "https://zerolith.dev/e/";

/** The codes the runtime can emit. Every code has exactly one catalog entry. */
export type DiagnosticCode =
    | "signal_written_inside_computed"
    | "computed_cycle"
    | "effect_cycle"
    | "effect_loop"
    | "on_dispose_outside_scope";

/**
 * Every diagnostic the runtime can emit. The documentation pages for the
 * codes are generated from this table, so an entry here is the single
 * source of truth for both the message and the docs.
 */
export const diagnosticCatalog: Readonly<Record<DiagnosticCode, DiagnosticText>> = {
    signal_written_inside_computed:
    {
        cause: "A signal was written while a computed value was being evaluated.",
        fix: "Move the write into an effect or an event handler; computed functions must be pure."
    },
    computed_cycle:
    {
        cause: "A computed value read itself, directly or through other computed values.",
        fix: "Break the cycle, for example by reading the previous value inside untracked()."
    },
    effect_cycle:
    {
        cause: "An effect was triggered synchronously while it was already running.",
        fix: "Do not write to a signal the effect reads from inside its own cleanup function."
    },
    effect_loop:
    {
        cause: "Effects kept re-triggering each other for more than 100 rounds in one batch.",
        fix: "Find the effect that writes a signal it also reads and make the write conditional."
    },
    on_dispose_outside_scope:
    {
        cause: "onDispose() was called with no enclosing effect or scope to attach to.",
        fix: "Call onDispose() inside an effect, a scope(), or a component."
    }
};

/** Builds the full diagnostic record for a catalog code. */
export function diagnostic(code: DiagnosticCode, severity: DiagnosticSeverity, args?: DiagnosticArgs, location?: DiagnosticLocation): Diagnostic
{
    const text = diagnosticCatalog[code];
    let url = DIAGNOSTIC_URL + code;
    if (args !== undefined)
    {
        const query = new URLSearchParams();
        for (const key of Object.keys(args))
        {
            query.set(key, String(args[key]));
        }
        url += "?" + query.toString();
    }
    const record: Diagnostic = { code, severity, cause: text.cause, fix: text.fix, url };
    if (args !== undefined)
    {
        record.args = args;
    }
    if (location !== undefined)
    {
        record.location = location;
    }
    return record;
}

/** An error thrown by zerolith. The diagnostic carries the machine-readable detail. */
export class ZerolithError extends Error
{
    readonly diagnostic: Diagnostic;

    constructor(record: Diagnostic)
    {
        super(`[zerolith] ${record.code}: ${record.cause} ${record.fix} ${record.url}`);
        this.name = "ZerolithError";
        this.diagnostic = record;
    }
}

/** Builds an error for a catalog code. */
export function fail(code: DiagnosticCode, args?: DiagnosticArgs, location?: DiagnosticLocation): ZerolithError
{
    return new ZerolithError(diagnostic(code, "error", args, location));
}

/** Receives every non-throwing diagnostic the runtime reports. */
export type DiagnosticListener = (diagnostic: Diagnostic) => void;

const listeners: Set<DiagnosticListener> = new Set();

/** Subscribes to warnings, deprecations, and info diagnostics. Returns an unsubscribe function. */
export function onDiagnostic(listener: DiagnosticListener): () => void
{
    listeners.add(listener);
    return () =>
    {
        listeners.delete(listener);
    };
}

/** Reports a non-throwing diagnostic to every listener. */
export function report(record: Diagnostic): void
{
    for (const listener of listeners)
    {
        listener(record);
    }
}
