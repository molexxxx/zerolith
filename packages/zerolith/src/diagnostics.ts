/**
 * The one record shape every zerolith diagnostic uses, whether it comes from
 * the runtime, the compiler, the CLI, or the dev tools. Tools consume it as
 * data: the overlay renders it, the editor surfaces it, the MCP endpoint
 * returns it, and a terminal prints it.
 */
import { diagnosticCatalog } from "./catalog.js";
import { printUnheard, trackDiagnostic } from "./devtools.js";

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
    /** The source file the diagnostic points into. */
    file?: string;
    /** The 1-based line within `file`. */
    line?: number;
    /** The 1-based column within `line`. */
    column?: number;
    /** A CSS selector that finds the node in the page the diagnostic is about, for a diagnostic raised at runtime. */
    selector?: string;
}

/** A concrete change that would resolve the diagnostic. */
export interface DiagnosticSuggestion
{
    /** One sentence describing the change. */
    description: string;
    /** The replacement source text, when the change is textual. */
    replacement?: string;
    /** Whether a tool may make the change unreviewed: `machine_applicable` says it may, while `maybe_incorrect` and `has_placeholders` need a person to check or complete it. */
    applicability: Applicability;
}

/** Values interpolated into a diagnostic's text, kept separately so tools can render their own. */
export type DiagnosticArgs = Readonly<Record<string, string | number | boolean>>;

/** A diagnostic as emitted by any part of zerolith. */
export interface Diagnostic
{
    /** Stable snake_case identifier, for example `signal_written_inside_computed`. Codes are public API; message text is not. */
    code: string;
    /** The diagnostic's weight; the runtime throws an `error` as a `ZerolithError` and passes every other severity to the `onDiagnostic` listeners. */
    severity: DiagnosticSeverity;
    /** One sentence naming what happened. Empty in production builds. */
    cause: string;
    /** One sentence naming what to do about it. Empty in production builds. */
    fix: string;
    /** Documentation page for the code, with the arguments encoded in the query string. */
    url: string;
    /** Where the diagnostic points, when the emitter knows: a position in the source or a node in the page. */
    location?: DiagnosticLocation;
    /** A change that would resolve the diagnostic, when the emitter can name one. */
    suggestion?: DiagnosticSuggestion;
    /** The values the diagnostic is about, such as the name of a refused attribute, kept apart so a tool can word its own text; `url` carries them in its query string. */
    args?: DiagnosticArgs;
}

/** The text of one catalog entry. */
export interface DiagnosticText
{
    /** One sentence naming what happened, used as the diagnostic's `cause` and on the code's documentation page. */
    cause: string;
    /** One sentence naming what to do about it, used as the diagnostic's `fix` and on the code's documentation page. */
    fix: string;
}

/** Base of every diagnostic URL; the code is appended as the path. */
export const DIAGNOSTIC_URL: string = "https://molexxxx.github.io/zerolith/e/";

/** The codes the runtime can emit. Every code has exactly one catalog entry. */
export type DiagnosticCode =
    | "signal_written_inside_computed"
    | "computed_cycle"
    | "effect_cycle"
    | "effect_loop"
    | "on_dispose_outside_scope"
    | "binding_in_tag_position"
    | "binding_in_comment"
    | "binding_in_raw_text"
    | "binding_not_single"
    | "script_in_template"
    | "template_unclosed_tag"
    | "unsafe_property_binding"
    | "unsafe_attribute_binding"
    | "unsafe_url_blocked"
    | "unrenderable_value"
    | "each_items_function"
    | "event_handler_not_function"
    | "when_condition_function"
    | "mount_component_uncalled"
    | "each_key_undefined"
    | "each_key_duplicate"
    | "css_value_not_allowed"
    | "ref_not_assignable"
    | "hydration_mismatch"
    | "jsx_not_lowered"
    | "template_frozen_read"
    | "image_without_alt"
    | "button_without_name"
    | "frame_without_title"
    | "mount_target_missing"
    | "template_not_prepared"
    | "lazy_module_not_split"
    | "package_version_mismatch";

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
    const record: Diagnostic = { code, severity, cause: text?.cause ?? "", fix: text?.fix ?? "", url };
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
    /** The record the error was built from, for tools that read its code and arguments as data instead of parsing the message. */
    readonly diagnostic: Diagnostic;

    /** Builds the message from the record's code, cause, fix, and URL, leaving out a cause or fix that is empty, as both are in production builds. */
    constructor(record: Diagnostic)
    {
        const detail = (record.cause === "" ? "" : ": " + record.cause) + (record.fix === "" ? "" : " " + record.fix);
        super(`[zerolith] ${record.code}${detail} ${record.url}`);
        this.name = "ZerolithError";
        this.diagnostic = record;
    }
}

/** Builds an error for a catalog code. */
export function fail(code: DiagnosticCode, args?: DiagnosticArgs, location?: DiagnosticLocation): ZerolithError
{
    const record = diagnostic(code, "error", args, location);
    trackDiagnostic(record);
    return new ZerolithError(record);
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

/**
 * Reports a non-throwing diagnostic to every listener. With none
 * registered, the development build prints it to the console instead, so
 * a warning is never lost; registering any listener takes it over.
 */
export function report(record: Diagnostic): void
{
    trackDiagnostic(record);
    if (listeners.size === 0)
    {
        printUnheard(record);
    }
    for (const listener of listeners)
    {
        try
        {
            listener(record);
        }
        catch (error)
        {
            console.error("zerolith: an onDiagnostic listener threw", error);
        }
    }
}
