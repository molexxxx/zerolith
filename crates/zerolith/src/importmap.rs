//! Vendors the installed zerolith packages and writes an import map with
//! integrity hashes and preload links, so a page runs with no build step
//! and no reference into node_modules.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use base64::Engine;
use oxc_allocator::Allocator;
use oxc_ast::ast::{
    BindingPattern, Expression, ImportExpression, Statement, VariableDeclarationKind,
};
use oxc_ast_visit::{Visit, walk};
use oxc_parser::Parser;
use oxc_span::SourceType;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// The packages the import map vendors and the doctor checks, in dependency order: every zerolith package a page loads that depends on nothing outside zerolith. `@zerolith/otel` is left out, since it needs `@opentelemetry/api`.
pub const PACKAGES: [&str; 7] = [
    "zerolith",
    "@zerolith/router",
    "@zerolith/forms",
    "@zerolith/client",
    "@zerolith/a11y",
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
}

impl Vendored {
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

/// The paths a module imports, read with the parser, so minified code such as `from"./x.js"` and an import for its effects alone count, and text that only looks like an import does not.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Imports {
    /// The relative imports and re-exports, in source order, which load before the module runs.
    pub statically: Vec<String>,
    /// The literal relative paths `import()` loads when the module asks for them, in source order.
    pub dynamically: Vec<String>,
    /// The bare specifiers imported or re-exported, such as `zerolith`, which an import map resolves, in source order.
    pub bare: Vec<String>,
    /// The bare specifiers `import()` loads with a literal, in source order.
    pub bare_dynamically: Vec<String>,
    /// The root-relative paths imported or re-exported, such as `/src/app.js`, in source order.
    pub rooted: Vec<String>,
    /// The root-relative paths `import()` loads with a literal, in source order.
    pub rooted_dynamically: Vec<String>,
    /// True when an `import()` names its module with an expression the module does not state, as `import(name)` with a name computed at run time does; a literal, a template without expressions, and a top-level `const` holding one are followed.
    pub computed: bool,
}

/// The path an `import()` call names, when it is a string or a template with no substitutions, as a minifier may write one. The split check reads strings only, as the Vite plugin does; vendoring reads published, minified modules.
/// The text of a string literal or a template without expressions.
fn literal_text<'a>(expression: &Expression<'a>) -> Option<&'a str> {
    match expression {
        Expression::StringLiteral(literal) => literal.value.as_str(),
        Expression::TemplateLiteral(template) if template.expressions.is_empty() => template
            .quasis
            .first()
            .and_then(|quasi| quasi.value.cooked)
            .and_then(|cooked| cooked.as_str()),
        _ => None,
    }
}

/// Collects the paths of `import()` calls anywhere in a module: literals, and identifiers of the module's top-level `const` declarations that hold one; any other argument marks the imports computed.
struct DynamicImports<'c> {
    constants: &'c BTreeMap<String, String>,
    paths: Vec<String>,
    computed: bool,
}

impl<'a> Visit<'a> for DynamicImports<'_> {
    fn visit_import_expression(&mut self, it: &ImportExpression<'a>) {
        let path = match &it.source {
            Expression::Identifier(identifier) => {
                self.constants.get(identifier.name.as_str()).cloned()
            }
            source => literal_text(source).map(str::to_string),
        };
        match path {
            Some(path) => self.paths.push(path),
            None => self.computed = true,
        }
        walk::walk_import_expression(self, it);
    }
}

/// True for a specifier that names a file relative to the module.
fn is_relative(specifier: &str) -> bool {
    specifier.starts_with("./") || specifier.starts_with("../")
}

/// True for a bare specifier, one an import map resolves: not relative, not a root-relative or protocol-relative path, and not a URL with a scheme.
fn is_bare(specifier: &str) -> bool {
    !specifier.is_empty()
        && !is_relative(specifier)
        && !specifier.starts_with('/')
        && !specifier.contains(':')
}

/// True for a root-relative path, which the browser resolves against the origin; `//` starts a protocol-relative URL instead.
fn is_rooted(specifier: &str) -> bool {
    specifier.starts_with('/') && !specifier.starts_with("//")
}

/// A module's relative imports. A module that does not parse is an error with the parser's message and the line and column where it stopped, without the code frame other parse errors show, since a minified module is one long line; a dependency missed here would load without its integrity hash.
pub fn relative_imports(source: &str) -> Result<Imports, String> {
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, SourceType::mjs()).parse();
    if let Some(diagnostic) = parsed.diagnostics.into_vec().into_iter().next() {
        return Err(match diagnostic.labels.first() {
            Some(label) => {
                let (line, column) = crate::lint::position(source, label.offset());
                format!("{diagnostic} at line {line}, column {column}")
            }
            None => diagnostic.to_string(),
        });
    }
    let loaded: Vec<&str> = parsed
        .program
        .body
        .iter()
        .filter_map(|statement| match statement {
            Statement::ImportDeclaration(declaration) => declaration.source.value.as_str(),
            Statement::ExportFromDeclaration(declaration) => declaration.source.value.as_str(),
            Statement::ExportAllDeclaration(declaration) => declaration.source.value.as_str(),
            _ => None,
        })
        .collect();
    let constants: BTreeMap<String, String> = parsed
        .program
        .body
        .iter()
        .filter_map(|statement| match statement {
            Statement::VariableDeclaration(declaration)
                if declaration.kind == VariableDeclarationKind::Const =>
            {
                Some(&declaration.declarations)
            }
            _ => None,
        })
        .flatten()
        .filter_map(|declarator| match (&declarator.id, &declarator.init) {
            (BindingPattern::BindingIdentifier(name), Some(init)) => {
                literal_text(init).map(|text| (name.name.to_string(), text.to_string()))
            }
            _ => None,
        })
        .collect();
    let mut dynamic = DynamicImports {
        constants: &constants,
        paths: Vec::new(),
        computed: false,
    };
    dynamic.visit_program(&parsed.program);
    let pick = |specifiers: &[&str], keep: fn(&str) -> bool| -> Vec<String> {
        specifiers
            .iter()
            .filter(|specifier| keep(specifier))
            .map(|specifier| (*specifier).to_string())
            .collect()
    };
    let asked: Vec<&str> = dynamic.paths.iter().map(String::as_str).collect();
    Ok(Imports {
        statically: pick(&loaded, is_relative),
        dynamically: pick(&asked, is_relative),
        bare: pick(&loaded, is_bare),
        bare_dynamically: pick(&asked, is_bare),
        rooted: pick(&loaded, is_rooted),
        rooted_dynamically: pick(&asked, is_rooted),
        computed: dynamic.computed,
    })
}

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
fn resolve_url(from: &str, specifier: &str) -> Option<String> {
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
fn resolve_within(from: &str, specifier: &str) -> Option<String> {
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

#[derive(Deserialize)]
struct Manifest {
    version: String,
    exports: BTreeMap<String, serde_json::Value>,
}

/// The `sha256-...` integrity value for file contents.
pub fn integrity(bytes: &[u8]) -> String {
    format!(
        "sha256-{}",
        base64::engine::general_purpose::STANDARD.encode(Sha256::digest(bytes))
    )
}

/// Picks the file an export entry resolves to under the given condition, falling back to `default`.
fn resolve_export(entry: &serde_json::Value, development: bool) -> Option<String> {
    match entry {
        serde_json::Value::String(path) => Some(path.clone()),
        serde_json::Value::Object(conditions) => {
            if development
                && let Some(serde_json::Value::String(path)) = conditions.get("development")
            {
                return Some(path.clone());
            }
            match conditions.get("default") {
                Some(serde_json::Value::String(path)) => Some(path.clone()),
                _ => None,
            }
        }
        _ => None,
    }
}

/// The two lists of a source map that `embeds_sources` compares, read without copying the embedded text.
#[derive(Deserialize)]
struct MapSources {
    sources: Vec<serde::de::IgnoredAny>,
    #[serde(rename = "sourcesContent", default)]
    contents: Option<Vec<Option<serde::de::IgnoredAny>>>,
}

/// True when a source map holds the text of every source it names, so it works where the sources are not served, as in a vendored copy, which leaves `src/` behind.
fn embeds_sources(map: &[u8]) -> bool {
    serde_json::from_slice::<MapSources>(map).is_ok_and(|map| {
        map.contents.is_some_and(|contents| {
            contents.len() == map.sources.len() && contents.iter().all(Option::is_some)
        })
    })
}

/// True for a source map URL that names a map file in the module's own folder: a file name ending in `.map`, with no folder separator, drive, scheme, query, or fragment, so the map is read and written beside the module and can never land on a module or on `VERSION`.
fn names_file_beside(url: &str) -> bool {
    url.len() > ".map".len() && url.ends_with(".map") && !url.contains(['/', '\\', ':', '?', '#'])
}

/// The `//# sourceMappingURL=` comment that ends a module: where its line starts and the URL it names.
fn source_map_comment(code: &[u8]) -> Option<(usize, String)> {
    let mut end = code.len();
    while end > 0 && matches!(code[end - 1], b'\n' | b'\r') {
        end -= 1;
    }
    let start = code[..end]
        .iter()
        .rposition(|&byte| byte == b'\n')
        .map_or(0, |at| at + 1);
    let line = std::str::from_utf8(&code[start..end]).ok()?;
    let url = line.strip_prefix("//# sourceMappingURL=")?.trim();
    Some((start, url.to_string()))
}

/// A module as the vendor folder holds it, and the source map that comes with it: the map's file name and text.
struct PlannedModule {
    bytes: Vec<u8>,
    map: Option<(String, Vec<u8>)>,
}

/// One module of a package as the vendor folder holds it, read and decided before anything is written: with `prepare`, through the template prepare pass, or the scanner's stand-in in the scanner's place. The source map its closing comment names comes with it, under that name, when the module is kept as published, the map is a file beside it, and the map embeds its sources, since `src/` is not copied; an inline map stays with a module kept as published. Otherwise the comment is dropped, since no map that fits would be served.
fn plan_module(path: &Path, prepare: bool) -> io::Result<PlannedModule> {
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    let stand_in = path.with_file_name("scan.unprepared.js");
    let (mut bytes, rewritten) = if prepare && name == "scan.js" && stand_in.is_file() {
        (fs::read(&stand_in)?, true)
    } else {
        let published = fs::read(path)?;
        if prepare {
            let text = std::str::from_utf8(&published).map_err(|error| {
                io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!("{}: {error}", path.display()),
                )
            })?;
            let prepared = crate::prepare::prepare(text)
                .map_err(|error| io::Error::other(format!("{}: {error}", path.display())))?;
            if prepared.as_bytes() == published.as_slice() {
                (published, false)
            } else {
                (prepared.into_bytes(), true)
            }
        } else {
            (published, false)
        }
    };
    let mut map = None;
    if let Some((start, url)) = source_map_comment(&bytes) {
        let inline = url.starts_with("data:");
        let beside = !inline && names_file_beside(&url);
        if !rewritten && beside && path.with_file_name(&url).is_file() {
            map = Some(fs::read(path.with_file_name(&url))?)
                .filter(|text| embeds_sources(text))
                .map(|text| (url, text));
        }
        if map.is_none() && (rewritten || !inline) {
            bytes.truncate(start);
        }
    }
    Ok(PlannedModule { bytes, map })
}

/// Plans the modules a package's entries load, following each module's relative imports, static and through `import()` with a literal path: each file under its path in the package goes into `writes`, each file's integrity hash under its URL into the plan's `files`, the URLs it imports statically into its `statics`, and its other imports into its `edges`. A file that is not a JavaScript module, such as JSON a module imports, is kept as it is. A missing module that something imports statically, a module that does not parse, and a static import that leaves the package's folder fail with the module's URL, since the map would name a file that is not there, or a dependency missed here would load without its integrity hash; a module that only `import()` asks for and that is missing or outside the folder is left out, since the package's own code decides what its absence means.
fn plan_reachable(
    folder: &Path,
    prefix: &str,
    entries: &[String],
    planned: &mut Plan,
    writes: &mut BTreeMap<String, Vec<u8>>,
    prepare: bool,
) -> io::Result<()> {
    let mut queue: Vec<(String, bool)> = entries.iter().map(|file| (file.clone(), false)).collect();
    while let Some((file, dynamic)) = queue.pop() {
        let url = format!("{prefix}/{file}");
        if planned.files.contains_key(&url) {
            continue;
        }
        let path = folder.join(&file);
        if !path.is_file() {
            if dynamic {
                continue;
            }
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!(
                    "{url} is missing from {}; install the package again, or build it if it is linked",
                    folder.display()
                ),
            ));
        }
        if !file.ends_with(".js") && !file.ends_with(".mjs") {
            let bytes = fs::read(&path)?;
            planned.statics.insert(url.clone(), Vec::new());
            planned.files.insert(url, integrity(&bytes));
            writes.insert(file, bytes);
            continue;
        }
        let PlannedModule { bytes, map } = plan_module(&path, prepare)?;
        let imports = relative_imports(&String::from_utf8_lossy(&bytes)).map_err(|error| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!("{url} does not parse: {error}"),
            )
        })?;
        let inside = |specifier: &String| {
            resolve_within(&file, specifier).ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!("{url} imports {specifier}, which leaves its package's folder or names a path the vendoring does not follow"),
                )
            })
        };
        let statically = imports
            .statically
            .iter()
            .map(inside)
            .collect::<io::Result<Vec<_>>>()?;
        let dynamically: Vec<String> = imports
            .dynamically
            .iter()
            .filter_map(|specifier| resolve_within(&file, specifier))
            .collect();
        planned.statics.insert(
            url.clone(),
            statically
                .iter()
                .map(|resolved| format!("{prefix}/{resolved}"))
                .collect(),
        );
        planned.edges.insert(
            url.clone(),
            Edges {
                statically: imports.bare,
                dynamically: dynamically
                    .iter()
                    .map(|resolved| format!("{prefix}/{resolved}"))
                    .collect(),
                bare_dynamically: imports.bare_dynamically,
            },
        );
        queue.extend(statically.into_iter().map(|resolved| (resolved, false)));
        queue.extend(dynamically.into_iter().map(|resolved| (resolved, true)));
        if let Some((name, text)) = map {
            let beside = match file.rsplit_once('/') {
                Some((folder, _)) => format!("{folder}/{name}"),
                None => name,
            };
            writes.insert(beside, text);
        }
        planned.files.insert(url, integrity(&bytes));
        writes.insert(file, bytes);
    }
    Ok(())
}

/// The names a package's license file goes by; the first one found is copied next to `VERSION`, since redistributing the files asks for a copy of the license.
const LICENSE_FILES: [&str; 3] = ["LICENSE", "LICENSE.md", "LICENSE.txt"];

/// Git settings written at the top of the vendor folder: no line ending conversion, since a converted module fails its integrity hash, and the `dist/` folders kept in commits, which a project's own `dist/` rule would leave out.
const GIT_ATTRIBUTES: &str = "# Written by zerolith importmap. The vendored modules carry integrity hashes, which line ending conversion would break.\n* -text\n";
const GIT_IGNORE: &str = "# Written by zerolith importmap. The vendored packages keep their dist/ folders in commits, whatever the project's own rules say.\n!**/dist/\n";

/// What a run writes for one package: its files by their path in the package folder, and its version; `empty` once the pages' graph reaches none of its modules, so the folder is left as it is, neither written nor removed, for a page the run was not given.
struct PackagePlan {
    package: &'static str,
    version: String,
    writes: BTreeMap<String, Vec<u8>>,
    empty: bool,
}

/// The other edges out of a vendored module: the bare specifiers it imports, which the map resolves to other entries, and what it loads through `import()`.
#[derive(Default)]
struct Edges {
    statically: Vec<String>,
    dynamically: Vec<String>,
    bare_dynamically: Vec<String>,
}

/// What planning found: each package's files, each file's integrity hash by URL, the URLs each module imports statically, and its other edges.
#[derive(Default)]
struct Plan {
    packages: Vec<PackagePlan>,
    files: BTreeMap<String, String>,
    statics: BTreeMap<String, Vec<String>>,
    edges: BTreeMap<String, Edges>,
}

/// The URLs a page's graph reaches among the planned files, by any edge: a mapped entry it names, statically or through `import()`, then every import, static or not, relative or through the map. `None` when there is no page, or the walk could not bound what the page loads, which keeps everything.
fn reached_by(
    page: Option<&PageGraph>,
    imports: &BTreeMap<String, String>,
    plan: &Plan,
) -> Option<BTreeSet<String>> {
    let page = page.filter(|page| !page.unbounded())?;
    let mut reached = BTreeSet::new();
    let mut queue: Vec<String> = page
        .bare
        .iter()
        .chain(page.lazy.iter())
        .filter_map(|specifier| imports.get(specifier).cloned())
        .collect();
    while let Some(url) = queue.pop() {
        if !plan.files.contains_key(&url) || !reached.insert(url.clone()) {
            continue;
        }
        if let Some(next) = plan.statics.get(&url) {
            queue.extend(next.iter().cloned());
        }
        if let Some(edges) = plan.edges.get(&url) {
            queue.extend(edges.dynamically.iter().cloned());
            queue.extend(
                edges
                    .statically
                    .iter()
                    .chain(edges.bare_dynamically.iter())
                    .filter_map(|specifier| imports.get(specifier).cloned()),
            );
        }
    }
    Some(reached)
}

/// Reads and checks every installed package before anything is written, filling in the map's imports and the versions. A package folder already in `destination` that no earlier run wrote, which a `VERSION` file would mark, stops the run.
fn plan(
    packages: &Path,
    destination: &Path,
    base: &str,
    development: bool,
    prepare: bool,
    vendored: &mut Vendored,
) -> io::Result<Plan> {
    let mut planned = Plan::default();
    for package in PACKAGES {
        let folder = packages.join(package);
        let manifest_path = folder.join("package.json");
        if !manifest_path.is_file() {
            continue;
        }
        let manifest: Manifest =
            serde_json::from_str(&fs::read_to_string(&manifest_path)?).map_err(io::Error::other)?;
        let existing = destination.join(package);
        if existing.exists() && !existing.join("VERSION").is_file() {
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                format!(
                    "{} holds files no earlier run wrote, since it has no VERSION file; remove it, or vendor into another folder",
                    existing.display()
                ),
            ));
        }
        vendored
            .versions
            .insert(package.to_string(), manifest.version.clone());
        let prefix = format!("{base}/{package}");
        let mut entries = Vec::new();
        for (subpath, entry) in &manifest.exports {
            if subpath == "./package.json" {
                continue;
            }
            let Some(file) = resolve_export(entry, development) else {
                continue;
            };
            if subpath.contains('*') || subpath.ends_with('/') || file.contains('*') {
                continue;
            }
            let Some(file) = resolve_within("package.json", &file) else {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!(
                        "{package} exports {subpath} as {file}, which leaves its package's folder or names a path the vendoring does not follow"
                    ),
                ));
            };
            let specifier = if subpath == "." {
                package.to_string()
            } else {
                format!("{package}/{}", subpath.trim_start_matches("./"))
            };
            vendored
                .map
                .imports
                .insert(specifier, format!("{prefix}/{file}"));
            entries.push(file);
        }
        let mut writes = BTreeMap::new();
        plan_reachable(
            &folder,
            &prefix,
            &entries,
            &mut planned,
            &mut writes,
            prepare,
        )?;
        if let Some(name) = LICENSE_FILES
            .iter()
            .find(|name| folder.join(name).is_file())
        {
            writes.insert((*name).to_string(), fs::read(folder.join(name))?);
        }
        planned.packages.push(PackagePlan {
            package,
            version: manifest.version,
            writes,
            empty: false,
        });
    }
    Ok(planned)
}

/// Every file under `folder`, by its path inside it with forward slashes, and every folder under it, parents before their children.
fn files_and_folders(folder: &Path) -> io::Result<(Vec<String>, Vec<std::path::PathBuf>)> {
    let mut files = Vec::new();
    let mut folders = Vec::new();
    let mut queue = vec![(folder.to_path_buf(), String::new())];
    while let Some((directory, prefix)) = queue.pop() {
        for entry in fs::read_dir(&directory)? {
            let entry = entry?;
            let name = format!("{prefix}{}", entry.file_name().to_string_lossy());
            if entry.file_type()?.is_dir() {
                folders.push(entry.path());
                queue.push((entry.path(), format!("{name}/")));
            } else {
                files.push(name);
            }
        }
    }
    Ok((files, folders))
}

/// Writes a package's `VERSION` and then its planned files into its folder in place, so a write that fails partway leaves a folder a later run takes for its own, and with `prune` removes the files an earlier run left there that the entries no longer load, and the folders that leaves empty. Only a folder that holds nothing but what this command writes reaches here, since planning refuses one without a `VERSION` file.
fn write_package(folder: &Path, plan: &PackagePlan, prune: bool) -> io::Result<()> {
    fs::create_dir_all(folder)?;
    fs::write(folder.join("VERSION"), format!("{}\n", plan.version))?;
    for (file, bytes) in &plan.writes {
        let to = folder.join(file);
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&to, bytes)?;
    }
    if !prune {
        return Ok(());
    }
    let (files, folders) = files_and_folders(folder)?;
    for file in files {
        if file != "VERSION" && !plan.writes.contains_key(&file) {
            fs::remove_file(folder.join(&file))?;
        }
    }
    for directory in folders.iter().rev() {
        if fs::read_dir(directory)?.next().is_none() {
            fs::remove_dir(directory)?;
        }
    }
    Ok(())
}

/// Copies each installed package's published modules into `out` under the project root and returns the import map; with `prune`, files an earlier run left that the entries no longer load are removed, which suits a run that moves the page to the new map at once. With a `page` whose graph the walk could bound, only the entries it reaches are vendored and mapped, and a package it does not reach is left as it is; without one, or with a page the walk could not bound, every entry of every package.
pub fn vendor(
    root: &Path,
    out: &Path,
    development: bool,
    prune: bool,
    page: Option<&PageGraph>,
) -> io::Result<Vendored> {
    vendor_from(
        &root.join("node_modules"),
        root,
        out,
        development,
        false,
        prune,
        page,
    )
}

/// Like `vendor`, reading the packages from `packages` (a node_modules folder) and writing under `root/out`, so a build can vendor into its output folder; with `prepare`, every vendored module goes through the template prepare pass and the core's scanner is replaced by its stand-in. Every package is read and checked before anything is written, so a run that a check stops leaves the vendored files the page uses as they were; then each package's files are written in place, and with `prune` files an earlier run left that the entries no longer load are removed; a package the page does not reach is neither written nor removed. The map holds an integrity hash for every file it vendors, the ones `import()` loads included, and `modules` preloads the JavaScript modules the mapped entries load statically.
pub fn vendor_from(
    packages: &Path,
    root: &Path,
    out: &Path,
    development: bool,
    prepare: bool,
    prune: bool,
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
        write_package(&destination.join(package.package), package, prune)?;
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

/// Where the first module script starts, inline or with a `src`, so an import map can go before it, since a browser ignores a map that comes after a module script.
fn first_module_script(html: &str) -> Option<usize> {
    let lower = html.to_ascii_lowercase();
    let mut from = 0;
    while let Some(at) = lower[from..].find("<script") {
        let start = from + at;
        let end = lower[start..]
            .find('>')
            .map_or(lower.len(), |close| start + close);
        let tag = &lower[start..end];
        if tag.contains("type=\"module\"")
            || tag.contains("type='module'")
            || tag.contains("type=module")
        {
            return Some(start);
        }
        from = end;
    }
    None
}

/// The text of the first import map in an HTML document, found as the build finds it: past comments, and whatever the element's other attributes, such as a `nonce`.
pub fn import_map_of(html: &str) -> Option<&str> {
    let (start, end) = *crate::html::scan(html).import_maps.first()?;
    let element = &html[start..end];
    let open = element.find('>')? + 1;
    let close = element.to_ascii_lowercase().rfind("</script")?;
    Some(element[open..close].trim())
}

/// The page's own import map, parsed, or None when it has none or it is not valid JSON.
pub fn page_map(html: &str) -> Option<ImportMap> {
    serde_json::from_str(import_map_of(html)?).ok()
}

/// True when the import map resolves `specifier`: an entry names it, or an entry ending in `/` is its prefix.
pub fn covers(map: &ImportMap, specifier: &str) -> bool {
    map.imports.contains_key(specifier)
        || map
            .imports
            .keys()
            .any(|key| key.ends_with('/') && specifier.starts_with(key.as_str()))
}

/// The script and preload tags for an HTML head. Each preload carries the integrity hash the map gives its module: a browser reuses a preload only when its integrity matches the module request's, which takes the hash from the map.
pub fn html_tags(vendored: &Vendored) -> String {
    tags(&vendored.map, &vendored.modules)
}

/// The tags for one page: the vendored map with the entries of the page's own import map kept where the vendored map names a different specifier, so a package mapped by hand survives an update, and the preloads for the page's graph when one is given. An entry of the page's map that points into a package folder this run wrote, at a file or a folder prefix the run no longer vendors anything under, is dropped, since the run removed what it no longer vendors there.
pub fn page_tags(vendored: &Vendored, html: &str, page: Option<&PageGraph>) -> String {
    let modules = page.map_or_else(|| vendored.modules.clone(), |page| vendored.preloads(page));
    let Some(mut map) = page_map(html) else {
        return tags(&vendored.map, &modules);
    };
    let gone = |url: &str| {
        vendored
            .folders
            .iter()
            .any(|folder| url.starts_with(folder.as_str()))
            && if url.ends_with('/') {
                !vendored
                    .map
                    .integrity
                    .keys()
                    .any(|kept| kept.starts_with(url))
            } else {
                !vendored.map.integrity.contains_key(url)
            }
    };
    map.imports.retain(|_, url| !gone(url));
    map.integrity.retain(|url, _| !gone(url));
    for scope in map.scopes.values_mut() {
        scope.retain(|_, url| !gone(url));
    }
    map.scopes.retain(|_, scope| !scope.is_empty());
    map.imports.extend(vendored.map.imports.clone());
    map.integrity.extend(vendored.map.integrity.clone());
    tags(&map, &modules)
}

fn tags(map: &ImportMap, modules: &[String]) -> String {
    let json = serde_json::to_string(map).unwrap_or_default();
    let mut out = format!("<script type=\"importmap\">{json}</script>\n");
    for module in modules {
        let integrity = map
            .integrity
            .get(module)
            .map(|hash| format!(" integrity=\"{hash}\""))
            .unwrap_or_default();
        out.push_str(&format!(
            "<link rel=\"modulepreload\" href=\"{module}\"{integrity} data-zerolith-preload>\n"
        ));
    }
    out
}

/// Replaces the import map and the previously generated preload links in an HTML document, or inserts them before the first module script, which a map has to precede, or else before `</head>`. A page with CRLF line endings keeps them, so a checkout that converts line endings does not see every run as a change.
pub fn update_html(html: &str, tags: &str) -> String {
    let crlf = html.contains("\r\n");
    let result = update_lf(&html.replace("\r\n", "\n"), tags);
    if crlf {
        result.replace('\n', "\r\n")
    } else {
        result
    }
}

/// `update_html` over a document with LF line endings.
fn update_lf(html: &str, tags: &str) -> String {
    let stripped: String = html
        .lines()
        .filter(|line| {
            !(line.contains("rel=\"modulepreload\"") && line.contains("data-zerolith-preload"))
        })
        .map(|line| format!("{line}\n"))
        .collect();
    let maps = crate::html::scan(&stripped).import_maps;
    let mut result = String::new();
    let mut from = 0;
    for (index, &(start, end)) in maps.iter().enumerate() {
        result.push_str(&stripped[from..start]);
        if index == 0 {
            let element = &stripped[start..end];
            let opening = &element[..element.find('>').map_or(element.len(), |at| at + 1)];
            let replaced = tags
                .trim_end()
                .replacen("<script type=\"importmap\">", opening, 1);
            result.push_str(&indented(&replaced, &indentation(&stripped, start)));
        }
        from = end;
        if stripped[from..].starts_with('\n') && result.ends_with('\n') {
            from += 1;
        }
    }
    result.push_str(&stripped[from..]);
    let replaced = !maps.is_empty();
    if !replaced {
        let head_end = result.find("</head>");
        let script = first_module_script(&result).filter(|&at| head_end.is_none_or(|end| at < end));
        let index = script.or(head_end).unwrap_or(0);
        let indent = indentation(&result, index);
        let inserted = format!("{}{indent}", indented(tags, &indent));
        result.insert_str(index, &inserted);
    }
    result
}

/// The whitespace that starts the line `at` is on, when nothing but whitespace precedes `at` on it; otherwise nothing, since the tags then follow other markup on the line.
fn indentation(text: &str, at: usize) -> String {
    let line_start = text[..at].rfind('\n').map_or(0, |index| index + 1);
    let before = &text[line_start..at];
    if before.trim().is_empty() {
        before.to_string()
    } else {
        String::new()
    }
}

/// The tags with every line after the first indented like the first, which sits where the page already indents it, so the preload links line up under the map.
fn indented(tags: &str, indentation: &str) -> String {
    if indentation.is_empty() {
        return tags.to_string();
    }
    let mut lines = tags.split_inclusive('\n');
    let mut out = lines.next().unwrap_or_default().to_string();
    for line in lines {
        out.push_str(indentation);
        out.push_str(line);
    }
    out
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
        pages.push((file, path, current, graph));
    }
    let vendored = vendor(
        root,
        out,
        development,
        !pages.is_empty(),
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
    for (file, path, current, graph) in &pages {
        fs::write(
            path,
            update_html(current, &page_tags(&vendored, current, Some(graph))),
        )?;
        anstream::println!(
            "{}",
            crate::term::row("updated", crate::term::done, file.display())
        );
    }
    anstream::println!();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        ImportMap, Vendored, covers, html_tags, integrity, page_tags, relative_imports,
        resolve_export, resolve_within, update_html, vendor, vendor_from,
    };
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn hashes_match_the_sri_format() {
        assert_eq!(
            integrity(b""),
            "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
        );
    }

    #[test]
    fn follows_static_relative_imports() {
        let source = "import { a } from \"./a.js\";\nexport { b } from './b.js';\nimport c from \"zerolith\";\nexport * from \"../up.js\";";
        let imports = relative_imports(source).unwrap();
        assert_eq!(imports.statically, vec!["./a.js", "./b.js", "../up.js"]);
        assert_eq!(imports.bare, vec!["zerolith"]);
        assert!(imports.bare_dynamically.is_empty());
        let kinds = "import \"/root.js\";
import \"//cdn.example/x.js\";
import \"https://cdn.example/y.js\";
import \"node:fs\";
import \"@zerolith/router\";
import \"zerolith/jsx-runtime\";
import \"\";
const lazy = () => import(\"@zerolith/forms\");
const tools = () => import(\"/tools.js\");";
        let kinds = relative_imports(kinds).unwrap();
        assert_eq!(kinds.bare, vec!["@zerolith/router", "zerolith/jsx-runtime"]);
        assert_eq!(kinds.bare_dynamically, vec!["@zerolith/forms"]);
        assert_eq!(kinds.rooted, vec!["/root.js"]);
        assert_eq!(kinds.rooted_dynamically, vec!["/tools.js"]);
        assert!(kinds.statically.is_empty() && kinds.dynamically.is_empty());
        assert!(!kinds.computed);
        let constants = "const LAZY = \"./lazy.js\";
const TEMPLATE = `./template.js`;
let mutable = \"./mutable.js\";
const { destructured } = settings;
export const a = () => import(LAZY);
export const b = () => import(TEMPLATE);
export const c = () => import(mutable);
export const d = () => import(destructured);
export const e = (name) => import(name);
export const f = () => import(`./${LAZY}`);";
        let constants = relative_imports(constants).unwrap();
        assert_eq!(constants.dynamically, vec!["./lazy.js", "./template.js"]);
        assert!(constants.computed);
        let followed = relative_imports(
            "const LAZY = \"./lazy.js\";
export const a = () => import(LAZY);",
        )
        .unwrap();
        assert!(!followed.computed);
        let minified = "import{a as e}from\"./a.js\";import\"./effects.js\";export*from\"./all.js\";export{b}from'./b.js';const t='from \"./text.js\"',l=()=>import(`./lazy.js`),m=()=>import(\"./more.js\"),n=e=>import(e),p=()=>import(\"zerolith\");export{e,t,l,m,n,p};";
        assert_eq!(
            relative_imports(minified).unwrap(),
            super::Imports {
                statically: vec![
                    "./a.js".to_string(),
                    "./effects.js".to_string(),
                    "./all.js".to_string(),
                    "./b.js".to_string()
                ],
                dynamically: vec!["./lazy.js".to_string(), "./more.js".to_string()],
                bare: Vec::new(),
                bare_dynamically: vec!["zerolith".to_string()],
                rooted: Vec::new(),
                rooted_dynamically: Vec::new(),
                computed: true,
            }
        );
        let error =
            relative_imports("export const a = 1;\nimport { b from \"./b.js\";").unwrap_err();
        assert!(error.ends_with(" at line 2, column 12"), "{error}");
        assert_eq!(
            resolve_within("dist/production/index.js", "./x.js").as_deref(),
            Some("dist/production/x.js")
        );
        assert_eq!(
            resolve_within("dist/production/index.js", "../up.js").as_deref(),
            Some("dist/up.js")
        );
        assert_eq!(
            resolve_within("dist/production/index.js", "../../root.js").as_deref(),
            Some("root.js")
        );
        assert_eq!(resolve_within("dist/index.js", "../../out.js"), None);
        for odd in [
            "./a//b.js",
            "./%2e%2e/b.js",
            "./a/",
            "./a/./b.js/",
            "./..\\..\\x.js",
        ] {
            assert_eq!(resolve_within("dist/index.js", odd), None, "{odd}");
        }
        assert_eq!(
            resolve_within("package.json", "./dist/./production/index.js").as_deref(),
            Some("dist/production/index.js")
        );
    }

    #[test]
    fn resolves_export_conditions() {
        let entry = serde_json::json!({ "types": "./dist/index.d.ts", "development": "./dist/index.js", "default": "./dist/production/index.js" });
        assert_eq!(
            resolve_export(&entry, false),
            Some("./dist/production/index.js".to_string())
        );
        assert_eq!(
            resolve_export(&entry, true),
            Some("./dist/index.js".to_string())
        );
        assert_eq!(
            resolve_export(&serde_json::json!("./dist/x.js"), false),
            Some("./dist/x.js".to_string())
        );
    }

    #[test]
    fn vendors_installed_packages_and_updates_html() {
        let root =
            std::env::temp_dir().join(format!("zerolith-importmap-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let core = root.join("node_modules/zerolith");
        fs::create_dir_all(core.join("dist/production")).unwrap();
        fs::write(core.join("package.json"), r#"{"name":"zerolith","version":"0.0.0","exports":{".":{"development":"./dist/index.js","default":"./dist/production/index.js"},"./package.json":"./package.json"}}"#).unwrap();
        fs::write(core.join("LICENSE"), "Apache License\n").unwrap();
        fs::write(core.join("dist/index.js"), "export const dev = 1;").unwrap();
        fs::write(
            core.join("dist/production/index.js"),
            "export { prod } from \"./inner.js\";",
        )
        .unwrap();
        fs::write(
            core.join("dist/production/inner.js"),
            "export const prod = 1;",
        )
        .unwrap();
        fs::write(root.join("index.html"), "<html><head><script type=\"importmap\">{}</script>\n<link rel=\"modulepreload\" href=\"/old.js\" data-zerolith-preload>\n</head><body></body></html>").unwrap();
        fs::create_dir_all(root.join("vendor/zerolith")).unwrap();
        fs::write(root.join("vendor/zerolith/VERSION"), "0.0.0\n").unwrap();
        fs::write(
            root.join("vendor/zerolith/stale.js"),
            "left by an earlier run",
        )
        .unwrap();

        let vendored = vendor(&root, std::path::Path::new("vendor"), false, true, None).unwrap();
        assert_eq!(
            fs::read_to_string(root.join("vendor/zerolith/LICENSE")).unwrap(),
            "Apache License\n"
        );
        assert!(!root.join("vendor/zerolith/stale.js").exists());
        assert!(
            fs::read_to_string(root.join("vendor/.gitattributes"))
                .unwrap()
                .contains("\n* -text\n")
        );
        assert!(
            fs::read_to_string(root.join("vendor/.gitignore"))
                .unwrap()
                .contains("\n!**/dist/\n")
        );
        assert_eq!(
            vendored.map.imports.get("zerolith"),
            Some(&"/vendor/zerolith/dist/production/index.js".to_string())
        );
        assert!(
            root.join("vendor/zerolith/dist/production/index.js")
                .is_file()
        );
        assert_eq!(
            vendored.modules,
            vec![
                "/vendor/zerolith/dist/production/index.js",
                "/vendor/zerolith/dist/production/inner.js"
            ]
        );
        assert!(
            vendored
                .map
                .integrity
                .contains_key("/vendor/zerolith/dist/production/inner.js")
        );
        assert!(
            !vendored
                .map
                .integrity
                .contains_key("/vendor/zerolith/dist/index.js")
        );
        assert_eq!(
            vendored.versions.get("zerolith"),
            Some(&"0.0.0".to_string())
        );
        assert!(root.join("vendor/importmap.json").is_file());

        let updated = update_html(
            &fs::read_to_string(root.join("index.html")).unwrap(),
            &html_tags(&vendored),
        );
        assert!(updated.contains("\"zerolith\":\"/vendor/zerolith/dist/production/index.js\""));
        assert!(!updated.contains("/old.js"));
        assert_eq!(updated.matches("<script type=\"importmap\">").count(), 1);
        let hash = &vendored.map.integrity["/vendor/zerolith/dist/production/index.js"];
        assert!(updated.contains(&format!("<link rel=\"modulepreload\" href=\"/vendor/zerolith/dist/production/index.js\" integrity=\"{hash}\" data-zerolith-preload>")));
        assert_eq!(
            updated.matches("rel=\"modulepreload\"").count(),
            updated.matches(" integrity=\"sha256-").count()
        );

        let inserted = update_html(
            "<html><head></head></html>",
            &html_tags(&Vendored::default()),
        );
        assert!(inserted.contains("<script type=\"importmap\">"));
        let before_script = update_html(
            "<html><head><title>x</title>\n<script type=\"module\" src=\"/app.js\"></script>\n</head><body></body></html>",
            &html_tags(&Vendored::default()),
        );
        assert!(
            before_script.find("<script type=\"importmap\">").unwrap()
                < before_script.find("<script type=\"module\"").unwrap(),
            "{before_script}"
        );
        let body_script = update_html(
            "<html><head><title>x</title></head><body><script type=\"module\">1</script></body></html>",
            &html_tags(&Vendored::default()),
        );
        assert!(
            body_script.find("<script type=\"importmap\">").unwrap()
                < body_script.find("</head>").unwrap(),
            "{body_script}"
        );
        let crlf = update_html(
            "<html>\r\n<head>\r\n<script type=\"importmap\">{}</script>\r\n<link rel=\"modulepreload\" href=\"/old.js\" data-zerolith-preload>\r\n</head>\r\n</html>\r\n",
            &html_tags(&vendored),
        );
        assert!(!crlf.replace("\r\n", "").contains('\n'), "{crlf:?}");
        assert!(crlf.contains("<script type=\"importmap\">") && !crlf.contains("/old.js"));
        let replaced = update_html(
            "<html>\n<head>\n    <meta charset=\"utf-8\">\n    <script type=\"importmap\">{}</script>\n<link rel=\"modulepreload\" href=\"/old.js\" data-zerolith-preload>\n</head>\n</html>\n",
            &html_tags(&vendored),
        );
        assert_eq!(
            replaced,
            format!(
                "<html>\n<head>\n    <meta charset=\"utf-8\">\n    <script type=\"importmap\">{}</script>\n    <link rel=\"modulepreload\" href=\"/vendor/zerolith/dist/production/index.js\" integrity=\"{hash}\" data-zerolith-preload>\n    <link rel=\"modulepreload\" href=\"/vendor/zerolith/dist/production/inner.js\" integrity=\"{}\" data-zerolith-preload>\n</head>\n</html>\n",
                serde_json::to_string(&vendored.map).unwrap(),
                vendored.map.integrity["/vendor/zerolith/dist/production/inner.js"]
            )
        );
        let indented = update_html(
            "<html>\n<head>\n    <title>x</title>\n    <script type=\"module\" src=\"/app.js\"></script>\n</head>\n</html>\n",
            &html_tags(&vendored),
        );
        assert!(
            indented.contains("</script>\n    <link rel=\"modulepreload\" href=\"/vendor/zerolith/dist/production/index.js\"")
                && indented.contains("data-zerolith-preload>\n    <script type=\"module\" src=\"/app.js\">"),
            "{indented}"
        );
        let inline = update_html(
            "<html><head><title>x</title><script type=\"module\" src=\"/app.js\"></script></head></html>",
            &html_tags(&vendored),
        );
        assert!(
            inline.contains("</script>\n<link rel=\"modulepreload\"")
                && inline.contains("data-zerolith-preload>\n<script type=\"module\""),
            "{inline}"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn vendors_what_the_entries_load_with_the_source_maps_that_still_fit_and_embed_their_sources() {
        let root = std::env::temp_dir().join(format!(
            "zerolith-importmap-maps-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let core = root.join("node_modules/zerolith");
        fs::create_dir_all(core.join("dist/production")).unwrap();
        fs::write(core.join("package.json"), r#"{"name":"zerolith","version":"0.0.0","exports":{".":{"development":"./dist/index.js","default":"./dist/production/index.js"}}}"#).unwrap();
        let bare = |file: &str| {
            format!(
                r#"{{"version":3,"file":"{file}","sources":["../src/{file}"],"names":[],"mappings":"AAAA"}}"#
            )
        };
        let embedded = |file: &str| {
            format!(
                r#"{{"version":3,"file":"{file}","sources":["../../src/{file}"],"sourcesContent":["source text\n"],"names":[],"mappings":"AAAA"}}"#
            )
        };
        fs::write(
            core.join("dist/index.js"),
            "export const dev = 1;\n//# sourceMappingURL=index.js.map\n",
        )
        .unwrap();
        fs::write(core.join("dist/index.js.map"), bare("index.js")).unwrap();
        let production = core.join("dist/production");
        fs::write(
            production.join("index.js"),
            "import\"./view.js\";import\"./plain.js\";export const prod=1;\n//# sourceMappingURL=index.js.map\n",
        )
        .unwrap();
        fs::write(production.join("index.js.map"), embedded("index.js")).unwrap();
        fs::write(
            production.join("view.js"),
            "import{html as e}from\"zerolith\";export const view=()=>e`<p>${1}</p>`;\n//# sourceMappingURL=view.js.map\n",
        )
        .unwrap();
        fs::write(production.join("view.js.map"), embedded("view.js")).unwrap();
        fs::write(
            production.join("plain.js"),
            "export const plain=1;\n//# sourceMappingURL=plain.js.map\n",
        )
        .unwrap();
        fs::write(production.join("plain.js.map"), bare("plain.js")).unwrap();
        fs::write(production.join("unused.js"), "export const unused=1;\n").unwrap();
        fs::write(production.join("orphan.js.map"), embedded("orphan.js")).unwrap();
        fs::write(production.join("notes.txt"), "not a module").unwrap();

        let vendored = vendor(&root, std::path::Path::new("vendor"), false, true, None).unwrap();
        let copied = root.join("vendor/zerolith/dist");
        assert_eq!(
            vendored.modules,
            vec![
                "/vendor/zerolith/dist/production/index.js",
                "/vendor/zerolith/dist/production/plain.js",
                "/vendor/zerolith/dist/production/view.js"
            ]
        );
        assert_eq!(
            vendored.map.integrity.keys().cloned().collect::<Vec<_>>(),
            vendored.modules
        );
        assert_eq!(
            fs::read_to_string(copied.join("production/index.js")).unwrap(),
            fs::read_to_string(production.join("index.js")).unwrap()
        );
        assert_eq!(
            fs::read_to_string(copied.join("production/index.js.map")).unwrap(),
            embedded("index.js")
        );
        assert_eq!(
            fs::read_to_string(copied.join("production/view.js.map")).unwrap(),
            embedded("view.js")
        );
        assert_eq!(
            fs::read_to_string(copied.join("production/plain.js")).unwrap(),
            "export const plain=1;\n"
        );
        assert!(!copied.join("production/plain.js.map").exists());
        for absent in [
            "index.js",
            "index.js.map",
            "production/unused.js",
            "production/orphan.js.map",
            "production/notes.txt",
        ] {
            assert!(!copied.join(absent).exists(), "{absent} was copied");
        }

        vendor(&root, std::path::Path::new("readable"), true, true, None).unwrap();
        let readable = root.join("readable/zerolith/dist");
        assert_eq!(
            fs::read_to_string(readable.join("index.js")).unwrap(),
            "export const dev = 1;\n"
        );
        assert!(!readable.join("index.js.map").exists());
        assert!(!readable.join("production").exists());

        let built = root.join("out");
        vendor_from(
            &root.join("node_modules"),
            &built,
            std::path::Path::new("vendor"),
            false,
            true,
            true,
            None,
        )
        .unwrap();
        let prepared = built.join("vendor/zerolith/dist/production");
        assert_eq!(
            fs::read_to_string(prepared.join("index.js.map")).unwrap(),
            embedded("index.js")
        );
        assert!(
            fs::read_to_string(prepared.join("index.js"))
                .unwrap()
                .ends_with("//# sourceMappingURL=index.js.map\n")
        );
        let view = fs::read_to_string(prepared.join("view.js")).unwrap();
        assert_ne!(
            view,
            fs::read_to_string(production.join("view.js")).unwrap()
        );
        assert!(!view.contains("sourceMappingURL"));
        assert!(!prepared.join("view.js.map").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn refuses_a_vendored_module_that_does_not_parse() {
        let root = std::env::temp_dir().join(format!(
            "zerolith-importmap-parse-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let core = root.join("node_modules/zerolith");
        fs::create_dir_all(core.join("dist")).unwrap();
        fs::write(
            core.join("package.json"),
            r#"{"name":"zerolith","version":"0.0.0","exports":{".":"./dist/index.js"}}"#,
        )
        .unwrap();
        fs::write(
            core.join("dist/index.js"),
            "export{a}from\"./a.js\";export{",
        )
        .unwrap();
        let error = vendor(&root, std::path::Path::new("vendor"), false, true, None)
            .expect_err("a module that does not parse");
        assert!(
            error
                .to_string()
                .starts_with("/vendor/zerolith/dist/index.js does not parse: "),
            "{error}"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn replaces_what_an_earlier_run_wrote_keeps_inline_maps_and_follows_the_named_map() {
        let root = std::env::temp_dir().join(format!(
            "zerolith-importmap-rerun-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let core = root.join("node_modules/zerolith");
        fs::create_dir_all(core.join("dist/production")).unwrap();
        fs::write(core.join("package.json"), r#"{"name":"zerolith","version":"0.0.0","exports":{".":{"development":"./dist/index.js","default":"./dist/production/index.js"}}}"#).unwrap();
        fs::write(core.join("dist/index.js"), "export const dev = 1;\n").unwrap();
        let named = r#"{"version":3,"file":"index.js","sources":["../../src/index.ts"],"sourcesContent":["source text\n"],"names":[],"mappings":"AAAA"}"#;
        fs::write(
            core.join("dist/production/index.js"),
            "import\"./inline.js\";export const prod=1;\n//# sourceMappingURL=index.named.map\n",
        )
        .unwrap();
        fs::write(core.join("dist/production/index.named.map"), named).unwrap();
        fs::write(core.join("dist/production/index.js.map"), named).unwrap();
        let inline =
            "export const inline=1;\n//# sourceMappingURL=data:application/json;base64,e30=\n";
        fs::write(core.join("dist/production/inline.js"), inline).unwrap();
        let user = root.join("other/zerolith");
        fs::create_dir_all(&user).unwrap();
        fs::write(user.join("notes.txt"), "the user's own").unwrap();

        vendor(&root, std::path::Path::new("vendor"), true, true, None).unwrap();
        assert!(root.join("vendor/zerolith/dist/index.js").is_file());
        vendor(&root, std::path::Path::new("vendor"), false, true, None).unwrap();
        let copied = root.join("vendor/zerolith/dist");
        assert!(!copied.join("index.js").exists());
        assert_eq!(
            fs::read_to_string(copied.join("production/index.named.map")).unwrap(),
            named
        );
        assert!(!copied.join("production/index.js.map").exists());
        assert_eq!(
            fs::read_to_string(copied.join("production/inline.js")).unwrap(),
            inline
        );

        let refused = vendor(&root, std::path::Path::new("other"), false, true, None)
            .expect_err("a folder no earlier run wrote");
        assert!(
            refused
                .to_string()
                .contains("holds files no earlier run wrote"),
            "{refused}"
        );
        assert_eq!(
            fs::read_to_string(user.join("notes.txt")).unwrap(),
            "the user's own"
        );
        assert_eq!(fs::read_dir(&user).unwrap().count(), 1);
        assert_eq!(fs::read_dir(root.join("other")).unwrap().count(), 1);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn keeps_the_vendored_files_when_a_run_fails_and_loads_lazy_modules_without_preloading_them() {
        let root = std::env::temp_dir().join(format!(
            "zerolith-importmap-staging-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let core = root.join("node_modules/zerolith");
        fs::create_dir_all(core.join("dist")).unwrap();
        fs::write(
            core.join("package.json"),
            r#"{"name":"zerolith","version":"0.0.0","exports":{".":"./dist/index.js"}}"#,
        )
        .unwrap();
        fs::write(
            core.join("dist/index.js"),
            "export const later=()=>import(`./lazy.js`);\n",
        )
        .unwrap();
        fs::write(core.join("dist/lazy.js"), "export const lazy=1;\n").unwrap();
        let vendored = vendor(&root, std::path::Path::new("vendor"), false, true, None).unwrap();
        assert_eq!(vendored.modules, vec!["/vendor/zerolith/dist/index.js"]);
        assert_eq!(
            vendored.map.integrity.keys().cloned().collect::<Vec<_>>(),
            vec![
                "/vendor/zerolith/dist/index.js",
                "/vendor/zerolith/dist/lazy.js"
            ]
        );
        let lazy = root.join("vendor/zerolith/dist/lazy.js");
        assert!(lazy.is_file());

        fs::write(
            core.join("dist/index.js"),
            "export{a}from\"./missing.js\";\n",
        )
        .unwrap();
        let error = vendor(&root, std::path::Path::new("vendor"), false, true, None)
            .expect_err("a module the package does not hold");
        assert!(
            error.to_string().contains("missing.js is missing"),
            "{error}"
        );
        assert!(lazy.is_file());
        assert_eq!(
            fs::read_to_string(root.join("vendor/zerolith/dist/index.js")).unwrap(),
            "export const later=()=>import(`./lazy.js`);\n"
        );
        let mut names: Vec<String> = fs::read_dir(root.join("vendor"))
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        assert_eq!(
            names,
            vec![".gitattributes", ".gitignore", "importmap.json", "zerolith"]
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn copies_other_files_as_they_are_and_skips_an_optional_lazy_module() {
        let root = std::env::temp_dir().join(format!(
            "zerolith-importmap-files-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let core = root.join("node_modules/zerolith");
        fs::create_dir_all(core.join("dist")).unwrap();
        fs::write(
            core.join("package.json"),
            r#"{"name":"zerolith","version":"0.0.0","exports":{".":"./dist/index.js"}}"#,
        )
        .unwrap();
        fs::write(
            core.join("dist/index.js"),
            "import data from\"./data.json\"with{type:\"json\"};export const optional=()=>import(\"./optional.js\").catch(()=>null),odd=()=>import(\"./a//b.js\"),outside=()=>import(\"../../outside.js\");export{data};\n",
        )
        .unwrap();
        fs::write(core.join("dist/data.json"), "{\"a\":1}").unwrap();
        let vendored = vendor(&root, std::path::Path::new("vendor"), false, true, None).unwrap();
        assert_eq!(
            fs::read_to_string(root.join("vendor/zerolith/dist/data.json")).unwrap(),
            "{\"a\":1}"
        );
        assert_eq!(
            vendored.map.integrity.keys().cloned().collect::<Vec<_>>(),
            vec![
                "/vendor/zerolith/dist/data.json",
                "/vendor/zerolith/dist/index.js"
            ]
        );
        assert_eq!(vendored.modules, vec!["/vendor/zerolith/dist/index.js"]);
        assert!(!root.join("vendor/zerolith/dist/optional.js").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn refuses_an_import_that_leaves_its_package_and_skips_export_patterns() {
        let root = std::env::temp_dir().join(format!(
            "zerolith-importmap-escape-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let core = root.join("node_modules/zerolith");
        fs::create_dir_all(core.join("dist/locales")).unwrap();
        fs::write(
            core.join("package.json"),
            r#"{"name":"zerolith","version":"0.0.0","exports":{".":"./dist/index.js","./locales/*":"./dist/locales/*.js","./assets/":"./dist/assets/"}}"#,
        )
        .unwrap();
        fs::write(core.join("dist/index.js"), "export const a=1;\n").unwrap();
        fs::write(core.join("dist/locales/de.js"), "export const de=1;\n").unwrap();
        let vendored = vendor(&root, std::path::Path::new("vendor"), false, true, None).unwrap();
        assert_eq!(
            vendored.map.imports.keys().cloned().collect::<Vec<_>>(),
            vec!["zerolith"]
        );

        fs::write(
            core.join("dist/index.js"),
            "export{a}from\"../../shared/a.js\";\n",
        )
        .unwrap();
        let error = vendor(&root, std::path::Path::new("vendor"), false, true, None)
            .expect_err("an import that leaves the package");
        assert!(
            error
                .to_string()
                .contains("imports ../../shared/a.js, which leaves its package's folder"),
            "{error}"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn removes_only_what_an_earlier_run_left_in_its_own_folders() {
        let root = std::env::temp_dir().join(format!(
            "zerolith-importmap-stale-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let core = root.join("node_modules/zerolith");
        fs::create_dir_all(core.join("dist")).unwrap();
        fs::write(
            core.join("package.json"),
            r#"{"name":"zerolith","version":"0.0.0","exports":{".":"./dist/index.js"}}"#,
        )
        .unwrap();
        fs::write(core.join("dist/index.js"), "export const v=1;\n").unwrap();
        let vendor_folder = root.join("vendor");
        vendor(&root, std::path::Path::new("vendor"), false, true, None).unwrap();
        fs::create_dir_all(vendor_folder.join("zerolith/dist/old")).unwrap();
        fs::write(vendor_folder.join("zerolith/dist/old/gone.js"), "stale").unwrap();
        fs::write(vendor_folder.join("zerolith/dist/gone.d.ts"), "stale").unwrap();
        fs::create_dir_all(vendor_folder.join("lenis")).unwrap();
        fs::write(vendor_folder.join("lenis/lenis.mjs"), "the site's own").unwrap();
        fs::write(core.join("dist/index.js"), "export const v=2;\n").unwrap();
        vendor(&root, std::path::Path::new("vendor"), false, true, None).unwrap();
        assert_eq!(
            fs::read_to_string(vendor_folder.join("zerolith/dist/index.js")).unwrap(),
            "export const v=2;\n"
        );
        assert!(!vendor_folder.join("zerolith/dist/old").exists());
        assert!(!vendor_folder.join("zerolith/dist/gone.d.ts").exists());
        assert_eq!(
            fs::read_to_string(vendor_folder.join("lenis/lenis.mjs")).unwrap(),
            "the site's own"
        );
        assert_eq!(
            fs::read_to_string(vendor_folder.join("zerolith/VERSION")).unwrap(),
            "0.0.0\n"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn writes_nothing_when_any_package_fails_its_checks() {
        let root = std::env::temp_dir().join(format!(
            "zerolith-importmap-plan-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let core = root.join("node_modules/zerolith");
        fs::create_dir_all(core.join("dist")).unwrap();
        fs::write(
            core.join("package.json"),
            r#"{"name":"zerolith","version":"0.0.0","exports":{".":"./dist/index.js"}}"#,
        )
        .unwrap();
        fs::write(core.join("dist/index.js"), "export const v=1;\n").unwrap();
        let router = root.join("node_modules/@zerolith/router");
        fs::create_dir_all(router.join("dist")).unwrap();
        fs::write(
            router.join("package.json"),
            r#"{"name":"@zerolith/router","version":"0.0.0","exports":{".":"./dist/index.js"}}"#,
        )
        .unwrap();
        fs::write(router.join("dist/index.js"), "export const r=1;\n").unwrap();
        let vendor_folder = root.join("vendor");
        vendor(&root, std::path::Path::new("vendor"), false, true, None).unwrap();
        let map = fs::read_to_string(vendor_folder.join("importmap.json")).unwrap();

        fs::write(core.join("dist/index.js"), "export const v=2;\n").unwrap();
        fs::write(router.join("dist/index.js"), "export{").unwrap();
        vendor(&root, std::path::Path::new("vendor"), false, true, None)
            .expect_err("a router module that does not parse");
        assert_eq!(
            fs::read_to_string(vendor_folder.join("zerolith/dist/index.js")).unwrap(),
            "export const v=1;\n"
        );
        assert_eq!(
            fs::read_to_string(vendor_folder.join("importmap.json")).unwrap(),
            map
        );
        let _ = fs::remove_dir_all(&root);
    }

    /// One import a generated module holds, as `module_from` writes it.
    #[derive(Debug, Clone)]
    enum Piece {
        Static {
            specifier: String,
            form: u8,
            spaced: bool,
        },
        Dynamic {
            specifier: String,
            template: bool,
        },
        Bare(String),
        Lookalike(String),
    }

    fn specifier() -> impl proptest::strategy::Strategy<Value = String> {
        use proptest::prelude::*;
        (0usize..3, "[a-z][a-z0-9_-]{0,7}").prop_map(|(up, name)| {
            if up == 0 {
                format!("./{name}.js")
            } else {
                format!("{}{name}.js", "../".repeat(up))
            }
        })
    }

    fn piece() -> impl proptest::strategy::Strategy<Value = Piece> {
        use proptest::prelude::*;
        prop_oneof![
            (specifier(), 0u8..4, any::<bool>()).prop_map(|(specifier, form, spaced)| {
                Piece::Static {
                    specifier,
                    form,
                    spaced,
                }
            }),
            (specifier(), any::<bool>()).prop_map(|(specifier, template)| Piece::Dynamic {
                specifier,
                template
            }),
            "[a-z]{1,8}".prop_map(Piece::Bare),
            specifier().prop_map(Piece::Lookalike),
        ]
    }

    /// The text of a module made of `pieces`, each binding under a name of its own.
    fn module_from(pieces: &[Piece]) -> String {
        pieces
            .iter()
            .enumerate()
            .map(|(index, piece)| match piece {
                Piece::Static {
                    specifier,
                    form,
                    spaced,
                } => {
                    let gap = if *spaced { " " } else { "" };
                    match form {
                        0 => {
                            format!("import{gap}{{ a as v{index} }}{gap}from{gap}\"{specifier}\";")
                        }
                        1 => format!("import{gap}'{specifier}';"),
                        2 => format!("export{gap}*{gap}from{gap}\"{specifier}\";"),
                        _ => format!("export{gap}{{ v{index} }}{gap}from{gap}'{specifier}';"),
                    }
                }
                Piece::Dynamic {
                    specifier,
                    template,
                } => {
                    if *template {
                        format!("const d{index}=()=>import(`{specifier}`);")
                    } else {
                        format!("const d{index}=()=>import(\"{specifier}\");")
                    }
                }
                Piece::Bare(name) => {
                    format!("import\"{name}\";const n{index}=()=>import(\"{name}\");")
                }
                Piece::Lookalike(specifier) => {
                    format!(
                        "const s{index}='import \"{specifier}\"; export * from \"{specifier}\"';"
                    )
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// The path a relative specifier names from a module's folder, found by deleting each `name/..` pair until none is left; None when a `..` would leave the package.
    fn reference_resolution(from: &str, specifier: &str) -> Option<String> {
        let folder = from.rsplit_once('/').map_or("", |(folder, _)| folder);
        let joined = format!("{folder}/{specifier}");
        let mut parts: Vec<&str> = joined
            .split('/')
            .filter(|part| !part.is_empty() && *part != ".")
            .collect();
        while let Some(at) = parts.iter().position(|part| *part == "..") {
            if at == 0 {
                return None;
            }
            parts.drain(at - 1..=at);
        }
        Some(parts.join("/"))
    }

    proptest::proptest! {
        /// The static imports a module holds are found in order, minified or spaced, quoted either way, for its effects alone or for bindings; `import()` paths are found apart from them; bare specifiers and text that only looks like an import are not.
        #[test]
        fn finds_exactly_the_relative_imports_a_module_holds(pieces in proptest::collection::vec(piece(), 0..12)) {
            let found = relative_imports(&module_from(&pieces)).unwrap();
            let statically: Vec<String> = pieces
                .iter()
                .filter_map(|piece| match piece {
                    Piece::Static { specifier, .. } => Some(specifier.clone()),
                    _ => None,
                })
                .collect();
            let dynamically: Vec<String> = pieces
                .iter()
                .filter_map(|piece| match piece {
                    Piece::Dynamic { specifier, .. } => Some(specifier.clone()),
                    _ => None,
                })
                .collect();
            proptest::prop_assert_eq!(found.statically, statically);
            proptest::prop_assert_eq!(found.dynamically, dynamically);
        }

        /// A relative specifier resolves as deleting each `name/..` pair resolves it, and to nothing when it climbs above the package's folder.
        #[test]
        fn resolves_as_the_reference_does(
            from in "[a-z]{1,4}(/[a-z]{1,4}){0,3}\\.js",
            specifier in "(\\./|(\\.\\./){1,4})([a-z]{1,4}/|\\./|\\.\\./){0,3}[a-z]{1,4}\\.js",
        ) {
            proptest::prop_assert_eq!(resolve_within(&from, &specifier), reference_resolution(&from, &specifier));
        }

        /// A module's closing comment gives back the URL it names and where its line starts, whatever comes before it; a module that does not end with one gives nothing.
        #[test]
        fn reads_the_comment_that_ends_a_module(code in "[^\\r\\n]{0,40}(\\n[^\\r\\n]{0,40}){0,3}", url in "[^\\s]{1,30}", trailing in "\\n{0,2}") {
            let module = format!("{code}\n//# sourceMappingURL={url}{trailing}");
            let found = super::source_map_comment(module.as_bytes());
            proptest::prop_assert_eq!(found, Some((code.len() + 1, url.clone())));
            let ends_otherwise = format!("//# sourceMappingURL={url}\n{code}x");
            proptest::prop_assert_eq!(super::source_map_comment(ends_otherwise.as_bytes()).map(|(_, named)| named), None::<String>);
        }
    }

    #[test]
    fn keeps_an_earlier_runs_files_unless_asked_to_prune_and_refuses_an_entry_outside_the_package()
    {
        let root = std::env::temp_dir().join(format!(
            "zerolith-importmap-prune-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let core = root.join("node_modules/zerolith");
        fs::create_dir_all(core.join("dist/production")).unwrap();
        fs::write(core.join("package.json"), r#"{"name":"zerolith","version":"0.0.0","exports":{".":{"development":"./dist/index.js","default":"./dist/production/index.js"}}}"#).unwrap();
        fs::write(core.join("dist/index.js"), "export const dev=1;\n").unwrap();
        fs::write(
            core.join("dist/production/index.js"),
            "export const prod=1;\n",
        )
        .unwrap();
        vendor(&root, std::path::Path::new("vendor"), true, false, None).unwrap();
        vendor(&root, std::path::Path::new("vendor"), false, false, None).unwrap();
        assert!(root.join("vendor/zerolith/dist/index.js").is_file());
        assert!(
            root.join("vendor/zerolith/dist/production/index.js")
                .is_file()
        );
        vendor(&root, std::path::Path::new("vendor"), false, true, None).unwrap();
        assert!(!root.join("vendor/zerolith/dist/index.js").exists());

        fs::write(core.join("package.json"), r#"{"name":"zerolith","version":"0.0.0","exports":{".":"./dist/production/index.js","./outside":"./../../outside.js"}}"#).unwrap();
        fs::write(root.join("node_modules/outside.js"), "export const o=1;\n").unwrap();
        let error = vendor(&root, std::path::Path::new("vendor"), false, true, None)
            .expect_err("an entry outside the package");
        assert!(
            error
                .to_string()
                .starts_with("zerolith exports ./outside as ./../../outside.js, which leaves"),
            "{error}"
        );
        assert!(!root.join("outside.js").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn reads_and_writes_a_source_map_only_beside_its_module() {
        for url in ["index.js.map", "index.named.map"] {
            assert!(super::names_file_beside(url), "{url}");
        }
        for url in [
            "",
            ".",
            "..",
            "../index.js.map",
            "maps/index.js.map",
            "maps\\index.js.map",
            "/index.js.map",
            "C:index.js.map",
            "C:\\index.js.map",
            "index.js.map?v=1",
            "index.js.map#x",
            "data:application/json;base64,e30=",
            "index.map.json",
            "x",
            "view.js",
            "VERSION",
            ".map",
        ] {
            assert!(!super::names_file_beside(url), "{url}");
        }
    }

    #[test]
    fn refuses_an_entry_the_package_does_not_hold() {
        let root = std::env::temp_dir().join(format!(
            "zerolith-importmap-missing-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let router = root.join("node_modules/@zerolith/router");
        fs::create_dir_all(router.join("dist")).unwrap();
        fs::write(router.join("package.json"), r#"{"name":"@zerolith/router","version":"0.0.0","exports":{".":{"development":"./dist/index.js","default":"./dist/production/index.js"}}}"#).unwrap();
        fs::write(router.join("dist/index.js"), "export const dev = 1;\n").unwrap();
        let error = vendor(&root, std::path::Path::new("vendor"), false, true, None)
            .expect_err("an entry the package does not hold");
        assert!(
            error
                .to_string()
                .starts_with("/vendor/@zerolith/router/dist/production/index.js is missing from "),
            "{error}"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn keeps_the_page_entries_the_vendored_map_does_not_replace() {
        let mut vendored = Vendored::default();
        vendored
            .map
            .imports
            .insert("zerolith".into(), "/vendor/zerolith/index.js".into());
        let page = "<head><script type=\"importmap\">{\"imports\":{\"zerolith\":\"/old.js\",\"lit\":\"https://cdn.example/lit.js\"},\"scopes\":{\"/legacy/\":{\"lit\":\"/legacy/lit.js\"}}}</script></head>";
        let updated = update_html(page, &page_tags(&vendored, page, None));
        assert!(updated.contains("\"zerolith\":\"/vendor/zerolith/index.js\""));
        assert!(updated.contains("\"lit\":\"https://cdn.example/lit.js\""));
        assert!(updated.contains("\"scopes\":{\"/legacy/\":{\"lit\":\"/legacy/lit.js\"}}"));
        assert!(!updated.contains("/old.js"));
        assert_eq!(
            page_tags(&vendored, "<head></head>", None),
            html_tags(&vendored)
        );

        vendored.folders = vec!["/vendor/zerolith/".into()];
        vendored
            .map
            .integrity
            .insert("/vendor/zerolith/index.js".into(), "sha256-kept".into());
        let earlier = "<head><script type=\"importmap\">{\"imports\":{\"zerolith/internal\":\"/vendor/zerolith/dist/internal.js\",\"#core\":\"/vendor/zerolith/index.js\",\"core/\":\"/vendor/zerolith/\",\"lit\":\"/lib/lit.js\"},\"integrity\":{\"/vendor/zerolith/dist/index.js\":\"sha256-old\",\"/lib/lit.js\":\"sha384-lit\"}}</script></head>";
        let refreshed = update_html(earlier, &page_tags(&vendored, earlier, None));
        assert!(!refreshed.contains("/vendor/zerolith/dist/"));
        assert!(refreshed.contains("\"#core\":\"/vendor/zerolith/index.js\""));
        assert!(refreshed.contains("\"core/\":\"/vendor/zerolith/\""));
        assert!(refreshed.contains("\"lit\":\"/lib/lit.js\""));
        assert!(refreshed.contains("\"/lib/lit.js\":\"sha384-lit\""));

        let scoped = "<head><script type=\"importmap\">{\"imports\":{},\"scopes\":{\"/app/\":{\"zerolith/x\":\"/vendor/zerolith/dist/x.js\"},\"/legacy/\":{\"lit\":\"/legacy/lit.js\",\"zerolith\":\"/vendor/zerolith/dist/old.js\"}}}</script></head>";
        let cleaned = update_html(scoped, &page_tags(&vendored, scoped, None));
        assert!(!cleaned.contains("/vendor/zerolith/dist/"));
        assert!(!cleaned.contains("\"/app/\""));
        assert!(cleaned.contains("\"scopes\":{\"/legacy/\":{\"lit\":\"/legacy/lit.js\"}}"));
    }

    #[test]
    fn rewrites_a_map_with_other_attributes_and_keeps_them() {
        let mut vendored = Vendored::default();
        vendored
            .map
            .imports
            .insert("zerolith".into(), "/vendor/zerolith/index.js".into());
        let page = "<head>\n<!-- <script type=\"importmap\">{\"imports\":{}}</script> -->\n<script type=\"importmap\" nonce=\"n0\">{\"imports\":{\"lit\":\"/lit.js\"}}</script>\n<script type=\"importmap\">{}</script>\n</head>";
        let updated = update_html(page, &page_tags(&vendored, page, None));
        assert!(
            updated.contains("<script type=\"importmap\" nonce=\"n0\">{\"imports\":{\"lit\":\"/lit.js\",\"zerolith\":\"/vendor/zerolith/index.js\"}}</script>"),
            "{updated}"
        );
        assert!(
            updated.contains("<!-- <script type=\"importmap\">{\"imports\":{}}</script> -->"),
            "{updated}"
        );
        assert_eq!(
            updated.matches("<script type=\"importmap\"").count(),
            2,
            "{updated}"
        );
    }

    #[test]
    fn walks_a_pages_modules_and_vendors_what_they_reach() {
        let root = std::env::temp_dir().join(format!(
            "zerolith-importmap-graph-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let packages = root.join("node_modules");
        for (package, manifest, files) in [
            (
                "zerolith",
                r#"{"name":"zerolith","version":"0.0.0","exports":{".":"./dist/index.js","./ssr":"./dist/ssr.js","./internal":"./dist/internal.js"}}"#,
                vec![
                    ("dist/index.js", "import\"./scan.js\";export const html=1;"),
                    ("dist/scan.js", "export const scan=1;"),
                    ("dist/ssr.js", "export const render=1;"),
                    ("dist/internal.js", "export const version=1;"),
                ],
            ),
            (
                "@zerolith/router",
                r#"{"name":"@zerolith/router","version":"0.0.0","exports":{".":"./dist/index.js","./server":"./dist/server.js"}}"#,
                vec![
                    (
                        "dist/index.js",
                        "import{html}from\"zerolith\";export const createRouter=html;\n//# sourceMappingURL=index.js.map\n",
                    ),
                    (
                        "dist/index.js.map",
                        r#"{"version":3,"file":"index.js","sources":["../src/index.ts"],"sourcesContent":["export const createRouter = 1;\n"],"names":[],"mappings":"AAAA"}"#,
                    ),
                    ("dist/server.js", "export const serverRouter=1;"),
                ],
            ),
            (
                "@zerolith/forms",
                r#"{"name":"@zerolith/forms","version":"0.0.0","exports":{".":"./dist/index.js"}}"#,
                vec![("dist/index.js", "export const form=1;")],
            ),
            (
                "@zerolith/a11y",
                r#"{"name":"@zerolith/a11y","version":"0.0.0","exports":{".":"./dist/index.js"}}"#,
                vec![("dist/index.js", "export const announce=1;")],
            ),
        ] {
            let folder = packages.join(package);
            fs::create_dir_all(folder.join("dist")).unwrap();
            fs::write(folder.join("package.json"), manifest).unwrap();
            fs::write(folder.join("LICENSE"), "Apache License\n").unwrap();
            for (file, text) in files {
                fs::write(folder.join(file), text).unwrap();
            }
        }
        fs::create_dir_all(root.join("src/views")).unwrap();
        fs::write(
            root.join("src/main.ts"),
            "import { html } from \"zerolith\";\nimport { app } from \"./app.js\";\nimport { lazy } from \"./lazy.js\";\nexport const main: number = html + app + lazy;\n",
        )
        .unwrap();
        fs::write(
            root.join("src/app.ts"),
            "import { createRouter } from \"@zerolith/router\";\nimport { view } from \"/src/views/view.js\";\nexport const app = createRouter + view;\n",
        )
        .unwrap();
        fs::write(
            root.join("src/views/view.ts"),
            "export const view = 1;\nexport const settings = () => import(\"./settings.js\");\n",
        )
        .unwrap();
        fs::write(
            root.join("src/views/settings.ts"),
            "import { form } from \"@zerolith/forms\";\nexport const settings = form;\n",
        )
        .unwrap();
        fs::write(
            root.join("src/lazy.ts"),
            "export const lazy = () => import(\"./tools.js\");\n",
        )
        .unwrap();
        fs::write(root.join("src/tools.ts"), "export const tools = 1;\n").unwrap();
        let page = "<!doctype html>\n<html><head>\n<script type=\"module\" src=\"/src/main.js\"></script>\n<script type=\"module\" src=\"./src/main.js?v=2\"></script>\n<script type=\"module\">import \"zerolith\";\nconst a11y = () => import(\"@zerolith/a11y\");</script>\n<script src=\"/legacy.js\"></script>\n</head><body></body></html>\n";
        fs::write(root.join("index.html"), page).unwrap();

        let graph = super::page_graph(&root, "/index.html", page).unwrap();
        assert_eq!(graph.entries, vec!["/src/main.js"]);
        assert_eq!(
            graph.modules,
            vec![
                "/src/main.js",
                "/src/app.js",
                "/src/views/view.js",
                "/src/lazy.js"
            ]
        );
        assert_eq!(
            graph.bare.iter().collect::<Vec<_>>(),
            ["@zerolith/router", "zerolith"]
        );
        assert_eq!(
            graph.lazy.iter().collect::<Vec<_>>(),
            ["@zerolith/a11y", "@zerolith/forms"]
        );

        let vendored = vendor(
            &root,
            std::path::Path::new("vendor"),
            false,
            true,
            Some(&graph),
        )
        .unwrap();
        assert_eq!(
            vendored.map.imports.keys().collect::<Vec<_>>(),
            [
                "@zerolith/a11y",
                "@zerolith/forms",
                "@zerolith/router",
                "zerolith"
            ]
        );
        assert_eq!(
            vendored.map.integrity.keys().collect::<Vec<_>>(),
            [
                "/vendor/@zerolith/a11y/dist/index.js",
                "/vendor/@zerolith/forms/dist/index.js",
                "/vendor/@zerolith/router/dist/index.js",
                "/vendor/zerolith/dist/index.js",
                "/vendor/zerolith/dist/scan.js"
            ]
        );
        for absent in [
            "zerolith/dist/ssr.js",
            "zerolith/dist/internal.js",
            "@zerolith/router/dist/server.js",
        ] {
            assert!(
                !root.join("vendor").join(absent).exists(),
                "{absent} was vendored"
            );
        }
        assert!(root.join("vendor/@zerolith/forms/LICENSE").is_file());
        assert!(
            root.join("vendor/@zerolith/router/dist/index.js.map")
                .is_file()
        );
        assert_eq!(
            vendored.preloads(&graph),
            vec![
                "/src/app.js",
                "/src/views/view.js",
                "/src/lazy.js",
                "/vendor/@zerolith/router/dist/index.js",
                "/vendor/zerolith/dist/index.js",
                "/vendor/zerolith/dist/scan.js"
            ]
        );
        let updated = update_html(page, &page_tags(&vendored, page, Some(&graph)));
        assert!(
            updated.contains(
                "<link rel=\"modulepreload\" href=\"/src/app.js\" data-zerolith-preload>"
            ),
            "{updated}"
        );
        assert!(!updated.contains("href=\"/src/main.js\""), "{updated}");
        assert!(
            !updated.contains("href=\"/vendor/@zerolith/forms/"),
            "{updated}"
        );
        let hash = &vendored.map.integrity["/vendor/@zerolith/router/dist/index.js"];
        assert!(
            updated.contains(&format!("<link rel=\"modulepreload\" href=\"/vendor/@zerolith/router/dist/index.js\" integrity=\"{hash}\" data-zerolith-preload>")),
            "{updated}"
        );
        assert!(
            updated.contains(
                "<link rel=\"modulepreload\" href=\"/vendor/zerolith/dist/scan.js\" integrity="
            ),
            "{updated}"
        );
        assert_eq!(updated.matches("rel=\"modulepreload\"").count(), 6);
        assert!(
            updated.find("<script type=\"importmap\">").unwrap()
                < updated.find("src=\"/src/main.js\"").unwrap()
        );

        fs::write(
            root.join("index.html"),
            "<!doctype html><head><script type=\"module\">import \"zerolith\";</script></head>",
        )
        .unwrap();
        let narrowed = super::page_graph(
            &root,
            "/index.html",
            &fs::read_to_string(root.join("index.html")).unwrap(),
        )
        .unwrap();
        assert!(narrowed.entries.is_empty() && narrowed.modules.is_empty());
        let vendored = vendor(
            &root,
            std::path::Path::new("vendor"),
            false,
            true,
            Some(&narrowed),
        )
        .unwrap();
        assert_eq!(
            vendored.map.imports.keys().collect::<Vec<_>>(),
            ["zerolith"]
        );
        assert_eq!(vendored.versions.keys().collect::<Vec<_>>(), ["zerolith"]);
        assert!(root.join("vendor/@zerolith/router/dist/index.js").is_file());
        assert!(root.join("vendor/@zerolith/forms/dist/index.js").is_file());
        assert!(root.join("vendor/zerolith/dist/index.js").is_file());
        assert_eq!(
            vendored.preloads(&narrowed),
            vec![
                "/vendor/zerolith/dist/index.js",
                "/vendor/zerolith/dist/scan.js"
            ]
        );
        let stale = "<head><script type=\"importmap\">{\"imports\":{\"@zerolith/router\":\"/vendor/@zerolith/router/dist/index.js\",\"lit\":\"/lib/lit.js\"}}</script></head>";
        let cleaned = update_html(stale, &page_tags(&vendored, stale, Some(&narrowed)));
        assert!(!cleaned.contains("@zerolith/router"), "{cleaned}");
        assert!(cleaned.contains("\"lit\":\"/lib/lit.js\""), "{cleaned}");

        let nothing = super::page_graph(&root, "/index.html", "<head></head>").unwrap();
        assert!(nothing.unbounded() && !nothing.open);
        let vendored = vendor(
            &root,
            std::path::Path::new("vendor"),
            false,
            true,
            Some(&nothing),
        )
        .unwrap();
        assert_eq!(vendored.map.imports.len(), 7);
        assert!(
            root.join("vendor/@zerolith/router/dist/server.js")
                .is_file()
        );
        assert!(vendored.preloads(&nothing).is_empty());

        fs::write(
            root.join("src/main.ts"),
            "import { html } from \"zerolith\";\nexport const open = (name: string) => import(name);\nexport const main = html;\n",
        )
        .unwrap();
        let computed = super::page_graph(
            &root,
            "/index.html",
            "<script type=\"module\" src=\"/src/main.js\"></script>",
        )
        .unwrap();
        assert!(computed.open && computed.unbounded());
        assert_eq!(computed.bare.iter().collect::<Vec<_>>(), ["zerolith"]);
        let vendored = vendor(
            &root,
            std::path::Path::new("vendor"),
            false,
            true,
            Some(&computed),
        )
        .unwrap();
        assert_eq!(vendored.map.imports.len(), 7);
        assert_eq!(
            vendored.preloads(&computed),
            vec![
                "/vendor/zerolith/dist/index.js",
                "/vendor/zerolith/dist/scan.js"
            ]
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn writes_every_page_given_from_one_vendoring() {
        let root = std::env::temp_dir().join(format!(
            "zerolith-importmap-pages-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        for (path, text) in [
            (
                "node_modules/zerolith/package.json",
                r#"{"name":"zerolith","version":"0.0.0","exports":{".":"./dist/index.js","./ssr":"./dist/ssr.js"}}"#,
            ),
            (
                "node_modules/zerolith/dist/index.js",
                "export const html=1;",
            ),
            (
                "node_modules/zerolith/dist/ssr.js",
                "export const render=1;",
            ),
            (
                "node_modules/@zerolith/router/package.json",
                r#"{"name":"@zerolith/router","version":"0.0.0","exports":{".":"./dist/index.js"}}"#,
            ),
            (
                "node_modules/@zerolith/router/dist/index.js",
                "import{html}from\"zerolith\";export const createRouter=html;",
            ),
            (
                "index.html",
                "<!doctype html><head><script type=\"module\" src=\"/src/home.js\"></script></head>",
            ),
            (
                "src/home.js",
                "import { html } from \"zerolith\";\nexport const home = html;\n",
            ),
            (
                "about/index.html",
                "<!doctype html><head><script type=\"module\" src=\"../src/about.js\"></script></head>",
            ),
            (
                "src/about.js",
                "import { createRouter } from \"@zerolith/router\";\nimport { shared } from \"./shared.js\";\nexport const about = createRouter + shared;\n",
            ),
            ("src/shared.js", "export const shared = 1;\n"),
        ] {
            let file = root.join(path);
            fs::create_dir_all(file.parent().unwrap()).unwrap();
            fs::write(file, text).unwrap();
        }
        super::run(
            &root,
            std::path::Path::new("vendor"),
            false,
            &[
                PathBuf::from("index.html"),
                PathBuf::from("about/index.html"),
            ],
        )
        .unwrap();
        let home = fs::read_to_string(root.join("index.html")).unwrap();
        let about = fs::read_to_string(root.join("about/index.html")).unwrap();
        for page in [&home, &about] {
            assert!(
                page.contains("\"@zerolith/router\":\"/vendor/@zerolith/router/dist/index.js\"")
                    && page.contains("\"zerolith\":\"/vendor/zerolith/dist/index.js\"")
                    && !page.contains("zerolith/ssr"),
                "{page}"
            );
        }
        assert!(
            home.contains("href=\"/vendor/zerolith/dist/index.js\"")
                && !home.contains("href=\"/vendor/@zerolith/router/")
                && !home.contains("href=\"/src/"),
            "{home}"
        );
        assert!(
            about.contains("href=\"/src/shared.js\" data-zerolith-preload>")
                && about.contains("href=\"/vendor/@zerolith/router/dist/index.js\"")
                && about.contains("href=\"/vendor/zerolith/dist/index.js\"")
                && !about.contains("href=\"/src/about.js\""),
            "{about}"
        );
        assert!(!root.join("vendor/zerolith/dist/ssr.js").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn covers_named_and_prefixed_specifiers() {
        let mut map = ImportMap::default();
        map.imports.insert("lit".into(), "/lit.js".into());
        map.imports.insert("lodash/".into(), "/lodash/".into());
        assert!(covers(&map, "lit"));
        assert!(covers(&map, "lodash/get.js"));
        assert!(!covers(&map, "lit/decorators.js"));
        assert!(!covers(&map, "lodash"));
    }
}
