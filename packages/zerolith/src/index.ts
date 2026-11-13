/**
 * zerolith: a standalone frontend framework.
 *
 * The public surface is assembled here.
 */
export type { Diagnostic, DiagnosticArgs, DiagnosticCode, DiagnosticListener, DiagnosticSeverity, DiagnosticText } from "./diagnostics.js";
export { DIAGNOSTIC_URL, ZerolithError, diagnostic, onDiagnostic, report } from "./diagnostics.js";
export { diagnosticCatalog } from "./catalog.js";

export type { Context, EffectFunction, Equals, ReadableSignal, Scope, Signal, SignalOptions } from "./signals.js";
export { batch, computed, context, effect, hasOwner, onDispose, scope, signal, untracked } from "./signals.js";

export type { LoaderContext, Resource, ResourceOptions, ResourceStatus } from "./resource.js";
export { resource } from "./resource.js";

export type { Fallback, HydrateResult, HydrationMismatch, KeyOf, MountTarget, Renderable, Root, RowOf, View } from "./render.js";
export { boundary, each, html, hydrate, render, unsafeHtml, when } from "./render.js";

export type { Styles } from "./css.js";
export { css } from "./css.js";

export type { FieldErrors, Problem } from "./problem.js";
export { PROBLEM_MEDIA_TYPE, isProblem } from "./problem.js";
