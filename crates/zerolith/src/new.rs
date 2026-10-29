//! `zerolith new`: writes the application layout the structure guide
//! describes, with a working first page, the scripts, and an AGENTS.md,
//! for the Vite path in TypeScript or JavaScript or for the buildless path.

use std::fs;
use std::path::Path;

/// Which layout to write.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Flavor {
    ViteTypeScript,
    ViteJavaScript,
    Buildless,
}

/// The repository's package.json, embedded so the scaffold pins the tool versions CI tests with.
const ROOT_MANIFEST: &str = include_str!("../../../package.json");

fn version_of(name: &str) -> String {
    let manifest: serde_json::Value = serde_json::from_str(ROOT_MANIFEST).unwrap_or_default();
    manifest["devDependencies"][name]
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| "latest".to_string())
}

fn framework_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

fn package_json(name: &str, flavor: Flavor) -> String {
    let framework = framework_version();
    let mut dependencies = vec![
        format!("        \"zerolith\": \"{framework}\""),
        format!("        \"@zerolith/router\": \"{framework}\""),
        format!("        \"@zerolith/devtools\": \"{framework}\""),
        format!("        \"@zerolith/test\": \"{framework}\""),
    ];
    let mut dev = vec![
        format!(
            "        \"@vitest/browser-playwright\": \"{}\"",
            version_of("@vitest/browser-playwright")
        ),
        format!("        \"oxlint\": \"{}\"", version_of("oxlint")),
        format!("        \"playwright\": \"{}\"", version_of("playwright")),
        format!("        \"typescript\": \"{}\"", version_of("typescript")),
        format!("        \"vitest\": \"{}\"", version_of("vitest")),
    ];
    let scripts = match flavor {
        Flavor::Buildless => {
            dev.push(format!(
                "        \"@types/node\": \"{}\"",
                version_of("@types/node")
            ));
            vec![
                "        \"dev\": \"zerolith dev .\"",
                "        \"vendor\": \"zerolith importmap --html index.html --development\"",
                "        \"build\": \"zerolith build . --out dist\"",
                "        \"check\": \"npm run typecheck && npm run lint && npm test\"",
                "        \"typecheck\": \"tsc -p tsconfig.json\"",
                "        \"lint\": \"oxlint\"",
                "        \"test\": \"vitest run\"",
            ]
        }
        _ => {
            dependencies.push(format!("        \"@zerolith/vite\": \"{framework}\""));
            dev.push(format!("        \"vite\": \"{}\"", version_of("vite")));
            vec![
                "        \"dev\": \"vite\"",
                "        \"build\": \"vite build\"",
                "        \"preview\": \"vite preview\"",
                "        \"check\": \"npm run typecheck && npm run lint && npm test && npm run build\"",
                "        \"typecheck\": \"tsc -p tsconfig.json\"",
                "        \"lint\": \"oxlint\"",
                "        \"test\": \"vitest run\"",
            ]
        }
    };
    dependencies.sort();
    dev.sort();
    format!(
        "{{\n    \"name\": \"{name}\",\n    \"version\": \"0.0.0\",\n    \"private\": true,\n    \"type\": \"module\",\n    \"scripts\": {{\n{}\n    }},\n    \"dependencies\": {{\n{}\n    }},\n    \"devDependencies\": {{\n{}\n    }}\n}}\n",
        scripts.join(",\n"),
        dependencies.join(",\n"),
        dev.join(",\n")
    )
}

fn index_html(name: &str, flavor: Flavor) -> String {
    let script = match flavor {
        Flavor::ViteTypeScript => "<script type=\"module\" src=\"/src/main.ts\"></script>",
        Flavor::ViteJavaScript => "<script type=\"module\" src=\"/src/main.js\"></script>",
        Flavor::Buildless => {
            "<script type=\"importmap\">{\"imports\":{}}</script>\n    <script type=\"module\" src=\"/src/main.js\"></script>"
        }
    };
    format!(
        "<!doctype html>\n<html lang=\"en\">\n<head>\n    <meta charset=\"utf-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n    <title>{name}</title>\n    <link rel=\"stylesheet\" href=\"/src/styles.css\">\n</head>\n<body>\n    <div id=\"app\"></div>\n    {script}\n</body>\n</html>\n"
    )
}

const STYLES: &str = ":root {\n    --bg: #101214;\n    --panel: #181b1f;\n    --line: #2a2f36;\n    --text: #e6e8eb;\n    --muted: #9aa3ad;\n    --accent: #7cc4ff;\n    color-scheme: dark;\n}\n* { box-sizing: border-box; }\nbody { margin: 0; font: 16px/1.5 system-ui, sans-serif; background: var(--bg); color: var(--text); }\na { color: var(--accent); }\nbutton { font: inherit; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--line); background: var(--panel); color: var(--text); cursor: pointer; }\n";

fn main_source(ext: &str, typescript: bool) -> String {
    let host = if typescript {
        "document.getElementById(\"app\") as HTMLElement"
    } else {
        "/** @type {HTMLElement} */ (document.getElementById(\"app\"))"
    };
    format!(
        "// Mounts the application: wait for the router, render the layout around its outlet, open the inspector in development.\nimport {{ render }} from \"zerolith\";\nimport {{ mountDevtools }} from \"@zerolith/devtools\";\nimport {{ Layout }} from \"./components/layout.{ext}\";\nimport {{ router }} from \"./router.{ext}\";\n\nawait router.ready;\nrender(Layout({{ content: router.outlet() }}), {host});\nmountDevtools();\n"
    )
}

fn routes_source(ext: &str) -> String {
    format!(
        "// The route table, one entry per page. Parameters are inferred from each path.\nimport {{ defineRoutes, route }} from \"@zerolith/router\";\nimport {{ Counter }} from \"./components/counter.{ext}\";\nimport {{ Home }} from \"./components/home.{ext}\";\n\nexport const routes = defineRoutes({{\n    home: route({{ path: \"/\", view: () => Home(), head: {{ title: \"Home\" }} }}),\n    counter: route({{ path: \"/counter/:start\", view: ({{ params }}) => Counter({{ start: Number(params.start) }}), head: {{ title: \"Counter\" }} }})\n}});\n"
    )
}

fn router_source(ext: &str, typescript: bool) -> String {
    let annotation = if typescript {
        ""
    } else {
        "/** @type {import(\"@zerolith/router\").Router<typeof routes>} */\n"
    };
    format!(
        "// The router, in its own module so components import it for typed hrefs while the route table imports the components.\nimport {{ createRouter }} from \"@zerolith/router\";\nimport {{ html }} from \"zerolith\";\nimport {{ routes }} from \"./routes.{ext}\";\n\n{annotation}export const router = createRouter(routes, {{ fallback: (url) => html`<p>Nothing at ${{url.pathname}}. <a href=\"/\">Home</a></p>` }});\n"
    )
}

fn layout_source(name: &str, ext: &str, typescript: bool) -> String {
    let (signature, doc) = if typescript {
        (
            "export function Layout({ content }: { content: unknown }): View",
            "",
        )
    } else {
        (
            "export function Layout({ content })",
            "/**\n * @param {{ content: unknown }} props\n * @returns {View}\n */\n",
        )
    };
    let import_view = if typescript {
        "import { type View, css, html } from \"zerolith\";"
    } else {
        "import { css, html } from \"zerolith\";\n\n/** @typedef {import(\"zerolith\").View} View */"
    };
    format!(
        "// The page frame around every route.\n{import_view}\nimport {{ router }} from \"../router.{ext}\";\n\nconst layout = css`\n    :scope {{ max-width: 40rem; margin: 0 auto; padding: 24px 16px; display: grid; gap: 24px; }}\n    header {{ display: flex; align-items: baseline; justify-content: space-between; }}\n    header h1 {{ margin: 0; font-size: 1.4rem; }}\n    header a {{ text-decoration: none; }}\n`;\n\n{doc}{signature}\n{{\n    return html`\n        <main class=${{layout}}>\n            <header>\n                <h1><a href=${{router.href(\"home\")}}>{name}</a></h1>\n                <a href=${{router.href(\"counter\", {{ start: \"5\" }})}}>Counter</a>\n            </header>\n            ${{content}}\n        </main>`;\n}}\n"
    )
}

fn home_source(typescript: bool) -> String {
    let (signature, doc, import_view) = if typescript {
        (
            "export function Home(): View",
            "",
            "import { type View, html } from \"zerolith\";",
        )
    } else {
        (
            "export function Home()",
            "/** @returns {View} */\n",
            "import { html } from \"zerolith\";\n\n/** @typedef {import(\"zerolith\").View} View */",
        )
    };
    format!(
        "// The first page.\n{import_view}\n\n{doc}{signature}\n{{\n    return html`<p>A zerolith application. Edit <code>src/components/home</code> and the page updates in place.</p>`;\n}}\n"
    )
}

fn counter_source(typescript: bool) -> String {
    let (signature, doc, import_view) = if typescript {
        (
            "export function Counter({ start }: { start: number }): View",
            "",
            "import { type View, html, signal } from \"zerolith\";",
        )
    } else {
        (
            "export function Counter({ start })",
            "/**\n * @param {{ start: number }} props\n * @returns {View}\n */\n",
            "import { html, signal } from \"zerolith\";\n\n/** @typedef {import(\"zerolith\").View} View */",
        )
    };
    format!(
        "// A component with state: the signal is bound, never its value, and it is named so an edit keeps the count.\n{import_view}\n\n{doc}{signature}\n{{\n    const count = signal(start, {{ name: \"count\" }});\n    return html`<button @click=${{() => count.set(count.get() + 1)}}>Clicked ${{count}} times</button>`;\n}}\n"
    )
}

fn test_source(ext: &str) -> String {
    format!(
        "import {{ afterEach, expect, it }} from \"vitest\";\nimport {{ cleanup, mount, settle }} from \"@zerolith/test\";\nimport {{ Counter }} from \"../src/components/counter.{ext}\";\n\nafterEach(cleanup);\n\nit(\"counts clicks\", async () =>\n{{\n    const {{ container }} = mount(Counter({{ start: 1 }}));\n    container.querySelector(\"button\")?.click();\n    await settle();\n    expect(container.textContent).toBe(\"Clicked 2 times\");\n}});\n"
    )
}

const VITEST_CONFIG: &str = "import { playwright } from \"@vitest/browser-playwright\";\nimport { defineConfig } from \"vitest/config\";\n\nexport default defineConfig({\n    test: {\n        browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: \"chromium\" }] }\n    }\n});\n";

const VITE_CONFIG: &str = "import { defineConfig } from \"vite\";\nimport { zerolith } from \"@zerolith/vite\";\n\nexport default defineConfig({\n    plugins: [zerolith()]\n});\n";

fn tsconfig(flavor: Flavor) -> String {
    let typescript = flavor != Flavor::ViteJavaScript;
    let files = if flavor == Flavor::ViteTypeScript {
        "\"src\", \"test\", \"vite.config.ts\", \"vitest.config.ts\""
    } else {
        "\"src\", \"test\", \"vitest.config.ts\""
    };
    let js = if typescript {
        ""
    } else {
        "        \"allowJs\": true,\n        \"checkJs\": true,\n"
    };
    format!(
        "{{\n    \"compilerOptions\": {{\n        \"target\": \"es2024\",\n        \"lib\": [\"es2024\", \"dom\", \"dom.iterable\"],\n        \"module\": \"nodenext\",\n        \"moduleResolution\": \"nodenext\",\n        \"strict\": true,\n        \"noUncheckedIndexedAccess\": true,\n        \"erasableSyntaxOnly\": true,\n        \"verbatimModuleSyntax\": true,\n        \"allowImportingTsExtensions\": true,\n        \"noEmit\": true,\n{js}        \"skipLibCheck\": true\n    }},\n    \"include\": [{files}]\n}}\n"
    )
}

const OXLINTRC: &str = "{\n    \"plugins\": [\"typescript\", \"unicorn\", \"import\"],\n    \"categories\": { \"correctness\": \"error\", \"suspicious\": \"error\" },\n    \"rules\": { \"eqeqeq\": \"error\", \"no-var\": \"error\", \"prefer-const\": \"error\" },\n    \"ignorePatterns\": [\"dist\", \"node_modules\", \"vendor\"]\n}\n";

fn agents_md(name: &str, flavor: Flavor) -> String {
    let dev = match flavor {
        Flavor::Buildless => {
            "`npm run dev` serves the folder with live reload; `npm run vendor` copies the packages into `vendor/` and writes the import map after `npm install`."
        }
        _ => "`npm run dev` starts Vite with hot replacement; `npm run build` writes `dist/`.",
    };
    let ext = if flavor == Flavor::ViteTypeScript {
        "ts"
    } else {
        "js"
    };
    format!(
        "# {name}: guide for coding agents\n\nA zerolith application. The framework's structure guide describes the layout; this file holds what is specific to this project.\n\n## Commands\n\n- {dev}\n- `npm run check` is the gate: typecheck, lint, tests.\n- `npx zerolith-client openapi.json --out src/api.{ext}` and `npx zerolith-i18n messages --out src/messages` regenerate the generated files once the project has a contract or catalogs.\n\n## Rules\n\n- Bind the signal, not its value: `${{count}}` updates, `${{count.get()}}` freezes. Call `.get()` only inside `computed`, `effect`, `resource.params`, and event handlers.\n- Components are capitalized functions returning `html` templates, one per file under `src/components/`, with their `css` literal next to the markup.\n- State that must survive an edit is a named signal: `signal(0, {{ name: \"count\" }})`.\n- `src/api.{ext}` and `src/messages/` are generated when they exist; change their inputs and regenerate, never edit them.\n- A new page is a route in `src/routes.{ext}` and a component; shared state goes in `src/store.{ext}`.\n- Relative imports carry the file extension so the same source runs unbundled.\n\n## Where things go\n\n| Change | Location |\n| --- | --- |\n| A page | `src/routes.{ext}` and `src/components/<page>.{ext}` |\n| Shared state or a request | `src/store.{ext}` |\n| A message | `messages/<locale>.json`, then regenerate |\n| A style token | `src/styles.css`; component styles stay in the component |\n"
    )
}

fn readme(name: &str, flavor: Flavor) -> String {
    let run = match flavor {
        Flavor::Buildless => "npm install\nnpm run vendor\nnpm run dev",
        _ => "npm install\nnpm run dev",
    };
    format!(
        "# {name}\n\nA zerolith application.\n\n```\n{run}\n```\n\n`AGENTS.md` is the map of the project for contributors and coding agents.\n"
    )
}

fn write(root: &Path, relative: &str, content: &str) -> std::io::Result<()> {
    let path = root.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, content)
}

/// Writes the layout for `name` into `root`, which must not exist yet or must be empty.
pub fn scaffold(root: &Path, name: &str, flavor: Flavor) -> std::io::Result<Vec<String>> {
    if root.exists() && fs::read_dir(root)?.next().is_some() {
        return Err(std::io::Error::other(format!(
            "{} exists and is not empty",
            root.display()
        )));
    }
    let typescript = flavor != Flavor::ViteJavaScript;
    let ext = if typescript { "ts" } else { "js" };
    let mut files = vec![
        ("package.json".to_string(), package_json(name, flavor)),
        ("index.html".to_string(), index_html(name, flavor)),
        ("AGENTS.md".to_string(), agents_md(name, flavor)),
        ("README.md".to_string(), readme(name, flavor)),
        ("tsconfig.json".to_string(), tsconfig(flavor)),
        (".oxlintrc.json".to_string(), OXLINTRC.to_string()),
        ("vitest.config.ts".to_string(), VITEST_CONFIG.to_string()),
        (
            ".gitignore".to_string(),
            "node_modules/\ndist/\nvendor/\n".to_string(),
        ),
        ("src/styles.css".to_string(), STYLES.to_string()),
        (format!("src/main.{ext}"), main_source(ext, typescript)),
        (format!("src/routes.{ext}"), routes_source(ext)),
        (format!("src/router.{ext}"), router_source(ext, typescript)),
        (
            format!("src/components/layout.{ext}"),
            layout_source(name, ext, typescript),
        ),
        (
            format!("src/components/home.{ext}"),
            home_source(typescript),
        ),
        (
            format!("src/components/counter.{ext}"),
            counter_source(typescript),
        ),
        (format!("test/counter.browser.test.{ext}"), test_source(ext)),
    ];
    if flavor != Flavor::Buildless {
        files.push(("vite.config.ts".to_string(), VITE_CONFIG.to_string()));
    }
    for (relative, content) in &files {
        write(root, relative, content)?;
    }
    Ok(files.into_iter().map(|(relative, _)| relative).collect())
}

/// Runs the `new` command.
pub fn run(root: &Path, flavor: Flavor) -> std::io::Result<()> {
    let name = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("app")
        .to_string();
    let files = scaffold(root, &name, flavor)?;
    println!(
        "zerolith: wrote {} files to {}",
        files.len(),
        root.display()
    );
    match flavor {
        Flavor::Buildless => {
            println!("next: cd {name} && npm install && npm run vendor && npm run dev")
        }
        _ => println!("next: cd {name} && npm install && npm run dev"),
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{Flavor, scaffold};
    use std::fs;

    #[test]
    fn writes_each_flavor_with_the_name_and_pinned_versions() {
        let base = std::env::temp_dir().join(format!("zerolith-new-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        for (flavor, folder, entry) in [
            (Flavor::ViteTypeScript, "ts-app", "src/main.ts"),
            (Flavor::ViteJavaScript, "js-app", "src/main.js"),
            (Flavor::Buildless, "plain-app", "src/main.ts"),
        ] {
            let root = base.join(folder);
            let files = scaffold(&root, folder, flavor).unwrap();
            assert!(
                files.iter().any(|file| file == entry),
                "{folder} lacks {entry}"
            );
            let manifest = fs::read_to_string(root.join("package.json")).unwrap();
            assert!(manifest.contains(&format!("\"name\": \"{folder}\"")));
            assert!(manifest.contains("\"vitest\": \""));
            assert!(!manifest.contains("latest"));
            let agents = fs::read_to_string(root.join("AGENTS.md")).unwrap();
            assert!(agents.contains(&format!("# {folder}: guide for coding agents")));
            let html = fs::read_to_string(root.join("index.html")).unwrap();
            assert_eq!(html.contains("importmap"), flavor == Flavor::Buildless);
            assert_eq!(
                root.join("vite.config.ts").exists(),
                flavor != Flavor::Buildless
            );
        }
        assert!(scaffold(&base.join("ts-app"), "ts-app", Flavor::ViteTypeScript).is_err());
        let _ = fs::remove_dir_all(&base);
    }
}
