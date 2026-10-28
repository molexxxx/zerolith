/**
 * The production catalog: no message text. Diagnostics keep their code and
 * URL, and the documentation page for the code carries the explanation.
 */
import type { DiagnosticCode, DiagnosticText } from "./diagnostics.js";

export const diagnosticCatalog: Readonly<Partial<Record<DiagnosticCode, DiagnosticText>>> = {};
