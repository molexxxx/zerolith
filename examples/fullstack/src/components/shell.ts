// The frame around every page once a member is signed in: the header with
// the brand, the navigation, the date format, and the member, then the page.
import { type View, computed, css, html } from "zerolith";
import { locale } from "../locale.ts";
import { router } from "../router.ts";
import { signOut, user } from "../store.ts";

const frame = css`
    :scope { min-height: 100vh; display: grid; grid-template-rows: auto 1fr; }
    header { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem 2rem; padding: 0.75rem clamp(1rem, 4vw, 3rem); border-bottom: 2px solid var(--line); background: var(--surface); }
    .brand { display: flex; align-items: center; gap: 0.625rem; font-family: var(--font-display); font-size: 1.125rem; font-weight: 800; letter-spacing: -0.02em; text-transform: uppercase; text-decoration: none; }
    .brand::before { content: ""; width: 0.875rem; height: 0.875rem; background: var(--accent); }
    nav { display: flex; gap: 0.25rem; }
    nav a { padding: 0.625rem 0.75rem; border-bottom: 2px solid transparent; color: var(--muted); font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; text-decoration: none; }
    nav a:hover { color: var(--text); }
    nav a[aria-current="page"] { border-bottom-color: var(--accent-text); color: var(--text); }
    .member { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem 1.25rem; margin-left: auto; }
    .format { display: flex; align-items: center; gap: 0.5rem; }
    .format select { width: auto; }
    .name { font-weight: 600; }
    main { width: 100%; max-width: 76rem; margin: 0 auto; padding: clamp(1.5rem, 4vw, 3rem) clamp(1rem, 4vw, 3rem); }
`;

/** A navigation link that marks itself while its page is shown. */
function Link({ href, label, exact }: { href: string; label: string; exact: boolean }): View
{
    const here = router.matches(href, { exact });
    return html`<a href=${href} aria-current=${computed(() => (here.get() ? "page" : undefined))}>${label}</a>`;
}

/** Switches the format to the one the reader picked. */
function choose(event: Event): void
{
    locale.set((event.target as HTMLSelectElement).value);
}

/** The format picker: each choice named in its own language. */
function FormatPicker(): View
{
    const options = locale.supported.map((tag) => html`
        <option value=${tag} ?selected=${computed(() => locale.locale.get() === tag)}>
            ${new Intl.DisplayNames([tag], { type: "language" }).of(tag) ?? tag}
        </option>`);
    return html`
        <label class="format">
            <span class="eyebrow">Format</span>
            <select @change=${choose}>${options}</select>
        </label>`;
}

export function Shell({ content }: { content: View }): View
{
    return html`
        <div class=${frame}>
            <header>
                <a class="brand" href=${router.href("dashboard")}>Harbor</a>
                <nav aria-label="Pages">
                    ${Link({ href: router.href("dashboard"), label: "Dashboard", exact: true })}
                    ${Link({ href: router.href("projects"), label: "Projects", exact: false })}
                </nav>
                <div class="member">
                    ${FormatPicker()}
                    <span class="name">${computed(() => user.get()?.name ?? "")}</span>
                    <button @click=${() => void signOut()}>Sign out</button>
                </div>
            </header>
            <main>${content}</main>
        </div>`;
}
