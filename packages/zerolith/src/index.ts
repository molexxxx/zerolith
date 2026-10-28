/**
 * zerolith: the front end of the zero-server pair.
 *
 * The public surface is assembled here. Only the diagnostic record types are
 * exported until the reactivity core lands.
 */
export type {
    Applicability,
    Diagnostic,
    DiagnosticLocation,
    DiagnosticSeverity,
    DiagnosticSuggestion
} from "./diagnostics.js";
