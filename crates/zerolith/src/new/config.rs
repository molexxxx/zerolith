//! The starter's configuration files: TypeScript, Vite, Vitest, the
//! linter, the environment's types, `zerolith.json`, the browser test, and
//! `.gitignore`.

use super::{Choice, Start, Tool};

pub(super) const VITE_ENV_TYPES: &str = r#"// The values import.meta.env carries under Vite, such as the base path the
// router follows, and the stylesheets imported with ?scoped.
/// <reference types="vite/client" />
/// <reference types="zerolith/imports" />
"#;

/// The settings zerolith dev, build, and preview share; an editor completes them from the schema.
pub const PROJECT_CONFIG: &str = r#"{
    "$schema": "./node_modules/@zerolith/cli/zerolith.schema.json",
    "proxy": {}
}
"#;

pub(super) const ENV_TYPES: &str = r#"// The values import.meta.env carries under zerolith dev and zerolith
// build: the mode, the base path, and every PUBLIC_ variable from the .env
// files and the environment. The references type the stylesheets imported
// with ?scoped and the images, fonts, and other files imported for their
// URL or, with ?raw, their text.
/// <reference types="zerolith/imports" />
/// <reference types="@zerolith/cli/assets" />
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

pub(super) const PACKAGES_DATA: &str = r#"[
    { "name": "zerolith", "description": "Signals, html and css templates, rendering, hydration, and coded diagnostics." },
    { "name": "@zerolith/router", "description": "A typed route table, plain links, route data, and head tags." },
    { "name": "@zerolith/forms", "description": "Native forms enhanced with fetch, validation, and field errors." },
    { "name": "@zerolith/client", "description": "A typed client generated from an OpenAPI contract." },
    { "name": "@zerolith/i18n", "description": "Locales, formatters, and message catalogs compiled to typed modules." },
    { "name": "@zerolith/a11y", "description": "A focus trap, roving tabindex, a live announcer, and preference signals." },
    { "name": "@zerolith/state", "description": "A signal kept in storage and across tabs, undo and redo, debounced and throttled signals, and a row selector." },
    { "name": "@zerolith/browser", "description": "The page as signals: online, visible, the window's size, an element's size, and whether it is in view." },
    { "name": "@zerolith/test", "description": "Mount, settle, and check hydration and accessibility in tests." },
    { "name": "@zerolith/devtools", "description": "The in-page inspector that Alt+Shift+Z opens." },
    { "name": "@zerolith/otel", "description": "OpenTelemetry spans for navigation, hydration, and requests." },
    { "name": "@zerolith/cli", "description": "The command line: dev, build, preview, and project checks." },
    { "name": "@zerolith/vite", "description": "The plugin for projects that develop on Vite." }
]
"#;

pub(super) const TEST: &str = r#"import { afterEach, expect, it } from "vitest";
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

pub(super) const VITEST_CONFIG: &str = r#"import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { zerolith } from "@zerolith/vite";

// Vitest reads the components itself, so it takes the zerolith plugin for
// JSX and stylesheets imported with ?scoped, without hot replacement.
export default defineConfig({
    plugins: zerolith({ hot: false }),
    test: {
        browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }]
        }
    }
});
"#;

pub(super) const VITE_CONFIG: &str = "import { defineConfig } from \"vite\";\nimport { zerolith } from \"@zerolith/vite\";\n\nexport default defineConfig({\n    plugins: [zerolith()]\n});\n";

pub(super) const OXLINTRC: &str = "{\n    \"plugins\": [\"typescript\", \"unicorn\", \"import\"],\n    \"categories\": { \"correctness\": \"error\", \"suspicious\": \"error\" },\n    \"rules\": { \"eqeqeq\": \"error\", \"no-var\": \"error\", \"prefer-const\": \"error\" },\n    \"ignorePatterns\": [\"dist\", \"node_modules\"]\n}\n";

pub(super) fn tsconfig(choice: Choice) -> String {
    let files = match (choice.start, choice.tool) {
        (Start::Fullstack, _) => "\"server\", \"shared\", \"src\", \"test\", \"vitest.config.ts\"",
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

pub(super) const GITIGNORE: &str = "node_modules/\ndist/\n.vitest/\n.env.local\n.env.*.local\n";
