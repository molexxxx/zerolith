//! The new project's `package.json`: its name, its scripts, and the
//! versions of zerolith and the tools it depends on.

use super::{Choice, Tool};

/// The tool versions the scaffold pins, mirrored from the repository package.json
/// so the published crate carries them; a test keeps the two in step.
pub(super) const TOOL_VERSIONS: &str = include_str!("../../versions.json");

pub(super) fn version_of(name: &str) -> String {
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
pub(super) fn display_name(name: &str) -> String {
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
pub(super) fn package_name(name: &str) -> String {
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
pub(super) fn manifest(
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

/// The development dependencies every project has: the command line, the test helpers, and the tools the checks run. `vite` is pinned in every project, since Vitest and `@zerolith/vite` need it as a peer, and Yarn installs no peers.
pub(super) fn tools() -> Vec<String> {
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
        "vite",
        "vitest",
    ] {
        dev.push(dependency(tool, &version_of(tool)));
    }
    dev
}

pub(super) fn package_json(name: &str, choice: Choice) -> String {
    let framework = framework_version();
    let mut dependencies = vec![
        dependency("zerolith", framework),
        dependency("@zerolith/router", framework),
    ];
    if choice.devtools {
        dependencies.push(dependency("@zerolith/devtools", framework));
    }
    let mut dev = tools();
    dev.push(dependency("@zerolith/vite", framework));
    let (develop, build, preview) = match choice.tool {
        Tool::CommandLine => ("zerolith dev", "zerolith build", "zerolith preview"),
        Tool::Unbundled => (
            "zerolith dev",
            "zerolith build --unbundled",
            "zerolith preview",
        ),
        Tool::Vite => ("vite", "vite build", "vite preview"),
    };
    manifest(
        name,
        &[("dev", develop), ("build", build), ("preview", preview)],
        dependencies,
        dev,
    )
}

/// The fullstack example's package.json: `dev` and `build` on the command line, `api` running the backend in watch mode, and `start` running it over the build.
pub(super) fn fullstack_package_json(name: &str) -> String {
    let framework = framework_version();
    let mut dev = tools();
    dev.push(dependency("@types/node", &version_of("@types/node")));
    dev.push(dependency("@zerolith/vite", framework));
    manifest(
        name,
        &[
            ("dev", "zerolith dev"),
            ("api", "node --watch server/main.ts"),
            ("build", "zerolith build"),
            ("start", "node server/main.ts --production"),
        ],
        vec![
            dependency("zerolith", framework),
            dependency("@zerolith/router", framework),
            dependency("@zerolith/forms", framework),
            dependency("@zerolith/client", framework),
            dependency("@zerolith/i18n", framework),
            dependency("@zerolith/a11y", framework),
            dependency("@zerolith/devtools", framework),
        ],
        dev,
    )
}
