/**
 * zerolith: the front end of the zero-server pair.
 *
 * The public surface is assembled here.
 */
export type {
    Applicability,
    Diagnostic,
    DiagnosticArgs,
    DiagnosticCode,
    DiagnosticListener,
    DiagnosticLocation,
    DiagnosticSeverity,
    DiagnosticSuggestion,
    DiagnosticText
} from "./diagnostics.js";
export { DIAGNOSTIC_URL, ZerolithError, diagnosticCatalog, onDiagnostic } from "./diagnostics.js";

export type { EffectFunction, Equals, ReadableSignal, Scope, Signal, SignalOptions } from "./signals.js";
export { batch, computed, effect, onDispose, scope, signal, untracked } from "./signals.js";
