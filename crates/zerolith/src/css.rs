//! The stylesheet `zerolith build` writes. The stylesheets the page links and the
//! modules import are read with lightningcss, their local `@import`s inlined
//! in place under the layer, supports, and media conditions they carry, and
//! their `url(...)` references pointed at the public folder or at hashed
//! copies next to the output. The combined stylesheet is then lowered for
//! the oldest supported browsers and, unless asked not to, minified. A
//! stylesheet imported with `?scoped` goes through the same steps on its
//! own, for the module that hands its rules to zerolith.

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
    Ok(plain(&path.canonicalize()?))
}

/// A path without the `\\?\` prefix Windows gives canonical paths, so it compares equal to the paths tools and file events use.
pub fn plain(path: &Path) -> PathBuf {
    match path.to_str().and_then(|text| text.strip_prefix(r"\\?\")) {
        Some(rest) if !rest.starts_with("UNC") => PathBuf::from(rest),
        _ => path.to_path_buf(),
    }
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

/// An error of reading `file`, with the file's path in the project in front of the reason.
pub fn located(root: &Path, file: &Path, error: io::Error) -> io::Error {
    io::Error::new(error.kind(), format!("{}: {error}", shown(root, file)))
}

/// The path from `folder` to `file`, with forward slashes and `..` to climb out; a file on another drive keeps only its name.
pub fn relative(folder: &Path, file: &Path) -> String {
    let (folder, file) = (plain(folder), plain(file));
    let folder: Vec<_> = folder.components().collect();
    let file: Vec<_> = file.components().collect();
    let shared = folder.iter().zip(&file).take_while(|(a, b)| a == b).count();
    if shared == 0 {
        return file
            .last()
            .map(|part| part.as_os_str().to_string_lossy().into_owned())
            .unwrap_or_default();
    }
    let mut parts: Vec<String> = vec!["..".to_string(); folder.len() - shared];
    parts.extend(
        file[shared..]
            .iter()
            .map(|part| part.as_os_str().to_string_lossy().into_owned()),
    );
    parts.join("/")
}

/// A file's path from the project folder, as `styleFile` keys a stylesheet: `src/card.css`, or `../ui/card.css` for one in a package of the workspace.
pub fn project_path(root: &Path, file: &Path) -> String {
    relative(root, file)
}

/// A file path written as a URL path: every byte outside the characters a path segment may hold as they are, such as `#`, `?`, `%`, a space, or a letter outside ASCII, is percent-encoded, so `c#.svg` becomes `c%23.svg` and is not read as `c` with a fragment.
pub fn encoded(path: &str) -> String {
    let mut out = String::with_capacity(path.len());
    for byte in path.bytes() {
        if byte.is_ascii_alphanumeric() || b"-._~!$&'()*+,;=:@/".contains(&byte) {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

/// A name for a copied asset that needs no encoding in a URL: every character other than an ASCII letter, a digit, `-`, `_`, or `.` becomes `_`.
fn url_safe(name: &str) -> String {
    name.chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '_'
            }
        })
        .collect()
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
        let bytes = fs::read(file).map_err(|error| {
            io::Error::new(error.kind(), format!("{}: {error}", file.display()))
        })?;
        let stem = url_safe(
            &file
                .file_stem()
                .map_or_else(|| "asset".into(), |stem| stem.to_string_lossy()),
        );
        let name = match file.extension() {
            Some(extension) => format!(
                "{stem}-{}.{}",
                short_hash(&bytes),
                url_safe(&extension.to_string_lossy())
            ),
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
    /// A file of the public folder, by its path inside it, percent-encoded for a URL; it is copied as it is and keeps its URL.
    Public(String),
    /// A file of the project, copied under a hashed name.
    File(PathBuf),
    /// Nothing; the URL is left as written.
    Missing,
}

/// Finds the file a local URL names: a root-absolute URL in the public folder first and then in the project, a relative one next to the file that holds it. The query and fragment are not part of the lookup.
/// Refuses a file that a dependency, a file installed under a `node_modules` folder, refers to outside that folder, so a package's stylesheet or `?raw` import cannot copy a file of the project, such as `.env`, or of the disk into the build's output. Paths are compared once links are resolved, so a package of the workspace that `node_modules` links to is the project's own, and the outermost `node_modules` above the file counts, so one installed package may refer to another's files.
pub fn reach(root: &Path, referrer: &Path, target: &Path) -> io::Result<()> {
    let referrer = canonical(referrer).unwrap_or_else(|_| referrer.to_path_buf());
    let Some(installed) = referrer
        .ancestors()
        .filter(|folder| {
            folder
                .file_name()
                .is_some_and(|name| name == "node_modules")
        })
        .last()
    else {
        return Ok(());
    };
    let target = canonical(target).unwrap_or_else(|_| target.to_path_buf());
    if target.starts_with(installed) {
        return Ok(());
    }
    Err(io::Error::new(
        io::ErrorKind::PermissionDenied,
        format!(
            "{}: refers to {}, outside the node_modules folder it is installed in; a dependency may refer only to installed files, so the build does not copy a file of the project or of the disk into its output",
            shown(root, &referrer),
            shown(root, &target)
        ),
    ))
}

pub fn locate(root: &Path, folder: &Path, url: &str) -> Located {
    let path = percent_decode(url.split(['?', '#']).next().unwrap_or(url));
    if let Some(absolute) = path.strip_prefix('/') {
        if root.join("public").join(absolute).is_file() {
            return Located::Public(encoded(absolute));
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
            '\0' => out.push('\u{fffd}'),
            '\u{1}'..='\u{1f}' | '\u{7f}' => {
                out.push_str(&format!("\\{:x} ", u32::from(character)));
            }
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

/// What `bundle` and `bundle_scoped` need.
pub struct Options<'a> {
    /// The project folder, canonical as `canonical` gives it, since the stylesheets' paths are canonicalized and messages show them relative to it: root-absolute URLs resolve against its public folder, then against it.
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

/// The rules of a stylesheet imported with `?scoped`, and what its module needs besides.
#[derive(Debug, Default)]
pub struct Scoped {
    pub code: String,
    /// The URLs, relative to the module, that the placeholders in `code` stand for, in order.
    pub spliced: Vec<String>,
    /// Every file read: the stylesheet and the ones it imports, sorted.
    pub files: Vec<PathBuf>,
    pub warnings: Vec<String>,
}

/// The start of a placeholder for a URL the module resolves when it runs.
const PLACEHOLDER: &str = "__zerolith_url_";

impl Scoped {
    /// The rules as a JavaScript expression: a string, with each placeholder replaced by its URL resolved against the module's own, quoted so any URL can stand there.
    pub fn expression(&self) -> String {
        let quoted = |text: &str| serde_json::Value::from(text).to_string();
        let mut parts = Vec::new();
        let mut text = String::new();
        let mut rest = self.code.as_str();
        while let Some(at) = rest.find(PLACEHOLDER) {
            let after = &rest[at + PLACEHOLDER.len()..];
            let digits = after.len() - after.trim_start_matches(|c: char| c.is_ascii_digit()).len();
            let url = after[..digits]
                .parse::<usize>()
                .ok()
                .and_then(|index| self.spliced.get(index));
            match (url, after[digits..].strip_prefix("__")) {
                (Some(url), Some(tail)) => {
                    let before = &rest[..at];
                    let (before, tail) = match (before.strip_suffix('"'), tail.strip_prefix('"')) {
                        (Some(before), Some(tail)) => (before, tail),
                        _ => (before, tail),
                    };
                    text.push_str(before);
                    text.push('"');
                    parts.push(quoted(&text));
                    parts.push(format!("new URL({}, import.meta.url).href", quoted(url)));
                    text = String::from("\"");
                    rest = tail;
                }
                _ => {
                    text.push_str(&rest[..at + PLACEHOLDER.len()]);
                    rest = after;
                }
            }
        }
        text.push_str(rest);
        parts.push(quoted(&text));
        parts.join(" + ")
    }
}

/// Where the local references of a combined stylesheet point.
enum Refs<'a> {
    /// The build's stylesheet, which sits in `assets/` beside the copies of the project files it references.
    Stylesheet(&'a mut Assets),
    /// The rules of a scoped stylesheet's module, which a constructable stylesheet resolves against the page: absolute URLs under an absolute base, and placeholders under `./`.
    Module(&'a mut Assets),
    /// The dev server, which serves each file at its own URL.
    Served(&'a dyn Fn(&Path) -> String),
    /// The unbundled output, which keeps the project's layout: a placeholder for each file, by its path from the folder of the module that holds the rules.
    Mirrored(PathBuf),
}

struct Combiner<'a> {
    root: &'a Path,
    base: &'a str,
    refs: Refs<'a>,
    /// Each file inlined so far, with the chain of conditions it was imported under.
    seen: HashSet<(PathBuf, String)>,
    /// Whether a layer has been declared so far, by an `@layer` statement or block or a local import with `layer()`.
    layered: bool,
    hoisted: Vec<String>,
    spliced: Vec<String>,
    warnings: Vec<String>,
}

/// Resolves an `@import`: relative to the stylesheet, root-absolute against the project, and a bare name in the nearest `node_modules` above the stylesheet, through a package's `style` field.
pub fn find_import(root: &Path, folder: &Path, url: &str) -> Option<PathBuf> {
    let path = percent_decode(url.split(['?', '#']).next().unwrap_or(url));
    if let Some(absolute) = path.strip_prefix('/') {
        let file = root.join(absolute);
        return file.is_file().then_some(file);
    }
    let relative = folder.join(&path);
    if relative.is_file() {
        return Some(relative);
    }
    if path.starts_with('.') {
        return None;
    }
    for ancestor in folder.ancestors() {
        let package = ancestor.join("node_modules").join(&path);
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
    }
    None
}

/// What the browser will skip of a stylesheet, as lightningcss reads it with error recovery: each warning, or the error that stops it, with the file and the position.
pub fn problems(source: &str, name: &str) -> Vec<String> {
    let warnings = Arc::new(RwLock::new(Vec::new()));
    let mut found = match StyleSheet::parse(
        source,
        ParserOptions {
            filename: name.to_string(),
            error_recovery: true,
            warnings: Some(warnings.clone()),
            ..ParserOptions::default()
        },
    ) {
        Ok(_) => Vec::new(),
        Err(error) => vec![located_error(&error, name)],
    };
    if let Ok(list) = warnings.read() {
        found.extend(
            list.iter()
                .map(|warning: &Error<ParserError>| located_error(warning, name)),
        );
    }
    found
}

/// A stylesheet with its relative `url(...)` and `@import` references made absolute through `url_of`, for a `<style>` element the dev server puts in the page, which resolves references against the page instead of the stylesheet. Root-absolute and remote references stay as written.
pub fn absolute_urls(
    file: &Path,
    root: &Path,
    url_of: impl Fn(&Path) -> String,
) -> io::Result<String> {
    let source = fs::read_to_string(file)?;
    let name = shown(root, file);
    let sheet = StyleSheet::parse(
        &source,
        ParserOptions {
            filename: name.clone(),
            error_recovery: true,
            ..ParserOptions::default()
        },
    )
    .map_err(|error| io::Error::other(located_error(&error, &name)))?;
    let output = sheet
        .to_css(PrinterOptions {
            analyze_dependencies: Some(DependencyOptions {
                remove_imports: false,
            }),
            ..PrinterOptions::default()
        })
        .map_err(|error| io::Error::other(located_error(&error, &name)))?;
    let folder = file.parent().unwrap_or(Path::new("."));
    let mut code = output.code;
    for dependency in output.dependencies.unwrap_or_default() {
        let (url, placeholder, found) = match dependency {
            Dependency::Url(reference) => {
                let path = percent_decode(
                    reference
                        .url
                        .split(['?', '#'])
                        .next()
                        .unwrap_or(&reference.url),
                );
                let found = folder.join(path);
                (
                    reference.url,
                    reference.placeholder,
                    found.is_file().then_some(found),
                )
            }
            Dependency::Import(import) => {
                let found = find_import(root, folder, &import.url);
                (import.url, import.placeholder, found)
            }
        };
        let replaced = match found {
            Some(path) if !(url.is_empty() || is_remote(&url) || url.starts_with('/')) => {
                format!("{}{}", url_of(&canonical(&path)?), suffix(&url))
            }
            _ => url,
        };
        code = code.replace(&placeholder, &escape(&replaced));
    }
    Ok(code)
}

impl<'a> Combiner<'a> {
    fn new(root: &'a Path, base: &'a str, refs: Refs<'a>) -> Self {
        Self {
            root,
            base,
            refs,
            seen: HashSet::new(),
            layered: false,
            hoisted: Vec::new(),
            spliced: Vec::new(),
            warnings: Vec::new(),
        }
    }

    /// The URL a `url(...)` gets in the output.
    fn rewrite_url(&mut self, file: &Path, url: &str) -> io::Result<String> {
        if url.is_empty() || is_remote(url) {
            return Ok(url.to_string());
        }
        let folder = file.parent().unwrap_or(Path::new("."));
        if let Refs::Served(url_of) = &self.refs {
            let path = percent_decode(url.split(['?', '#']).next().unwrap_or(url));
            let found = folder.join(path);
            if url.starts_with('/') || !found.is_file() {
                return Ok(url.to_string());
            }
            reach(self.root, file, &found)?;
            return Ok(format!("{}{}", url_of(&canonical(&found)?), suffix(url)));
        }
        if let Refs::Mirrored(module) = &self.refs {
            let path = percent_decode(url.split(['?', '#']).next().unwrap_or(url));
            let found = folder.join(path);
            if url.starts_with('/') || !found.is_file() {
                return Ok(url.to_string());
            }
            reach(self.root, file, &found)?;
            let from_module = relative(module, &canonical(&found)?);
            self.spliced.push(format!("{from_module}{}", suffix(url)));
            return Ok(format!("{PLACEHOLDER}{}__", self.spliced.len() - 1));
        }
        let (assets, module) = match &mut self.refs {
            Refs::Stylesheet(assets) => (assets, false),
            Refs::Module(assets) => (assets, true),
            Refs::Served(_) | Refs::Mirrored(_) => return Ok(url.to_string()),
        };
        let from_root = match locate(self.root, folder, url) {
            Located::Public(path) if !module => {
                return Ok(format!(
                    "{}{}",
                    public_url(self.base, &path, 1),
                    suffix(url)
                ));
            }
            Located::File(found) if !module => {
                reach(self.root, file, &found)?;
                return Ok(format!("{}{}", assets.copy(&found)?, suffix(url)));
            }
            Located::Public(path) => path,
            Located::File(found) => {
                reach(self.root, file, &found)?;
                format!("assets/{}", assets.copy(&found)?)
            }
            Located::Missing => {
                self.warnings.push(format!(
                    "{} refers to {url}, which is in neither the public folder nor the project; it is left as written",
                    shown(self.root, file)
                ));
                return Ok(url.to_string());
            }
        };
        if self.base != "./" {
            return Ok(format!("{}{from_root}{}", self.base, suffix(url)));
        }
        self.spliced.push(format!("../{from_root}{}", suffix(url)));
        Ok(format!("{PLACEHOLDER}{}__", self.spliced.len() - 1))
    }

    /// Fails when a scoped stylesheet imports a remote one, which a constructable stylesheet cannot load.
    fn refuse_remote(&self, file: &Path) -> io::Result<()> {
        match self.hoisted.first() {
            Some(rule) => Err(io::Error::other(format!(
                "{}: {rule} imports a remote stylesheet, which a scoped stylesheet cannot load; link it from index.html or import it from a global stylesheet",
                shown(self.root, file)
            ))),
            None => Ok(()),
        }
    }

    /// The scoped stylesheet's rules with what its module needs besides.
    fn scoped(self, code: String) -> Scoped {
        let mut files: Vec<PathBuf> = self.seen.into_iter().map(|(file, _)| file).collect();
        files.sort();
        files.dedup();
        Scoped {
            code,
            spliced: self.spliced,
            files,
            warnings: self.warnings,
        }
    }

    /// One stylesheet with its local imports inlined: each file once under each chain of `conditions` it is imported under, since the browser applies a stylesheet imported again under other conditions again.
    fn read(&mut self, file: &Path, conditions: &str) -> io::Result<String> {
        let file = canonical(file).map_err(|error| located(self.root, file, error))?;
        if !self.seen.insert((file.clone(), conditions.to_string())) {
            return Ok(String::new());
        }
        let source = fs::read_to_string(&file).map_err(|error| located(self.root, &file, error))?;
        let name = shown(self.root, &file);
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
                    self.layered = true;
                }
                Prelude::Import(import) => {
                    if is_remote(&import.url) {
                        if !conditions.is_empty() {
                            return Err(io::Error::other(format!(
                                "{name}:{}: @import \"{}\" is a remote stylesheet in a stylesheet imported under conditions, which it would lose when it moves to the top of the combined stylesheet; import it from a stylesheet imported without conditions, or give the import those conditions",
                                import.line, import.url
                            )));
                        }
                        if import.layer.is_some() && self.layered {
                            return Err(io::Error::other(format!(
                                "{name}:{}: @import \"{}\" puts a remote stylesheet in a layer after other layers are declared, and moving it to the top of the combined stylesheet would change the order of the layers; save the stylesheet in the project and import it from there",
                                import.line, import.url
                            )));
                        }
                        self.hoisted.push(import.rule);
                        continue;
                    }
                    let Some(target) = find_import(self.root, &folder, &import.url) else {
                        return Err(io::Error::new(
                            io::ErrorKind::NotFound,
                            format!(
                                "{name}:{}: @import \"{}\" names no file next to the stylesheet, in the project, or in node_modules",
                                import.line, import.url
                            ),
                        ));
                    };
                    reach(self.root, &file, &target)?;
                    let mut nested = conditions.to_string();
                    if import.layer.is_some() || import.supports.is_some() || import.media.is_some()
                    {
                        nested.push_str(&format!(
                            "|{:?}|{:?}|{:?}",
                            import.layer, import.supports, import.media
                        ));
                    }
                    let mut inner = self.read(&target, &nested)?;
                    if import.layer.is_some() {
                        self.layered = true;
                    }
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
        if body.contains("@layer") {
            self.layered = true;
        }
        out.push_str(&body);
        out.push('\n');
        Ok(out)
    }
}

/// A stylesheet lowered for the supported browsers and, when `minify` is true, minified.
fn lowered(text: &str, name: &str, minify: bool) -> io::Result<String> {
    let mut sheet = StyleSheet::parse(
        text,
        ParserOptions {
            filename: name.to_string(),
            error_recovery: true,
            ..ParserOptions::default()
        },
    )
    .map_err(|error| io::Error::other(located_error(&error, name)))?;
    sheet
        .minify(MinifyOptions {
            targets: targets(),
            ..MinifyOptions::default()
        })
        .map_err(|error| io::Error::other(located_error(&error, name)))?;
    Ok(sheet
        .to_css(PrinterOptions {
            minify,
            targets: targets(),
            ..PrinterOptions::default()
        })
        .map_err(|error| io::Error::other(located_error(&error, name)))?
        .code)
}

/// Combines stylesheets, in order, into one: imports inlined, references rewritten, lowered for the supported browsers, and minified unless `options.minify` is false. Remote imports move to the top, where CSS requires them.
pub fn bundle(files: &[PathBuf], options: &Options, assets: &mut Assets) -> io::Result<Bundled> {
    let mut combiner = Combiner::new(options.root, options.base, Refs::Stylesheet(assets));
    let mut body = String::new();
    for file in files {
        body.push_str(&combiner.read(file, "")?);
    }
    let mut combined = combiner.hoisted.join("\n");
    combined.push('\n');
    combined.push_str(&body);
    Ok(Bundled {
        code: lowered(&combined, "the combined stylesheet", options.minify)?,
        warnings: combiner.warnings,
    })
}

/// The rules of a stylesheet imported with `?scoped`, for the module the build writes in its place: imports inlined, references rewritten, lowered, and minified as `bundle` does. A constructable stylesheet resolves references against the page, so each one is an absolute URL under an absolute base and, under `./`, a placeholder the module resolves against its own URL. A remote `@import` fails, since a constructable stylesheet loads no imports.
pub fn bundle_scoped(file: &Path, options: &Options, assets: &mut Assets) -> io::Result<Scoped> {
    let mut combiner = Combiner::new(options.root, options.base, Refs::Module(assets));
    let body = combiner.read(file, "")?;
    combiner.refuse_remote(file)?;
    let code = lowered(&body, &shown(options.root, file), options.minify)?;
    Ok(combiner.scoped(code))
}

/// A stylesheet imported with `?scoped`, for the module the unbundled output writes next to it: imports inlined as the build inlines them and each relative reference a placeholder the module resolves against its own URL, which sits beside the stylesheet in the copied project. The rules are otherwise as written, as the copied stylesheets are. A remote `@import` fails, as it does in the build.
pub fn mirrored_scoped(file: &Path, root: &Path) -> io::Result<Scoped> {
    let folder = canonical(file.parent().unwrap_or(root))?;
    let mut combiner = Combiner::new(root, "/", Refs::Mirrored(folder));
    let code = combiner.read(file, "")?;
    combiner.refuse_remote(file)?;
    Ok(combiner.scoped(code))
}

/// A stylesheet imported with `?scoped`, as the dev server serves it: imports inlined as the build inlines them and each relative reference pointed at the URL `url_of` gives its file, since a constructable stylesheet resolves references against the page; the rules are otherwise as written. A remote `@import` fails, as it does in the build.
pub fn served_scoped(
    file: &Path,
    root: &Path,
    url_of: &dyn Fn(&Path) -> String,
) -> io::Result<Scoped> {
    let mut combiner = Combiner::new(root, "/", Refs::Served(url_of));
    let code = combiner.read(file, "")?;
    combiner.refuse_remote(file)?;
    Ok(combiner.scoped(code))
}

#[cfg(test)]
mod tests {
    use super::{
        Assets, Options, bundle, bundle_scoped, canonical, encoded, mirrored_scoped, public_url,
        relative, served_scoped, shown,
    };
    use std::fs;
    use std::path::{Path, PathBuf};

    /// A project folder with `files`, canonical as the build's own root is, so a temporary folder under an 8.3 short name, as on GitHub's Windows runners, compares equal to the canonical paths of its stylesheets.
    fn project(name: &str, files: &[(&str, &str)]) -> PathBuf {
        let root = std::env::temp_dir().join(format!("zerolith-css-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        for (path, text) in files {
            let file = root.join(path);
            fs::create_dir_all(file.parent().unwrap()).unwrap();
            fs::write(file, text).unwrap();
        }
        super::canonical(&root).unwrap()
    }

    fn run(root: &Path, files: &[&str], base: &str, minify: bool) -> (String, Vec<String>) {
        let mut assets = Assets::new(root.join("dist/assets"));
        let options = Options { root, base, minify };
        let paths: Vec<PathBuf> = files.iter().map(|file| root.join(file)).collect();
        let bundled = bundle(&paths, &options, &mut assets).unwrap();
        (bundled.code, bundled.warnings)
    }

    #[test]
    fn inlines_a_stylesheet_again_under_other_conditions_and_refuses_what_hoisting_would_change() {
        let root = project(
            "conditions",
            &[
                (
                    "src/app.css",
                    "@import \"./reset.css\" print;\n@import \"./reset.css\";\n@import \"./reset.css\";\n.app { color: red; }\n",
                ),
                ("src/reset.css", "* { margin: 0; }\n"),
                (
                    "src/print.css",
                    "@import \"https://fonts.example/a.css\";\n.p { color: red; }\n",
                ),
                ("src/nested.css", "@import \"./print.css\" print;\n"),
                (
                    "src/layered.css",
                    "@import \"./reset.css\" layer(reset);\n@import \"https://fonts.example/b.css\" layer(fonts);\n",
                ),
            ],
        );
        let (code, _) = run(&root, &["src/app.css"], "/", true);
        assert_eq!(code.matches("margin:0").count(), 2, "{code}");
        assert!(code.contains("@media print{*{margin:0}}"), "{code}");
        assert!(
            code.replace("@media print{*{margin:0}}", "")
                .contains("*{margin:0}"),
            "{code}"
        );
        let refused = |file: &str| {
            let mut assets = Assets::new(root.join("dist/assets"));
            let options = Options {
                root: &root,
                base: "/",
                minify: false,
            };
            bundle(&[root.join(file)], &options, &mut assets)
                .unwrap_err()
                .to_string()
        };
        let nested = refused("src/nested.css");
        assert!(
            nested.contains("src/print.css:1: @import \"https://fonts.example/a.css\" is a remote stylesheet in a stylesheet imported under conditions"),
            "{nested}"
        );
        let layered = refused("src/layered.css");
        assert!(
            layered.contains("src/layered.css:2: @import \"https://fonts.example/b.css\" puts a remote stylesheet in a layer after other layers are declared"),
            "{layered}"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn refuses_a_reference_from_a_dependency_outside_node_modules() {
        let root = project(
            "reach",
            &[
                ("src/app.css", "@import \"theme\";\n"),
                (
                    "node_modules/theme/package.json",
                    "{\"style\":\"theme.css\"}",
                ),
                (
                    "node_modules/theme/theme.css",
                    "@import \"./base.css\";\n.a { background: url(./dot.svg); }\n.b { background: url(../../.env); }\n",
                ),
                ("node_modules/theme/base.css", ".base { color: red; }\n"),
                (
                    "node_modules/theme/dot.svg",
                    "<svg xmlns=\"http://www.w3.org/2000/svg\"/>",
                ),
                (".env", "SECRET=1\n"),
            ],
        );
        let mut assets = Assets::new(root.join("dist/assets"));
        let options = Options {
            root: &root,
            base: "/",
            minify: false,
        };
        let error = bundle(&[root.join("src/app.css")], &options, &mut assets)
            .unwrap_err()
            .to_string();
        assert!(
            error.contains("node_modules/theme/theme.css: refers to .env, outside the node_modules folder it is installed in"),
            "{error}"
        );
        fs::write(
            root.join("node_modules/theme/theme.css"),
            "@import \"./base.css\";\n.a { background: url(./dot.svg); }\n",
        )
        .unwrap();
        let (code, _) = run(&root, &["src/app.css"], "/", false);
        assert!(code.contains(".base") && code.contains("dot-"), "{code}");
        let _ = fs::remove_dir_all(&root);
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
        assert_eq!(
            code.matches("margin: 0").count(),
            2,
            "reset.css again, outside the layer that app.css imports it into: {code}"
        );
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
    fn escapes_every_control_character_in_a_string() {
        assert_eq!(super::escape("a\rb\u{c}c\nd"), "a\\d b\\c c\\a d");
        assert_eq!(super::escape("q\"s\\"), "q\\\"s\\\\");
        assert_eq!(super::escape("n\0"), "n\u{fffd}");
    }

    #[test]
    fn encodes_file_names_that_a_url_would_misread() {
        assert_eq!(encoded("icons/c#.svg"), "icons/c%23.svg");
        assert_eq!(encoded("a b/100%.png"), "a%20b/100%25.png");
        assert_eq!(encoded("\u{e9}t\u{e9}.png"), "%C3%A9t%C3%A9.png");
        assert_eq!(encoded("ok-_.~:@/x.png"), "ok-_.~:@/x.png");
        let root = project(
            "encoded",
            &[
                ("public/c#.svg", "<svg/>"),
                ("src/a#b c.png", "png"),
                (
                    "src/app.css",
                    ".a { background: url(/c%23.svg); }\n.b { background: url(\"./a%23b%20c.png\"); }\n",
                ),
            ],
        );
        let (code, warnings) = run(&root, &["src/app.css"], "/", false);
        assert!(warnings.is_empty(), "{warnings:?}");
        assert!(code.contains("url(\"/c%23.svg\")"), "{code}");
        assert!(code.contains("url(\"a_b_c-"), "{code}");
        let copied: Vec<String> = fs::read_dir(root.join("dist/assets"))
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert!(
            copied
                .iter()
                .any(|name| name.starts_with("a_b_c-") && name.ends_with(".png")),
            "{copied:?}"
        );
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

    #[test]
    fn bundles_a_scoped_stylesheet_for_its_module() {
        let root = project(
            "scoped",
            &[
                (
                    "src/card.css",
                    "@import \"./tokens.css\";\n:scope { padding: 4px; background: url(./dot.svg); }\n.title { color: var(--ink); & em { font-style: normal; } }\n.mark { background: url(/mark.svg); }\n",
                ),
                ("src/tokens.css", ":scope { --ink: red; }\n"),
                ("src/dot.svg", "<svg/>"),
                ("public/mark.svg", "<svg/>"),
            ],
        );
        let mut assets = Assets::new(root.join("dist/assets"));
        let card = root.join("src/card.css");
        let absolute = Options {
            root: &root,
            base: "/app/",
            minify: true,
        };
        let scoped = bundle_scoped(&card, &absolute, &mut assets).unwrap();
        let code = &scoped.code;
        assert!(code.contains("--ink:red"), "{code}");
        assert!(code.contains("url(/app/assets/dot-"), "{code}");
        assert!(code.contains("url(/app/mark.svg)"), "{code}");
        assert!(code.contains(".title em{font-style:normal}"), "{code}");
        assert!(!code.contains("@import"), "{code}");
        assert!(scoped.spliced.is_empty());
        assert_eq!(
            scoped.expression(),
            serde_json::Value::from(code.as_str()).to_string()
        );
        assert_eq!(scoped.files.len(), 2);

        let relative_base = Options {
            root: &root,
            base: "./",
            minify: true,
        };
        let scoped = bundle_scoped(&card, &relative_base, &mut assets).unwrap();
        assert_eq!(scoped.spliced.len(), 2, "{:?}", scoped.spliced);
        let expression = scoped.expression();
        assert!(
            expression.contains("new URL(\"../mark.svg\", import.meta.url).href"),
            "{expression}"
        );
        assert!(
            expression.contains("url(\\\"\" + new URL(\"../assets/dot-"),
            "{expression}"
        );
        assert!(!expression.contains("__zerolith_url_"), "{expression}");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn refuses_a_remote_import_in_a_scoped_stylesheet() {
        let root = project(
            "scoped-remote",
            &[(
                "card.css",
                "@import \"https://fonts.example/a.css\";\n.a { color: red; }\n",
            )],
        );
        let mut assets = Assets::new(root.join("dist/assets"));
        let options = Options {
            root: &root,
            base: "/",
            minify: true,
        };
        let error = bundle_scoped(&root.join("card.css"), &options, &mut assets)
            .unwrap_err()
            .to_string();
        assert!(
            error.starts_with("card.css: @import")
                && error.contains("a scoped stylesheet cannot load"),
            "{error}"
        );
        let url_of = |path: &Path| format!("/{}", shown(&root, path));
        assert!(served_scoped(&root.join("card.css"), &root, &url_of).is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn serves_a_scoped_stylesheet_with_imports_inlined_and_references_absolute() {
        let root = project(
            "scoped-dev",
            &[
                (
                    "src/card.css",
                    "@import \"./tokens.css\";\n.a { background: url(./dot.svg); }\n.b { background: url(/mark.svg); }\n",
                ),
                ("src/tokens.css", ":scope { --ink: red; }\n"),
                ("src/dot.svg", "<svg/>"),
            ],
        );
        let root = canonical(&root).unwrap();
        let url_of = |path: &Path| format!("/{}", shown(&root, path));
        let scoped = served_scoped(&root.join("src/card.css"), &root, &url_of).unwrap();
        let code = &scoped.code;
        assert!(code.contains("--ink: red"), "{code}");
        assert!(code.contains("/src/dot.svg"), "{code}");
        assert!(code.contains("/mark.svg"), "{code}");
        assert!(!code.contains("@import"), "{code}");
        assert_eq!(
            scoped.files,
            [root.join("src/card.css"), root.join("src/tokens.css")]
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn points_references_at_the_copied_files_for_the_unbundled_output() {
        let root = project(
            "scoped-mirror",
            &[
                (
                    "src/ui/card.css",
                    "@import \"../tokens.css\";\n.a { background: url(./dot.svg); }\n",
                ),
                ("src/tokens.css", ".t { background: url(./grain.png); }\n"),
                ("src/ui/dot.svg", "<svg/>"),
                ("src/grain.png", "PNG"),
            ],
        );
        let root = canonical(&root).unwrap();
        let scoped = mirrored_scoped(&root.join("src/ui/card.css"), &root).unwrap();
        let mut spliced = scoped.spliced.clone();
        spliced.sort();
        assert_eq!(spliced, ["../grain.png", "dot.svg"]);
        let expression = scoped.expression();
        assert!(
            expression.contains("new URL(\"dot.svg\", import.meta.url).href")
                && expression.contains("new URL(\"../grain.png\", import.meta.url).href"),
            "{expression}"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn writes_paths_relative_to_a_folder() {
        assert_eq!(
            relative(Path::new("/p/app"), Path::new("/p/app/src/card.css")),
            "src/card.css"
        );
        assert_eq!(
            relative(Path::new("/p/app"), Path::new("/p/ui/card.css")),
            "../ui/card.css"
        );
        assert_eq!(
            relative(
                Path::new("/p/app/src/ui"),
                Path::new("/p/app/src/grain.png")
            ),
            "../grain.png"
        );
    }
}
