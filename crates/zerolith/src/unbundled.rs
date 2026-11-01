//! `zerolith build --unbundled`: the buildless path's production output. Every source
//! under the project is copied into an output folder, with `.ts`, `.tsx`,
//! `.jsx`, and `.mts` files transformed to JavaScript and renamed, the
//! relative specifiers that named them rewritten to `.js`, HTML module
//! scripts pointed at the renamed files, and the installed packages vendored
//! into the output with an import map carrying integrity hashes. An import
//! of a file that is not a module, such as a stylesheet, is pointed at a
//! small module written next to the file that gives what `zerolith dev`
//! gives. The result serves from any static host.

use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::importmap::{html_tags, update_html, vendor_from};
use crate::transform;
use crate::{css, env, modules, prepare, term};

/// Folders never copied into the output.
const SKIPPED: [&str; 7] = [
    "node_modules",
    "vendor",
    "dist",
    "target",
    ".git",
    "test",
    "tests",
];

/// Files that belong to development, not to the served output.
const DEVELOPMENT_FILES: [&str; 5] = [
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "AGENTS.md",
    "README.md",
];

fn is_development_file(name: &str) -> bool {
    name.starts_with('.')
        || DEVELOPMENT_FILES.contains(&name)
        || [".config.ts", ".config.js", ".config.mts", ".config.mjs"]
            .iter()
            .any(|suffix| name.ends_with(suffix))
}

/// What `build` wrote.
#[derive(Debug, Default)]
pub struct Built {
    pub copied: usize,
    pub transformed: usize,
    pub html: usize,
}

fn rewrite_html(html: &str) -> String {
    let mut out = html.to_string();
    for extension in [".ts", ".tsx", ".jsx", ".mts"] {
        for quote in ['"', '\''] {
            let needle = format!("{extension}{quote}");
            let mut result = String::with_capacity(out.len());
            let mut rest = out.as_str();
            while let Some(index) = rest.find(&needle) {
                let before = &rest[..index];
                let attribute = before.rfind("src=").map(|at| &before[at + 4..]);
                let is_source = attribute
                    .is_some_and(|value| value.starts_with(quote) && !value[1..].contains(quote));
                result.push_str(before);
                result.push_str(if is_source { ".js" } else { extension });
                result.push(quote);
                rest = &rest[index + needle.len()..];
            }
            result.push_str(rest);
            out = result;
        }
    }
    out
}

/// Runs the template prepare pass over a module unless the build keeps the scanner.
fn prepared(code: String, prepare_templates: bool) -> Result<String, transform::TransformError> {
    if prepare_templates {
        prepare::prepare(&code)
    } else {
        Ok(code)
    }
}

/// What an import of a file that is not a module asks for, which a module written next to the file gives.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Form {
    /// A stylesheet, linked from the page, as `import "./card.css"` asks.
    Stylesheet,
    /// A stylesheet's rules scoped to a component, with `?scoped`.
    Scoped,
    /// A JSON file's value.
    Json,
    /// A file's URL: an image, font, or other asset, or any file with `?url`.
    Url,
    /// A file's text, with `?raw`.
    Raw,
}

impl Form {
    /// What a local specifier of a file that is not a module asks for, with the path it names and the specifier of the module that serves it.
    fn of(specifier: &str) -> Option<(Form, &str, String)> {
        let local = specifier.starts_with("./")
            || specifier.starts_with("../")
            || (specifier.starts_with('/') && !specifier.starts_with("//"));
        if !local {
            return None;
        }
        let (path, query) = specifier.split_once('?').unwrap_or((specifier, ""));
        let extension = Path::new(path).extension()?.to_str()?;
        let form = match (query, extension) {
            ("scoped", _) => Form::Scoped,
            ("raw", _) => Form::Raw,
            ("url", _) => Form::Url,
            ("", "css") => Form::Stylesheet,
            ("", "json") => Form::Json,
            ("", extension) if modules::is_asset(extension) => Form::Url,
            _ => return None,
        };
        Some((form, path, format!("{path}{}", form.suffix())))
    }

    /// The ending of the module's name after the file's own: `card.css` imported with `?scoped` is served by `card.css.scoped.js`.
    fn suffix(self) -> &'static str {
        match self {
            Form::Stylesheet | Form::Json => ".js",
            Form::Scoped => ".scoped.js",
            Form::Url => ".url.js",
            Form::Raw => ".raw.js",
        }
    }
}

/// The files that modules import but that are not modules, by their path and form, each with the import that first asked for it, for messages.
type Imports = BTreeMap<(PathBuf, Form), String>;

/// The module that links a stylesheet a module imports, once, and waits for it so the page renders styled.
const STYLESHEET_MODULE: &str = "const href = new URL(__FILE__, import.meta.url).href;\nif (!Array.from(document.querySelectorAll(\"link[rel=stylesheet]\"), (link) => link.href).includes(href))\n{\n    const link = document.createElement(\"link\");\n    link.rel = \"stylesheet\";\n    link.href = href;\n    await new Promise((resolve) =>\n    {\n        link.onload = resolve;\n        link.onerror = resolve;\n        document.head.append(link);\n    });\n}\n";

fn quoted(text: &str) -> String {
    serde_json::Value::from(text).to_string()
}

/// Writes the module that serves an imported file in its form, next to the file's copy.
fn write_import(
    root: &Path,
    out: &Path,
    file: &Path,
    form: Form,
    importer: &str,
) -> io::Result<()> {
    if !file.is_file() {
        return Err(io::Error::other(format!("{importer} names no file")));
    }
    let relative = file
        .strip_prefix(root)
        .map_err(|_| io::Error::other(format!("{importer} names a file outside the project")))?;
    let relative = relative.strip_prefix("public").unwrap_or(relative);
    let name = format!(
        "./{}",
        file.file_name().unwrap_or_default().to_string_lossy()
    );
    let code = match form {
        Form::Stylesheet => STYLESHEET_MODULE.replace("__FILE__", &quoted(&name)),
        Form::Scoped => {
            if file.extension().is_none_or(|extension| extension != "css") {
                return Err(io::Error::other(format!(
                    "{importer}: ?scoped applies to a stylesheet, a .css file"
                )));
            }
            let scoped = css::mirrored_scoped(file, root)
                .map_err(|error| io::Error::other(format!("{importer}: {error}")))?;
            format!(
                "import {{ styleFile }} from \"zerolith/internal\";\nexport default styleFile({}, {});\n",
                quoted(&css::project_path(root, file)),
                scoped.expression()
            )
        }
        Form::Json => {
            let text = fs::read_to_string(file)?;
            let value: serde_json::Value = serde_json::from_str(&text).map_err(|error| {
                io::Error::other(format!(
                    "{importer} names a file that is not valid JSON: {error}"
                ))
            })?;
            format!("export default {value};\n")
        }
        Form::Url => format!(
            "export default new URL({}, import.meta.url).href;\n",
            quoted(&name)
        ),
        Form::Raw => format!("export default {};\n", quoted(&fs::read_to_string(file)?)),
    };
    let mut target = out.join(relative).into_os_string();
    target.push(form.suffix());
    let target = PathBuf::from(target);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(target, code)
}

/// What every module's `import.meta.env` and `process.env.NODE_ENV` become in the output.
struct Defines {
    env: String,
    node_env: String,
}

/// Rewrites a module's specifiers for the output: a transformed source to its `.js` name, and a file that is not a module to the module that serves it, recorded in `imports`.
fn rewrite(
    code: &str,
    root: &Path,
    file: &Path,
    imports: &mut Imports,
) -> Result<String, transform::TransformError> {
    let folder = file.parent().unwrap_or(root);
    let shown = css::shown(root, file);
    transform::rewrite_specifiers(code, &mut |specifier| {
        if let Some(name) = transform::renamed_module(specifier) {
            return Some(name);
        }
        let (form, path, name) = Form::of(specifier)?;
        let target = match path.strip_prefix('/') {
            Some(absolute) => root.join(absolute),
            None => folder.join(path),
        };
        imports
            .entry((css::plain(&target), form))
            .or_insert_with(|| format!("{shown}: the import of {specifier}"));
        Some(name)
    })
}

fn walk(
    root: &Path,
    folder: &Path,
    out: &Path,
    built: &mut Built,
    prepare_templates: bool,
    defines: &Defines,
    imports: &mut Imports,
) -> io::Result<()> {
    for entry in fs::read_dir(folder)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if path.is_dir() {
            if SKIPPED.contains(&name.as_str()) || name.starts_with('.') || path == out {
                continue;
            }
            walk(root, &path, out, built, prepare_templates, defines, imports)?;
            continue;
        }
        if is_development_file(&name) {
            continue;
        }
        let relative = path.strip_prefix(root).map_err(io::Error::other)?;
        let extension = path
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or("");
        if let Ok(public) = relative.strip_prefix("public") {
            let target = out.join(public);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(&path, &target)?;
            built.copied += 1;
            continue;
        }
        let target = out.join(relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        let replace =
            |code: String| modules::replace_defines(&code, &defines.env, &defines.node_env);
        if transform::transforms(extension) {
            let source = fs::read_to_string(&path)?;
            let code = transform::transform(&path, &source)
                .and_then(|code| rewrite(&code, root, &path, imports))
                .map(replace)
                .and_then(|code| prepared(code, prepare_templates))
                .map_err(|error| io::Error::other(format!("{}: {error}", relative.display())))?;
            fs::write(target.with_extension("js"), code)?;
            built.transformed += 1;
        } else if extension == "js" || extension == "mjs" {
            let source = fs::read_to_string(&path)?;
            let code = rewrite(&source, root, &path, imports)
                .map(replace)
                .and_then(|code| prepared(code, prepare_templates))
                .map_err(|error| io::Error::other(format!("{}: {error}", relative.display())))?;
            fs::write(&target, code)?;
            built.copied += 1;
        } else if extension == "html" || extension == "htm" {
            fs::write(&target, rewrite_html(&fs::read_to_string(&path)?))?;
            built.html += 1;
        } else {
            fs::copy(&path, &target)?;
            built.copied += 1;
        }
    }
    Ok(())
}

/// Builds `root` into `root/out`.
pub fn build(root: &Path, out: &Path, prepare_templates: bool) -> io::Result<(PathBuf, Built)> {
    let root = css::canonical(root)?;
    if prepare_templates {
        crate::build::check_core_version(&root)?;
    }
    let out_dir = root.join(out);
    if out_dir == root {
        return Err(io::Error::other(
            "the output folder must differ from the project folder",
        ));
    }
    if out_dir.exists() {
        fs::remove_dir_all(&out_dir)?;
    }
    fs::create_dir_all(&out_dir)?;
    let mut built = Built::default();
    let defines = Defines {
        env: format!(
            "({})",
            env::object("production", "/", &env::variables(&root, "production"))
        ),
        node_env: "\"production\"".to_string(),
    };
    let mut imports = Imports::new();
    walk(
        &root,
        &root,
        &out_dir,
        &mut built,
        prepare_templates,
        &defines,
        &mut imports,
    )?;
    for ((file, form), importer) in &imports {
        write_import(&root, &out_dir, file, *form, importer)?;
        built.transformed += 1;
    }
    let packages = root
        .ancestors()
        .map(|folder| folder.join("node_modules"))
        .find(|folder| folder.join("zerolith").is_dir())
        .unwrap_or_else(|| root.join("node_modules"));
    if packages.join("zerolith").is_dir() {
        let vendored = vendor_from(
            &packages,
            &out_dir,
            Path::new("vendor"),
            false,
            prepare_templates,
        )?;
        let tags = html_tags(&vendored);
        for entry in fs::read_dir(&out_dir)? {
            let path = entry?.path();
            if path
                .extension()
                .is_some_and(|extension| extension == "html")
            {
                let current = fs::read_to_string(&path)?;
                fs::write(&path, update_html(&current, &tags))?;
            }
        }
    }
    Ok((out_dir, built))
}

/// Runs the `build --unbundled` command and prints what it wrote.
pub fn run(root: &Path, out: &Path, prepare_templates: bool) -> io::Result<()> {
    let started = std::time::Instant::now();
    anstream::println!(
        "{}",
        term::heading("build", "unbundled, the modules behind an import map")
    );
    let (out_dir, built) = build(root, out, prepare_templates)?;
    anstream::println!(
        "{}",
        term::row(
            "Modules",
            term::label,
            format!("{} transformed", built.transformed)
        )
    );
    anstream::println!(
        "{}",
        term::row("Files", term::label, format!("{} copied", built.copied))
    );
    anstream::println!("{}", term::row("Pages", term::label, built.html));
    let project = crate::css::canonical(root)
        .ok()
        .and_then(|folder| {
            folder
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
        })
        .unwrap_or_else(|| root.display().to_string());
    anstream::println!(
        "\n  {} {} into {} in {} ms\n",
        term::success("built"),
        term::bold(project),
        crate::server::display(&out_dir),
        started.elapsed().as_millis()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{build, rewrite_html};
    use std::fs;
    use std::path::Path;

    #[test]
    fn rewrites_module_script_sources_only() {
        let html = "<script type=\"module\" src=\"/src/main.tsx\"></script><a href=\"notes.ts\">x</a><script src='./b.ts'></script>";
        assert_eq!(
            rewrite_html(html),
            "<script type=\"module\" src=\"/src/main.js\"></script><a href=\"notes.ts\">x</a><script src='./b.js'></script>"
        );
    }

    #[test]
    fn transforms_renames_rewrites_and_copies() {
        let root = std::env::temp_dir().join(format!("zerolith-build-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("src")).unwrap();
        fs::create_dir_all(root.join("node_modules/zerolith/dist")).unwrap();
        fs::write(root.join("node_modules/zerolith/package.json"), format!("{{\"name\":\"zerolith\",\"version\":\"{}\",\"exports\":{{\".\":{{\"development\":\"./dist/index.js\",\"default\":\"./dist/index.js\"}}}}}}", env!("CARGO_PKG_VERSION"))).unwrap();
        fs::write(
            root.join("node_modules/zerolith/dist/index.js"),
            "export const html = 1;",
        )
        .unwrap();
        fs::write(
            root.join("node_modules/zerolith/dist/scan.js"),
            "export const scanner = 1;",
        )
        .unwrap();
        fs::write(
            root.join("node_modules/zerolith/dist/scan.unprepared.js"),
            "export const stub = 1;",
        )
        .unwrap();
        fs::write(
            root.join("index.html"),
            "<!doctype html><script type=\"module\" src=\"/src/main.ts\"></script>",
        )
        .unwrap();
        fs::write(
            root.join("src/main.ts"),
            "import { html } from \"zerolith\";\nimport { App } from \"./app.tsx\";\nexport const n: number = 1;\nexport const v = html`<p>${n}</p>`;\n",
        )
        .unwrap();
        fs::write(
            root.join("src/app.tsx"),
            "export function App(): unknown { return <p>{1}</p>; }\n",
        )
        .unwrap();
        fs::write(root.join("src/plain.js"), "import \"./app.tsx\";\n").unwrap();
        fs::write(root.join("styles.css"), "body {}").unwrap();
        let (out, built) = build(&root, std::path::Path::new("dist"), true).unwrap();
        assert_eq!((built.transformed, built.copied, built.html), (2, 2, 1));
        assert!(
            fs::read_to_string(out.join("src/main.js"))
                .unwrap()
                .contains("from \"./app.js\"")
        );
        assert!(
            !fs::read_to_string(out.join("src/main.js"))
                .unwrap()
                .contains(": number")
        );
        assert!(
            fs::read_to_string(out.join("src/app.js"))
                .unwrap()
                .contains("__zl_html(__zl_t0, 1)")
        );
        assert!(
            fs::read_to_string(out.join("src/main.js"))
                .unwrap()
                .contains("html(__zl_t0, n)")
        );
        assert_eq!(
            fs::read_to_string(out.join("vendor/zerolith/dist/scan.js")).unwrap(),
            "export const stub = 1;"
        );
        assert!(
            fs::read_to_string(out.join("src/plain.js"))
                .unwrap()
                .contains("\"./app.js\"")
        );
        assert!(
            fs::read_to_string(out.join("index.html"))
                .unwrap()
                .contains("src=\"/src/main.js\"")
        );
        assert!(out.join("styles.css").is_file());
        assert!(out.join("vendor/importmap.json").is_file());
        assert!(
            fs::read_to_string(out.join("index.html"))
                .unwrap()
                .contains("\"zerolith\":\"/vendor/zerolith/dist/index.js\"")
        );
        assert!(!out.join("node_modules").exists());
        assert!(!out.join("src/main.ts").exists());
        assert!(build(&root, std::path::Path::new("."), true).is_err());
        let (plain, _) = build(&root, std::path::Path::new("plain"), false).unwrap();
        assert!(
            fs::read_to_string(plain.join("src/main.js"))
                .unwrap()
                .contains("html`<p>${n}</p>`")
        );
        assert_eq!(
            fs::read_to_string(plain.join("vendor/zerolith/dist/scan.js")).unwrap(),
            "export const scanner = 1;"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn serves_imports_of_other_files_through_modules_next_to_them() {
        let root =
            std::env::temp_dir().join(format!("zerolith-unbundled-imports-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        for (path, text) in [
            (
                "index.html",
                "<!doctype html><script type=\"module\" src=\"/src/main.ts\"></script>",
            ),
            (
                "src/main.ts",
                "import \"./plain.css\";\nimport card from \"./ui/card.css?scoped\";\nimport data from \"./data.json\";\nimport logo from \"./logo.svg\";\nimport notes from \"./notes.md?raw\";\nimport license from \"/LICENSE.txt?url\";\nconsole.log(card, data, logo, notes, license);\n",
            ),
            ("src/plain.css", "body { margin: 0; }\n"),
            (
                "src/ui/card.css",
                "@import \"../tokens.css\";\n:scope { background: url(./dot.svg); }\n",
            ),
            ("src/tokens.css", ":scope { --ink: red; }\n"),
            ("src/ui/dot.svg", "<svg/>"),
            ("src/data.json", "{ \"ok\": true }"),
            ("src/logo.svg", "<svg/>"),
            ("src/notes.md", "# Notes"),
            ("LICENSE.txt", "MIT"),
        ] {
            let file = root.join(path);
            fs::create_dir_all(file.parent().unwrap()).unwrap();
            fs::write(file, text).unwrap();
        }
        let (out, _) = build(&root, Path::new("dist"), false).unwrap();
        let main = fs::read_to_string(out.join("src/main.js")).unwrap();
        for specifier in [
            "import \"./plain.css.js\"",
            "from \"./ui/card.css.scoped.js\"",
            "from \"./data.json.js\"",
            "from \"./logo.svg.url.js\"",
            "from \"./notes.md.raw.js\"",
            "from \"/LICENSE.txt.url.js\"",
        ] {
            assert!(main.contains(specifier), "{specifier} in {main}");
        }
        let plain = fs::read_to_string(out.join("src/plain.css.js")).unwrap();
        assert!(
            plain.contains("new URL(\"./plain.css\", import.meta.url)") && plain.contains("await"),
            "{plain}"
        );
        let card = fs::read_to_string(out.join("src/ui/card.css.scoped.js")).unwrap();
        assert!(
            card.contains("styleFile(\"src/ui/card.css\", ")
                && card.contains("--ink")
                && card.contains("new URL(\"dot.svg\", import.meta.url).href")
                && !card.contains("@import"),
            "{card}"
        );
        assert_eq!(
            fs::read_to_string(out.join("src/data.json.js")).unwrap(),
            "export default {\"ok\":true};\n"
        );
        assert_eq!(
            fs::read_to_string(out.join("src/logo.svg.url.js")).unwrap(),
            "export default new URL(\"./logo.svg\", import.meta.url).href;\n"
        );
        assert_eq!(
            fs::read_to_string(out.join("src/notes.md.raw.js")).unwrap(),
            "export default \"# Notes\";\n"
        );
        assert!(out.join("LICENSE.txt.url.js").is_file());
        assert!(out.join("src/ui/card.css").is_file() && out.join("src/ui/dot.svg").is_file());
        fs::write(
            root.join("src/main.ts"),
            "import missing from \"./missing.css?scoped\";\nconsole.log(missing);\n",
        )
        .unwrap();
        let error = build(&root, Path::new("dist"), false)
            .unwrap_err()
            .to_string();
        assert!(
            error.contains("src/main.ts: the import of ./missing.css?scoped names no file"),
            "{error}"
        );
        let _ = fs::remove_dir_all(&root);
    }
}
