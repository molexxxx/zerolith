//! Which files of each package a page needs, with their integrity hashes
//! and source maps, and the vendored folder written from that plan.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use base64::Engine;
use serde::Deserialize;
use sha2::{Digest, Sha256};

use super::graph::{PageGraph, resolve_within};
use super::imports::relative_imports;
use super::{PACKAGES, Vendored};

#[derive(Deserialize)]
struct Manifest {
    pub(super) version: String,
    pub(super) exports: BTreeMap<String, serde_json::Value>,
}

/// The `sha256-...` integrity value for file contents.
pub fn integrity(bytes: &[u8]) -> String {
    format!(
        "sha256-{}",
        base64::engine::general_purpose::STANDARD.encode(Sha256::digest(bytes))
    )
}

/// Picks the file an export entry resolves to under the given condition, falling back to `default`.
pub(super) fn resolve_export(entry: &serde_json::Value, development: bool) -> Option<String> {
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
    pub(super) sources: Vec<serde::de::IgnoredAny>,
    #[serde(rename = "sourcesContent", default)]
    pub(super) contents: Option<Vec<Option<serde::de::IgnoredAny>>>,
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
pub(super) fn names_file_beside(url: &str) -> bool {
    url.len() > ".map".len() && url.ends_with(".map") && !url.contains(['/', '\\', ':', '?', '#'])
}

/// The `//# sourceMappingURL=` comment that ends a module: where its line starts and the URL it names.
pub(super) fn source_map_comment(code: &[u8]) -> Option<(usize, String)> {
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
    pub(super) bytes: Vec<u8>,
    pub(super) map: Option<(String, Vec<u8>)>,
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
pub(super) const LICENSE_FILES: [&str; 3] = ["LICENSE", "LICENSE.md", "LICENSE.txt"];

/// Git settings written at the top of the vendor folder: no line ending conversion, since a converted module fails its integrity hash, and the `dist/` folders kept in commits, which a project's own `dist/` rule would leave out.
pub(super) const GIT_ATTRIBUTES: &str = "# Written by zerolith importmap. The vendored modules carry integrity hashes, which line ending conversion would break.\n* -text\n";
pub(super) const GIT_IGNORE: &str = "# Written by zerolith importmap. The vendored packages keep their dist/ folders in commits, whatever the project's own rules say.\n!**/dist/\n";

/// What a run writes for one package: its files by their path in the package folder, and its version; `empty` once the pages' graph reaches none of its modules, so the folder is left as it is, neither written nor removed, for a page the run was not given.
pub(super) struct PackagePlan {
    pub(super) package: &'static str,
    pub(super) version: String,
    pub(super) writes: BTreeMap<String, Vec<u8>>,
    pub(super) empty: bool,
}

/// The other edges out of a vendored module: the bare specifiers it imports, which the map resolves to other entries, and what it loads through `import()`.
#[derive(Default)]
pub(super) struct Edges {
    pub(super) statically: Vec<String>,
    pub(super) dynamically: Vec<String>,
    pub(super) bare_dynamically: Vec<String>,
}

/// What planning found: each package's files, each file's integrity hash by URL, the URLs each module imports statically, and its other edges.
#[derive(Default)]
pub(super) struct Plan {
    pub(super) packages: Vec<PackagePlan>,
    pub(super) files: BTreeMap<String, String>,
    pub(super) statics: BTreeMap<String, Vec<String>>,
    pub(super) edges: BTreeMap<String, Edges>,
}

/// The URLs a page's graph reaches among the planned files, by any edge: a mapped entry it names, statically or through `import()`, then every import, static or not, relative or through the map. `None` when there is no page, or the walk could not bound what the page loads, which keeps everything.
pub(super) fn reached_by(
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
pub(super) fn plan(
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

/// Removes a stale entry: a file, or a symbolic link, which Windows removes as a directory when it points at one.
pub(super) fn remove_entry(path: &Path) -> io::Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::fs::FileTypeExt;
        if fs::symlink_metadata(path)?.file_type().is_symlink_dir() {
            return fs::remove_dir(path);
        }
    }
    fs::remove_file(path)
}

/// Writes a package's `VERSION` and then its planned files into its folder in place, so a write that fails partway leaves a folder a later run takes for its own, and lists in `stale` the files an earlier run left there that the entries no longer load, and in `folders` every folder of the package, for `Vendored::prune` to remove once the pages that named the files are rewritten. Only a folder that holds nothing but what this command writes reaches here, since planning refuses one without a `VERSION` file.
pub(super) fn write_package(
    folder: &Path,
    plan: &PackagePlan,
    stale: &mut Vec<PathBuf>,
    folders: &mut Vec<PathBuf>,
) -> io::Result<()> {
    fs::create_dir_all(folder)?;
    fs::write(folder.join("VERSION"), format!("{}\n", plan.version))?;
    for (file, bytes) in &plan.writes {
        let to = folder.join(file);
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&to, bytes)?;
    }
    let (files, found) = files_and_folders(folder)?;
    for file in files {
        if file != "VERSION" && !plan.writes.contains_key(&file) {
            stale.push(folder.join(&file));
        }
    }
    folders.extend(found);
    Ok(())
}
