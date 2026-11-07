//! Rewriting one source for the output: TypeScript and JSX transformed,
//! relative specifiers pointed at the renamed files, imports of stylesheets
//! and other files given the module `zerolith dev` gives, and the module
//! scripts of a page pointed at the renamed files.

use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::transform;
use crate::{css, modules, prepare};

pub(super) fn rewrite_html(html: &str) -> String {
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
pub(super) fn prepared(
    code: String,
    prepare_templates: bool,
) -> Result<String, transform::TransformError> {
    if prepare_templates {
        prepare::prepare(&code)
    } else {
        Ok(code)
    }
}

/// What an import of a file that is not a module asks for, which a module written next to the file gives.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub(super) enum Form {
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
pub(super) struct Imports {
    /// The files that are not modules, by their path and form, each with the import that first asked for it, for messages.
    pub(super) files: BTreeMap<(PathBuf, Form), String>,
    /// The bare specifiers, each with the first module that imports it, for the check that the import map covers them.
    pub(super) bare: BTreeMap<String, String>,
    /// The imports refused, with the reason, which fail the build.
    pub(super) refused: Vec<String>,
}

/// The module that links a stylesheet a module imports, once, and waits for it so the page renders styled.
const STYLESHEET_MODULE: &str = "const href = new URL(__FILE__, import.meta.url).href;\nif (!Array.from(document.querySelectorAll(\"link[rel=stylesheet]\"), (link) => link.href).includes(href))\n{\n    const link = document.createElement(\"link\");\n    link.rel = \"stylesheet\";\n    link.href = href;\n    await new Promise((resolve) =>\n    {\n        link.onload = resolve;\n        link.onerror = resolve;\n        document.head.append(link);\n    });\n}\n";

fn quoted(text: &str) -> String {
    serde_json::Value::from(text).to_string()
}

/// Writes the module that serves an imported file in its form, next to the file's copy.
pub(super) fn write_import(
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
pub(super) struct Defines {
    pub(super) env: String,
    pub(super) node_env: String,
}

/// Rewrites a module's specifiers for the output: a transformed source to its `.js` name, and a file that is not a module to the module that serves it; both that file and a bare specifier are recorded in `imports`.
pub(super) fn rewrite(
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
