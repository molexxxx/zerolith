//! Combining stylesheets: each local `@import` inlined in place under the
//! conditions it carries, and each reference pointed at its output.

use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use lightningcss::dependencies::{Dependency, DependencyOptions};
use lightningcss::error::{Error, ParserError};
use lightningcss::rules::CssRule;
use lightningcss::stylesheet::{MinifyOptions, ParserOptions, PrinterOptions, StyleSheet};
use lightningcss::traits::ToCss;

use crate::server::percent_decode;

use super::assets::Assets;
use super::paths::{
    Located, canonical, find_import, is_remote, locate, located, public_url, reach, relative,
    shown, suffix,
};
use super::scoped::{PLACEHOLDER, Scoped};
use super::targets;

/// Escapes text for a double-quoted CSS string.
pub(super) fn escape(text: &str) -> String {
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
pub(super) struct Import {
    url: String,
    layer: Option<Option<String>>,
    supports: Option<String>,
    media: Option<String>,
    /// The whole rule, for a remote import moved to the top of the output.
    rule: String,
    line: u32,
}

/// One item of a stylesheet's prelude, the statements before its first other rule.
pub(super) enum Prelude {
    Import(Import),
    /// An `@layer` statement, which fixes the order of layers and must keep its place among the imports.
    Layers(String),
}

fn printed<T: ToCss>(value: &T) -> io::Result<String> {
    value
        .to_css_string(PrinterOptions::default())
        .map_err(|error| io::Error::other(error.to_string()))
}

pub(super) fn located_error<T: std::fmt::Display>(error: &Error<T>, fallback: &str) -> String {
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

/// Where the local references of a combined stylesheet point.
pub(super) enum Refs<'a> {
    /// The build's stylesheet, which sits in `assets/` beside the copies of the project files it references.
    Stylesheet(&'a mut Assets),
    /// The rules of a scoped stylesheet's module, which a constructable stylesheet resolves against the page: absolute URLs under an absolute base, and placeholders under `./`.
    Module(&'a mut Assets),
    /// The dev server, which serves each file at its own URL.
    Served(&'a dyn Fn(&Path) -> String),
    /// The unbundled output, which keeps the project's layout: a placeholder for each file, by its path from the folder of the module that holds the rules.
    Mirrored(PathBuf),
}

pub(super) struct Combiner<'a> {
    pub(super) root: &'a Path,
    pub(super) base: &'a str,
    pub(super) refs: Refs<'a>,
    /// Each file inlined so far, with the chain of conditions it was imported under.
    pub(super) seen: HashSet<(PathBuf, String)>,
    /// Whether a layer has been declared so far, by an `@layer` statement or block or a local import with `layer()`.
    pub(super) layered: bool,
    pub(super) hoisted: Vec<String>,
    pub(super) spliced: Vec<String>,
    pub(super) warnings: Vec<String>,
}

impl<'a> Combiner<'a> {
    pub(super) fn new(root: &'a Path, base: &'a str, refs: Refs<'a>) -> Self {
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
    pub(super) fn refuse_remote(&self, file: &Path) -> io::Result<()> {
        match self.hoisted.first() {
            Some(rule) => Err(io::Error::other(format!(
                "{}: {rule} imports a remote stylesheet, which a scoped stylesheet cannot load; link it from index.html or import it from a global stylesheet",
                shown(self.root, file)
            ))),
            None => Ok(()),
        }
    }

    /// The scoped stylesheet's rules with what its module needs besides.
    pub(super) fn scoped(self, code: String) -> Scoped {
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
    pub(super) fn read(&mut self, file: &Path, conditions: &str) -> io::Result<String> {
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
pub(super) fn lowered(text: &str, name: &str, minify: bool) -> io::Result<String> {
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
