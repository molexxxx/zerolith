//! The fullstack example as `zerolith new --example fullstack` writes it,
//! from the files under `templates/examples/fullstack`.

use super::Choice;
use super::config::{GITIGNORE, OXLINTRC, tsconfig};
use super::docs::{FULLSTACK_AGENTS, FULLSTACK_README, skill_pointer};
use super::manifest::fullstack_package_json;

/// The files of `examples/fullstack`, its tests among them, copied into the crate so the published crate carries them. The example's README and its end-to-end test, which runs this repository's build of the command line, stay behind; the scaffold writes its own README. A test keeps the copy in step with the example, apart from `zerolith.json`, whose schema path points into `node_modules` in a project of its own and whose backend command is the project's own `npm run api`.
pub(super) const FULLSTACK_FILES: [(&str, &str); 29] = [
    (
        "index.html",
        include_str!("../../templates/examples/fullstack/index.html"),
    ),
    (
        "server/api.ts",
        include_str!("../../templates/examples/fullstack/server/api.ts"),
    ),
    (
        "server/app.ts",
        include_str!("../../templates/examples/fullstack/server/app.ts"),
    ),
    (
        "server/data.ts",
        include_str!("../../templates/examples/fullstack/server/data.ts"),
    ),
    (
        "server/events.ts",
        include_str!("../../templates/examples/fullstack/server/events.ts"),
    ),
    (
        "server/main.ts",
        include_str!("../../templates/examples/fullstack/server/main.ts"),
    ),
    (
        "server/node.ts",
        include_str!("../../templates/examples/fullstack/server/node.ts"),
    ),
    (
        "server/static.ts",
        include_str!("../../templates/examples/fullstack/server/static.ts"),
    ),
    (
        "shared/api.ts",
        include_str!("../../templates/examples/fullstack/shared/api.ts"),
    ),
    (
        "shared/model.ts",
        include_str!("../../templates/examples/fullstack/shared/model.ts"),
    ),
    (
        "shared/schema.ts",
        include_str!("../../templates/examples/fullstack/shared/schema.ts"),
    ),
    (
        "src/components/dashboard.ts",
        include_str!("../../templates/examples/fullstack/src/components/dashboard.ts"),
    ),
    (
        "src/components/not-found.ts",
        include_str!("../../templates/examples/fullstack/src/components/not-found.ts"),
    ),
    (
        "src/components/project.css",
        include_str!("../../templates/examples/fullstack/src/components/project.css"),
    ),
    (
        "src/components/project.ts",
        include_str!("../../templates/examples/fullstack/src/components/project.ts"),
    ),
    (
        "src/components/projects.ts",
        include_str!("../../templates/examples/fullstack/src/components/projects.ts"),
    ),
    (
        "src/components/shell.ts",
        include_str!("../../templates/examples/fullstack/src/components/shell.ts"),
    ),
    (
        "src/components/sign-in.ts",
        include_str!("../../templates/examples/fullstack/src/components/sign-in.ts"),
    ),
    (
        "src/components/ui.ts",
        include_str!("../../templates/examples/fullstack/src/components/ui.ts"),
    ),
    (
        "src/env.d.ts",
        include_str!("../../templates/examples/fullstack/src/env.d.ts"),
    ),
    (
        "src/locale.ts",
        include_str!("../../templates/examples/fullstack/src/locale.ts"),
    ),
    (
        "src/main.ts",
        include_str!("../../templates/examples/fullstack/src/main.ts"),
    ),
    (
        "src/router.ts",
        include_str!("../../templates/examples/fullstack/src/router.ts"),
    ),
    (
        "src/routes.ts",
        include_str!("../../templates/examples/fullstack/src/routes.ts"),
    ),
    (
        "src/store.ts",
        include_str!("../../templates/examples/fullstack/src/store.ts"),
    ),
    (
        "src/styles.css",
        include_str!("../../templates/examples/fullstack/src/styles.css"),
    ),
    (
        "test/app.browser.test.ts",
        include_str!("../../templates/examples/fullstack/test/app.browser.test.ts"),
    ),
    (
        "test/server.test.ts",
        include_str!("../../templates/examples/fullstack/test/server.test.ts"),
    ),
    (
        "zerolith.json",
        include_str!("../../templates/examples/fullstack/zerolith.json"),
    ),
];

const FULLSTACK_VITEST_CONFIG: &str = r#"import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { zerolith } from "@zerolith/vite";

// The backend's tests run in Node, and the pages' in headless Chromium,
// with the zerolith plugin for the stylesheets the pages import with
// ?scoped.
export default defineConfig({
    test: {
        projects: [
            {
                test: { name: "server", include: ["test/**/*.test.ts"], exclude: ["test/**/*.browser.test.ts"] }
            },
            {
                plugins: zerolith({ hot: false }),
                test: {
                    name: "browser",
                    include: ["test/**/*.browser.test.ts"],
                    browser: {
                        enabled: true,
                        headless: true,
                        provider: playwright(),
                        instances: [{ browser: "chromium" }]
                    }
                }
            }
        ]
    }
});
"#;

/// The fullstack example's application files as the example has them, with the manifest, configuration, tests, README, and AGENTS.md of a project of its own.
pub(super) fn fullstack_files(name: &str, shown: &str, choice: Choice) -> Vec<(String, String)> {
    let mut files = vec![
        ("package.json".to_string(), fullstack_package_json(name)),
        (
            "README.md".to_string(),
            FULLSTACK_README.replace("__NAME__", shown),
        ),
        (
            "AGENTS.md".to_string(),
            FULLSTACK_AGENTS
                .replace("__NAME__", shown)
                .replace("__SKILL__", &skill_pointer(choice)),
        ),
        ("tsconfig.json".to_string(), tsconfig(Choice::FULLSTACK)),
        (".oxlintrc.json".to_string(), OXLINTRC.to_string()),
        (
            "vitest.config.ts".to_string(),
            FULLSTACK_VITEST_CONFIG.to_string(),
        ),
        (".gitignore".to_string(), GITIGNORE.to_string()),
    ];
    files.extend(
        FULLSTACK_FILES
            .iter()
            .map(|(relative, content)| (relative.to_string(), content.to_string())),
    );
    files
}
