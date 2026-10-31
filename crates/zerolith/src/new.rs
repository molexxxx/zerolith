//! `zerolith new`: writes a starter application in the brand style, with
//! the layout the structure guide describes, three pages that show the
//! patterns a project grows from, a browser test, a README that walks
//! through developing, building, previewing, and deploying, and an
//! AGENTS.md, then installs its dependencies. It asks for what the flags
//! leave open, with a default for every question: the starter, TSX on the
//! command line, the inspector included, and the dependencies installed.
//! `--example fullstack` writes the fullstack example instead, an app with
//! its own Node backend, as a project of its own.

use std::fs;
use std::io::{self, BufRead, IsTerminal, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::term;

/// What `dev`, `build`, and `preview` run in the new project.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tool {
    /// `zerolith dev`, `zerolith build`, and `zerolith preview`.
    CommandLine,
    /// The same, with a build that writes the modules as they are behind an import map.
    Unbundled,
    /// `vite`, `vite build`, and `vite preview`, with `@zerolith/vite`.
    Vite,
}

/// What the new project starts from.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Start {
    /// The starter, written in the language and for the tools chosen.
    Starter,
    /// The fullstack example: a notes app under `/app/` with its own Node backend.
    Fullstack,
}

impl Start {
    /// The example `--example` names.
    pub fn example(name: &str) -> Option<Start> {
        match name {
            "fullstack" => Some(Start::Fullstack),
            _ => None,
        }
    }
}

/// The project to write.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Choice {
    /// The starter or an example; an example fixes the other fields.
    pub start: Start,
    pub tool: Tool,
    pub typescript: bool,
    /// Components written in JSX, in `.tsx` or `.jsx` files, instead of `html` templates.
    pub jsx: bool,
    /// Mount the inspector from `@zerolith/devtools`.
    pub devtools: bool,
}

impl Choice {
    /// The starter in TSX on the command line, with the inspector: what every question defaults to.
    pub const DEFAULT: Choice = Choice {
        start: Start::Starter,
        tool: Tool::CommandLine,
        typescript: true,
        jsx: true,
        devtools: true,
    };

    /// The fullstack example as it is: TypeScript with `html` templates on the command line, without the inspector.
    pub const FULLSTACK: Choice = Choice {
        start: Start::Fullstack,
        tool: Tool::CommandLine,
        typescript: true,
        jsx: false,
        devtools: false,
    };

    fn ext(self) -> &'static str {
        if self.typescript { "ts" } else { "js" }
    }

    fn component_ext(self) -> &'static str {
        match (self.typescript, self.jsx) {
            (true, true) => "tsx",
            (true, false) => "ts",
            (false, true) => "jsx",
            (false, false) => "js",
        }
    }
}

/// The tool versions the scaffold pins, mirrored from the repository package.json
/// so the published crate carries them; a test keeps the two in step.
const TOOL_VERSIONS: &str = include_str!("../versions.json");

/// The favicon from `brand/app-icon`, copied into the crate so the published crate carries it; a test keeps the two in step.
const FAVICON: &str = include_str!("../templates/favicon.svg");

/// The application files of `examples/fullstack`, copied into the crate so the published crate carries them. The example's README and its test, which runs this repository's build of the command line, stay behind; the scaffold writes its own. A test keeps the copy in step with the example, apart from the schema path in `zerolith.json`, which points into `node_modules` in a project of its own.
const FULLSTACK_FILES: [(&str, &str); 8] = [
    (
        "index.html",
        include_str!("../templates/examples/fullstack/index.html"),
    ),
    (
        "server.ts",
        include_str!("../templates/examples/fullstack/server.ts"),
    ),
    (
        "zerolith.json",
        include_str!("../templates/examples/fullstack/zerolith.json"),
    ),
    (
        "src/env.d.ts",
        include_str!("../templates/examples/fullstack/src/env.d.ts"),
    ),
    (
        "src/main.ts",
        include_str!("../templates/examples/fullstack/src/main.ts"),
    ),
    (
        "src/notes.ts",
        include_str!("../templates/examples/fullstack/src/notes.ts"),
    ),
    (
        "src/router.ts",
        include_str!("../templates/examples/fullstack/src/router.ts"),
    ),
    (
        "src/styles.css",
        include_str!("../templates/examples/fullstack/src/styles.css"),
    ),
];

fn version_of(name: &str) -> String {
    let versions: serde_json::Value = serde_json::from_str(TOOL_VERSIONS).unwrap_or_default();
    versions[name]
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| "latest".to_string())
}

fn framework_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// The project name as the page shows it: letters, digits, spaces, dots, dashes, and underscores.
fn display_name(name: &str) -> String {
    name.chars()
        .map(|character| {
            if character.is_alphanumeric() || matches!(character, ' ' | '.' | '-' | '_') {
                character
            } else {
                '-'
            }
        })
        .collect()
}

/// The project name as npm accepts it: lowercase, with anything else a dash.
fn package_name(name: &str) -> String {
    let name: String = name
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
                character
            } else {
                '-'
            }
        })
        .collect();
    let name = name.trim_matches(['.', '_', '-']).to_string();
    if name.is_empty() {
        "app".to_string()
    } else {
        name
    }
}

/// One entry of a dependency list in package.json.
fn dependency(name: &str, version: &str) -> String {
    format!("        \"{name}\": \"{version}\"")
}

/// The scripts every project ends with: the gate and the checks it runs.
const CHECKS: [(&str, &str); 4] = [
    (
        "check",
        "npm run typecheck && npm run lint && npm test && npm run build",
    ),
    ("typecheck", "tsc -p tsconfig.json"),
    ("lint", "oxlint"),
    ("test", "vitest run"),
];

/// A package.json: the project's own scripts, then the checks, and each dependency list sorted by name.
fn manifest(
    name: &str,
    scripts: &[(&str, &str)],
    mut dependencies: Vec<String>,
    mut dev: Vec<String>,
) -> String {
    dependencies.sort();
    dev.sort();
    let scripts: Vec<String> = scripts
        .iter()
        .chain(CHECKS.iter())
        .map(|(script, command)| format!("        \"{script}\": \"{command}\""))
        .collect();
    format!(
        "{{\n    \"name\": \"{}\",\n    \"version\": \"0.0.0\",\n    \"private\": true,\n    \"type\": \"module\",\n    \"scripts\": {{\n{}\n    }},\n    \"dependencies\": {{\n{}\n    }},\n    \"devDependencies\": {{\n{}\n    }}\n}}\n",
        package_name(name),
        scripts.join(",\n"),
        dependencies.join(",\n"),
        dev.join(",\n")
    )
}

/// The development dependencies every project has: the command line, the test helpers, and the tools the checks run.
fn tools() -> Vec<String> {
    let framework = framework_version();
    let mut dev = vec![
        dependency("@zerolith/cli", framework),
        dependency("@zerolith/test", framework),
    ];
    for tool in [
        "@vitest/browser-playwright",
        "oxlint",
        "playwright",
        "typescript",
        "vitest",
    ] {
        dev.push(dependency(tool, &version_of(tool)));
    }
    dev
}

fn package_json(name: &str, choice: Choice) -> String {
    let framework = framework_version();
    let mut dependencies = vec![
        dependency("zerolith", framework),
        dependency("@zerolith/router", framework),
    ];
    if choice.devtools {
        dependencies.push(dependency("@zerolith/devtools", framework));
    }
    let mut dev = tools();
    if choice.jsx || choice.tool == Tool::Vite {
        dev.push(dependency("@zerolith/vite", framework));
    }
    let (develop, build, preview) = match choice.tool {
        Tool::CommandLine => ("zerolith dev", "zerolith build", "zerolith preview"),
        Tool::Unbundled => (
            "zerolith dev",
            "zerolith build --unbundled",
            "zerolith preview",
        ),
        Tool::Vite => {
            dev.push(dependency("vite", &version_of("vite")));
            ("vite", "vite build", "vite preview")
        }
    };
    manifest(
        name,
        &[("dev", develop), ("build", build), ("preview", preview)],
        dependencies,
        dev,
    )
}

/// The fullstack example's package.json: `dev` and `build` on the command line, `api` running the backend, and `start` running it over the build.
fn fullstack_package_json(name: &str) -> String {
    let framework = framework_version();
    let mut dev = tools();
    dev.push(dependency("@types/node", &version_of("@types/node")));
    manifest(
        name,
        &[
            ("dev", "zerolith dev"),
            ("api", "node server.ts"),
            ("build", "zerolith build"),
            ("start", "node server.ts --production"),
        ],
        vec![
            dependency("zerolith", framework),
            dependency("@zerolith/router", framework),
        ],
        dev,
    )
}

const INDEX_HTML: &str = r#"<!doctype html>
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

const STYLES: &str = include_str!("../templates/styles.css");

const MAIN: &str = r##"// The entry: wait for the first route and render the layout around it.
import { render } from "zerolith";
import { Layout } from "./components/layout.__CEXT__";
import { router } from "./router.__EXT__";

await router.ready;
render(Layout({ content: router.outlet() }), "#app");
"##;

const MAIN_DEVTOOLS: &str = r##"// The entry: wait for the first route, render the layout around it, and
// mount the inspector, which Alt+Shift+Z opens while developing.
import { render } from "zerolith";
import { mountDevtools } from "@zerolith/devtools";
import { Layout } from "./components/layout.__CEXT__";
import { router } from "./router.__EXT__";

await router.ready;
render(Layout({ content: router.outlet() }), "#app");
mountDevtools();
"##;

const ROUTER_TS: &str = r#"// The router, in its own module so components can import it for typed
// links while the route table imports the components. It follows the base
// path the app is served under, which zerolith.json or --base sets.
import { createRouter } from "@zerolith/router";
import { NotFound } from "./components/not-found.__CEXT__";
import { routes } from "./routes.__EXT__";

export const router = createRouter(routes, {
    base: import.meta.env.BASE_URL,
    fallback: (url) => NotFound({ path: url.pathname })
});
"#;

const ROUTER_JS: &str = r#"// The router, in its own module so components can import it for typed
// links while the route table imports the components. It follows the base
// path the app is served under, which zerolith.json or --base sets.
import { createRouter } from "@zerolith/router";
import { NotFound } from "./components/not-found.__CEXT__";
import { routes } from "./routes.__EXT__";

/** @type {import("@zerolith/router").Router<typeof routes>} */
export const router = createRouter(routes, {
    base: import.meta.env.BASE_URL,
    fallback: (url) => NotFound({ path: url.pathname })
});
"#;

const ROUTES: &str = r#"// The route table: one entry per page. Parameters are inferred from each
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

const MARK: &str = r#"<svg viewBox="14.29 4 35.42 56" aria-hidden="true"><path fill-rule="evenodd" fill="currentColor" d="M26 4h12q6 0 6.64 5.97l5.04 47.05Q50 60 47 60H17q-3 0-2.68-2.98l5.04-47.05Q20 4 26 4ZM30 13h4q3 0 3.26 2.99l2.56 29.02Q40 47 38 47H26q-2 0-1.82-1.99l2.56-29.02Q27 13 30 13Z"/></svg>"#;

const FOOTER: &str = r#"Built with <a href="https://molexxxx.github.io/zerolith/">zerolith</a>."#;

const FOOTER_DEVTOOLS: &str = r#"Built with <a href="https://molexxxx.github.io/zerolith/">zerolith</a>. Press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> for the inspector."#;

const LAYOUT_STYLES: &str = r#"const frame = css`
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

const LAYOUT_TS: &str = r#"// The frame around every page: the header with the mark and the
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

const LAYOUT_JS: &str = r#"// The frame around every page: the header with the mark and the
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

const LAYOUT_TSX: &str = r#"// The frame around every page: the header with the mark and the
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

const LAYOUT_JSX: &str = r#"// The frame around every page: the header with the mark and the
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

const HOME_STYLES: &str = r#"const home = css`
    :scope { display: grid; gap: 2.5rem; }
    h1 { font-size: clamp(2.25rem, 7vw, 3.5rem); }
    .lead { margin: 1rem 0 0; color: var(--muted); font-size: 1.25rem; max-width: 36rem; }
    ol { list-style: none; margin: 0; padding: 0; border-top: 2px solid var(--line); }
    li { display: grid; grid-template-columns: minmax(9rem, 12rem) 1fr; gap: 1rem; padding: 1rem 0; border-bottom: 2px solid var(--line); }
    li code { color: var(--accent-text); }
    li p { margin: 0; color: var(--muted); }
    .next { display: flex; flex-wrap: wrap; gap: 1rem; }
`;"#;

const HOME_HTML: &str = r#"    return html`
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
                <a class="button" href="https://molexxxx.github.io/zerolith/guide/">Read the guide</a>
            </div>
        </section>`;"#;

const HOME_JSX_BODY: &str = r#"    return (
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
                <a class="button" href="https://molexxxx.github.io/zerolith/guide/">Read the guide</a>
            </div>
        </section>
    );"#;

const HOME_TS: &str = r#"// The first page: what the project is and the three commands it runs on.
import { type View, css, html } from "zerolith";
import { router } from "../router.ts";

__STYLES__

export function Home(): View
{
__BODY__
}
"#;

const HOME_JS: &str = r#"// The first page: what the project is and the three commands it runs on.
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

const HOME_TSX: &str = r#"// The first page: what the project is and the three commands it runs on.
import { type View, css } from "zerolith";
import { router } from "../router.ts";

__STYLES__

export function Home(): View
{
__BODY__
}
"#;

const HOME_JSX: &str = r#"// The first page: what the project is and the three commands it runs on.
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

const COUNTER_STYLES: &str = r#"const counter = css`
    :scope { display: grid; gap: 1.5rem; justify-items: start; }
    output { font-family: var(--font-display); font-size: 4rem; line-height: 1; }
    p { margin: 0; color: var(--muted); }
    .actions { display: flex; gap: 0.75rem; }
`;"#;

const COUNTER_HTML: &str = r#"    const count = signal(start, { name: "count" });
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

const COUNTER_JSX_BODY: &str = r#"    const count = signal(start, { name: "count" });
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

const COUNTER_TS: &str = r#"// State in a component: a named signal and a value derived from it. Bind
// the signal, not its value: ${count} stays live, ${count.get()} would not.
import { type View, computed, css, html, signal } from "zerolith";

__STYLES__

export function Counter({ start }: { start: number }): View
{
__BODY__
}
"#;

const COUNTER_JS: &str = r#"// State in a component: a named signal and a value derived from it. Bind
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

const COUNTER_TSX: &str = r#"// State in a component: a named signal and a value derived from it. Bind
// the signal, not its value: {count} stays live, {count.get()} would not.
import { type View, computed, css, signal } from "zerolith";

__STYLES__

export function Counter({ start }: { start: number }): View
{
__BODY__
}
"#;

const COUNTER_JSX: &str = r#"// State in a component: a named signal and a value derived from it. Bind
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

const PACKAGES_STYLES: &str = r#"const page = css`
    :scope { display: grid; gap: 1.5rem; }
    input { width: 100%; }
    ul { list-style: none; margin: 0; padding: 0; border-top: 2px solid var(--line); }
    li { display: grid; gap: 0.25rem; padding: 0.75rem 0; border-bottom: 2px solid var(--line); }
    li strong { font-family: var(--font-mono); font-weight: 400; color: var(--accent-text); }
    li span, .status { color: var(--muted); }
`;"#;

const PACKAGES_DOC: &str = r#"// Data from a request: a resource loads public/data/packages.json once, a
// computed value filters it by the search text, and each renders the
// matches keyed by name."#;

const CATALOG_TS: &str = r#"interface Package
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

const CATALOG_JS: &str = r#"/** @typedef {import("zerolith").View} View */
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

const MATCHES: &str = r#"    const query = signal("", { name: "query" });
    const matches = computed(() =>
    {
        const text = query.get().trim().toLowerCase();
        return (catalog.get() ?? []).filter((item) => text === "" || item.name.includes(text) || item.description.toLowerCase().includes(text));
    });"#;

const PACKAGES_HTML: &str = r#"    return html`
        <section class=${page}>
            <h1>Packages</h1>
            <input type="search" placeholder="Search the packages" aria-label="Search the packages" .value=${query} @input=${__INPUT__}>
            ${when(catalog.pending, () => html`<p class="status">Loading the list</p>`)}
            ${when(catalog.error, () => html`<p class="status">The list did not load. <button @click=${() => catalog.reload()}>Try again</button></p>`)}
            <ul>${each(matches, (item) => item.name, (item) => html`<li><strong>${computed(() => item.get().name)}</strong><span>${computed(() => item.get().description)}</span></li>`)}</ul>
        </section>`;"#;

const PACKAGES_JSX_BODY: &str = r#"    return (
        <section class={page}>
            <h1>Packages</h1>
            <input type="search" placeholder="Search the packages" aria-label="Search the packages" prop:value={query} on:input={__INPUT__} />
            {when(catalog.pending, () => <p class="status">Loading the list</p>)}
            {when(catalog.error, () => <p class="status">The list did not load. <button on:click={() => catalog.reload()}>Try again</button></p>)}
            <ul>{each(matches, (item) => item.name, (item) => <li><strong>{computed(() => item.get().name)}</strong><span>{computed(() => item.get().description)}</span></li>)}</ul>
        </section>
    );"#;

const INPUT_TS: &str =
    r#"(event: Event) => query.set((event.currentTarget as HTMLInputElement).value)"#;

const INPUT_JS: &str = r#"(/** @type {Event} */ event) => query.set(/** @type {HTMLInputElement} */ (event.currentTarget).value)"#;

const NOT_FOUND_TS: &str = r#"// Shown for a URL that no route matches.
import { type View, html } from "zerolith";

export function NotFound({ path }: { path: string }): View
{
    return html`<section><h1>Not found</h1><p>Nothing lives at <code>${path}</code>. <a href=${import.meta.env.BASE_URL}>Go home</a>.</p></section>`;
}
"#;

const NOT_FOUND_JS: &str = r#"// Shown for a URL that no route matches.
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

const NOT_FOUND_TSX: &str = r#"// Shown for a URL that no route matches.
import type { View } from "zerolith";

export function NotFound({ path }: { path: string }): View
{
    return <section><h1>Not found</h1><p>Nothing lives at <code>{path}</code>. <a href={import.meta.env.BASE_URL}>Go home</a>.</p></section>;
}
"#;

const NOT_FOUND_JSX: &str = r#"// Shown for a URL that no route matches.

/**
 * @param {{ path: string }} props
 * @returns {import("zerolith").View}
 */
export function NotFound({ path })
{
    return <section><h1>Not found</h1><p>Nothing lives at <code>{path}</code>. <a href={import.meta.env.BASE_URL}>Go home</a>.</p></section>;
}
"#;

const VITE_ENV_TYPES: &str = r#"// The values import.meta.env carries under Vite, such as the base path the
// router follows.
/// <reference types="vite/client" />
"#;

/// The settings zerolith dev, build, and preview share; an editor completes them from the schema.
pub const PROJECT_CONFIG: &str = r#"{
    "$schema": "./node_modules/@zerolith/cli/zerolith.schema.json",
    "proxy": {}
}
"#;

const ENV_TYPES: &str = r#"// The values import.meta.env carries under zerolith dev and zerolith
// build: the mode, the base path, and every PUBLIC_ variable from the .env
// files and the environment.
interface ImportMetaEnv
{
    readonly MODE: string;
    readonly DEV: boolean;
    readonly PROD: boolean;
    readonly BASE_URL: string;
    readonly [name: `PUBLIC_${string}`]: string | undefined;
}

interface ImportMeta
{
    readonly env: ImportMetaEnv;
}
"#;

const PACKAGES_DATA: &str = r#"[
    { "name": "zerolith", "description": "Signals, html and css templates, rendering, hydration, and coded diagnostics." },
    { "name": "@zerolith/router", "description": "A typed route table, plain links, route data, and head tags." },
    { "name": "@zerolith/forms", "description": "Native forms enhanced with fetch, validation, and field errors." },
    { "name": "@zerolith/client", "description": "A typed client generated from an OpenAPI contract." },
    { "name": "@zerolith/i18n", "description": "Locales, formatters, and message catalogs compiled to typed modules." },
    { "name": "@zerolith/a11y", "description": "A focus trap, roving tabindex, a live announcer, and preference signals." },
    { "name": "@zerolith/test", "description": "Mount, settle, and check hydration and accessibility in tests." },
    { "name": "@zerolith/devtools", "description": "The in-page inspector that Alt+Shift+Z opens." },
    { "name": "@zerolith/otel", "description": "OpenTelemetry spans for navigation, hydration, and requests." },
    { "name": "@zerolith/cli", "description": "The command line: dev, build, preview, and project checks." },
    { "name": "@zerolith/vite", "description": "The plugin for projects that develop on Vite." }
]
"#;

const TEST: &str = r#"import { afterEach, expect, it } from "vitest";
import { cleanup, mount, settle } from "@zerolith/test";
import { Counter } from "../src/components/counter.__CEXT__";

afterEach(cleanup);

it("counts clicks and resets", async () =>
{
    const { container } = mount(Counter({ start: 1 }));
    const [add, reset] = Array.from(container.querySelectorAll("button"));
    add?.click();
    await settle();
    expect(container.querySelector("output")?.textContent).toBe("2");
    reset?.click();
    await settle();
    expect(container.querySelector("output")?.textContent).toBe("1");
});
"#;

const VITEST_CONFIG: &str = "import { playwright } from \"@vitest/browser-playwright\";\nimport { defineConfig } from \"vitest/config\";\n\nexport default defineConfig({\n    test: {\n        browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: \"chromium\" }] }\n    }\n});\n";

const VITEST_CONFIG_JSX: &str = "import { playwright } from \"@vitest/browser-playwright\";\nimport { defineConfig } from \"vitest/config\";\nimport { zerolith } from \"@zerolith/vite\";\n\n// Vitest reads the components directly, so it needs the same JSX lowering zerolith dev and build apply.\nexport default defineConfig({\n    plugins: zerolith().filter((plugin) => plugin.name === \"zerolith:jsx\"),\n    test: {\n        browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: \"chromium\" }] }\n    }\n});\n";

const VITE_CONFIG: &str = "import { defineConfig } from \"vite\";\nimport { zerolith } from \"@zerolith/vite\";\n\nexport default defineConfig({\n    plugins: [zerolith()]\n});\n";

const OXLINTRC: &str = "{\n    \"plugins\": [\"typescript\", \"unicorn\", \"import\"],\n    \"categories\": { \"correctness\": \"error\", \"suspicious\": \"error\" },\n    \"rules\": { \"eqeqeq\": \"error\", \"no-var\": \"error\", \"prefer-const\": \"error\" },\n    \"ignorePatterns\": [\"dist\", \"node_modules\"]\n}\n";

fn tsconfig(choice: Choice) -> String {
    let files = match (choice.start, choice.tool) {
        (Start::Fullstack, _) => "\"server.ts\", \"src\", \"test\", \"vitest.config.ts\"",
        (Start::Starter, Tool::Vite) => {
            "\"src\", \"test\", \"vite.config.ts\", \"vitest.config.ts\""
        }
        (Start::Starter, _) => "\"src\", \"test\", \"vitest.config.ts\"",
    };
    let node = if choice.start == Start::Fullstack {
        "        \"types\": [\"node\"],\n"
    } else {
        ""
    };
    let js = if choice.typescript {
        ""
    } else {
        "        \"allowJs\": true,\n        \"checkJs\": true,\n"
    };
    let jsx = if choice.jsx {
        "        \"jsx\": \"react-jsx\",\n        \"jsxImportSource\": \"zerolith\",\n"
    } else {
        ""
    };
    format!(
        "{{\n    \"compilerOptions\": {{\n        \"target\": \"es2024\",\n        \"lib\": [\"es2024\", \"dom\", \"dom.iterable\"],\n        \"module\": \"nodenext\",\n        \"moduleResolution\": \"nodenext\",\n        \"strict\": true,\n        \"noUncheckedIndexedAccess\": true,\n        \"erasableSyntaxOnly\": true,\n        \"verbatimModuleSyntax\": true,\n        \"allowImportingTsExtensions\": true,\n        \"noEmit\": true,\n{js}{jsx}{node}        \"skipLibCheck\": true\n    }},\n    \"include\": [{files}]\n}}\n"
    )
}

/// What each script does, as the home page says it.
fn steps(tool: Tool) -> (&'static str, &'static str, &'static str) {
    match tool {
        Tool::CommandLine => (
            "Serves the app while you work, with packages loaded straight from node_modules.",
            "Bundles and minifies it into dist/, ready for any host.",
            "Serves dist/ the way a host will, to check the build.",
        ),
        Tool::Unbundled => (
            "Serves the app while you work, with packages loaded straight from node_modules.",
            "Writes the modules to dist/ as they are, the packages behind an import map.",
            "Serves dist/ the way a host will, to check the build.",
        ),
        Tool::Vite => (
            "Starts Vite, which swaps an edited component in place.",
            "Bundles and minifies the app into dist/ through Vite.",
            "Serves dist/ the way a host will, to check the build.",
        ),
    }
}

fn agents_md(name: &str, choice: Choice) -> String {
    let ext = choice.ext();
    let component = choice.component_ext();
    let tool = match choice.tool {
        Tool::Vite => "The project develops and builds on Vite with `@zerolith/vite`.",
        _ => {
            "The project develops and builds on the zerolith command line; packages load from `node_modules` with no import map, and there is no Vite config."
        }
    };
    let syntax = if choice.jsx {
        "Components are capitalized functions written in JSX, one per file under `src/components/`, with their `css` literal next to the markup. JSX is a spelling of `html` templates: `class`, not `className`; `on:click` for events, `prop:value` for properties, `bool:disabled` for boolean attributes; lists and conditions are `each` and `when`."
    } else {
        "Components are capitalized functions returning `html` templates, one per file under `src/components/`, with their `css` literal next to the markup."
    };
    format!(
        "# {name}: guide for coding agents\n\nA zerolith application. {tool} This file holds what is specific to this project. zerolith's own rules and patterns are in the zerolith skill, which `npx skills add molexxxx/zerolith` installs, and in the guides at https://molexxxx.github.io/zerolith/guide/.\n\n## Commands\n\n- `npm run dev` serves the app with live reload; `npm run build` writes `dist/`; `npm run preview` serves `dist/`.\n- `npm run check` is the gate: typecheck, lint, browser tests, and the build.\n- `npx zerolith-client openapi.json --out src/api.{ext}` and `npx zerolith-i18n messages --out src/messages` regenerate the generated files once the project has a contract or catalogs.\n\n## Rules\n\n- Bind the signal, not its value: a live binding takes `count`, never `count.get()`, which freezes. Call `.get()` only inside `computed`, `effect`, `resource.params`, and event handlers.\n- {syntax}\n- State that must survive an edit is a named signal: `signal(0, {{ name: \"count\" }})`.\n- `src/api.{ext}` and `src/messages/` are generated when they exist; change their inputs and regenerate, never edit them.\n- A new page is a route in `src/routes.{ext}` and a component; shared state goes in `src/store.{ext}`.\n- Files served as they are, such as data, icons, and `robots.txt`, go in `public/`.\n- Only `.env` variables named `PUBLIC_*` reach the browser, as `import.meta.env.PUBLIC_*`.\n\n## Where things go\n\n| Change | Location |\n| --- | --- |\n| A page | `src/routes.{ext}` and `src/components/<page>.{component}` |\n| Shared state or a request | `src/store.{ext}` |\n| A message | `messages/<locale>.json`, then regenerate |\n| A style token | `src/styles.css`; component styles stay in the component |\n| A static file | `public/` |\n"
    )
}

/// The commands the starter's home page and README show for each step.
fn commands(tool: Tool) -> (&'static str, &'static str, &'static str) {
    match tool {
        Tool::CommandLine => ("zerolith dev", "zerolith build", "zerolith preview"),
        Tool::Unbundled => (
            "zerolith dev",
            "zerolith build --unbundled",
            "zerolith preview",
        ),
        Tool::Vite => ("npm run dev", "npm run build", "npm run preview"),
    }
}

fn readme(name: &str, choice: Choice) -> String {
    let ext = choice.ext();
    let component = choice.component_ext();
    let (run_dev, run_build, run_preview) = commands(choice.tool);
    let intro = match choice.tool {
        Tool::Vite => {
            "A zerolith application on Vite. The commands below are the project's npm scripts, which run Vite with `@zerolith/vite`."
        }
        _ => {
            "A zerolith application. The commands below are the zerolith command line. Install it once with `npm install --global @zerolith/cli@alpha`, or run the project's own copy, which `npm install` put in `node_modules`, as `npx zerolith dev` or through the `dev`, `build`, and `preview` npm scripts, which is what CI should do."
        }
    };
    let (develop, build) = match choice.tool {
        Tool::CommandLine => (
            "serves the app at http://127.0.0.1:8080/ with live reload. Packages load straight from `node_modules`, so `index.html` names one module and a new file needs nothing but an import where it is used. An edit reloads the page and keeps the value of every named signal; a stylesheet edit applies without a reload.",
            "bundles and minifies the app into `dist/`: one script and one stylesheet with content hashes in their names, a chunk of its own for each lazy route, the files in `public/`, and an `index.html` that loads them. Templates are prepared at build time, and the inspector stays out.",
        ),
        Tool::Unbundled => (
            "serves the app at http://127.0.0.1:8080/ with live reload. Packages load straight from `node_modules`, so `index.html` names one module and a new file needs nothing but an import where it is used. An edit reloads the page and keeps the value of every named signal; a stylesheet edit applies without a reload.",
            "writes the app into `dist/` without bundling it: every module transformed to JavaScript and served as it is, the files in `public/`, and the packages copied into `dist/vendor/` behind an import map with integrity hashes. `zerolith build` bundles it instead, whenever one minified file suits the host better.",
        ),
        Tool::Vite => (
            "starts Vite with `@zerolith/vite`, which applies an edited component in place and keeps the value of every named signal.",
            "runs `vite build`, which bundles and minifies the app into `dist/`: hashed scripts and a stylesheet, the files in `public/`, and an `index.html` that loads them. `npx zerolith build` writes an equivalent bundle without Vite.",
        ),
    };
    let preview = if choice.tool == Tool::Vite {
        "runs `vite preview`, which serves `dist/` at http://localhost:4173/"
    } else {
        "serves `dist/` at http://127.0.0.1:4173/"
    };
    let base = match choice.tool {
        Tool::CommandLine => {
            "set `\"base\": \"/app/\"` in `zerolith.json`: `zerolith dev`, `build`, and `preview` then serve and write the app under that path, and the router follows it"
        }
        Tool::Unbundled => {
            "set `\"base\": \"/app/\"` in `zerolith.json` and bundle it with `zerolith build`, which applies it; the unbundled output is served from the root"
        }
        Tool::Vite => {
            "build it with `npm run build -- --base /app/`; the router follows the base Vite builds with"
        }
    };
    let backend = match choice.tool {
        Tool::Vite => {
            "To reach an API while developing, add `server.proxy` to `vite.config.ts`, such as `{ \"/api\": \"http://127.0.0.1:3000\" }`, so the page calls `fetch(\"/api/notes\")` on its own origin."
        }
        _ => {
            "To reach an API while developing, add it to the proxy in `zerolith.json`: `\"proxy\": { \"/api\": \"http://127.0.0.1:3000\" }` forwards every request under `/api` to the backend on port 3000, so the page calls `fetch(\"/api/notes\")` on its own origin with no CORS to set up, and cookies work as they will in production. `zerolith preview` forwards the same paths, and `--proxy /api=http://127.0.0.1:3000` does it for one run."
        }
    };
    let config = if choice.tool == Tool::Vite {
        ""
    } else {
        "zerolith.json            the settings dev, build, and preview share\n"
    };
    let inspector = if choice.devtools {
        " Press Alt+Shift+Z, or the launcher button in the corner, to open the inspector: every signal with its value, the mounted roots, and the diagnostics."
    } else {
        ""
    };
    let syntax = if choice.jsx {
        "\n\nComponents are written in JSX, which `zerolith dev` and `zerolith build` lower to `html` templates before the browser sees them: write `class` rather than `className`, `on:click` for events, `prop:value` for properties, and `bool:disabled` for boolean attributes. Lists and conditions are `each` and `when`. The [templates guide](https://molexxxx.github.io/zerolith/guide/templates/) has the whole mapping."
    } else {
        ""
    };
    let vite = match choice.tool {
        Tool::Vite => {
            "This project develops on Vite, for in-place component replacement and Vite plugins. The zerolith command line runs the same app without it: `npx zerolith dev`, `npx zerolith build`, and `npx zerolith preview`."
        }
        _ => {
            "Nothing here needs Vite: the zerolith command line serves, bundles, and previews the app on its own. Add Vite when you want one of its plugins, or an edited component applied in place instead of a reload: `npm install --save-dev vite @zerolith/vite`, write a `vite.config.ts` that adds `zerolith()` from `@zerolith/vite` to its plugins, and point the scripts at `vite`, `vite build`, and `vite preview`. `zerolith new --vite` starts a project that way."
        }
    };
    format!(
        "# {name}\n\n{intro}{syntax}\n\n## Develop\n\n```\n{run_dev}\n```\n\n`{run_dev}` {develop}{inspector}\n\n## Build\n\n```\n{run_build}\n```\n\n`{run_build}` {build}\n\n## Preview\n\n```\n{run_preview}\n```\n\n`{run_preview}` {preview} as a host would, to check the build before deploying it.\n\n## Deploy\n\n`dist/` is static files. Upload it to any static host, such as GitHub Pages, Netlify, Cloudflare Pages, or a storage bucket, or serve it from the static file handler of any backend. Answer every path that names no file with `index.html`, so routes such as `/counter` load directly. To serve the app under a path such as `/app/`, {base}.\n\n## Backend\n\n{backend}\n\n## Environment variables\n\nVariables in `.env` whose names start with `PUBLIC_` reach the code as `import.meta.env.PUBLIC_NAME`; any other variable stays out of the browser. `.env.local` overrides `.env` and stays out of git.\n\n## Tests and checks\n\n`npm test` runs the browser tests in `test/` in headless Chromium; run `npx playwright install chromium` once first. `npm run check` runs the type check, the linter, the tests, and the build.\n\n## Vite\n\n{vite}\n\n## Layout\n\n```\nindex.html               the page: the stylesheet and the entry module\npublic/                  files served and copied as they are\nsrc/main.{ext}             the entry\nsrc/routes.{ext}           the route table\nsrc/router.{ext}           the router the components share\nsrc/components/*.{component}   one component per file, its styles next to its markup\nsrc/styles.css           the design tokens and global styles\ntest/                    browser tests\n{config}```\n\n`AGENTS.md` is the same map for coding agents.\n"
    )
}

const FULLSTACK_README: &str = r##"# __NAME__

A zerolith application with its own backend, written from the fullstack example: a notes page under `/app/` that lists and adds notes through a JSON API under `/api`. The backend is `server.ts`, plain Node with no dependencies, which Node 24 or newer runs as TypeScript with no build step.

The commands below are the project's npm scripts: `dev` and `build` run the zerolith command line that `npm install` put in `node_modules`, and `api` and `start` run the backend.

## Develop

While you develop, two processes run side by side. Start the backend in one terminal:

```
npm run api
```

It serves the API at http://127.0.0.1:3001/api/notes. Then start the app in a second terminal:

```
npm run dev
```

`zerolith dev` serves the app at http://127.0.0.1:8080/app/ with live reload, or on the next free port when 8080 is taken, as its banner says, and the site root redirects to `/app/`. It forwards every request under `/api` to the backend, as `zerolith.json` says, so the page calls `fetch("/api/notes")` on its own origin, with no CORS to configure, and cookies work as they will in production:

```json
{
    "$schema": "./node_modules/@zerolith/cli/zerolith.schema.json",
    "base": "/app/",
    "proxy": {
        "/api": "http://127.0.0.1:3001"
    }
}
```

An edit under `src/` reloads the page; an edit to `server.ts` needs the backend restarted. To run the backend on another port, set `PORT`, as in `PORT=4000 npm run api`, and point the proxy at it.

## Build

```
npm run build
```

`zerolith build` bundles and minifies the app into `dist/` for the base in `zerolith.json`, so every URL in `dist/index.html` starts with `/app/`, such as `/app/assets/index-<hash>.js`. The router follows the same base through `import.meta.env.BASE_URL`, so its links are `/app/` and `/app/about` while developing and in production alike.

## Run the build

```
npm start
```

`npm start` runs `node server.ts --production`: one server answers the API and serves `dist/` under `/app/`, at http://127.0.0.1:3001/app/. The hashed files under `assets/` are cached for a year, and every other path under `/app/` gets `index.html`, uncached, so a route such as `/app/about` loads directly and a new build is picked up at once.

To check the build without the backend serving it, `npx zerolith preview` serves `dist/` under the same base and forwards `/api` the same way, with `npm run api` running.

## Deploy

The project deploys as one Node application on Node 24 or newer: install the dependencies, run `npm run build`, and start it with `npm start`, with `PORT` set to the port it should listen on. The server listens on 127.0.0.1, so put a reverse proxy such as nginx or Caddy in front of it, or change the address in `server.ts` to `0.0.0.0` on a host that routes traffic to the port directly. The notes live in memory and start over when the server restarts; move them to a database before relying on them.

To serve `dist/` from a static host or another web server instead, give it the same rules: `index.html` for every path under `/app/` that names no file, a year of caching for `assets/`, and `/api` forwarded to the backend. The [building and serving guide](https://molexxxx.github.io/zerolith/guide/deploying/) has the setup for static hosts, nginx, IIS, Express, and ASP.NET Core.

## Environment variables

Variables in `.env` whose names start with `PUBLIC_` reach the app's code as `import.meta.env.PUBLIC_NAME`; any other variable stays out of the browser. `.env.local` overrides `.env` and stays out of git. The backend reads the environment it runs in through `process.env`, as it reads `PORT`.

## Tests and checks

`npm test` runs the tests in `test/`: `server.test.ts` starts the backend on a free port and checks the API and how it serves a build, in Node, and `notes.browser.test.ts` renders the notes page against an API kept in memory, in headless Chromium; run `npx playwright install chromium` once first. `npm run check` runs the type check, the linter, the tests, and the build.

## Layout

```
server.ts                the backend: the API, and the built app with --production
zerolith.json            the base, /app/, and the proxy from /api to the backend
index.html               the page: the stylesheet and the entry module
src/main.ts              the entry: navigation and the current page
src/router.ts            the routes, under the base from zerolith.json
src/notes.ts             the notes page, which calls the API
src/styles.css           the global styles
src/env.d.ts             the types of import.meta.env
test/                    the backend's tests and the page's
```

`AGENTS.md` is the same map for coding agents.
"##;

const FULLSTACK_AGENTS: &str = r##"# __NAME__: guide for coding agents

A zerolith application with its own backend, written from the fullstack example. The app is served under `/app/` and calls a JSON API under `/api`; `server.ts` is the backend, plain Node with no dependencies, and serves the build in production. The app develops and builds on the zerolith command line; packages load from `node_modules` with no import map, and there is no Vite config. This file holds what is specific to this project. zerolith's own rules and patterns are in the zerolith skill, which `npx skills add molexxxx/zerolith` installs, and in the guides at https://molexxxx.github.io/zerolith/guide/.

## Commands

- Development runs two processes: `npm run api` starts the backend on port 3001, and `npm run dev` serves the app under `/app/` with live reload, forwarding `/api` to the backend as `zerolith.json` says. Restart `npm run api` after changing `server.ts`.
- `npm run build` writes `dist/` for the base `/app/`; `npm start` serves the API and `dist/` from the backend.
- `npm run check` is the gate: typecheck, lint, the backend's tests in Node and the page's in Chromium, and the build.

## Rules

- Bind the signal, not its value: a live binding takes `count`, never `count.get()`, which freezes. Call `.get()` only inside `computed`, `effect`, `resource.params`, and event handlers.
- Components are capitalized functions returning `html` templates, with their `css` literal next to the markup.
- The page calls the API by path on its own origin, such as `fetch("/api/notes")`, never by host and port: the proxy forwards the request while developing, and the backend answers it in production.
- The base `/app/` is set in `zerolith.json` and served by `server.ts`; change the two together. Links come from `router.href`, never a written-out `/app/` path.
- `server.ts` runs on Node with its types stripped, so it uses erasable TypeScript only: no `enum`, `namespace`, or parameter properties.
- Only `.env` variables named `PUBLIC_*` reach the browser, as `import.meta.env.PUBLIC_*`.

## Where things go

| Change | Location |
| --- | --- |
| An API route | `server.ts`, under `/api`, with a test in `test/server.test.ts` |
| A page | A route in `src/router.ts` and a component in `src/` |
| A style token or a global style | `src/styles.css`; component styles stay in the component |
| The base path or the backend's port | `zerolith.json` and `server.ts`, together |
| A test | `test/*.test.ts` runs in Node, `test/*.browser.test.ts` in Chromium |
| A static file | `public/` |
"##;

const FULLSTACK_VITEST_CONFIG: &str = r#"import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// The backend's tests run in Node, and the page's in headless Chromium.
export default defineConfig({
    test: {
        projects: [
            {
                test: { name: "server", include: ["test/**/*.test.ts"], exclude: ["test/**/*.browser.test.ts"] }
            },
            {
                test: {
                    name: "browser",
                    include: ["test/**/*.browser.test.ts"],
                    browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: "chromium" }] }
                }
            }
        ]
    }
});
"#;

const FULLSTACK_SERVER_TEST: &str = r#"import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { createBackend } from "../server.ts";

const servers: Server[] = [];
const dist = mkdtempSync(join(tmpdir(), "dist-"));

/** Starts a backend on a free port and resolves with its origin. */
function listen(server: Server): Promise<string>
{
    servers.push(server);
    return new Promise((resolve) =>
    {
        server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`));
    });
}

afterAll(() =>
{
    for (const server of servers)
    {
        server.close();
    }
    rmSync(dist, { recursive: true, force: true });
});

it("lists the notes and adds one", async () =>
{
    const origin = await listen(createBackend());
    const listed = await fetch(`${origin}/api/notes`);
    const before = (await listed.json()) as unknown[];
    const added = await fetch(`${origin}/api/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Test the API" })
    });
    expect(added.status).toBe(201);
    expect(await added.json()).toMatchObject({ text: "Test the API" });
    const after = await fetch(`${origin}/api/notes`);
    expect(await after.json()).toHaveLength(before.length + 1);
});

it("refuses a note without text", async () =>
{
    const origin = await listen(createBackend());
    const response = await fetch(`${origin}/api/notes`, { method: "POST", body: JSON.stringify({ text: " " }) });
    expect(response.status).toBe(400);
});

// A stand-in for what npm run build writes, so the test needs no build first.
it("serves the build under /app/, with index.html for routes and the hashed files cached", async () =>
{
    mkdirSync(join(dist, "assets"));
    writeFileSync(join(dist, "index.html"), "<!doctype html><title>Notes</title>");
    writeFileSync(join(dist, "assets", "index-1a2b3c4d.js"), "");
    const origin = await listen(createBackend({ dist }));
    const home = await fetch(`${origin}/`, { redirect: "manual" });
    expect(home.headers.get("location")).toBe("/app/");
    const route = await fetch(`${origin}/app/about`);
    expect(route.headers.get("cache-control")).toBe("no-cache");
    expect(await route.text()).toContain("<title>Notes</title>");
    const asset = await fetch(`${origin}/app/assets/index-1a2b3c4d.js`);
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    const missing = await fetch(`${origin}/app/assets/missing.js`);
    expect(missing.status).toBe(404);
});
"#;

const FULLSTACK_PAGE_TEST: &str = r#"import { afterEach, expect, it, vi } from "vitest";
import { cleanup, mount, settle } from "@zerolith/test";
import type { Note } from "../src/notes.ts";

// The notes page against an API kept in memory. The page asks for the notes
// as soon as its module runs, so fetch is replaced before it is imported.
const saved: Note[] = [{ id: 1, text: "Write the first note" }];

vi.stubGlobal("fetch", (_url: string, init?: RequestInit) =>
{
    if (init?.method === "POST")
    {
        const note = { id: saved.length + 1, text: (JSON.parse(String(init.body)) as { text: string }).text };
        saved.push(note);
        return Promise.resolve(Response.json(note, { status: 201 }));
    }
    return Promise.resolve(Response.json(saved));
});

const { Notes } = await import("../src/notes.ts");

afterEach(cleanup);

it("lists the notes from the API and adds one through the form", async () =>
{
    const { container } = mount(Notes());
    await settle();
    expect(container.querySelectorAll("li")).toHaveLength(1);
    const input = container.querySelector("input") as HTMLInputElement;
    input.value = "Add a second note";
    input.form?.requestSubmit();
    await settle();
    expect(Array.from(container.querySelectorAll("li"), (item) => item.textContent)).toEqual(["Write the first note", "Add a second note"]);
});
"#;

/// Fills a template's placeholders for the project.
fn fill(template: &str, choice: Choice, name: &str) -> String {
    let (develop, build, preview) = steps(choice.tool);
    template
        .replace(
            "__INPUT__",
            if choice.typescript {
                INPUT_TS
            } else {
                INPUT_JS
            },
        )
        .replace("__MARK__", MARK)
        .replace(
            "__FOOTER__",
            if choice.devtools {
                FOOTER_DEVTOOLS
            } else {
                FOOTER
            },
        )
        .replace("__DEV__", develop)
        .replace("__BUILD__", build)
        .replace("__PREVIEW__", preview)
        .replace("__RUN_DEV__", commands(choice.tool).0)
        .replace("__RUN_BUILD__", commands(choice.tool).1)
        .replace("__RUN_PREVIEW__", commands(choice.tool).2)
        .replace("__NAME__", name)
        .replace("__CEXT__", choice.component_ext())
        .replace("__EXT__", choice.ext())
}

/// A component file from its frame, styles, and body.
fn assemble(frame: &str, styles: &str, body: &str) -> String {
    frame
        .replace("__STYLES__", styles)
        .replace("__BODY__", body)
}

/// The source of each component for the choice.
fn components(choice: Choice) -> Vec<(&'static str, String)> {
    let pick = |ts: &'static str, js: &'static str, tsx: &'static str, jsx: &'static str| match (
        choice.typescript,
        choice.jsx,
    ) {
        (true, false) => ts,
        (false, false) => js,
        (true, true) => tsx,
        (false, true) => jsx,
    };
    let markup = |html: &'static str, jsx: &'static str| if choice.jsx { jsx } else { html };
    let packages_imports = match (choice.typescript, choice.jsx) {
        (true, false) => {
            "import { type View, computed, css, each, html, resource, signal, when } from \"zerolith\";"
        }
        (false, false) => {
            "import { computed, css, each, html, resource, signal, when } from \"zerolith\";"
        }
        (true, true) => {
            "import { type View, computed, css, each, resource, signal, when } from \"zerolith\";"
        }
        (false, true) => {
            "import { computed, css, each, resource, signal, when } from \"zerolith\";"
        }
    };
    let packages_signature = if choice.typescript {
        "export function Packages(): View"
    } else {
        "/** @returns {View} */\nexport function Packages()"
    };
    let packages = format!(
        "{PACKAGES_DOC}\n{packages_imports}\n\n{}\n\n{PACKAGES_STYLES}\n\n{packages_signature}\n{{\n{MATCHES}\n{}\n}}\n",
        if choice.typescript {
            CATALOG_TS
        } else {
            CATALOG_JS
        },
        markup(PACKAGES_HTML, PACKAGES_JSX_BODY)
    );
    vec![
        (
            "layout",
            assemble(
                pick(LAYOUT_TS, LAYOUT_JS, LAYOUT_TSX, LAYOUT_JSX),
                LAYOUT_STYLES,
                "",
            ),
        ),
        (
            "home",
            assemble(
                pick(HOME_TS, HOME_JS, HOME_TSX, HOME_JSX),
                HOME_STYLES,
                markup(HOME_HTML, HOME_JSX_BODY),
            ),
        ),
        (
            "counter",
            assemble(
                pick(COUNTER_TS, COUNTER_JS, COUNTER_TSX, COUNTER_JSX),
                COUNTER_STYLES,
                markup(COUNTER_HTML, COUNTER_JSX_BODY),
            ),
        ),
        ("packages", packages),
        (
            "not-found",
            pick(NOT_FOUND_TS, NOT_FOUND_JS, NOT_FOUND_TSX, NOT_FOUND_JSX).to_string(),
        ),
    ]
}

fn write(root: &Path, relative: &str, content: &str) -> io::Result<()> {
    let path = root.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, content)
}

const GITIGNORE: &str = "node_modules/\ndist/\n.env.local\n.env.*.local\n";

/// Writes the project for `name` into `root`, which must not exist yet or must be empty: the starter, or the example the choice names. Returns the files it wrote.
pub fn scaffold(root: &Path, name: &str, choice: Choice) -> io::Result<Vec<String>> {
    if root.exists() && fs::read_dir(root)?.next().is_some() {
        return Err(io::Error::other(format!(
            "{} exists and is not empty",
            root.display()
        )));
    }
    let shown = display_name(name);
    let files = match choice.start {
        Start::Starter => starter_files(name, &shown, choice),
        Start::Fullstack => fullstack_files(name, &shown),
    };
    for (relative, content) in &files {
        write(root, relative, content)?;
    }
    Ok(files.into_iter().map(|(relative, _)| relative).collect())
}

/// The fullstack example's application files as the example has them, with the manifest, configuration, tests, README, and AGENTS.md of a project of its own.
fn fullstack_files(name: &str, shown: &str) -> Vec<(String, String)> {
    let mut files = vec![
        ("package.json".to_string(), fullstack_package_json(name)),
        (
            "README.md".to_string(),
            FULLSTACK_README.replace("__NAME__", shown),
        ),
        (
            "AGENTS.md".to_string(),
            FULLSTACK_AGENTS.replace("__NAME__", shown),
        ),
        ("tsconfig.json".to_string(), tsconfig(Choice::FULLSTACK)),
        (".oxlintrc.json".to_string(), OXLINTRC.to_string()),
        (
            "vitest.config.ts".to_string(),
            FULLSTACK_VITEST_CONFIG.to_string(),
        ),
        (".gitignore".to_string(), GITIGNORE.to_string()),
        (
            "test/server.test.ts".to_string(),
            FULLSTACK_SERVER_TEST.to_string(),
        ),
        (
            "test/notes.browser.test.ts".to_string(),
            FULLSTACK_PAGE_TEST.to_string(),
        ),
    ];
    files.extend(
        FULLSTACK_FILES
            .iter()
            .map(|(relative, content)| (relative.to_string(), content.to_string())),
    );
    files
}

/// The starter's files for the language and tools of the choice.
fn starter_files(name: &str, shown: &str, choice: Choice) -> Vec<(String, String)> {
    let ext = choice.ext();
    let mut files = vec![
        ("package.json".to_string(), package_json(name, choice)),
        ("index.html".to_string(), fill(INDEX_HTML, choice, shown)),
        ("README.md".to_string(), readme(shown, choice)),
        ("AGENTS.md".to_string(), agents_md(shown, choice)),
        ("tsconfig.json".to_string(), tsconfig(choice)),
        (".oxlintrc.json".to_string(), OXLINTRC.to_string()),
        (
            "vitest.config.ts".to_string(),
            if choice.jsx {
                VITEST_CONFIG_JSX
            } else {
                VITEST_CONFIG
            }
            .to_string(),
        ),
        (".gitignore".to_string(), GITIGNORE.to_string()),
        ("public/favicon.svg".to_string(), FAVICON.to_string()),
        (
            "public/data/packages.json".to_string(),
            PACKAGES_DATA.to_string(),
        ),
        ("src/styles.css".to_string(), STYLES.to_string()),
        (
            format!("src/main.{ext}"),
            fill(
                if choice.devtools { MAIN_DEVTOOLS } else { MAIN },
                choice,
                shown,
            ),
        ),
        (
            format!("src/router.{ext}"),
            fill(
                if choice.typescript {
                    ROUTER_TS
                } else {
                    ROUTER_JS
                },
                choice,
                shown,
            ),
        ),
        (format!("src/routes.{ext}"), fill(ROUTES, choice, shown)),
        (
            format!("test/counter.browser.test.{ext}"),
            fill(TEST, choice, shown),
        ),
    ];
    for (component, source) in components(choice) {
        files.push((
            format!("src/components/{component}.{}", choice.component_ext()),
            fill(&source, choice, shown),
        ));
    }
    if choice.tool == Tool::Vite {
        files.push(("vite.config.ts".to_string(), VITE_CONFIG.to_string()));
        files.push(("src/env.d.ts".to_string(), VITE_ENV_TYPES.to_string()));
    } else {
        files.push(("src/env.d.ts".to_string(), ENV_TYPES.to_string()));
        files.push(("zerolith.json".to_string(), PROJECT_CONFIG.to_string()));
    }
    files
}

/// What the command line settled before any question: each `None` is asked, or takes its default.
#[derive(Debug, Default)]
pub struct Answers {
    pub root: Option<PathBuf>,
    /// The starter or an example; `--example` sets it.
    pub start: Option<Start>,
    /// `tsx`, `ts`, `jsx`, or `js`.
    pub template: Option<String>,
    pub tool: Option<Tool>,
    pub devtools: Option<bool>,
    pub install: Option<bool>,
}

fn template_choice(template: &str) -> (bool, bool) {
    match template {
        "ts" => (true, false),
        "jsx" => (false, true),
        "js" => (false, false),
        _ => (true, true),
    }
}

/// Asks one question on the terminal and returns the answer, or the default for an empty line.
fn ask(input: &mut impl BufRead, question: &str, default: &str) -> io::Result<String> {
    anstream::print!(
        "  {} {}: ",
        term::bold(question),
        term::muted(format!("({default})"))
    );
    io::stdout().flush()?;
    let mut line = String::new();
    input.read_line(&mut line)?;
    let answer = line.trim();
    Ok(if answer.is_empty() {
        default.to_string()
    } else {
        answer.to_string()
    })
}

/// Asks to pick one of `options` by number, the first being the default.
fn pick(input: &mut impl BufRead, question: &str, options: &[&str]) -> io::Result<usize> {
    anstream::println!("\n  {}", term::bold(question));
    for (index, option) in options.iter().enumerate() {
        anstream::println!("    {}  {option}", term::muted(index + 1));
    }
    loop {
        let answer = ask(input, &format!("Choose 1-{}", options.len()), "1")?;
        if let Ok(number) = answer.parse::<usize>()
            && (1..=options.len()).contains(&number)
        {
            return Ok(number - 1);
        }
        anstream::println!(
            "  {}",
            term::warning(format!("Type a number from 1 to {}.", options.len()))
        );
    }
}

fn confirm(input: &mut impl BufRead, question: &str) -> io::Result<bool> {
    anstream::println!();
    let answer = ask(input, question, "Y/n")?;
    Ok(!matches!(answer.to_ascii_lowercase().as_str(), "n" | "no"))
}

/// The flags given that only the starter takes, as they were written, since an example is TypeScript on the command line.
fn starter_flags(answers: &Answers) -> Vec<String> {
    let mut flags = Vec::new();
    if let Some(template) = &answers.template {
        flags.push(format!("--template {template}"));
    }
    match answers.tool {
        Some(Tool::Vite) => flags.push("--vite".to_string()),
        Some(Tool::Unbundled) => flags.push("--buildless".to_string()),
        Some(Tool::CommandLine) | None => {}
    }
    flags
}

/// Fills in what the flags left open: asked on a terminal, or the defaults elsewhere and with `--yes`.
pub fn settle(answers: Answers, interactive: bool) -> io::Result<(PathBuf, Choice, bool)> {
    let interactive = interactive && io::stdin().is_terminal() && io::stdout().is_terminal();
    settle_from(&mut io::stdin().lock(), answers, interactive)
}

/// `settle`, reading the answers to its questions from `input`. The starting point comes first, unless a flag only the starter takes already settled it.
fn settle_from(
    input: &mut impl BufRead,
    mut answers: Answers,
    interactive: bool,
) -> io::Result<(PathBuf, Choice, bool)> {
    let starter_only = starter_flags(&answers);
    let start = match answers.start {
        Some(Start::Fullstack) if !starter_only.is_empty() => {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                format!(
                    "--example fullstack takes no {}, since the example is TypeScript on the zerolith command line; leave {} out, or drop --example to write the starter",
                    starter_only.join(" or "),
                    if starter_only.len() == 1 {
                        "the flag"
                    } else {
                        "the flags"
                    }
                ),
            ));
        }
        Some(start) => start,
        None if interactive && starter_only.is_empty() => match pick(
            input,
            "Starting point",
            &[
                "The starter: three pages in the brand style, in the language and with the tools you pick next",
                "The fullstack example: a notes app under /app/ with its own Node backend, in TypeScript on the command line",
            ],
        )? {
            1 => Start::Fullstack,
            _ => Start::Starter,
        },
        None => Start::Starter,
    };
    if answers.root.is_none() {
        answers.root = Some(PathBuf::from(if interactive {
            ask(input, "Project folder", "zerolith-app")?
        } else {
            "zerolith-app".to_string()
        }));
    }
    let choice = match start {
        Start::Fullstack => Choice::FULLSTACK,
        Start::Starter => starter_choice(input, &answers, interactive)?,
    };
    let install = match answers.install {
        Some(install) => install,
        None if interactive => confirm(
            input,
            &format!("Install the dependencies with {}", package_manager()),
        )?,
        None => true,
    };
    if interactive {
        anstream::println!();
    }
    Ok((answers.root.unwrap_or_default(), choice, install))
}

/// The starter's language, tools, and inspector: from the flags, asked on a terminal, or the defaults.
fn starter_choice(
    input: &mut impl BufRead,
    answers: &Answers,
    interactive: bool,
) -> io::Result<Choice> {
    let (typescript, jsx) = match &answers.template {
        Some(template) => template_choice(template),
        None if interactive => match pick(
            input,
            "Language",
            &[
                "TSX: TypeScript components written in JSX",
                "TS: TypeScript components written as html templates",
                "JSX: JavaScript components written in JSX",
                "JS: JavaScript components written as html templates",
            ],
        )? {
            1 => (true, false),
            2 => (false, true),
            3 => (false, false),
            _ => (Choice::DEFAULT.typescript, Choice::DEFAULT.jsx),
        },
        None => (Choice::DEFAULT.typescript, Choice::DEFAULT.jsx),
    };
    let tool = match answers.tool {
        Some(tool) => tool,
        None if interactive => match pick(
            input,
            "Dev server and build",
            &[
                "The zerolith command line: dev, build, and preview with nothing else",
                "Vite with @zerolith/vite: in-place component replacement and Vite plugins",
                "The zerolith command line, deploying the modules behind an import map instead of a bundle",
            ],
        )? {
            1 => Tool::Vite,
            2 => Tool::Unbundled,
            _ => Choice::DEFAULT.tool,
        },
        None => Choice::DEFAULT.tool,
    };
    let devtools = match answers.devtools {
        Some(devtools) => devtools,
        None if interactive => confirm(input, "Include the inspector from @zerolith/devtools")?,
        None => Choice::DEFAULT.devtools,
    };
    Ok(Choice {
        start: Start::Starter,
        tool,
        typescript,
        jsx,
        devtools,
    })
}

/// The package manager that ran the command, from the user agent npm, pnpm, Yarn, and Bun set, or npm.
fn package_manager() -> &'static str {
    let agent = std::env::var("npm_config_user_agent").unwrap_or_default();
    ["pnpm", "yarn", "bun"]
        .into_iter()
        .find(|name| agent.starts_with(name))
        .unwrap_or("npm")
}

/// Runs `<manager> install` in the new project, through `cmd` on Windows, where the managers are batch files.
fn install(root: &Path, manager: &str) -> io::Result<bool> {
    let status = if cfg!(windows) {
        Command::new("cmd")
            .args(["/C", manager, "install"])
            .current_dir(root)
            .status()?
    } else {
        Command::new(manager)
            .arg("install")
            .current_dir(root)
            .status()?
    };
    Ok(status.success())
}

/// Runs the `new` command: writes the starter or the example and, when asked to, installs its dependencies.
pub fn run(root: &Path, choice: Choice, install_dependencies: bool) -> io::Result<()> {
    let name = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("app")
        .to_string();
    let files = scaffold(root, &name, choice)?;
    anstream::println!(
        "{}",
        term::row(
            "wrote",
            term::done,
            format!("{} files to {}", files.len(), term::bold(root.display()))
        )
    );
    let manager = package_manager();
    let mut installed = false;
    if install_dependencies {
        anstream::println!(
            "{}\n",
            term::row("install", term::label, format!("{manager} install"))
        );
        installed = install(root, manager).unwrap_or(false);
        if installed {
            anstream::println!(
                "\n{}",
                term::row("installed", term::done, "the dependencies")
            );
        } else {
            anstream::eprintln!(
                "\n{}",
                term::row(
                    "warning",
                    term::caution,
                    format!(
                        "{manager} install did not finish; run it in {} before starting",
                        root.display()
                    )
                )
            );
        }
    }
    anstream::println!("\n  {}", term::muted("Next:"));
    anstream::println!("    {}", term::bold(format!("cd {}", root.display())));
    if !installed {
        anstream::println!("    {}", term::bold(format!("{manager} install")));
    }
    let steps = next_steps(choice);
    let width = steps
        .iter()
        .map(|(command, _)| command.len())
        .max()
        .unwrap_or(0)
        + 3;
    for (command, what) in &steps {
        let padding = " ".repeat(width.saturating_sub(command.len()));
        anstream::println!("    {}{padding}{}", term::bold(command), term::muted(what));
    }
    anstream::println!();
    Ok(())
}

/// The commands the new project runs on, each with what it does, as the closing lines list them.
fn next_steps(choice: Choice) -> Vec<(String, &'static str)> {
    if choice.start == Start::Fullstack {
        return vec![
            (
                "npm run api".to_string(),
                "start the backend, which answers /api",
            ),
            (
                "npm run dev".to_string(),
                "in a second terminal, serve the app and forward /api to the backend",
            ),
            (
                "npm run build".to_string(),
                "write the production build to dist/",
            ),
            (
                "npm start".to_string(),
                "serve the API and the build from the backend",
            ),
        ];
    }
    let (develop, build, preview) = commands(choice.tool);
    let prefix = if choice.tool == Tool::Vite || on_path("zerolith") {
        ""
    } else {
        "npx "
    };
    vec![
        (format!("{prefix}{develop}"), "serve the app while you work"),
        (
            format!("{prefix}{build}"),
            "write the production build to dist/",
        ),
        (format!("{prefix}{preview}"), "serve dist/ to check it"),
    ]
}

/// True when a program of this name is on `PATH` for good, as a global npm install puts the command line there; the folders npx and npm scripts add for one run do not count.
fn on_path(program: &str) -> bool {
    let Some(paths) = std::env::var_os("PATH") else {
        return false;
    };
    std::env::split_paths(&paths).any(|folder| {
        let text = folder.to_string_lossy().replace('\\', "/");
        !text.contains("/_npx/")
            && !text.trim_end_matches('/').ends_with("node_modules/.bin")
            && ["", ".exe", ".cmd"]
                .iter()
                .any(|suffix| folder.join(format!("{program}{suffix}")).is_file())
    })
}

#[cfg(test)]
mod tests {
    use super::{
        Answers, Choice, FAVICON, FULLSTACK_FILES, Start, TOOL_VERSIONS, Tool, agents_md, ask,
        confirm, package_json, package_name, pick, scaffold, settle, settle_from,
    };
    use std::fs;
    use std::io::{self, Cursor};
    use std::path::{Path, PathBuf};

    #[test]
    fn writes_the_agents_md_the_structure_guide_shows() {
        let guide = include_str!("../../../docs/guide/structure.md");
        let written = agents_md(
            "<name>",
            Choice {
                jsx: false,
                ..Choice::DEFAULT
            },
        );
        assert!(
            guide.contains(&format!(
                "```markdown
{written}```"
            )),
            "docs/guide/structure.md should show the AGENTS.md a TypeScript starter gets:
{written}"
        );
    }

    /// The files under `folder` as paths relative to `prefix`, leaving out build output and installed packages.
    fn files_under(folder: &Path, prefix: &str, found: &mut Vec<String>) {
        for entry in fs::read_dir(folder).unwrap() {
            let entry = entry.unwrap();
            let name = entry.file_name().to_string_lossy().to_string();
            if entry.path().is_dir() {
                if !matches!(name.as_str(), "dist" | "node_modules") {
                    files_under(&entry.path(), &format!("{prefix}{name}/"), found);
                }
            } else {
                found.push(format!("{prefix}{name}"));
            }
        }
    }

    #[test]
    fn writes_each_choice_with_the_name_and_pinned_versions() {
        let base = std::env::temp_dir().join(format!("zerolith-new-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let choices = [
            (
                "tsx-app",
                Choice::DEFAULT,
                "src/main.ts",
                "tsx",
                "zerolith dev",
            ),
            (
                "ts-app",
                Choice {
                    jsx: false,
                    ..Choice::DEFAULT
                },
                "src/main.ts",
                "ts",
                "zerolith dev",
            ),
            (
                "jsx-app",
                Choice {
                    typescript: false,
                    ..Choice::DEFAULT
                },
                "src/main.js",
                "jsx",
                "zerolith dev",
            ),
            (
                "js-app",
                Choice {
                    typescript: false,
                    jsx: false,
                    devtools: false,
                    ..Choice::DEFAULT
                },
                "src/main.js",
                "js",
                "zerolith dev",
            ),
            (
                "plain-app",
                Choice {
                    tool: Tool::Unbundled,
                    ..Choice::DEFAULT
                },
                "src/main.ts",
                "tsx",
                "zerolith dev",
            ),
            (
                "vite-app",
                Choice {
                    tool: Tool::Vite,
                    ..Choice::DEFAULT
                },
                "src/main.ts",
                "tsx",
                "vite",
            ),
        ];
        for (folder, choice, entry, component, develop) in choices {
            let root = base.join(folder);
            let files = scaffold(&root, folder, choice).unwrap();
            assert!(
                files.iter().any(|file| file == entry),
                "{folder} lacks {entry}"
            );
            let manifest = fs::read_to_string(root.join("package.json")).unwrap();
            let parsed: serde_json::Value = serde_json::from_str(&manifest).unwrap();
            assert_eq!(parsed["name"], folder);
            assert_eq!(parsed["scripts"]["dev"], develop);
            assert_eq!(
                parsed["scripts"]["build"]
                    .as_str()
                    .unwrap()
                    .ends_with("--unbundled"),
                choice.tool == Tool::Unbundled
            );
            assert!(
                parsed["devDependencies"]["@zerolith/cli"].is_string()
                    && parsed["devDependencies"]["@zerolith/test"].is_string()
            );
            assert_eq!(
                parsed["devDependencies"]["vite"].is_string(),
                choice.tool == Tool::Vite
            );
            assert_eq!(
                parsed["devDependencies"]["@zerolith/vite"].is_string(),
                choice.tool == Tool::Vite || choice.jsx
            );
            assert_eq!(
                parsed["dependencies"]["@zerolith/devtools"].is_string(),
                choice.devtools
            );
            assert!(!manifest.contains("latest"));
            assert!(
                crate::doctor::lint_sources(&root).is_empty(),
                "{folder} has template findings"
            );
            let html = fs::read_to_string(root.join("index.html")).unwrap();
            assert!(
                !html.contains("importmap") && html.contains(&format!("src=\"/{entry}\"")),
                "{html}"
            );
            assert_eq!(
                root.join("vite.config.ts").exists(),
                choice.tool == Tool::Vite
            );
            assert!(
                root.join("public/favicon.svg").is_file()
                    && root.join("public/data/packages.json").is_file()
            );
            for page in ["layout", "home", "counter", "packages", "not-found"] {
                let source =
                    fs::read_to_string(root.join(format!("src/components/{page}.{component}")))
                        .unwrap();
                assert!(
                    !source.contains("__"),
                    "{folder}/{page} keeps a placeholder: {source}"
                );
                assert_eq!(source.contains("html`"), !choice.jsx, "{folder}/{page}");
                assert_eq!(
                    source.contains("): View"),
                    choice.typescript,
                    "{folder}/{page}"
                );
            }
            let main = fs::read_to_string(root.join(entry)).unwrap();
            assert_eq!(main.contains("mountDevtools"), choice.devtools);
            let readme = fs::read_to_string(root.join("README.md")).unwrap();
            let (develop, _, preview) = super::commands(choice.tool);
            assert!(
                readme.contains("## Deploy") && readme.contains(preview),
                "{readme}"
            );
            let home =
                fs::read_to_string(root.join(format!("src/components/home.{component}"))).unwrap();
            assert!(home.contains(&format!("<code>{develop}</code>")), "{home}");
            let agents = fs::read_to_string(root.join("AGENTS.md")).unwrap();
            assert!(agents.contains(&format!("# {folder}: guide for coding agents")));
        }
        assert!(scaffold(&base.join("tsx-app"), "tsx-app", Choice::DEFAULT).is_err());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn writes_the_fullstack_example_as_a_project_of_its_own() {
        let root =
            std::env::temp_dir().join(format!("zerolith-new-fullstack-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let mut files = scaffold(&root, "My Notes", Choice::FULLSTACK).unwrap();
        files.sort();
        let mut found = Vec::new();
        files_under(&root, "", &mut found);
        found.sort();
        assert_eq!(files, found);
        assert_eq!(
            files,
            [
                ".gitignore",
                ".oxlintrc.json",
                "AGENTS.md",
                "README.md",
                "index.html",
                "package.json",
                "server.ts",
                "src/env.d.ts",
                "src/main.ts",
                "src/notes.ts",
                "src/router.ts",
                "src/styles.css",
                "test/notes.browser.test.ts",
                "test/server.test.ts",
                "tsconfig.json",
                "vitest.config.ts",
                "zerolith.json",
            ]
        );
        for (relative, content) in FULLSTACK_FILES {
            assert_eq!(
                fs::read_to_string(root.join(relative)).unwrap(),
                content,
                "{relative}"
            );
        }

        let manifest: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(root.join("package.json")).unwrap()).unwrap();
        assert_eq!(manifest["name"], "my-notes");
        let scripts = manifest["scripts"].as_object().unwrap();
        let mut names: Vec<&str> = scripts.keys().map(String::as_str).collect();
        names.sort_unstable();
        assert_eq!(
            names,
            [
                "api",
                "build",
                "check",
                "dev",
                "lint",
                "start",
                "test",
                "typecheck"
            ]
        );
        assert_eq!(scripts["dev"], "zerolith dev");
        assert_eq!(scripts["api"], "node server.ts");
        assert_eq!(scripts["build"], "zerolith build");
        assert_eq!(scripts["start"], "node server.ts --production");
        let starter: serde_json::Value =
            serde_json::from_str(&package_json("starter", Choice::DEFAULT)).unwrap();
        for script in ["check", "typecheck", "lint", "test"] {
            assert_eq!(scripts[script], starter["scripts"][script], "{script}");
        }

        let framework = env!("CARGO_PKG_VERSION");
        let versions: serde_json::Value = serde_json::from_str(TOOL_VERSIONS).unwrap();
        let pinned = |list: &str| -> Vec<(String, String)> {
            let mut pinned: Vec<(String, String)> = manifest[list]
                .as_object()
                .unwrap()
                .iter()
                .map(|(name, version)| (name.clone(), version.as_str().unwrap().to_string()))
                .collect();
            pinned.sort();
            pinned
        };
        assert_eq!(
            pinned("dependencies"),
            [
                ("@zerolith/router".to_string(), framework.to_string()),
                ("zerolith".to_string(), framework.to_string()),
            ]
        );
        let dev = pinned("devDependencies");
        assert_eq!(
            dev.iter()
                .map(|(name, _)| name.as_str())
                .collect::<Vec<_>>(),
            [
                "@types/node",
                "@vitest/browser-playwright",
                "@zerolith/cli",
                "@zerolith/test",
                "oxlint",
                "playwright",
                "typescript",
                "vitest",
            ]
        );
        for (name, version) in &dev {
            let expected = if name.starts_with("@zerolith/") {
                framework
            } else {
                versions[name].as_str().unwrap()
            };
            assert_eq!(version, expected, "{name}");
        }

        let config = crate::config::Config::load(&root).unwrap();
        assert_eq!(config.base.as_deref(), Some("/app/"));
        let rules = config.proxy_rules(&[]).unwrap();
        assert_eq!(
            (rules[0].prefix.as_str(), rules[0].target.port),
            ("/api", 3001)
        );
        let tsconfig = fs::read_to_string(root.join("tsconfig.json")).unwrap();
        assert!(
            tsconfig.contains("\"types\": [\"node\"]")
                && tsconfig.contains(
                    "\"include\": [\"server.ts\", \"src\", \"test\", \"vitest.config.ts\"]"
                ),
            "{tsconfig}"
        );
        assert!(crate::doctor::lint_sources(&root).is_empty());
        for relative in &files {
            let text = fs::read_to_string(root.join(relative)).unwrap();
            assert!(
                !text.contains("../../")
                    && !text.contains("examples/fullstack")
                    && !text.contains("scripts/zerolith")
                    && !text.contains("npm run fullstack")
                    && !text.contains("__"),
                "{relative} refers to the repository or keeps a placeholder"
            );
        }
        let readme = fs::read_to_string(root.join("README.md")).unwrap();
        assert!(readme.starts_with("# My Notes\n"));
        for section in ["## Develop", "## Build", "## Run the build", "## Deploy"] {
            assert!(readme.contains(section), "README.md lacks {section}");
        }
        assert!(readme.contains("npm run api") && readme.contains("npm run dev"));
        let agents = fs::read_to_string(root.join("AGENTS.md")).unwrap();
        assert!(agents.starts_with("# My Notes: guide for coding agents\n"));
        assert!(agents.contains("two processes"));
        assert!(scaffold(&root, "My Notes", Choice::FULLSTACK).is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn the_fullstack_copy_matches_the_example() {
        let example = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/fullstack");
        if !example.is_dir() {
            return;
        }
        let adaptations = [(
            "zerolith.json",
            "\"../../packages/cli/zerolith.schema.json\"",
            "\"./node_modules/@zerolith/cli/zerolith.schema.json\"",
        )];
        let mut found = Vec::new();
        files_under(&example, "", &mut found);
        found.retain(|relative| relative != "README.md" && !relative.starts_with("test/"));
        found.sort();
        let mut copied: Vec<&str> = FULLSTACK_FILES
            .iter()
            .map(|(relative, _)| *relative)
            .collect();
        copied.sort();
        assert_eq!(
            found, copied,
            "examples/fullstack and its copy in templates/examples/fullstack hold different files"
        );
        for (relative, copy) in FULLSTACK_FILES {
            let mut source = fs::read_to_string(example.join(relative)).unwrap();
            for (file, from, to) in adaptations {
                if file == relative {
                    assert!(
                        source.contains(from),
                        "examples/fullstack/{file} no longer has {from}"
                    );
                    source = source.replace(from, to);
                }
            }
            assert_eq!(
                copy, source,
                "templates/examples/fullstack/{relative} drifted from examples/fullstack/{relative}"
            );
        }
    }

    #[test]
    fn settles_flags_and_defaults_without_asking() {
        let (root, choice, install) = settle(
            Answers {
                template: Some("js".to_string()),
                tool: Some(Tool::Vite),
                devtools: Some(false),
                install: Some(false),
                ..Answers::default()
            },
            false,
        )
        .unwrap();
        assert_eq!(root, PathBuf::from("zerolith-app"));
        assert_eq!(
            choice,
            Choice {
                start: Start::Starter,
                tool: Tool::Vite,
                typescript: false,
                jsx: false,
                devtools: false
            }
        );
        assert!(!install);
        let (_, defaults, install) = settle(Answers::default(), false).unwrap();
        assert_eq!(defaults, Choice::DEFAULT);
        assert!(install);
    }

    #[test]
    fn keeps_the_starter_under_yes_and_asks_for_the_starting_point_first() {
        let (_, choice, _) = settle(
            Answers {
                install: Some(false),
                ..Answers::default()
            },
            false,
        )
        .unwrap();
        assert_eq!(choice.start, Start::Starter);
        let mut input = Cursor::new("2\nnotes\nn\n");
        assert_eq!(
            settle_from(&mut input, Answers::default(), true).unwrap(),
            (PathBuf::from("notes"), Choice::FULLSTACK, false)
        );
        let mut input = Cursor::new("\n\n\n\n\n\n");
        assert_eq!(
            settle_from(&mut input, Answers::default(), true).unwrap(),
            (PathBuf::from("zerolith-app"), Choice::DEFAULT, true)
        );
        let mut input = Cursor::new("2\n\n\n");
        let (_, choice, _) = settle_from(
            &mut input,
            Answers {
                root: Some(PathBuf::from("site")),
                template: Some("ts".to_string()),
                ..Answers::default()
            },
            true,
        )
        .unwrap();
        assert_eq!(
            (choice.start, choice.tool, choice.jsx),
            (Start::Starter, Tool::Vite, false)
        );
    }

    #[test]
    fn takes_the_example_with_its_own_settings_and_refuses_starter_flags() {
        let (_, choice, install) = settle(
            Answers {
                start: Some(Start::Fullstack),
                devtools: Some(false),
                ..Answers::default()
            },
            false,
        )
        .unwrap();
        assert_eq!(choice, Choice::FULLSTACK);
        assert!(install);
        assert_eq!(Start::example("fullstack"), Some(Start::Fullstack));
        assert_eq!(Start::example("starter"), None);
        for (template, tool, named) in [
            (Some("ts"), None, "takes no --template ts, since"),
            (None, Some(Tool::Vite), "takes no --vite, since"),
            (None, Some(Tool::Unbundled), "takes no --buildless, since"),
            (
                Some("js"),
                Some(Tool::Vite),
                "takes no --template js or --vite, since",
            ),
        ] {
            let error = settle(
                Answers {
                    start: Some(Start::Fullstack),
                    template: template.map(str::to_string),
                    tool,
                    ..Answers::default()
                },
                false,
            )
            .unwrap_err();
            assert_eq!(error.kind(), io::ErrorKind::InvalidInput);
            let message = error.to_string();
            assert!(
                message.contains(named)
                    && message.contains("TypeScript on the zerolith command line"),
                "{message}"
            );
        }
    }

    #[test]
    fn asks_until_an_answer_is_valid_and_takes_defaults_on_enter() {
        let mut input = Cursor::new("9\n2\n\nn\nmy-site\n");
        assert_eq!(pick(&mut input, "Language", &["a", "b", "c"]).unwrap(), 1);
        assert!(confirm(&mut input, "Install").unwrap());
        assert!(!confirm(&mut input, "Inspector").unwrap());
        assert_eq!(
            ask(&mut input, "Folder", "zerolith-app").unwrap(),
            "my-site"
        );
        assert_eq!(
            ask(&mut input, "Folder", "zerolith-app").unwrap(),
            "zerolith-app"
        );
    }

    #[test]
    fn makes_any_folder_name_a_package_name() {
        assert_eq!(package_name("My App"), "my-app");
        assert_eq!(package_name("--"), "app");
        assert_eq!(package_name("site.v2"), "site.v2");
    }

    #[test]
    fn tool_versions_and_the_favicon_match_their_sources() {
        let repository = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let Ok(source) = fs::read_to_string(repository.join("package.json")) else {
            return;
        };
        let manifest: serde_json::Value = serde_json::from_str(&source).unwrap();
        let versions: serde_json::Value = serde_json::from_str(TOOL_VERSIONS).unwrap();
        for (name, version) in versions.as_object().unwrap() {
            assert_eq!(
                &manifest["devDependencies"][name], version,
                "{name} drifted"
            );
        }
        let favicon = fs::read_to_string(repository.join("brand/app-icon/favicon.svg")).unwrap();
        assert_eq!(
            FAVICON, favicon,
            "templates/favicon.svg drifted from brand/app-icon/favicon.svg"
        );
    }
}
