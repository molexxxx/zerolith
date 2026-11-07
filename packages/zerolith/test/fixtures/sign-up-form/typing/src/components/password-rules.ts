// The password's rules as a checklist that follows what you type.
import { type ReadableSignal, type View, computed, css, html } from "zerolith";
import { visuallyHidden } from "@zerolith/a11y";
import { type Fields, passwordRules } from "../schema.ts";

const list = css`
    :scope {
        margin: 0; padding: 0; list-style: none;
        color: var(--muted); font-size: 0.875rem;
    }
    li { display: flex; gap: 0.5rem; }
    [data-met="true"] { color: var(--text); }
    [data-met="true"] .mark { color: var(--accent-text); }
`;

export interface PasswordRulesProps
{
    values: ReadableSignal<Fields>;
}

export function PasswordRules({ values }: PasswordRulesProps): View
{
    const rows = passwordRules.map((rule) =>
    {
        const met = computed(() => rule.passes(values.get()));
        const mark = computed(() => (met.get() ? "✓" : "○"));
        const state = computed(() => (met.get() ? "Met:" : "Not met:"));
        return html`
            <li data-met=${met}>
                <span class="mark" aria-hidden="true">${mark}</span>
                <span class=${visuallyHidden}>${state}</span>
                ${rule.label}
            </li>`;
    });
    return html`<ul class=${list}>${rows}</ul>`;
}
