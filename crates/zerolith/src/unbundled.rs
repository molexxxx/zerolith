//! `zerolith build --unbundled`: the buildless path's production output. Every source
//! under the project is copied into an output folder, with `.ts`, `.tsx`,
//! `.jsx`, and `.mts` files transformed to JavaScript and renamed, the
//! relative specifiers that named them rewritten to `.js`, HTML module
//! scripts pointed at the renamed files, and the installed zerolith packages
//! vendored into the output with an import map carrying integrity hashes,
//! merged with the page's own map. An import
//! of a file that is not a module, such as a stylesheet, is pointed at a
//! small module written next to the file that gives what `zerolith dev`
//! gives. The result serves from any static host.

use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::importmap::{
    ImportMap, PageGraph, covers, page_graph, page_map, page_tags, update_html, vendor_from,
};
use crate::transform;
use crate::{css, env, modules, prepare, term};

/// Folders never copied into the output.
const SKIPPED: [&str; 6] = ["node_modules", "dist", "target", ".git", "test", "tests"];

/// Files that belong to development, not to the served output.
const DEVELOPMENT_FILES: [&str; 6] = [
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "zerolith.json",
    "AGENTS.md",
    "README.md",
];

fn is_development_file(name: &str) -> bool {
    name.starts_with('.')
        || DEVELOPMENT_FILES.contains(&name)
        || [
            ".config.ts",
            ".config.js",
            ".config.mts",
            ".config.mjs",
            ".d.ts",
            ".d.mts",
        ]
        .iter()
        .any(|suffix| name.ends_with(suffix))
}

/// What `build` wrote.
#[derive(Debug, Default)]
pub struct Built {
    /// The files copied as they are.
    pub copied: usize,
    /// The modules written: sources transformed to JavaScript, JavaScript modules with their imports rewritten, and the modules that serve other files.
    pub modules: usize,
    /// The modules among them transformed from `.ts`, `.tsx`, `.jsx`, or `.mts`.
    pub transformed: usize,
    pub html: usize,
    /// The pages written, wherever they are in the output, each of which gets the import map.
    pub pages: Vec<PathBuf>,
    /// Each output file and the source that wrote it, so a second source for one file is refused.
    written: BTreeMap<PathBuf, PathBuf>,
}

impl Built {
    /// Records that `source` writes `target`, refusing a second source for the same output file, as `utils.ts` beside a stale `utils.js` would give.
    fn claim(&mut self, root: &Path, out: &Path, target: &Path, source: &Path) -> io::Result<()> {
        match self
            .written
            .insert(target.to_path_buf(), source.to_path_buf())
        {
            Some(first) if first != source => Err(io::Error::other(format!(
                "{} and {} both become {} in the output; rename one",
                css::shown(root, &first),
                css::shown(root, source),
                css::shown(out, target)
            ))),
            _ => Ok(()),
        }
    }
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

/// What the project's modules import that the output must answer for.
#[derive(Default)]
struct Imports {
    /// The files that are not modules, by their path and form, each with the import that first asked for it, for messages.
    files: BTreeMap<(PathBuf, Form), String>,
    /// The bare specifiers, each with the first module that imports it, for the check that the import map covers them.
    bare: BTreeMap<String, String>,
    /// The imports refused, with the reason, which fail the build.
    refused: Vec<String>,
}

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
        css::encoded(&file.file_name().unwrap_or_default().to_string_lossy())
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
            let text = fs::read_to_string(file)
                .map_err(|error| io::Error::new(error.kind(), format!("{importer}: {error}")))?;
            serde_json::from_str::<serde_json::Value>(&text).map_err(|error| {
                io::Error::other(format!(
                    "{importer} names a file that is not valid JSON: {error}"
                ))
            })?;
            format!("export default JSON.parse({});\n", quoted(&text))
        }
        Form::Url => format!(
            "export default new URL({}, import.meta.url).href;\n",
            quoted(&name)
        ),
        Form::Raw => {
            let text = fs::read_to_string(file)
                .map_err(|error| io::Error::new(error.kind(), format!("{importer}: {error}")))?;
            format!("export default {};\n", quoted(&text))
        }
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

/// Rewrites a module's specifiers for the output: a transformed source to its `.js` name, and a file that is not a module to the module that serves it; both that file and a bare specifier are recorded in `imports`.
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
        if !(specifier.starts_with('.') || specifier.starts_with('/') || specifier.contains(':')) {
            imports
                .bare
                .entry(specifier.to_string())
                .or_insert_with(|| shown.clone());
            return None;
        }
        let (form, path, name) = Form::of(specifier)?;
        let target = match path.strip_prefix('/') {
            Some(absolute) => root.join(absolute),
            None => folder.join(path),
        };
        let target = css::canonical(&target).unwrap_or_else(|_| css::plain(&target));
        let public = root.join("public");
        let served = match path.strip_prefix('/') {
            Some(absolute) if !target.exists() && public.join(absolute).is_file() => {
                Some(absolute.to_string())
            }
            _ => target
                .strip_prefix(&public)
                .ok()
                .map(|inside| inside.to_string_lossy().replace('\\', "/")),
        };
        if let Some(served) = served {
            imports.refused.push(format!(
                "{shown}: the import of {specifier} names a file in public/, which is served as it is and imports no module; reference it by its URL, /{served}, or move it next to the module"
            ));
            return None;
        }
        imports
            .files
            .entry((target, form))
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
            if path.join("importmap.json").is_file() {
                copy_vendored(root, &path, out, built, path == root.join("vendor"))?;
                continue;
            }
            walk(root, &path, out, built, prepare_templates, defines, imports)?;
            continue;
        }
        let claim = |built: &mut Built, target: &Path| built.claim(root, out, target, &path);
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
            claim(built, &target)?;
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
        let read =
            |path: &Path| fs::read_to_string(path).map_err(|error| css::located(root, path, error));
        if transform::transforms(extension) {
            claim(built, &target.with_extension("js"))?;
            let source = read(&path)?;
            let code = transform::transform(&path, &source)
                .and_then(|code| rewrite(&code, root, &path, imports))
                .map(replace)
                .and_then(|code| prepared(code, prepare_templates))
                .map_err(|error| io::Error::other(format!("{}: {error}", relative.display())))?;
            fs::write(target.with_extension("js"), code)?;
            built.modules += 1;
            built.transformed += 1;
        } else if extension == "js" || extension == "mjs" {
            claim(built, &target)?;
            let source = read(&path)?;
            let code = rewrite(&source, root, &path, imports)
                .map(replace)
                .and_then(|code| prepared(code, prepare_templates))
                .map_err(|error| io::Error::other(format!("{}: {error}", relative.display())))?;
            fs::write(&target, code)?;
            built.modules += 1;
        } else if extension == "html" || extension == "htm" {
            claim(built, &target)?;
            fs::write(&target, rewrite_html(&read(&path)?))?;
            built.html += 1;
            built.pages.push(target);
        } else {
            claim(built, &target)?;
            fs::copy(&path, &target)?;
            built.copied += 1;
        }
    }
    Ok(())
}

/// Copies a folder `zerolith importmap` wrote, which its `importmap.json` marks, as it is, since the page's import map names its modules with integrity hashes that a rewritten byte would fail. Hidden files are left out, and so are, at the top of the project's own `vendor/` folder, `importmap.json` and the zerolith packages, which the build writes anew into the output's.
fn copy_vendored(
    root: &Path,
    folder: &Path,
    out: &Path,
    built: &mut Built,
    own: bool,
) -> io::Result<()> {
    for entry in fs::read_dir(folder)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.')
            || (own && ["importmap.json", "zerolith", "@zerolith"].contains(&name.as_str()))
        {
            continue;
        }
        if path.is_dir() {
            copy_vendored(root, &path, out, built, false)?;
            continue;
        }
        let target = out.join(path.strip_prefix(root).map_err(io::Error::other)?);
        built.claim(root, out, &target, &path)?;
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(&path, &target)?;
        built.copied += 1;
    }
    Ok(())
}

/// The files the project's `index.html` loads as module scripts, which the output folder must not hold.
fn page_sources(root: &Path) -> Vec<PathBuf> {
    let Ok(html) = fs::read_to_string(root.join("index.html")) else {
        return Vec::new();
    };
    crate::html::scan(&html)
        .scripts
        .iter()
        .chain(crate::html::scan(&html).styles.iter())
        .map(|reference| {
            let path = crate::server::percent_decode(
                reference
                    .url
                    .split(['?', '#'])
                    .next()
                    .unwrap_or(&reference.url),
            );
            root.join(path.trim_start_matches('/'))
        })
        .collect()
}

/// Builds `root` into `out`, relative to it unless absolute. The output folder is refused when it holds the project, is in the public folder, or holds a source the page loads, and it is emptied first when it is inside the project or `empty_out_dir` asks for it; the warnings say what was left alone.
pub fn build(
    root: &Path,
    out: &Path,
    prepare_templates: bool,
    empty_out_dir: bool,
) -> io::Result<(PathBuf, Built, Vec<String>)> {
    let root = css::canonical(root)?;
    if prepare_templates {
        crate::build::check_core_version(&root)?;
    }
    let out_dir = crate::build::resolve_out_dir(&root, out)?;
    let mut warnings = Vec::new();
    crate::build::prepare_out_dir(
        &root,
        &out_dir,
        &page_sources(&root),
        empty_out_dir,
        &mut warnings,
    )?;
    let mut built = Built::default();
    let defines = Defines {
        env: format!(
            "({})",
            env::object("production", "/", &env::variables(&root, "production"))
        ),
        node_env: "\"production\"".to_string(),
    };
    let mut imports = Imports::default();
    walk(
        &root,
        &root,
        &out_dir,
        &mut built,
        prepare_templates,
        &defines,
        &mut imports,
    )?;
    if !imports.refused.is_empty() {
        return Err(io::Error::other(imports.refused.join("\n")));
    }
    for ((file, form), importer) in &imports.files {
        write_import(&root, &out_dir, file, *form, importer)?;
        built.modules += 1;
    }
    let packages = root
        .ancestors()
        .map(|folder| folder.join("node_modules"))
        .find(|folder| folder.join("zerolith").is_dir())
        .unwrap_or_else(|| root.join("node_modules"));
    let mut graphs = Vec::new();
    let mut every = PageGraph::default();
    for path in &built.pages {
        let url = format!(
            "/{}",
            path.strip_prefix(&out_dir)
                .map_err(io::Error::other)?
                .to_string_lossy()
                .replace('\\', "/")
        );
        let graph = page_graph(&out_dir, &url, &fs::read_to_string(path)?)?;
        every.extend(&graph);
        graphs.push(graph);
    }
    let vendored = if packages.join("zerolith").is_dir() {
        Some(vendor_from(
            &packages,
            &out_dir,
            Path::new("vendor"),
            false,
            prepare_templates,
            true,
            Some(&every),
        )?)
    } else {
        None
    };
    let mut mapped = ImportMap::default();
    for (path, graph) in built.pages.iter().zip(&graphs) {
        let current = fs::read_to_string(path)?;
        if let Some(map) = page_map(&current) {
            mapped.imports.extend(map.imports);
        }
        if let Some(vendored) = &vendored {
            fs::write(
                path,
                update_html(&current, &page_tags(vendored, &current, Some(graph))),
            )?;
        }
    }
    if let Some(vendored) = &vendored {
        mapped.imports.extend(vendored.map.imports.clone());
    }
    for (specifier, module) in &imports.bare {
        if !covers(&mapped, specifier) {
            warnings.push(format!(
                "{module} imports {specifier}, which no import map entry covers, so the browser cannot load it: install it if it is a zerolith package, or map it in the page's <script type=\"importmap\">"
            ));
        }
    }
    Ok((out_dir, built, warnings))
}

/// Runs the `build --unbundled` command and prints what it wrote.
pub fn run(
    root: &Path,
    out: &Path,
    prepare_templates: bool,
    empty_out_dir: bool,
) -> io::Result<()> {
    let started = std::time::Instant::now();
    anstream::println!(
        "{}",
        term::heading("build", "unbundled, the modules behind an import map")
    );
    let (out_dir, built, warnings) = build(root, out, prepare_templates, empty_out_dir)?;
    for warning in &warnings {
        anstream::eprintln!("{}", term::row("warning", term::caution, warning));
    }
    anstream::println!(
        "{}",
        term::row(
            "Modules",
            term::label,
            format!(
                "{} written, {} transformed from TypeScript or JSX",
                built.modules, built.transformed
            )
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
            "import \"./scan.js\";\nexport const html = 1;",
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
            "import { html } from \"zerolith\";\nimport { App } from \"./app.tsx\";\nexport const n: number = 1;\nexport const v = html`<p>${n}</p>`;\nexport const app = App;\n",
        )
        .unwrap();
        fs::write(
            root.join("src/app.tsx"),
            "export function App(): unknown { return <p>{1}</p>; }\n",
        )
        .unwrap();
        fs::write(root.join("src/plain.js"), "import \"./app.tsx\";\n").unwrap();
        fs::write(root.join("styles.css"), "body {}").unwrap();
        let (out, built, warnings) =
            build(&root, std::path::Path::new("dist"), true, false).unwrap();
        assert!(warnings.is_empty(), "{warnings:?}");
        assert_eq!(
            (built.modules, built.transformed, built.copied, built.html),
            (3, 2, 1, 1)
        );
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
        assert!(build(&root, std::path::Path::new("."), true, false).is_err());
        let parent = build(&root, std::path::Path::new(".."), true, false)
            .unwrap_err()
            .to_string();
        assert!(parent.contains("holds the project"), "{parent}");
        let name = root.file_name().unwrap().to_string_lossy().into_owned();
        assert!(build(&root, &std::path::Path::new("..").join(&name), true, false).is_err());
        fs::create_dir_all(root.join("public")).unwrap();
        fs::write(root.join("public/favicon.svg"), "<svg/>").unwrap();
        let public = build(&root, std::path::Path::new("public"), true, false)
            .unwrap_err()
            .to_string();
        assert!(public.contains("public folder"), "{public}");
        assert!(root.join("public/favicon.svg").is_file());
        let sources = build(&root, std::path::Path::new("src"), true, false)
            .unwrap_err()
            .to_string();
        assert!(sources.contains("a source the page loads"), "{sources}");
        assert!(root.join("src/main.ts").is_file());
        let outside = root.with_file_name(format!(
            "zerolith-build-test-outside-{}",
            std::process::id()
        ));
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("keep.txt"), "kept").unwrap();
        let (_, _, warnings) = build(&root, &outside, true, false).unwrap();
        assert!(outside.join("keep.txt").is_file());
        assert!(
            warnings
                .iter()
                .any(|warning| warning.contains("--empty-out-dir")),
            "{warnings:?}"
        );
        build(&root, &outside, true, true).unwrap();
        assert!(!outside.join("keep.txt").exists());
        let _ = fs::remove_dir_all(&outside);
        fs::remove_dir_all(root.join("public")).unwrap();
        let (plain, _, _) = build(&root, std::path::Path::new("plain"), false, false).unwrap();
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
    fn maps_every_page_and_refuses_what_the_output_cannot_serve() {
        let root =
            std::env::temp_dir().join(format!("zerolith-unbundled-pages-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("src")).unwrap();
        fs::create_dir_all(root.join("about")).unwrap();
        fs::create_dir_all(root.join("public")).unwrap();
        fs::create_dir_all(root.join("node_modules/zerolith/dist")).unwrap();
        fs::write(
            root.join("node_modules/zerolith/package.json"),
            "{\"name\":\"zerolith\",\"version\":\"0.0.0\",\"exports\":{\".\":\"./dist/index.js\"}}",
        )
        .unwrap();
        fs::write(
            root.join("node_modules/zerolith/dist/index.js"),
            "export const html = 1;",
        )
        .unwrap();
        fs::write(
            root.join("src/main.ts"),
            "import { html } from \"zerolith\";\nimport settings from \"./settings.json\";\nexport const parts = [html, settings];\n",
        )
        .unwrap();
        fs::write(
            root.join("src/settings.json"),
            "{\"__proto__\": {\"admin\": true}}",
        )
        .unwrap();
        fs::write(root.join("src/env.d.ts"), "declare const x: number;\n").unwrap();
        fs::write(root.join("zerolith.json"), "{}").unwrap();
        fs::write(root.join("public/logo.svg"), "<svg/>").unwrap();
        let page =
            "<!doctype html><head></head><script type=\"module\" src=\"/src/main.ts\"></script>";
        fs::write(root.join("index.html"), page).unwrap();
        fs::write(root.join("about/index.html"), page).unwrap();
        let (out, built, _) = build(&root, Path::new("dist"), false, false).unwrap();
        assert_eq!(built.pages.len(), 2);
        for page in ["index.html", "about/index.html"] {
            let written = fs::read_to_string(out.join(page)).unwrap();
            assert!(
                written.contains("\"zerolith\":\"/vendor/zerolith/dist/index.js\""),
                "{page}: {written}"
            );
        }
        let json = fs::read_to_string(out.join("src/settings.json.js")).unwrap();
        assert!(json.starts_with("export default JSON.parse("), "{json}");
        assert!(!out.join("zerolith.json").exists());
        assert!(!out.join("src/env.d.js").exists());

        fs::write(root.join("src/main.js"), "export const stale = 1;\n").unwrap();
        let collision = build(&root, Path::new("dist"), false, false)
            .unwrap_err()
            .to_string();
        assert!(
            collision.contains("src/main.js and src/main.ts both become src/main.js")
                || collision.contains("src/main.ts and src/main.js both become src/main.js"),
            "{collision}"
        );
        fs::remove_file(root.join("src/main.js")).unwrap();

        fs::write(
            root.join("src/logo.ts"),
            "import relative from \"../public/logo.svg\";\nimport served from \"/logo.svg\";\nexport const urls = [relative, served];\n",
        )
        .unwrap();
        let public = build(&root, Path::new("dist"), false, false)
            .unwrap_err()
            .to_string();
        assert!(
            public
                .contains("src/logo.ts: the import of ../public/logo.svg names a file in public/"),
            "{public}"
        );
        assert!(
            public.contains("src/logo.ts: the import of /logo.svg names a file in public/"),
            "{public}"
        );
        assert!(public.contains("by its URL, /logo.svg,"), "{public}");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn copies_the_projects_vendored_folders_as_they_are_and_writes_the_packages_anew() {
        let root = std::env::temp_dir().join(format!(
            "zerolith-unbundled-vendored-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let lenis = "export const lenis = () => import(\"./inner.js\");\nconsole.log(import.meta.env.MODE);\n";
        let page = "<!doctype html><head><script type=\"importmap\">{\"imports\":{\"lenis\":\"/vendor/lenis/lenis.js\"},\"integrity\":{\"/vendor/lenis/lenis.js\":\"sha256-lenis\"}}</script></head><script type=\"module\" src=\"/src/main.ts\"></script>";
        for (path, text) in [
            ("index.html", page),
            (
                "src/main.ts",
                "import { html } from \"zerolith\";\nimport { lenis } from \"lenis\";\nexport const main = [html, lenis];\n",
            ),
            (
                "node_modules/zerolith/package.json",
                "{\"name\":\"zerolith\",\"version\":\"0.0.0\",\"exports\":{\".\":\"./dist/index.js\"}}",
            ),
            (
                "node_modules/zerolith/dist/index.js",
                "export const html = 1;",
            ),
            ("vendor/importmap.json", "{\"imports\":{}}"),
            ("vendor/.gitattributes", "* -text\n"),
            ("vendor/lenis/lenis.js", lenis),
            ("vendor/lenis/lenis.css", ".lenis { height: auto; }\n"),
            ("vendor/lenis/package.json", "{\"name\":\"lenis\"}"),
            ("vendor/zerolith/VERSION", "0.0.0\n"),
            ("vendor/zerolith/dist/stale.js", "export const stale = 1;"),
            ("vendor/@zerolith/router/VERSION", "0.0.0\n"),
            (
                "vendor/@zerolith/router/dist/old.js",
                "export const old = 1;",
            ),
            ("lib/importmap.json", "{\"imports\":{\"x\":\"/lib/x.js\"}}"),
            ("lib/x.js", lenis),
            ("lib/zerolith/kept.js", "export const kept = 1;"),
        ] {
            let file = root.join(path);
            fs::create_dir_all(file.parent().unwrap()).unwrap();
            fs::write(file, text).unwrap();
        }
        let (out, built, warnings) = build(&root, Path::new("dist"), false, false).unwrap();
        assert!(warnings.is_empty(), "{warnings:?}");
        assert_eq!(
            fs::read_to_string(out.join("vendor/lenis/lenis.js")).unwrap(),
            lenis
        );
        assert!(out.join("vendor/lenis/lenis.css").is_file());
        assert!(out.join("vendor/lenis/package.json").is_file());
        assert_eq!(fs::read_to_string(out.join("lib/x.js")).unwrap(), lenis);
        assert!(out.join("lib/importmap.json").is_file());
        assert!(out.join("lib/zerolith/kept.js").is_file());
        for absent in [
            "vendor/zerolith/dist/stale.js",
            "vendor/@zerolith/router/dist/old.js",
            "vendor/@zerolith",
        ] {
            assert!(!out.join(absent).exists(), "{absent} was copied");
        }
        assert!(out.join("vendor/zerolith/dist/index.js").is_file());
        assert!(
            fs::read_to_string(out.join("vendor/importmap.json"))
                .unwrap()
                .contains("\"zerolith\": \"/vendor/zerolith/dist/index.js\"")
        );
        assert!(
            fs::read_to_string(out.join("vendor/.gitattributes"))
                .unwrap()
                .contains("-text")
        );
        let written = fs::read_to_string(out.join("index.html")).unwrap();
        assert!(
            written.contains("\"lenis\":\"/vendor/lenis/lenis.js\"")
                && written.contains("\"/vendor/lenis/lenis.js\":\"sha256-lenis\""),
            "{written}"
        );
        assert_eq!((built.modules, built.transformed, built.copied), (1, 1, 6));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn preloads_each_pages_own_modules_and_vendors_what_the_pages_reach() {
        let root =
            std::env::temp_dir().join(format!("zerolith-unbundled-graph-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("src")).unwrap();
        fs::create_dir_all(root.join("about")).unwrap();
        fs::create_dir_all(root.join("node_modules/zerolith/dist")).unwrap();
        fs::write(
            root.join("node_modules/zerolith/package.json"),
            "{\"name\":\"zerolith\",\"version\":\"0.0.0\",\"exports\":{\".\":\"./dist/index.js\",\"./ssr\":\"./dist/ssr.js\"}}",
        )
        .unwrap();
        fs::write(
            root.join("node_modules/zerolith/dist/index.js"),
            "export const html = 1;",
        )
        .unwrap();
        fs::write(
            root.join("node_modules/zerolith/dist/ssr.js"),
            "export const render = 1;",
        )
        .unwrap();
        fs::write(
            root.join("src/main.ts"),
            "import { html } from \"zerolith\";\nimport { app } from \"./app.ts\";\nexport const main = html + app;\n",
        )
        .unwrap();
        fs::write(root.join("src/app.ts"), "export const app: number = 1;\n").unwrap();
        fs::write(root.join("about/about.ts"), "export const about = 1;\n").unwrap();
        fs::write(
            root.join("index.html"),
            "<!doctype html><head></head><script type=\"module\" src=\"/src/main.ts\"></script>",
        )
        .unwrap();
        fs::write(
            root.join("about/index.html"),
            "<!doctype html><head></head><script type=\"module\" src=\"about.ts\"></script>",
        )
        .unwrap();
        let (out, _, warnings) = build(&root, Path::new("dist"), false, false).unwrap();
        assert!(warnings.is_empty(), "{warnings:?}");
        assert!(!out.join("vendor/zerolith/dist/ssr.js").exists());
        let home = fs::read_to_string(out.join("index.html")).unwrap();
        assert!(
            home.contains(
                "<link rel=\"modulepreload\" href=\"/src/app.js\" data-zerolith-preload>"
            ),
            "{home}"
        );
        assert!(
            home.contains("<link rel=\"modulepreload\" href=\"/vendor/zerolith/dist/index.js\" integrity=\"sha256-"),
            "{home}"
        );
        assert!(!home.contains("href=\"/src/main.js\""), "{home}");
        let about = fs::read_to_string(out.join("about/index.html")).unwrap();
        assert!(
            about.contains("\"zerolith\":\"/vendor/zerolith/dist/index.js\""),
            "{about}"
        );
        assert!(!about.contains("modulepreload"), "{about}");
        assert!(about.contains("src=\"about.js\""), "{about}");

        fs::write(root.join("src/main.ts"), "export const main = 1;\n").unwrap();
        let (out, _, _) = build(&root, Path::new("dist"), false, false).unwrap();
        assert!(out.join("vendor/zerolith/dist/ssr.js").is_file());
        let home = fs::read_to_string(out.join("index.html")).unwrap();
        assert!(
            home.contains("\"zerolith/ssr\":\"/vendor/zerolith/dist/ssr.js\""),
            "{home}"
        );
        assert!(!home.contains("modulepreload"), "{home}");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn warns_of_a_bare_import_no_import_map_covers_and_keeps_the_page_entries() {
        let root =
            std::env::temp_dir().join(format!("zerolith-unbundled-bare-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("src")).unwrap();
        fs::create_dir_all(root.join("node_modules/zerolith/dist")).unwrap();
        fs::write(
            root.join("node_modules/zerolith/package.json"),
            "{\"name\":\"zerolith\",\"version\":\"0.0.0\",\"exports\":{\".\":\"./dist/index.js\"}}",
        )
        .unwrap();
        fs::write(
            root.join("node_modules/zerolith/dist/index.js"),
            "export const html = 1;",
        )
        .unwrap();
        fs::write(
            root.join("src/main.ts"),
            "import { html } from \"zerolith\";\nimport { LitElement } from \"lit\";\nimport { get } from \"lodash-es/get.js\";\nimport { readFile } from \"node:fs\";\nexport const parts = [html, LitElement, get, readFile];\n",
        )
        .unwrap();
        fs::write(
            root.join("index.html"),
            "<!doctype html><head></head><script type=\"module\" src=\"/src/main.ts\"></script>",
        )
        .unwrap();
        let (_, _, warnings) = build(&root, Path::new("dist"), false, false).unwrap();
        assert_eq!(warnings.len(), 2, "{warnings:?}");
        assert!(
            warnings[0].starts_with("src/main.ts imports lit,"),
            "{warnings:?}"
        );
        assert!(
            warnings[1].starts_with("src/main.ts imports lodash-es/get.js,"),
            "{warnings:?}"
        );

        fs::write(
            root.join("index.html"),
            "<!doctype html><head><script type=\"importmap\">{\"imports\":{\"lit\":\"https://cdn.example/lit.js\",\"lodash-es/\":\"/lib/lodash-es/\"}}</script></head><script type=\"module\" src=\"/src/main.ts\"></script>",
        )
        .unwrap();
        let (out, _, warnings) = build(&root, Path::new("dist"), false, false).unwrap();
        assert!(warnings.is_empty(), "{warnings:?}");
        let page = fs::read_to_string(out.join("index.html")).unwrap();
        assert!(
            page.contains("\"lit\":\"https://cdn.example/lit.js\""),
            "{page}"
        );
        assert!(
            page.contains("\"zerolith\":\"/vendor/zerolith/dist/index.js\""),
            "{page}"
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
        let (out, _, _) = build(&root, Path::new("dist"), false, false).unwrap();
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
            "export default JSON.parse(\"{ \\\"ok\\\": true }\");\n"
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
        let error = build(&root, Path::new("dist"), false, false)
            .unwrap_err()
            .to_string();
        assert!(
            error.contains("src/main.ts: the import of ./missing.css?scoped names no file"),
            "{error}"
        );
        let outside = root.with_file_name(format!(
            "zerolith-unbundled-outside-{}.txt",
            std::process::id()
        ));
        fs::write(&outside, "secret").unwrap();
        let name = outside.file_name().unwrap().to_string_lossy().into_owned();
        fs::write(
            root.join("src/main.ts"),
            format!("import text from \"../../{name}?raw\";\nconsole.log(text);\n"),
        )
        .unwrap();
        let error = build(&root, Path::new("dist"), false, false)
            .unwrap_err()
            .to_string();
        assert!(
            error.contains("names a file outside the project"),
            "{error}"
        );
        assert!(!root.join(format!("{name}.raw.js")).exists());
        let _ = fs::remove_file(&outside);
        let _ = fs::remove_dir_all(&root);
    }
}
