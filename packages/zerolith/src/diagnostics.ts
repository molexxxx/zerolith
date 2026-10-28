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
    | "event_handler_not_function"
    | "each_key_undefined"
    | "each_key_duplicate";

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
    },
    binding_in_tag_position:
    {
        cause: "An expression appears where a tag or attribute name is expected.",
        fix: "Bind values only as element content or inside an attribute value; tag and attribute names must be static."
    },
    binding_in_comment:
    {
        cause: "An expression appears inside an HTML comment.",
        fix: "Remove the expression from the comment; comments are static."
    },
    binding_in_raw_text:
    {
        cause: "An expression appears inside an element whose content is raw text.",
        fix: "Set the content of style, textarea, and title elements through a .textContent or .value property binding instead."
    },
    binding_not_single:
    {
        cause: "A boolean attribute, property, or event binding has more than one expression or extra text.",
        fix: "Bind exactly one expression with nothing around it, for example ?disabled=${flag}."
    },
    script_in_template:
    {
        cause: "A template contains a script element.",
        fix: "Keep scripts in modules; templates describe markup only."
    },
    template_unclosed_tag:
    {
        cause: "A template ends inside a tag, attribute, or comment.",
        fix: "Close the tag or comment inside the same template literal."
    },
    unsafe_property_binding:
    {
        cause: "A property binding targets a property that parses its value as HTML.",
        fix: "Bind child content with ${} instead; for trusted markup use the raw HTML API explicitly."
    },
    unsafe_attribute_binding:
    {
        cause: "An attribute binding targets an attribute that runs script or parses HTML.",
        fix: "Use an @event binding for handlers and child content for markup."
    },
    unsafe_url_blocked:
    {
        cause: "A URL attribute received a value with a scheme that can run script, and the attribute was removed.",
        fix: "Pass http, https, mailto, tel, or a relative URL; data URLs are allowed only for images."
    },
    unrenderable_value:
    {
        cause: "A value of a type the renderer cannot display was bound as content.",
        fix: "Bind a string, number, signal, template, node, or iterable; call component functions rather than passing them."
    },
    event_handler_not_function:
    {
        cause: "An @event binding received something other than a function or an object with handleEvent.",
        fix: "Pass a function, for example @click=${() => count.set(count.get() + 1)}."
    },
    each_key_undefined:
    {
        cause: "The key function passed to each() returned undefined for an item.",
        fix: "Return a stable string or number per item, such as its id."
    },
    each_key_duplicate:
    {
        cause: "Two items in an each() list produced the same key.",
        fix: "Return a key that is unique within the list; duplicates make rows indistinguishable."
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
