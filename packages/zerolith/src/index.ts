/**
 * zerolith: a standalone frontend framework.
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

export type { LoaderContext, Resource, ResourceOptions, ResourceStatus } from "./resource.js";
export { resource } from "./resource.js";

export type { KeyOf, Root, RowOf, View } from "./render.js";
export { each, html, render, when } from "./render.js";

export type { Styles } from "./css.js";
export { SCOPE_MARKER, css } from "./css.js";
