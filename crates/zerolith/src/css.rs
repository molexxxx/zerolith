//! The stylesheet `zerolith build` writes. The stylesheets the page links and the
//! modules import are read with lightningcss, their local `@import`s inlined
//! in place under the layer, supports, and media conditions they carry, and
//! their `url(...)` references pointed at the public folder or at hashed
//! copies next to the output. The combined stylesheet is then lowered for
//! the oldest supported browsers and, unless asked not to, minified.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use lightningcss::dependencies::{Dependency, DependencyOptions};
use lightningcss::error::{Error, ParserError};
use lightningcss::rules::CssRule;
use lightningcss::stylesheet::{MinifyOptions, ParserOptions, PrinterOptions, StyleSheet};
use lightningcss::targets::{Browsers, Targets};
use lightningcss::traits::ToCss;
use sha2::{Digest, Sha256};

use crate::server::percent_decode;

/// The oldest browsers the support policy names: the first versions with both import maps and constructable stylesheets.
pub fn targets() -> Targets {
    let version = |major: u32, minor: u32| Some((major << 16) | (minor << 8));
    Targets::from(Browsers {
        chrome: version(89, 0),
        edge: version(89, 0),
        firefox: version(108, 0),
        safari: version(16, 4),
        ios_saf: version(16, 4),
        ..Browsers::default()
    })
}

/// A canonical path without the verbatim prefix Windows adds, which the bundler's resolver does not use either.
pub fn canonical(path: &Path) -> io::Result<PathBuf> {
    let path = path.canonicalize()?;
    Ok(
        match path.to_str().and_then(|text| text.strip_prefix(r"\\?\")) {
            Some(rest) if !rest.starts_with("UNC") => PathBuf::from(rest),
            _ => path,
        },
    )
}

/// The first eight hex digits of a SHA-256 digest, for file names.
pub fn short_hash(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .take(4)
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// A path relative to the project, with forward slashes, as messages show it.
pub fn shown(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

/// True for a URL that names no file of the project: remote, protocol-relative, a data URL, or a fragment.
pub fn is_remote(url: &str) -> bool {
    url.contains("://") || url.starts_with("//") || url.starts_with("data:") || url.starts_with('#')
}

/// The files of a build's `assets` folder that were copied from the project, each once, under a name with its content hash.
#[derive(Debug)]
pub struct Assets {
    folder: PathBuf,
    copied: HashMap<PathBuf, String>,
}

impl Assets {
    pub fn new(folder: PathBuf) -> Self {
        Self {
            folder,
            copied: HashMap::new(),
        }
    }

    /// Copies a file into the folder unless it is there already, and returns its new name.
    pub fn copy(&mut self, file: &Path) -> io::Result<String> {
        if let Some(name) = self.copied.get(file) {
            return Ok(name.clone());
        }
        let bytes = fs::read(file)?;
        let stem = file
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("asset");
        let name = match file.extension().and_then(|extension| extension.to_str()) {
            Some(extension) => format!("{stem}-{}.{extension}", short_hash(&bytes)),
            None => format!("{stem}-{}", short_hash(&bytes)),
        };
        fs::create_dir_all(&self.folder)?;
        fs::write(self.folder.join(&name), &bytes)?;
        self.copied.insert(file.to_path_buf(), name.clone());
        Ok(name)
    }
}

/// Where a local URL points.
#[derive(Debug, PartialEq, Eq)]
pub enum Located {
    /// A file of the public folder, by its path inside it; it is copied as it is and keeps its URL.
    Public(String),
    /// A file of the project, copied under a hashed name.
    File(PathBuf),
    /// Nothing; the URL is left as written.
    Missing,
}

/// Finds the file a local URL names: a root-absolute URL in the public folder first and then in the project, a relative one next to the file that holds it. The query and fragment are not part of the lookup.
pub fn locate(root: &Path, folder: &Path, url: &str) -> Located {
    let path = percent_decode(url.split(['?', '#']).next().unwrap_or(url));
    if let Some(absolute) = path.strip_prefix('/') {
        if root.join("public").join(absolute).is_file() {
            return Located::Public(absolute.to_string());
        }
        if root.join(absolute).is_file() {
            return Located::File(root.join(absolute));
        }
        return Located::Missing;
    }
    let file = folder.join(&path);
    if file.is_file() {
        Located::File(file)
    } else {
        Located::Missing
    }
}

/// The query and fragment of a URL, kept on the rewritten URL.
pub fn suffix(url: &str) -> &str {
    url.find(['?', '#']).map_or("", |at| &url[at..])
}

/// The URL of a public file, as seen from a file `depth` folders below the output root.
pub fn public_url(base: &str, path: &str, depth: usize) -> String {
    if base == "./" {
        if depth == 0 {
            format!("./{path}")
        } else {
            format!("{}{path}", "../".repeat(depth))
        }
    } else {
        format!("{base}{path}")
    }
}

/// Escapes text for a double-quoted CSS string.
fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for character in text.chars() {
        match character {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\a "),
            _ => out.push(character),
        }
    }
    out
}

/// An `@import` read from a stylesheet, with its conditions as CSS text.
struct Import {
    url: String,
    layer: Option<Option<String>>,
    supports: Option<String>,
    media: Option<String>,
    /// The whole rule, for a remote import moved to the top of the output.
    rule: String,
    line: u32,
}

/// One item of a stylesheet's prelude, the statements before its first other rule.
enum Prelude {
    Import(Import),
    /// An `@layer` statement, which fixes the order of layers and must keep its place among the imports.
    Layers(String),
}

fn printed<T: ToCss>(value: &T) -> io::Result<String> {
    value
        .to_css_string(PrinterOptions::default())
        .map_err(|error| io::Error::other(error.to_string()))
}

fn located_error<T: std::fmt::Display>(error: &Error<T>, fallback: &str) -> String {
    match &error.loc {
        Some(location) => format!(
            "{}:{}:{}: {}",
            location.filename,
            location.line + 1,
            location.column,
            error.kind
        ),
        None => format!("{fallback}: {}", error.kind),
    }
}

/// What `bundle` needs.
pub struct Options<'a> {
    /// The project folder: root-absolute URLs resolve against its public folder, then against it.
    pub root: &'a Path,
    /// The base path the app is served under, normalized.
    pub base: &'a str,
    pub minify: bool,
}

/// The combined stylesheet and the warnings to report.
#[derive(Debug, Default)]
pub struct Bundled {
    pub code: String,
    pub warnings: Vec<String>,
}

struct Combiner<'a> {
    options: &'a Options<'a>,
    assets: &'a mut Assets,
    seen: HashSet<PathBuf>,
    hoisted: Vec<String>,
    warnings: Vec<String>,
}

impl Combiner<'_> {
    /// Resolves an `@import`: relative to the stylesheet, root-absolute against the project, and a bare name in `node_modules`, through a package's `style` field.
    fn resolve_import(&self, folder: &Path, url: &str) -> Option<PathBuf> {
        let path = percent_decode(url.split(['?', '#']).next().unwrap_or(url));
        if let Some(absolute) = path.strip_prefix('/') {
            let file = self.options.root.join(absolute);
            return file.is_file().then_some(file);
        }
        let relative = folder.join(&path);
        if relative.is_file() {
            return Some(relative);
        }
        if path.starts_with('.') {
            return None;
        }
        let package = self.options.root.join("node_modules").join(&path);
        if package.is_file() {
            return Some(package);
        }
        if package.is_dir() {
            let style = fs::read_to_string(package.join("package.json"))
                .ok()
                .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
                .and_then(|manifest| manifest.get("style")?.as_str().map(str::to_string));
            let file = package.join(style.as_deref().unwrap_or("index.css"));
            return file.is_file().then_some(file);
        }
        None
    }

    /// The URL a `url(...)` gets in the output stylesheet, which sits in the `assets` folder.
    fn rewrite_url(&mut self, file: &Path, url: &str) -> io::Result<String> {
        if url.is_empty() || is_remote(url) {
            return Ok(url.to_string());
        }
        let folder = file.parent().unwrap_or(Path::new("."));
        Ok(match locate(self.options.root, folder, url) {
            Located::Public(path) => {
                format!("{}{}", public_url(self.options.base, &path, 1), suffix(url))
            }
            Located::File(found) => format!("{}{}", self.assets.copy(&found)?, suffix(url)),
            Located::Missing => {
                self.warnings.push(format!(
                    "{} refers to {url}, which is in neither the public folder nor the project; it is left as written",
                    shown(self.options.root, file)
                ));
                url.to_string()
            }
        })
    }

    /// One stylesheet with its local imports inlined, each file once.
    fn read(&mut self, file: &Path) -> io::Result<String> {
        let file = canonical(file)?;
        if !self.seen.insert(file.clone()) {
            return Ok(String::new());
        }
        let source = fs::read_to_string(&file)?;
        let name = shown(self.options.root, &file);
        let warnings = Arc::new(RwLock::new(Vec::new()));
        let mut sheet = StyleSheet::parse(
            &source,
            ParserOptions {
                filename: name.clone(),
                error_recovery: true,
                warnings: Some(warnings.clone()),
                ..ParserOptions::default()
            },
        )
        .map_err(|error| io::Error::other(located_error(&error, &name)))?;
        if let Ok(found) = warnings.read() {
            self.warnings.extend(
                found
                    .iter()
                    .map(|warning: &Error<ParserError>| located_error(warning, &name)),
            );
        }
        let length = sheet
            .rules
            .0
            .iter()
            .position(|rule| !matches!(rule, CssRule::Import(_) | CssRule::LayerStatement(_)))
            .unwrap_or(sheet.rules.0.len());
        let mut prelude = Vec::new();
        for rule in sheet.rules.0.drain(..length) {
            match rule {
                CssRule::Import(import) => prelude.push(Prelude::Import(Import {
                    url: import.url.to_string(),
                    layer: match &import.layer {
                        None => None,
                        Some(None) => Some(None),
                        Some(Some(name)) => Some(Some(printed(name)?)),
                    },
                    supports: import.supports.as_ref().map(printed).transpose()?,
                    media: if import.media.media_queries.is_empty() {
                        None
                    } else {
                        Some(printed(&import.media)?)
                    },
                    rule: printed(&import)?,
                    line: import.loc.line + 1,
                })),
                CssRule::LayerStatement(statement) => {
                    prelude.push(Prelude::Layers(printed(&statement)?));
                }
                _ => {}
            }
        }
        let output = sheet
            .to_css(PrinterOptions {
                analyze_dependencies: Some(DependencyOptions {
                    remove_imports: false,
                }),
                ..PrinterOptions::default()
            })
            .map_err(|error| io::Error::other(located_error(&error, &name)))?;
        let mut body = output.code;
        for dependency in output.dependencies.unwrap_or_default() {
            if let Dependency::Url(reference) = dependency {
                let url = self.rewrite_url(&file, &reference.url)?;
                body = body.replace(&reference.placeholder, &escape(&url));
            }
        }
        let folder = file.parent().unwrap_or(Path::new(".")).to_path_buf();
        let mut out = String::new();
        for item in prelude {
            match item {
                Prelude::Layers(statement) => {
                    out.push_str(&statement);
                    out.push('\n');
                }
                Prelude::Import(import) => {
                    if is_remote(&import.url) {
                        self.hoisted.push(import.rule);
                        continue;
                    }
                    let Some(target) = self.resolve_import(&folder, &import.url) else {
                        return Err(io::Error::new(
                            io::ErrorKind::NotFound,
                            format!(
                                "{name}:{}: @import \"{}\" names no file next to the stylesheet, in the project, or in node_modules",
                                import.line, import.url
                            ),
                        ));
                    };
                    let mut inner = self.read(&target)?;
                    if let Some(layer) = &import.layer {
                        inner = match layer {
                            Some(name) => format!("@layer {name} {{\n{inner}}}\n"),
                            None => format!("@layer {{\n{inner}}}\n"),
                        };
                    }
                    if let Some(condition) = &import.supports {
                        inner = format!("@supports {condition} {{\n{inner}}}\n");
                    }
                    if let Some(media) = &import.media {
                        inner = format!("@media {media} {{\n{inner}}}\n");
                    }
                    out.push_str(&inner);
                }
            }
        }
        out.push_str(&body);
        out.push('\n');
        Ok(out)
    }
}

/// Combines stylesheets, in order, into one: imports inlined, references rewritten, lowered for the supported browsers, and minified unless `options.minify` is false. Remote imports move to the top, where CSS requires them.
pub fn bundle(files: &[PathBuf], options: &Options, assets: &mut Assets) -> io::Result<Bundled> {
    let mut combiner = Combiner {
        options,
        assets,
        seen: HashSet::new(),
        hoisted: Vec::new(),
        warnings: Vec::new(),
    };
    let mut body = String::new();
    for file in files {
        body.push_str(&combiner.read(file)?);
    }
    let mut combined = combiner.hoisted.join("\n");
    combined.push('\n');
    combined.push_str(&body);
    let mut sheet = StyleSheet::parse(
        &combined,
        ParserOptions {
            filename: "the combined stylesheet".to_string(),
            error_recovery: true,
            ..ParserOptions::default()
        },
    )
    .map_err(|error| io::Error::other(located_error(&error, "the combined stylesheet")))?;
    sheet
        .minify(MinifyOptions {
            targets: targets(),
            ..MinifyOptions::default()
        })
        .map_err(|error| io::Error::other(located_error(&error, "the combined stylesheet")))?;
    let code = sheet
        .to_css(PrinterOptions {
            minify: options.minify,
            targets: targets(),
            ..PrinterOptions::default()
        })
        .map_err(|error| io::Error::other(located_error(&error, "the combined stylesheet")))?
        .code;
    Ok(Bundled {
        code,
        warnings: combiner.warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::{Assets, Options, bundle, public_url};
    use std::fs;
    use std::path::{Path, PathBuf};

    fn project(name: &str, files: &[(&str, &str)]) -> PathBuf {
        let root = std::env::temp_dir().join(format!("zerolith-css-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        for (path, text) in files {
            let file = root.join(path);
            fs::create_dir_all(file.parent().unwrap()).unwrap();
            fs::write(file, text).unwrap();
        }
        root
    }

    fn run(root: &Path, files: &[&str], base: &str, minify: bool) -> (String, Vec<String>) {
        let mut assets = Assets::new(root.join("dist/assets"));
        let options = Options { root, base, minify };
        let paths: Vec<PathBuf> = files.iter().map(|file| root.join(file)).collect();
        let bundled = bundle(&paths, &options, &mut assets).unwrap();
        (bundled.code, bundled.warnings)
    }

    #[test]
    fn inlines_imports_in_order_under_their_conditions() {
        let root = project(
            "imports",
            &[
                (
                    "src/app.css",
                    "@layer reset, base;\n@import \"https://fonts.example/a.css\";\n@import \"./reset.css\" layer(reset);\n@import \"./print.css\" print;\n@import \"./grid.css\" supports(display: grid);\n@import \"modern-normalize\";\n.app { color: red; }\n",
                ),
                ("src/reset.css", "* { margin: 0; }\n"),
                ("src/print.css", ".noprint { display: none; }\n"),
                (
                    "src/grid.css",
                    ".grid { display: grid; }\n@import \"./late.css\";\n",
                ),
                (
                    "src/other.css",
                    "@import \"./reset.css\";\n.other { color: blue; }\n",
                ),
                (
                    "node_modules/modern-normalize/package.json",
                    "{\"style\":\"modern-normalize.css\"}",
                ),
                (
                    "node_modules/modern-normalize/modern-normalize.css",
                    "html { line-height: 1.15; }\n",
                ),
            ],
        );
        let (code, warnings) = run(&root, &["src/app.css", "src/other.css"], "/", false);
        let at = |needle: &str| {
            code.find(needle)
                .unwrap_or_else(|| panic!("{needle} missing from {code}"))
        };
        assert!(
            code.starts_with("@import \"https://fonts.example/a.css\";"),
            "{code}"
        );
        assert!(
            at("@layer reset {") < at("@layer base;"),
            "the layer order stays reset, then base: {code}"
        );
        assert!(at("@layer reset {") < at("@media print {"));
        assert!(at("@media print {") < at("@supports (display: grid) {"));
        assert!(at("@supports (display: grid) {") < at("line-height: 1.15"));
        assert!(at("line-height: 1.15") < at(".app {") && at(".app {") < at(".other {"));
        assert_eq!(code.matches("margin: 0").count(), 1, "{code}");
        assert!(
            warnings
                .iter()
                .any(|warning| warning.contains("src/grid.css")),
            "{warnings:?}"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rewrites_references_to_public_files_and_hashed_copies() {
        let root = project(
            "urls",
            &[
                (
                    "src/app.css",
                    "@font-face { font-family: Brand; src: url(\"./fonts/brand.woff2?v=2#x\") format(\"woff2\"); }\n.b { background: url(/logo.svg); }\n.c { background: url(/src/grain.png); }\n.d { background: url(data:image/png;base64,AAAA); }\n.e { background: url(missing.png); }\n.f { color: oklch(70% 0.1 200); }\n",
                ),
                ("src/fonts/brand.woff2", "WOFF"),
                ("src/grain.png", "PNG"),
                ("public/logo.svg", "<svg/>"),
            ],
        );
        let (code, warnings) = run(&root, &["src/app.css"], "/app/", true);
        assert!(
            code.contains("url(brand-") && code.contains(".woff2?v=2#x)"),
            "{code}"
        );
        assert!(code.contains("url(/app/logo.svg)"), "{code}");
        assert!(code.contains("url(grain-"), "{code}");
        assert!(code.contains("data:image/png;base64,AAAA"), "{code}");
        assert!(code.contains("url(missing.png)"), "{code}");
        assert!(
            code.contains(".f{color:#") && code.contains("color:lab("),
            "{code}"
        );
        assert!(!code.contains('\n'), "{code}");
        assert_eq!(warnings.len(), 1, "{warnings:?}");
        assert!(warnings[0].contains("missing.png"));
        let copied: Vec<String> = fs::read_dir(root.join("dist/assets"))
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(copied.len(), 2, "{copied:?}");
        assert_eq!(public_url("./", "logo.svg", 1), "../logo.svg");
        assert_eq!(public_url("./", "logo.svg", 0), "./logo.svg");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn lowers_nesting_for_the_supported_browsers() {
        let root = project(
            "nesting",
            &[(
                "a.css",
                ".card { color: red; & .title { font-weight: 600; } }\n",
            )],
        );
        let (code, _) = run(&root, &["a.css"], "/", true);
        assert!(code.contains(".card .title{font-weight:600}"), "{code}");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn fails_on_an_import_that_names_no_file() {
        let root = project("missing", &[("a.css", "\n@import \"./nope.css\";\n")]);
        let mut assets = Assets::new(root.join("dist/assets"));
        let options = Options {
            root: &root,
            base: "/",
            minify: true,
        };
        let error = bundle(&[root.join("a.css")], &options, &mut assets)
            .unwrap_err()
            .to_string();
        assert!(
            error.starts_with("a.css:2: @import \"./nope.css\""),
            "{error}"
        );
        let _ = fs::remove_dir_all(&root);
    }
}
