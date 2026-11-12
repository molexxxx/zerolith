//! The stylesheet `zerolith build` writes. The stylesheets the page links and the
//! modules import are read with lightningcss, their local `@import`s inlined
//! in place under the layer, supports, and media conditions they carry, and
//! their `url(...)` references pointed at the public folder or at hashed
//! copies next to the output. The combined stylesheet is then lowered for
//! the oldest supported browsers and, unless asked not to, minified. A
//! stylesheet imported with `?scoped` goes through the same steps on its
//! own, for the module that hands its rules to zerolith.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use lightningcss::dependencies::{Dependency, DependencyOptions};
use lightningcss::error::{Error, ParserError};
use lightningcss::stylesheet::{ParserOptions, PrinterOptions, StyleSheet};
use lightningcss::targets::{Browsers, Targets};

use crate::server::percent_decode;

mod assets;
mod combine;
mod paths;
mod scoped;
#[cfg(test)]
mod tests;

pub use assets::Assets;
use combine::{Combiner, Refs, escape, located_error, lowered};
pub use paths::{
    Located, canonical, encoded, locate, located, plain, project_path, public_url, reach,
    short_hash, shown, suffix,
};
use paths::{find_import, is_remote};
use scoped::Scoped;

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
