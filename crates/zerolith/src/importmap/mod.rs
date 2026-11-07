//! Vendors the installed zerolith packages and writes an import map with
//! integrity hashes and preload links, so a page runs with no build step
//! and no reference into node_modules.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

mod graph;
mod html;
mod imports;
mod plan;
#[cfg(test)]
mod tests;

pub use graph::{PageGraph, page_graph};
use html::html_tags;
pub use html::{covers, import_map_of, page_map, page_tags, update_html};
pub use plan::integrity;
use plan::{
    GIT_ATTRIBUTES, GIT_IGNORE, LICENSE_FILES, plan, reached_by, remove_entry, write_package,
};

/// The packages the import map vendors and the doctor checks, in dependency order: every zerolith package a page loads that depends on nothing outside zerolith. `@zerolith/otel` is left out, since it needs `@opentelemetry/api`.
pub const PACKAGES: [&str; 9] = [
    "zerolith",
    "@zerolith/router",
    "@zerolith/forms",
    "@zerolith/client",
    "@zerolith/a11y",
    "@zerolith/state",
    "@zerolith/browser",
    "@zerolith/i18n",
    "@zerolith/devtools",
];

/// The generated import map, written as `importmap.json` next to the vendored files.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct ImportMap {
    pub imports: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub integrity: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub scopes: BTreeMap<String, BTreeMap<String, String>>,
}

/// What `vendor` produced.
#[derive(Debug, Default)]
pub struct Vendored {
    pub map: ImportMap,
    /// Root-relative URLs of the modules reachable from the mapped entries, for `modulepreload` links.
    pub modules: Vec<String>,
    /// Package name to version, for `doctor`.
    pub versions: BTreeMap<String, String>,
    /// The URL of each package folder this run wrote, or left alone as unreached, ending in `/`, whose entries in a page's map it alone decides.
    pub folders: Vec<String>,
    /// The URLs each vendored module imports statically, relative imports resolved and bare ones through the map.
    pub statics: BTreeMap<String, Vec<String>>,
    /// The files an earlier run left in the package folders this run wrote, which the entries no longer load, for `prune` to remove once the pages that named them are rewritten.
    pub stale: Vec<PathBuf>,
    /// Every folder under the package folders this run wrote, each after its parent, which `prune` removes when pruning leaves it empty.
    written_folders: Vec<PathBuf>,
}

impl Vendored {
    /// Removes the files an earlier run left that the entries no longer load, listed in `stale`, and the folders that leaves empty. A caller runs it once the pages that named those files are written, so a page write that fails leaves a page whose files are all still there. Every removal is tried, and the first that failed is the error, naming its path; what stays is listed as stale again by the next run.
    pub fn prune(&self) -> io::Result<()> {
        let mut failed: Option<io::Error> = None;
        let mut note = |path: &Path, error: io::Error| {
            failed.get_or_insert_with(|| {
                io::Error::new(
                    error.kind(),
                    format!("could not remove {}: {error}", path.display()),
                )
            });
        };
        for file in &self.stale {
            if let Err(error) = remove_entry(file) {
                note(file, error);
            }
        }
        for directory in self.written_folders.iter().rev() {
            let empty = match fs::read_dir(directory) {
                Ok(mut entries) => entries.next().is_none(),
                Err(error) => {
                    note(directory, error);
                    continue;
                }
            };
            if empty && let Err(error) = fs::remove_dir(directory) {
                note(directory, error);
            }
        }
        failed.map_or(Ok(()), Err)
    }

    /// The preload links for one page: the modules its entries load statically, the entries themselves left out since the page names them, then every vendored module the page's bare imports load statically, through the map and the modules' own imports, in a stable order.
    pub fn preloads(&self, page: &PageGraph) -> Vec<String> {
        let mut reached = BTreeSet::new();
        let mut queue: Vec<String> = page
            .bare
            .iter()
            .filter_map(|specifier| self.map.imports.get(specifier).cloned())
            .collect();
        while let Some(url) = queue.pop() {
            if !self.map.integrity.contains_key(&url) || !reached.insert(url.clone()) {
                continue;
            }
            if let Some(next) = self.statics.get(&url) {
                queue.extend(next.iter().cloned());
            }
        }
        let mut modules: Vec<String> = page
            .modules
            .iter()
            .filter(|url| !page.entries.contains(url))
            .cloned()
            .collect();
        modules.extend(
            reached
                .into_iter()
                .filter(|url| url.ends_with(".js") || url.ends_with(".mjs")),
        );
        modules
    }
}

/// Copies each installed package's published modules into `out` under the project root and returns the import map, which lists in `stale` the files an earlier run left that the entries no longer load, for `Vendored::prune` to remove once the page is moved to the new map. With a `page` whose graph the walk could bound, only the entries it reaches are vendored and mapped, and a package it does not reach is left as it is; without one, or with a page the walk could not bound, every entry of every package.
pub fn vendor(
    root: &Path,
    out: &Path,
    development: bool,
    page: Option<&PageGraph>,
) -> io::Result<Vendored> {
    vendor_from(
        &root.join("node_modules"),
        root,
        out,
        development,
        false,
        page,
    )
}

/// Like `vendor`, reading the packages from `packages` (a node_modules folder) and writing under `root/out`, so a build can vendor into its output folder; with `prepare`, every vendored module goes through the template prepare pass and the core's scanner is replaced by its stand-in. Every package is read and checked before anything is written, so a run that a check stops leaves the vendored files the page uses as they were; then each package's files are written in place, and the files an earlier run left that the entries no longer load are listed in `stale` for `Vendored::prune`, which a caller runs once its pages name the new files; a package the page does not reach is neither written nor pruned. The map holds an integrity hash for every file it vendors, the ones `import()` loads included, and `modules` preloads the JavaScript modules the mapped entries load statically.
pub fn vendor_from(
    packages: &Path,
    root: &Path,
    out: &Path,
    development: bool,
    prepare: bool,
    page: Option<&PageGraph>,
) -> io::Result<Vendored> {
    let mut vendored = Vendored::default();
    let base = format!(
        "/{}",
        out.to_string_lossy().replace('\\', "/").trim_matches('/')
    );
    let destination = root.join(out);
    let mut planned = plan(
        packages,
        &destination,
        &base,
        development,
        prepare,
        &mut vendored,
    )?;
    if vendored.map.imports.is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            "no zerolith packages found under node_modules; run npm install first",
        ));
    }
    if let Some(reached) = reached_by(page, &vendored.map.imports, &planned) {
        vendored.map.imports.retain(|_, url| reached.contains(url));
        planned.files.retain(|url, _| reached.contains(url));
        for package in &mut planned.packages {
            let prefix = format!("{base}/{}", package.package);
            let kept: BTreeSet<String> = package
                .writes
                .keys()
                .filter(|file| reached.contains(&format!("{prefix}/{file}")))
                .cloned()
                .collect();
            package.writes.retain(|file, _| {
                kept.contains(file)
                    || LICENSE_FILES.contains(&file.as_str())
                    || file
                        .strip_suffix(".map")
                        .is_some_and(|module| kept.contains(module))
            });
            package.empty = kept.is_empty();
        }
    }
    vendored.statics = planned
        .statics
        .iter()
        .map(|(url, next)| {
            let mut next = next.clone();
            if let Some(edges) = planned.edges.get(url) {
                next.extend(
                    edges
                        .statically
                        .iter()
                        .filter_map(|specifier| vendored.map.imports.get(specifier).cloned()),
                );
            }
            (url.clone(), next)
        })
        .collect();
    let every = PageGraph {
        bare: vendored.map.imports.keys().cloned().collect(),
        ..PageGraph::default()
    };
    vendored.map.integrity = planned.files;
    vendored.modules = vendored.preloads(&every);
    vendored.folders = planned
        .packages
        .iter()
        .map(|package| format!("{base}/{}/", package.package))
        .collect();
    vendored.versions.retain(|name, _| {
        planned
            .packages
            .iter()
            .any(|package| package.package == name && !package.empty)
    });
    for package in &planned.packages {
        if package.empty {
            continue;
        }
        write_package(
            &destination.join(package.package),
            package,
            &mut vendored.stale,
            &mut vendored.written_folders,
        )?;
    }
    fs::create_dir_all(&destination)?;
    fs::write(
        destination.join("importmap.json"),
        format!(
            "{}\n",
            serde_json::to_string_pretty(&vendored.map).map_err(io::Error::other)?
        ),
    )?;
    fs::write(destination.join(".gitattributes"), GIT_ATTRIBUTES)?;
    fs::write(destination.join(".gitignore"), GIT_IGNORE)?;
    Ok(vendored)
}

/// Runs the `importmap` command.
pub fn run(root: &Path, out: &Path, development: bool, html: &[PathBuf]) -> io::Result<()> {
    anstream::println!(
        "{}",
        crate::term::heading(
            "importmap",
            if development {
                "development entries"
            } else {
                "production entries"
            }
        )
    );
    let mut pages = Vec::new();
    let mut every = PageGraph::default();
    for file in html {
        let path = root.join(file);
        let current = fs::read_to_string(&path)?;
        let url = format!(
            "/{}",
            file.to_string_lossy()
                .replace('\\', "/")
                .trim_start_matches('/')
        );
        let graph = page_graph(root, &url, &current)?;
        every.extend(&graph);
        pages.push((file, path, url, current, graph));
    }
    let vendored = vendor(
        root,
        out,
        development,
        (!pages.is_empty()).then_some(&every),
    )?;
    let packages = format!(
        "{} packages into {}",
        vendored.versions.len(),
        out.display()
    );
    anstream::println!(
        "{}",
        crate::term::row("vendored", crate::term::done, packages)
    );
    if pages.is_empty() {
        anstream::println!(
            "\n  {}\n\n{}\n",
            crate::term::muted("Add this to the head of your HTML:"),
            html_tags(&vendored)
        );
        return Ok(());
    }
    for (file, path, url, current, graph) in &pages {
        fs::write(
            path,
            update_html(current, &page_tags(&vendored, url, current, Some(graph))),
        )?;
        anstream::println!(
            "{}",
            crate::term::row("updated", crate::term::done, file.display())
        );
    }
    if let Err(error) = vendored.prune() {
        anstream::println!(
            "{}",
            crate::term::row(
                "warning",
                crate::term::caution,
                format!(
                    "{error}; the pages are written, and the next run removes what this one left"
                )
            )
        );
    }
    anstream::println!();
    Ok(())
}
