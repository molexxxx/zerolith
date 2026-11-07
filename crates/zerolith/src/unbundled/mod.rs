//! `zerolith build --unbundled`: the buildless path's production output. Every source
//! under the project is copied into an output folder, with `.ts`, `.tsx`,
//! `.jsx`, and `.mts` files transformed to JavaScript and renamed, the
//! relative specifiers that named them rewritten to `.js`, HTML module
//! scripts pointed at the renamed files, and the installed zerolith packages
//! vendored into the output with an import map carrying integrity hashes,
//! merged with the page's own map. That map also resolves each of the
//! application's own modules to an address carrying its hash, so a new build
//! never meets a browser's older copy, with no module rewritten for it. An import
//! of a file that is not a module, such as a stylesheet, is pointed at a
//! small module written next to the file that gives what `zerolith dev`
//! gives. The result serves from any static host.

use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::importmap::{
    ImportMap, PageGraph, Vendored, covers, import_map_hash, page_graph, page_map, page_tags,
    update_html, vendor_from,
};
use crate::{css, env, term};

mod files;
mod rewrite;
#[cfg(test)]
mod tests;

use files::{page_sources, walk};
use rewrite::{Defines, Imports, address_of, versioned_page, write_import};

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
    /// The application's own modules, as written to the output.
    own_modules: Vec<PathBuf>,
    /// What a Content-Security-Policy names in `script-src` to allow a page's import map, with the pages each allows.
    pub map_hashes: BTreeMap<String, Vec<String>>,
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
        built
            .own_modules
            .push(write_import(&root, &out_dir, file, *form, importer)?);
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
        graphs.push((url, graph));
    }
    let installed = packages.join("zerolith").is_dir();
    let mut vendored = if installed {
        vendor_from(
            &packages,
            &out_dir,
            Path::new("vendor"),
            false,
            prepare_templates,
            Some(&every),
        )?
    } else {
        Vendored::default()
    };
    vendored.addresses = built
        .own_modules
        .iter()
        .map(|file| address_of(&out_dir, file))
        .collect::<io::Result<_>>()?;
    let mut mapped = ImportMap::default();
    for (path, (url, graph)) in built.pages.iter().zip(&graphs) {
        let current = fs::read_to_string(path)?;
        if let Some(map) = page_map(&current) {
            mapped.imports.extend(map.imports);
        }
        let mapping = if installed || !vendored.addresses.is_empty() {
            update_html(&current, &page_tags(&vendored, url, &current, Some(graph)))
        } else {
            current
        };
        let written = versioned_page(&mapping, url, &out_dir, &vendored.addresses)?;
        if let Some(hash) = import_map_hash(&written) {
            built.map_hashes.entry(hash).or_default().push(url.clone());
        }
        fs::write(path, written)?;
    }
    if let Err(error) = vendored.prune() {
        warnings.push(format!(
            "{error}; the pages are written, and the next build removes what this one left"
        ));
    }
    mapped.imports.extend(vendored.map.imports.clone());
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
    for (hash, pages) in &built.map_hashes {
        let which = if built.map_hashes.len() > 1 {
            format!(", for {}", pages.join(" and "))
        } else {
            String::new()
        };
        anstream::println!(
            "{}",
            term::row(
                "Policy",
                term::label,
                format!(
                    "'{hash}' in script-src allows the import map{which}; it changes with the modules"
                )
            )
        );
    }
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
