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
    /** Values interpolated into the cause and fix, kept separately so tools can render their own text. */
    args?: Readonly<Record<string, string | number | boolean>>;
}
