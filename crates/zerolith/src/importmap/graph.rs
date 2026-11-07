//! The modules a page reaches through its own files, from its module
//! scripts to every relative import.

use std::collections::BTreeSet;
use std::fs;
use std::io;
use std::path::Path;

use super::imports::relative_imports;

/// What a page's own module scripts load: the page's modules, in load order, and the bare specifiers they import, which decide what the import map vendors and preloads.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct PageGraph {
    /// The root-relative URLs of the page's module scripts with a `src`, which the page loads itself.
    pub entries: Vec<String>,
    /// The root-relative URLs of the modules the page loads statically, the entries first, each once, in load order.
    pub modules: Vec<String>,
    /// The bare specifiers the modules the page loads statically import statically, inline module scripts included, which the page loads before it runs.
    pub bare: BTreeSet<String>,
    /// The bare specifiers reached only through `import()`, by a module loaded statically or by one `import()` loads, which the page loads when asked.
    pub lazy: BTreeSet<String>,
    /// True when a module of the page loads another through an `import()` the walk cannot follow, so the page may reach any entry.
    pub open: bool,
}

impl PageGraph {
    /// Joins another page's graph into this one, for a build with several pages, which vendor what any of them loads.
    pub fn extend(&mut self, other: &PageGraph) {
        for module in &other.modules {
            if !self.modules.contains(module) {
                self.modules.push(module.clone());
            }
        }
        for entry in &other.entries {
            if !self.entries.contains(entry) {
                self.entries.push(entry.clone());
            }
        }
        self.bare.extend(other.bare.iter().cloned());
        self.lazy.extend(other.lazy.iter().cloned());
        self.open |= other.open;
    }

    /// True when the walk cannot bound what the page loads: a module loads another through an `import()` it cannot follow, or the page's modules import nothing from the packages, where the page may load them some way the walk does not see. The map then holds every entry, as a run without a page writes it, while the preloads still follow what the walk found.
    pub fn unbounded(&self) -> bool {
        self.open || (self.bare.is_empty() && self.lazy.is_empty())
    }
}

/// The URL a relative or root-relative specifier names from a module at `from`, both root-relative, or None when it climbs above the root or holds a query, a fragment, or a path the browser would read otherwise.
pub(super) fn resolve_url(from: &str, specifier: &str) -> Option<String> {
    let path = specifier.split(['?', '#']).next().unwrap_or(specifier);
    if path != specifier {
        return None;
    }
    let (from, path) = match path.strip_prefix('/') {
        Some(rooted) => ("page", format!("./{rooted}")),
        None => (from.trim_start_matches('/'), path.to_string()),
    };
    resolve_within(from, &path).map(|resolved| format!("/{resolved}"))
}

/// Reads the graph of a page's module scripts under `root`, where the page itself is `page`, root-relative: each module is found as `zerolith dev` finds it, a `.ts`, `.tsx`, `.jsx`, or `.mts` source standing in for the `.js` a URL names, and read as the browser would run it. Relative and root-relative imports are followed, the static ones in load order and the ones `import()` loads behind them; a file that is not a script, or that is missing, is left to the browser, and an `import()` the walk cannot follow marks the graph open.
pub fn page_graph(root: &Path, page: &str, html: &str) -> io::Result<PageGraph> {
    let folder = page.rsplit_once('/').map_or("", |(folder, _)| folder);
    let from_page = |url: &str| -> Option<String> {
        let url = url.split(['?', '#']).next().unwrap_or(url);
        if url.starts_with('/') {
            Some(url.to_string())
        } else {
            resolve_url(&format!("{folder}/page"), &format!("./{url}"))
        }
    };
    let scanned = crate::html::scan(html);
    let mut entries: Vec<String> = scanned
        .scripts
        .iter()
        .filter_map(|script| from_page(&script.url))
        .collect();
    entries.dedup();
    let mut graph = PageGraph {
        entries,
        ..PageGraph::default()
    };
    let mut queue: Vec<(String, bool)> = Vec::new();
    for (start, end) in &scanned.inline_modules {
        let imports = relative_imports(&html[*start..*end]).map_err(|error| {
            io::Error::other(format!(
                "{page}: an inline module script does not parse: {error}"
            ))
        })?;
        graph.bare.extend(imports.bare);
        graph.lazy.extend(imports.bare_dynamically);
        graph.open |= imports.computed;
        queue.extend(
            imports
                .dynamically
                .iter()
                .chain(imports.rooted_dynamically.iter())
                .filter_map(|specifier| from_page(specifier))
                .map(|url| (url, true)),
        );
        queue.extend(
            imports
                .statically
                .iter()
                .chain(imports.rooted.iter())
                .filter_map(|specifier| from_page(specifier))
                .map(|url| (url, false)),
        );
    }
    queue.extend(graph.entries.iter().map(|url| (url.clone(), false)));
    queue.reverse();
    let mut seen = BTreeSet::new();
    while let Some((url, dynamic)) = queue.pop() {
        if !seen.insert(url.clone()) {
            continue;
        }
        let Some(file) = crate::server::resolve(root, &url) else {
            continue;
        };
        if !crate::modules::is_script(&file) || !file.is_file() {
            continue;
        }
        if !dynamic {
            graph.modules.push(url.clone());
        }
        let source = fs::read_to_string(&file)?;
        let extension = file
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or("");
        let code = if crate::transform::transforms(extension) {
            crate::transform::transform(&file, &source)
                .map_err(|error| io::Error::other(format!("{url}: {error}")))?
        } else {
            source
        };
        let imports = relative_imports(&code)
            .map_err(|error| io::Error::other(format!("{url} does not parse: {error}")))?;
        if dynamic {
            graph.lazy.extend(imports.bare);
        } else {
            graph.bare.extend(imports.bare);
        }
        graph.lazy.extend(imports.bare_dynamically);
        graph.open |= imports.computed;
        let mut next: Vec<(String, bool)> = imports
            .dynamically
            .iter()
            .chain(imports.rooted_dynamically.iter())
            .filter_map(|specifier| resolve_url(&url, specifier))
            .map(|target| (target, true))
            .collect();
        next.extend(
            imports
                .statically
                .iter()
                .chain(imports.rooted.iter())
                .filter_map(|specifier| resolve_url(&url, specifier))
                .map(|target| (target, dynamic)),
        );
        next.reverse();
        queue.extend(next);
    }
    Ok(graph)
}

/// Resolves a relative specifier against a module's path inside its package, or None when it climbs above the package's folder, where the browser would look for a file that was not vendored, or when it holds an empty segment, a percent escape, a backslash, or a trailing slash, which the browser resolves as URL paths do and a file path does not.
pub(super) fn resolve_within(from: &str, specifier: &str) -> Option<String> {
    if specifier.contains(['%', '\\']) || specifier.ends_with('/') {
        return None;
    }
    let mut segments: Vec<&str> = from.split('/').collect();
    segments.pop();
    for (index, part) in specifier.split('/').enumerate() {
        match part {
            "" if index > 0 => return None,
            "." | "" => {}
            ".." => {
                segments.pop()?;
            }
            name => segments.push(name),
        }
    }
    Some(segments.join("/"))
}
