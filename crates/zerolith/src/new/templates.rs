//! The starter's source files as templates: the page, the entry, the
//! router, the layout, and the three pages, in TypeScript, JavaScript, TSX,
//! and JSX, with placeholders `fill` replaces.

/// The favicon from `brand/app-icon`, copied into the crate so the published crate carries it; a test keeps the two in step.
pub(super) const FAVICON: &str = include_str!("../../templates/favicon.svg");

pub(super) const INDEX_HTML: &str = r#"<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>__NAME__</title>
    <meta name="description" content="__NAME__, a zerolith application.">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/src/styles.css">
    <script type="module" src="/src/main.__EXT__"></script>
</head>
<body>
    <div id="app"></div>
</body>
</html>
"#;

pub(super) const STYLES: &str = include_str!("../../templates/styles.css");

pub(super) const MAIN: &str = r##"// The entry: wait for the first route and render the layout around it.
import { render } from "zerolith";
import { Layout } from "./components/layout.__CEXT__";
import { router } from "./router.__EXT__";

await router.ready;
render(() => Layout({ content: router.outlet() }), "#app");
"##;

pub(super) const MAIN_DEVTOOLS: &str = r##"// The entry: wait for the first route, render the layout around it, and
// mount the inspector, which Alt+Shift+Z opens while developing.
import { render } from "zerolith";
import { mountDevtools } from "@zerolith/devtools";
import { Layout } from "./components/layout.__CEXT__";
import { router } from "./router.__EXT__";

await router.ready;
render(() => Layout({ content: router.outlet() }), "#app");
mountDevtools();
"##;

pub(super) const ROUTER_TS: &str = r#"// The router. Components import it for typed links while the route table
// it reads imports the components, so read `router` inside a component's
// function, never at a module's top level, where it does not exist yet. It
// follows the base path the app is served under, import.meta.env.BASE_URL,
// which the build's base setting gives.
import { createRouter } from "@zerolith/router";
import { NotFound } from "./components/not-found.__CEXT__";
import { routes } from "./routes.__EXT__";

export const router = createRouter(routes, {
    base: import.meta.env.BASE_URL,
    fallback: (url) => NotFound({ path: url.pathname })
});
"#;

pub(super) const ROUTER_JS: &str = r#"// The router. Components import it for typed links while the route table
// it reads imports the components, so read `router` inside a component's
// function, never at a module's top level, where it does not exist yet. It
// follows the base path the app is served under, import.meta.env.BASE_URL,
// which the build's base setting gives.
import { createRouter } from "@zerolith/router";
import { NotFound } from "./components/not-found.__CEXT__";
import { routes } from "./routes.__EXT__";

/** @type {import("@zerolith/router").Router<typeof routes>} */
export const router = createRouter(routes, {
    base: import.meta.env.BASE_URL,
    fallback: (url) => NotFound({ path: url.pathname })
});
"#;

pub(super) const ROUTES: &str = r#"// The route table: one entry per page. Parameters are inferred from each
// path, so the links that router.href builds are checked.
import { defineRoutes, route } from "@zerolith/router";
import { Counter } from "./components/counter.__CEXT__";
import { Home } from "./components/home.__CEXT__";
import { Packages } from "./components/packages.__CEXT__";

export const routes = defineRoutes({
    home: route({ path: "/", view: () => Home(), head: { title: "__NAME__" } }),
    counter: route({ path: "/counter", view: () => Counter({ start: 0 }), head: { title: "Counter" } }),
    packages: route({ path: "/packages", view: () => Packages(), head: { title: "Packages" } })
});
"#;

pub(super) const MARK: &str = r#"<svg viewBox="14.29 4 35.42 56" aria-hidden="true"><path fill-rule="evenodd" fill="currentColor" d="M26 4h12q6 0 6.64 5.97l5.04 47.05Q50 60 47 60H17q-3 0-2.68-2.98l5.04-47.05Q20 4 26 4ZM30 13h4q3 0 3.26 2.99l2.56 29.02Q40 47 38 47H26q-2 0-1.82-1.99l2.56-29.02Q27 13 30 13Z"/></svg>"#;

pub(super) const FOOTER: &str = r#"Built with <a href="https://zerolith.dev/">zerolith</a>."#;

/// The footer with the inspector's shortcut, which `import.meta.env.DEV` keeps out of a production build, where the inspector is not there.
pub(super) const FOOTER_DEVTOOLS: &str = r#"Built with <a href="https://zerolith.dev/">zerolith</a>.${import.meta.env.DEV
                ? html` Press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> for the inspector.`
                : ""}"#;

/// The same footer in JSX.
pub(super) const FOOTER_DEVTOOLS_JSX: &str = r#"Built with <a href="https://zerolith.dev/">zerolith</a>.{import.meta.env.DEV
                ? <> Press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> for the inspector.</>
                : ""}"#;

pub(super) const LAYOUT_STYLES: &str = r#"const frame = css`
    :scope { min-height: 100vh; display: grid; grid-template-rows: auto 1fr auto; }
    header { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem 2rem; padding: 1rem 1.5rem; border-bottom: 2px solid var(--line); }
    .brand { display: flex; align-items: center; gap: 0.75rem; color: var(--text); text-decoration: none; font-family: var(--font-display); font-weight: 600; letter-spacing: -0.03em; }
    .brand svg { width: 1.25rem; height: 2rem; color: var(--accent); }
    nav { display: flex; gap: 1.5rem; }
    nav a { color: var(--muted); text-decoration: none; padding: 0.25rem 0; border-bottom: 2px solid transparent; }
    nav a[aria-current="page"] { color: var(--text); border-bottom-color: var(--accent); }
    .page { width: 100%; max-width: 48rem; margin: 0 auto; padding: 3rem 1.5rem; }
    footer { padding: 1rem 1.5rem; border-top: 2px solid var(--line); color: var(--muted); font-size: 0.875rem; }
`;"#;

pub(super) const LAYOUT_TS: &str = r#"// The frame around every page: the header with the mark and the
// navigation, the page itself, and the footer.
import { type View, computed, css, html } from "zerolith";
import { router } from "../router.ts";

__STYLES__

function Link({ href, label, exact }: { href: string; label: string; exact: boolean }): View
{
    const here = router.matches(href, { exact });
    return html`<a href=${href} aria-current=${computed(() => (here.get() ? "page" : undefined))}>${label}</a>`;
}

export function Layout({ content }: { content: View }): View
{
    return html`
        <div class=${frame}>
            <header>
                <a class="brand" href=${router.href("home")}>__MARK__ __NAME__</a>
                <nav aria-label="Pages">
                    ${Link({ href: router.href("home"), label: "Home", exact: true })}
                    ${Link({ href: router.href("counter"), label: "Counter", exact: false })}
                    ${Link({ href: router.href("packages"), label: "Packages", exact: false })}
                </nav>
            </header>
            <main class="page">${content}</main>
            <footer>__FOOTER__</footer>
        </div>`;
}
"#;

pub(super) const LAYOUT_JS: &str = r#"// The frame around every page: the header with the mark and the
// navigation, the page itself, and the footer.
import { computed, css, html } from "zerolith";
import { router } from "../router.js";

/** @typedef {import("zerolith").View} View */

__STYLES__

/**
 * @param {{ href: string, label: string, exact: boolean }} props
 * @returns {View}
 */
function Link({ href, label, exact })
{
    const here = router.matches(href, { exact });
    return html`<a href=${href} aria-current=${computed(() => (here.get() ? "page" : undefined))}>${label}</a>`;
}

/**
 * @param {{ content: View }} props
 * @returns {View}
 */
export function Layout({ content })
{
    return html`
        <div class=${frame}>
            <header>
                <a class="brand" href=${router.href("home")}>__MARK__ __NAME__</a>
                <nav aria-label="Pages">
                    ${Link({ href: router.href("home"), label: "Home", exact: true })}
                    ${Link({ href: router.href("counter"), label: "Counter", exact: false })}
                    ${Link({ href: router.href("packages"), label: "Packages", exact: false })}
                </nav>
            </header>
            <main class="page">${content}</main>
            <footer>__FOOTER__</footer>
        </div>`;
}
"#;

pub(super) const LAYOUT_TSX: &str = r#"// The frame around every page: the header with the mark and the
// navigation, the page itself, and the footer.
import { type View, computed, css } from "zerolith";
import { router } from "../router.ts";

__STYLES__

function Link({ href, label, exact }: { href: string; label: string; exact: boolean }): View
{
    const here = router.matches(href, { exact });
    return <a href={href} aria-current={computed(() => (here.get() ? "page" : undefined))}>{label}</a>;
}

export function Layout({ content }: { content: View }): View
{
    return (
        <div class={frame}>
            <header>
                <a class="brand" href={router.href("home")}>__MARK__ __NAME__</a>
                <nav aria-label="Pages">
                    <Link href={router.href("home")} label="Home" exact={true} />
                    <Link href={router.href("counter")} label="Counter" exact={false} />
                    <Link href={router.href("packages")} label="Packages" exact={false} />
                </nav>
            </header>
            <main class="page">{content}</main>
            <footer>__FOOTER__</footer>
        </div>
    );
}
"#;

pub(super) const LAYOUT_JSX: &str = r#"// The frame around every page: the header with the mark and the
// navigation, the page itself, and the footer.
import { computed, css } from "zerolith";
import { router } from "../router.js";

/** @typedef {import("zerolith").View} View */

__STYLES__

/**
 * @param {{ href: string, label: string, exact: boolean }} props
 * @returns {View}
 */
function Link({ href, label, exact })
{
    const here = router.matches(href, { exact });
    return <a href={href} aria-current={computed(() => (here.get() ? "page" : undefined))}>{label}</a>;
}

/**
 * @param {{ content: View }} props
 * @returns {View}
 */
export function Layout({ content })
{
    return (
        <div class={frame}>
            <header>
                <a class="brand" href={router.href("home")}>__MARK__ __NAME__</a>
                <nav aria-label="Pages">
                    <Link href={router.href("home")} label="Home" exact={true} />
                    <Link href={router.href("counter")} label="Counter" exact={false} />
                    <Link href={router.href("packages")} label="Packages" exact={false} />
                </nav>
            </header>
            <main class="page">{content}</main>
            <footer>__FOOTER__</footer>
        </div>
    );
}
"#;

pub(super) const HOME_STYLES: &str = r#"const home = css`
    :scope { display: grid; gap: 2.5rem; }
    h1 { font-size: clamp(2.25rem, 7vw, 3.5rem); }
    .lead { margin: 1rem 0 0; color: var(--muted); font-size: 1.25rem; max-width: 36rem; }
    ol { list-style: none; margin: 0; padding: 0; border-top: 2px solid var(--line); }
    li { display: grid; grid-template-columns: minmax(9rem, 12rem) 1fr; gap: 1rem; padding: 1rem 0; border-bottom: 2px solid var(--line); }
    li code { color: var(--accent-text); }
    li p { margin: 0; color: var(--muted); }
    .next { display: flex; flex-wrap: wrap; gap: 1rem; }
`;"#;

pub(super) const HOME_HTML: &str = r#"    return html`
        <section class=${home}>
            <div>
                <h1>__NAME__</h1>
                <p class="lead">A zerolith application. Edit <code>src/components/home.__CEXT__</code> and save: the page updates and keeps its state.</p>
            </div>
            <ol>
                <li><code>__RUN_DEV__</code><p>__DEV__</p></li>
                <li><code>__RUN_BUILD__</code><p>__BUILD__</p></li>
                <li><code>__RUN_PREVIEW__</code><p>__PREVIEW__</p></li>
            </ol>
            <div class="next">
                <a class="button primary" href=${router.href("counter")}>Try the counter</a>
                <a class="button" href="https://zerolith.dev/guide/">Read the guide</a>
            </div>
        </section>`;"#;

pub(super) const HOME_JSX_BODY: &str = r#"    return (
        <section class={home}>
            <div>
                <h1>__NAME__</h1>
                <p class="lead">A zerolith application. Edit <code>src/components/home.__CEXT__</code> and save: the page updates and keeps its state.</p>
            </div>
            <ol>
                <li><code>__RUN_DEV__</code><p>__DEV__</p></li>
                <li><code>__RUN_BUILD__</code><p>__BUILD__</p></li>
                <li><code>__RUN_PREVIEW__</code><p>__PREVIEW__</p></li>
            </ol>
            <div class="next">
                <a class="button primary" href={router.href("counter")}>Try the counter</a>
                <a class="button" href="https://zerolith.dev/guide/">Read the guide</a>
            </div>
        </section>
    );"#;

pub(super) const HOME_TS: &str = r#"// The first page: what the project is and the three commands it runs on.
import { type View, css, html } from "zerolith";
import { router } from "../router.ts";

__STYLES__

export function Home(): View
{
__BODY__
}
"#;

pub(super) const HOME_JS: &str = r#"// The first page: what the project is and the three commands it runs on.
import { css, html } from "zerolith";
import { router } from "../router.js";

/** @typedef {import("zerolith").View} View */

__STYLES__

/** @returns {View} */
export function Home()
{
__BODY__
}
"#;

pub(super) const HOME_TSX: &str = r#"// The first page: what the project is and the three commands it runs on.
import { type View, css } from "zerolith";
import { router } from "../router.ts";

__STYLES__

export function Home(): View
{
__BODY__
}
"#;

pub(super) const HOME_JSX: &str = r#"// The first page: what the project is and the three commands it runs on.
import { css } from "zerolith";
import { router } from "../router.js";

/** @typedef {import("zerolith").View} View */

__STYLES__

/** @returns {View} */
export function Home()
{
__BODY__
}
"#;

pub(super) const COUNTER_STYLES: &str = r#"const counter = css`
    :scope { display: grid; gap: 1.5rem; justify-items: start; }
    output { font-family: var(--font-display); font-size: 4rem; line-height: 1; }
    p { margin: 0; color: var(--muted); }
    .actions { display: flex; gap: 0.75rem; }
`;"#;

pub(super) const COUNTER_HTML: &str = r#"    const count = signal(start, { name: "count" });
    const doubled = computed(() => count.get() * 2);
    return html`
        <section class=${counter}>
            <h1>Counter</h1>
            <output aria-live="polite">${count}</output>
            <p>Doubled, ${doubled}. The count is a named signal, so an edit to this file keeps it.</p>
            <div class="actions">
                <button class="primary" @click=${() => count.set(count.get() + 1)}>Add one</button>
                <button @click=${() => count.set(start)}>Reset</button>
            </div>
        </section>`;"#;

pub(super) const COUNTER_JSX_BODY: &str = r#"    const count = signal(start, { name: "count" });
    const doubled = computed(() => count.get() * 2);
    return (
        <section class={counter}>
            <h1>Counter</h1>
            <output aria-live="polite">{count}</output>
            <p>Doubled, {doubled}. The count is a named signal, so an edit to this file keeps it.</p>
            <div class="actions">
                <button class="primary" on:click={() => count.set(count.get() + 1)}>Add one</button>
                <button on:click={() => count.set(start)}>Reset</button>
            </div>
        </section>
    );"#;

pub(super) const COUNTER_TS: &str = r#"// State in a component: a named signal and a value derived from it. Bind
// the signal, not its value: ${count} stays live, ${count.get()} would not.
import { type View, computed, css, html, signal } from "zerolith";

__STYLES__

export function Counter({ start }: { start: number }): View
{
__BODY__
}
"#;

pub(super) const COUNTER_JS: &str = r#"// State in a component: a named signal and a value derived from it. Bind
// the signal, not its value: ${count} stays live, ${count.get()} would not.
import { computed, css, html, signal } from "zerolith";

/** @typedef {import("zerolith").View} View */

__STYLES__

/**
 * @param {{ start: number }} props
 * @returns {View}
 */
export function Counter({ start })
{
__BODY__
}
"#;

pub(super) const COUNTER_TSX: &str = r#"// State in a component: a named signal and a value derived from it. Bind
// the signal, not its value: {count} stays live, {count.get()} would not.
import { type View, computed, css, signal } from "zerolith";

__STYLES__

export function Counter({ start }: { start: number }): View
{
__BODY__
}
"#;

pub(super) const COUNTER_JSX: &str = r#"// State in a component: a named signal and a value derived from it. Bind
// the signal, not its value: {count} stays live, {count.get()} would not.
import { computed, css, signal } from "zerolith";

/** @typedef {import("zerolith").View} View */

__STYLES__

/**
 * @param {{ start: number }} props
 * @returns {View}
 */
export function Counter({ start })
{
__BODY__
}
"#;

pub(super) const PACKAGES_STYLES: &str = r#"const page = css`
    :scope { display: grid; gap: 1.5rem; }
    input { width: 100%; }
    ul { list-style: none; margin: 0; padding: 0; border-top: 2px solid var(--line); }
    li { display: grid; gap: 0.25rem; padding: 0.75rem 0; border-bottom: 2px solid var(--line); }
    li strong { font-family: var(--font-mono); font-weight: 400; color: var(--accent-text); }
    li span, .status { color: var(--muted); }
`;"#;

pub(super) const PACKAGES_DOC: &str = r#"// Data from a request: a resource loads public/data/packages.json once, a
// computed value filters it by the search text, and each renders the
// matches keyed by name."#;

pub(super) const CATALOG_TS: &str = r#"interface Package
{
    name: string;
    description: string;
}

const catalog = resource({
    params: () => `${import.meta.env.BASE_URL}data/packages.json`,
    loader: async ({ params, abort }) =>
    {
        const response = await fetch(params, { signal: abort });
        if (!response.ok)
        {
            throw new Error(`${params} answered ${response.status}`);
        }
        return (await response.json()) as Package[];
    }
});"#;

pub(super) const CATALOG_JS: &str = r#"/** @typedef {import("zerolith").View} View */
/** @typedef {{ name: string, description: string }} Package */

const catalog = resource({
    params: () => `${import.meta.env.BASE_URL}data/packages.json`,
    loader: async ({ params, abort }) =>
    {
        const response = await fetch(params, { signal: abort });
        if (!response.ok)
        {
            throw new Error(`${params} answered ${response.status}`);
        }
        return /** @type {Package[]} */ (await response.json());
    }
});"#;

pub(super) const MATCHES: &str = r#"    const query = signal("", { name: "query" });
    const matches = computed(() =>
    {
        const text = query.get().trim().toLowerCase();
        return (catalog.get() ?? []).filter((item) => text === "" || item.name.includes(text) || item.description.toLowerCase().includes(text));
    });"#;

pub(super) const PACKAGES_HTML: &str = r#"    return html`
        <section class=${page}>
            <h1>Packages</h1>
            <input type="search" placeholder="Search the packages" aria-label="Search the packages" .value=${query} @input=${__INPUT__}>
            ${when(catalog.pending, () => html`<p class="status">Loading the list</p>`)}
            ${when(catalog.error, () => html`<p class="status">The list did not load. <button @click=${() => catalog.reload()}>Try again</button></p>`)}
            <ul>${each(matches, (item) => item.name, (item) => html`<li><strong>${computed(() => item.get().name)}</strong><span>${computed(() => item.get().description)}</span></li>`)}</ul>
        </section>`;"#;

pub(super) const PACKAGES_JSX_BODY: &str = r#"    return (
        <section class={page}>
            <h1>Packages</h1>
            <input type="search" placeholder="Search the packages" aria-label="Search the packages" prop:value={query} on:input={__INPUT__} />
            {when(catalog.pending, () => <p class="status">Loading the list</p>)}
            {when(catalog.error, () => <p class="status">The list did not load. <button on:click={() => catalog.reload()}>Try again</button></p>)}
            <ul>{each(matches, (item) => item.name, (item) => <li><strong>{computed(() => item.get().name)}</strong><span>{computed(() => item.get().description)}</span></li>)}</ul>
        </section>
    );"#;

pub(super) const INPUT_TS: &str =
    r#"(event: Event) => query.set((event.currentTarget as HTMLInputElement).value)"#;

pub(super) const INPUT_JS: &str = r#"(/** @type {Event} */ event) => query.set(/** @type {HTMLInputElement} */ (event.currentTarget).value)"#;

pub(super) const NOT_FOUND_TS: &str = r#"// Shown for a URL that no route matches.
import { type View, html } from "zerolith";

export function NotFound({ path }: { path: string }): View
{
    return html`<section><h1>Not found</h1><p>Nothing lives at <code>${path}</code>. <a href=${import.meta.env.BASE_URL}>Go home</a>.</p></section>`;
}
"#;

pub(super) const NOT_FOUND_JS: &str = r#"// Shown for a URL that no route matches.
import { html } from "zerolith";

/**
 * @param {{ path: string }} props
 * @returns {import("zerolith").View}
 */
export function NotFound({ path })
{
    return html`<section><h1>Not found</h1><p>Nothing lives at <code>${path}</code>. <a href=${import.meta.env.BASE_URL}>Go home</a>.</p></section>`;
}
"#;

pub(super) const NOT_FOUND_TSX: &str = r#"// Shown for a URL that no route matches.
import type { View } from "zerolith";

export function NotFound({ path }: { path: string }): View
{
    return <section><h1>Not found</h1><p>Nothing lives at <code>{path}</code>. <a href={import.meta.env.BASE_URL}>Go home</a>.</p></section>;
}
"#;

pub(super) const NOT_FOUND_JSX: &str = r#"// Shown for a URL that no route matches.

/**
 * @param {{ path: string }} props
 * @returns {import("zerolith").View}
 */
export function NotFound({ path })
{
    return <section><h1>Not found</h1><p>Nothing lives at <code>{path}</code>. <a href={import.meta.env.BASE_URL}>Go home</a>.</p></section>;
}
"#;
