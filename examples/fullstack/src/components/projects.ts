// Every project as a card with its progress, and a form that starts a new
// one. The list is shared state, so creating a project updates the
// dashboard's numbers too.
import { createForm } from "@zerolith/forms";
import { type ReadableSignal, type View, computed, css, each, html, when } from "zerolith";
import type { Project } from "../../shared/model.ts";
import { newProjectSchema } from "../../shared/schema.ts";
import { format } from "../locale.ts";
import { router } from "../router.ts";
import { expired, projects, refresh } from "../store.ts";
import { Empty, Field, FormError } from "./ui.ts";

const page = css`
    :scope { display: grid; gap: clamp(2rem, 5vw, 3rem); }
    .top { display: grid; gap: 0.75rem; }
    .top h1 { font-size: var(--display); }
    .layout { display: grid; gap: 2rem; align-items: start; }
    @media (min-width: 60rem) { .layout { grid-template-columns: minmax(0, 1fr) 22rem; } }
    ul { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr)); gap: 1rem; margin: 0; padding: 0; list-style: none; }
    li a { display: grid; gap: 1rem; height: 100%; padding: 1.5rem; border: 2px solid var(--line); background: var(--surface); text-decoration: none; }
    li a:hover { border-color: var(--accent); }
    li h2 { font-size: 1.5rem; }
    li p { color: var(--muted); }
    .counts { font-family: var(--font-mono); font-size: 0.8125rem; }
    form { display: grid; gap: 1rem; padding: 1.5rem; border: 2px solid var(--text); }
    form h2 { font-size: 1.5rem; }
`;

/** A project's card, linking to its board. */
function Card({ project }: { project: ReadableSignal<Project> }): View
{
    const { id } = project.get();
    const total = computed(() => project.get().open + project.get().done);
    return html`
        <li>
            <a href=${router.href("project", { id: String(id) })}>
                <h2>${computed(() => project.get().name)}</h2>
                <p>${computed(() => project.get().summary)}</p>
                <progress aria-label="Done" max=${computed(() => Math.max(total.get(), 1))} value=${computed(() => project.get().done)}></progress>
                <span class="counts">${computed(() => `${format.number(project.get().open)} open, ${format.number(project.get().done)} done`)}</span>
            </a>
        </li>`;
}

export function Projects(): View
{
    const form = createForm({ schema: newProjectSchema, reset: true, onSuccess: () => refresh(), onFailure: expired });
    const list = computed(() => projects.get() ?? []);
    return html`
        <div class=${page}>
            <section class="top">
                <p class="eyebrow">Projects</p>
                <h1>${computed(() => format.number(list.get().length))} in motion.</h1>
            </section>
            <div class="layout">
                ${when(computed(() => list.get().length > 0),
                    () => html`<ul>${each(list, (project) => project.id, (project) => Card({ project }))}</ul>`,
                    () => Empty({ text: "No projects yet. Start one with the form." }))}
                <form method="post" action="/api/projects" @submit=${form.submit}>
                    <h2>New project</h2>
                    ${Field({ form, name: "name", label: "Name", required: true })}
                    ${Field({ form, name: "summary", label: "Summary", multiline: true })}
                    ${FormError({ form })}
                    <button class="primary" ?disabled=${form.pending}>Create project</button>
                </form>
            </div>
        </div>`;
}
