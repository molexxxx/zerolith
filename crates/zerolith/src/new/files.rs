//! Assembling the starter: each template filled for the project's choices,
//! and the files written.

use std::fs;
use std::io::{self};
use std::path::Path;

use super::config::{
    ENV_TYPES, GITIGNORE, OXLINTRC, PACKAGES_DATA, PROJECT_CONFIG, TEST, VITE_CONFIG,
    VITE_ENV_TYPES, VITEST_CONFIG, tsconfig,
};
use super::docs::{agents_md, commands, readme, steps};
use super::fullstack::fullstack_files;
use super::manifest::{display_name, package_json};
use super::templates::{
    CATALOG_JS, CATALOG_TS, COUNTER_HTML, COUNTER_JS, COUNTER_JSX, COUNTER_JSX_BODY,
    COUNTER_STYLES, COUNTER_TS, COUNTER_TSX, FAVICON, FOOTER, FOOTER_DEVTOOLS, FOOTER_DEVTOOLS_JSX,
    HOME_HTML, HOME_JS, HOME_JSX, HOME_JSX_BODY, HOME_STYLES, HOME_TS, HOME_TSX, INDEX_HTML,
    INPUT_JS, INPUT_TS, LAYOUT_JS, LAYOUT_JSX, LAYOUT_STYLES, LAYOUT_TS, LAYOUT_TSX, MAIN,
    MAIN_DEVTOOLS, MARK, MATCHES, NOT_FOUND_JS, NOT_FOUND_JSX, NOT_FOUND_TS, NOT_FOUND_TSX,
    PACKAGES_DOC, PACKAGES_HTML, PACKAGES_JSX_BODY, PACKAGES_STYLES, ROUTER_JS, ROUTER_TS, ROUTES,
    STYLES,
};
use super::{Choice, Start, Tool};

/// Fills a template's placeholders for the project.
pub(super) fn fill(template: &str, choice: Choice, name: &str) -> String {
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
            match (choice.devtools, choice.jsx) {
                (false, _) => FOOTER,
                (true, false) => FOOTER_DEVTOOLS,
                (true, true) => FOOTER_DEVTOOLS_JSX,
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
pub(super) fn components(choice: Choice) -> Vec<(&'static str, String)> {
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

pub(super) fn write(root: &Path, relative: &str, content: &str) -> io::Result<()> {
    let path = root.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, content)
}

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
        Start::Fullstack => fullstack_files(name, &shown, choice),
    };
    for (relative, content) in &files {
        write(root, relative, content)?;
    }
    Ok(files.into_iter().map(|(relative, _)| relative).collect())
}

/// The starter's files for the language and tools of the choice.
pub(super) fn starter_files(name: &str, shown: &str, choice: Choice) -> Vec<(String, String)> {
    let ext = choice.ext();
    let mut files = vec![
        ("package.json".to_string(), package_json(name, choice)),
        ("index.html".to_string(), fill(INDEX_HTML, choice, shown)),
        ("README.md".to_string(), readme(shown, choice)),
        ("AGENTS.md".to_string(), agents_md(shown, choice)),
        ("tsconfig.json".to_string(), tsconfig(choice)),
        (".oxlintrc.json".to_string(), OXLINTRC.to_string()),
        ("vitest.config.ts".to_string(), VITEST_CONFIG.to_string()),
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
