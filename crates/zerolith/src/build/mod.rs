//! `zerolith build`: bundles the modules `index.html`
//! loads with Rolldown, the bundler Vite is built on, applying the same JSX
//! lowering, template preparation, and split check as the Vite plugin. The
//! output is minified, tree-shaken chunks with hashed names, one stylesheet
//! made from the stylesheets the page links and the modules import, the
//! files they reference, the public folder, and an `index.html` that loads
//! them. Given a module instead of a page, it writes that module as one
//! script with a name that stays the same, for a page someone else writes.

use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use rolldown::plugin::Plugin;
use rolldown::{
    AddonOutputOption, Bundler, BundlerOptions, BundlerTransformOptions, Either, InputItem,
    OutputFormat, Platform, PreserveEntrySignatures, RawMinifyOptions, ResolveOptions,
    SourceMapType, TsConfig,
};
use rolldown_common::{CodeSplittingMode, Output, OutputChunk};

use crate::css::{self, Assets, Located};
use crate::scan::DIAGNOSTIC_URL;
use crate::{env, html, term};

mod output;
mod plugin;
mod report;
#[cfg(test)]
mod tests;

use output::{copy_folder, list, page_file};
pub use output::{normalize_base, prepare_out_dir, resolve_out_dir};
use plugin::{Recorded, SCRIPT_TARGET, Zerolith, failure, path_of, quoted};
use report::{COMPRESSED, describe, gzip_size, kilobytes};

/// What `build` needs.
pub struct Options {
    /// The project folder, holding `index.html`.
    pub root: PathBuf,
    /// The output folder, relative to the root unless absolute.
    pub out: PathBuf,
    /// Empty an output folder outside the project too; one inside it is always emptied.
    pub empty_out_dir: bool,
    /// The public base path the app is served under, as `normalize_base` returns it.
    pub base: String,
    /// `production`, or another mode that resolves the development build of the packages.
    pub mode: String,
    pub minify: bool,
    pub sourcemap: bool,
    pub prepare: bool,
    /// One script to write instead of the page and its chunks.
    pub script: Option<Script>,
}

/// One script for a page someone else writes: a module and everything it imports, lazy imports included, under a name that stays the same from one build to the next.
#[derive(Debug, Clone)]
pub struct Script {
    /// The module to start from, relative to the project unless absolute.
    pub entry: PathBuf,
    /// The file's name in the output folder, without `.js`.
    pub name: String,
    /// Write a plain script instead of an ES module, which any `<script src>` loads from any origin. It has no exports.
    pub classic: bool,
}

impl Script {
    /// The script for `entry`, named `name` or, without one, after the module. `name` may carry the `.js` the file gets, and has to be a plain file name.
    pub fn new(entry: PathBuf, name: Option<String>) -> io::Result<Self> {
        let chosen = name.unwrap_or_else(|| {
            entry
                .file_stem()
                .map(|stem| stem.to_string_lossy().into_owned())
                .unwrap_or_default()
        });
        let name = chosen.strip_suffix(".js").unwrap_or(&chosen).to_string();
        let plain = !name.is_empty()
            && !name.starts_with('.')
            && name
                .chars()
                .all(|found| found.is_ascii_alphanumeric() || "-_.".contains(found));
        if !plain {
            return Err(failure(format!(
                "--name {chosen} is not a plain file name; use letters, digits, dashes, underscores, and dots, as in --name feedback-widget"
            )));
        }
        Ok(Self {
            entry,
            name,
            classic: false,
        })
    }
}

/// One file the build wrote.
#[derive(Debug, PartialEq, Eq)]
pub struct Written {
    /// The path relative to the output folder, with forward slashes.
    pub path: String,
    pub bytes: u64,
}

/// What `build` reports.
#[derive(Debug)]
pub struct Built {
    pub out_dir: PathBuf,
    /// Every file in the output folder, sorted by path.
    pub files: Vec<Written>,
    pub warnings: Vec<String>,
}

/// The version of `package` as Node resolves it from `root`: from the nearest `node_modules` folder that holds it.
pub fn installed_version(root: &Path, package: &str) -> Option<String> {
    root.ancestors().find_map(|folder| {
        let text = fs::read_to_string(
            folder
                .join("node_modules")
                .join(package)
                .join("package.json"),
        )
        .ok()?;
        let manifest = serde_json::from_str::<serde_json::Value>(&text).ok()?;
        manifest.get("version")?.as_str().map(str::to_string)
    })
}

/// Fails with `package_version_mismatch` when the installed zerolith is not the version of this command line, since the prepare pass writes calls into its `zerolith/internal` entry, which can change with every version.
pub fn check_core_version(root: &Path) -> io::Result<()> {
    let own = env!("CARGO_PKG_VERSION");
    match installed_version(root, "zerolith") {
        Some(installed) if installed != own => Err(failure(format!(
            "package_version_mismatch: the command line {own} requires zerolith {own}, and zerolith {installed} is installed. Install one version of both, with npm install @zerolith/cli@{installed} or npm install zerolith@{own}, or build with --no-prepare to keep the scanner. {DIAGNOSTIC_URL}package_version_mismatch"
        ))),
        _ => Ok(()),
    }
}

/// What `import.meta.url` reads in a classic script: the script's own address, which the intro captures while the script runs, since a plain script has no `import.meta`.
const SCRIPT_URL: &str = "__zerolith_script_url";

/// Captures a classic script's address for `import.meta.url` before its code runs, as `document.currentScript` is set only then; a worker has no document and reads its own location. Marked pure, so a script that never reads it carries none of it.
const SCRIPT_URL_INTRO: &str = "var __zerolith_script_url = /* @__PURE__ */ (() => typeof document !== \"undefined\" && document.currentScript !== null ? document.currentScript.src : self.location.href)();";

/// Bundles the project into its output folder.
pub async fn build(options: &Options) -> io::Result<Built> {
    let root = css::canonical(&options.root)?;
    if options.prepare {
        check_core_version(&root)?;
    }
    let (page_source, mut page, entries) = if let Some(script) = &options.script {
        let entry = root.join(&script.entry);
        let entry = css::canonical(&entry).map_err(|error| {
            io::Error::new(
                error.kind(),
                format!(
                    "{} could not be read ({error}); --entry names a module, relative to the project",
                    entry.display()
                ),
            )
        })?;
        (String::new(), html::Page::default(), vec![entry])
    } else {
        let page_path = root.join("index.html");
        let page_source = fs::read_to_string(&page_path).map_err(|error| {
            io::Error::new(
                error.kind(),
                format!(
                    "{} could not be read ({error}); zerolith build starts from index.html, or pass --entry to write one module as one script, or --unbundled to transform the sources file by file",
                    page_path.display()
                ),
            )
        })?;
        let page = html::scan(&page_source);
        if page.scripts.is_empty() {
            return Err(failure(
                "index.html has no <script type=\"module\" src=\"...\"> with a local source, so there is nothing to bundle".to_string(),
            ));
        }
        let entries = page
            .scripts
            .iter()
            .map(|script| page_file(&root, &script.url))
            .collect::<io::Result<Vec<PathBuf>>>()?;
        (page_source, page, entries)
    };
    let out_dir = resolve_out_dir(&root, &options.out)?;
    let mut warnings = Vec::new();
    let (styles, hosted): (Vec<_>, Vec<_>) = std::mem::take(&mut page.styles)
        .into_iter()
        .partition(|style| page_file(&root, &style.url).is_ok());
    page.styles = styles;
    warnings.extend(hosted.iter().map(|style| {
        format!(
            "index.html links {}, which is not in the project, so the link is kept as it is for the host to serve",
            style.url
        )
    }));
    let mut sources = entries.clone();
    sources.extend(
        page.styles
            .iter()
            .filter_map(|style| page_file(&root, &style.url).ok()),
    );
    prepare_out_dir(
        &root,
        &out_dir,
        &sources,
        options.empty_out_dir,
        &mut warnings,
    )?;
    let out_dir = css::canonical(&out_dir)?;

    let mut inputs = Vec::new();
    let mut names: Vec<String> = Vec::new();
    for (index, file) in entries.iter().enumerate() {
        let name = if let Some(script) = &options.script {
            script.name.clone()
        } else if entries.len() == 1 {
            "index".to_string()
        } else {
            let stem = file
                .file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or("entry");
            if names.iter().any(|name| name == stem) {
                format!("{stem}{index}")
            } else {
                stem.to_string()
            }
        };
        names.push(name.clone());
        inputs.push(InputItem {
            name: Some(name),
            import: file.to_string_lossy().into_owned(),
        });
    }

    let production = options.mode == "production";
    let mut conditions: Vec<String> = ["import", "module", "browser", "default"]
        .into_iter()
        .map(String::from)
        .collect();
    conditions.insert(
        0,
        if production {
            "production"
        } else {
            "development"
        }
        .to_string(),
    );
    let node_env = if production {
        "production"
    } else {
        "development"
    };
    let env = env::object(
        &options.mode,
        &options.base,
        &env::variables(&root, &options.mode),
    );
    let classic = options.script.as_ref().is_some_and(|script| script.classic);
    let mut define: Vec<(String, String)> = vec![
        ("import.meta.env".to_string(), env.to_string()),
        ("process.env.NODE_ENV".to_string(), quoted(node_env)),
    ];
    if classic {
        define.push(("import.meta.url".to_string(), SCRIPT_URL.to_string()));
    }
    if let Some(values) = env.as_object() {
        define.extend(
            values
                .iter()
                .map(|(key, value)| (format!("import.meta.env.{key}"), value.to_string())),
        );
    }
    let recorded = Arc::new(Mutex::new(Recorded {
        splits: Vec::new(),
        css: HashSet::new(),
        css_order: Vec::new(),
        assets: Assets::new(out_dir.join("assets")),
        warnings: Vec::new(),
        failures: Vec::new(),
    }));
    let plugin = Zerolith {
        prepare: options.prepare,
        production,
        minify: options.minify,
        root: root.clone(),
        base: options.base.clone(),
        entries: names.clone(),
        one_script: options.script.is_some(),
        recorded: recorded.clone(),
    };
    let mut bundler = Bundler::with_plugins(
        BundlerOptions {
            input: Some(inputs),
            cwd: Some(root.clone()),
            dir: Some(out_dir.to_string_lossy().into_owned()),
            format: Some(if classic {
                OutputFormat::Iife
            } else {
                OutputFormat::Esm
            }),
            platform: Some(Platform::Browser),
            minify: Some(if options.minify {
                RawMinifyOptions::Bool(true)
            } else {
                RawMinifyOptions::DeadCodeEliminationOnly
            }),
            sourcemap: options.sourcemap.then_some(SourceMapType::File),
            entry_filenames: Some(
                if options.script.is_some() {
                    "[name].js"
                } else {
                    "assets/[name]-[hash].js"
                }
                .to_string()
                .into(),
            ),
            code_splitting: options
                .script
                .as_ref()
                .map(|_| CodeSplittingMode::Bool(false)),
            chunk_filenames: Some("assets/[name]-[hash].js".to_string().into()),
            asset_filenames: Some("assets/[name]-[hash][extname]".to_string().into()),
            resolve: Some(ResolveOptions {
                condition_names: Some(conditions),
                ..Default::default()
            }),
            define: Some(define.into_iter().collect()),
            clean_dir: Some(false),
            preserve_entry_signatures: Some(if options.script.is_some() {
                PreserveEntrySignatures::ExportsOnly
            } else {
                PreserveEntrySignatures::False
            }),
            intro: classic.then(|| AddonOutputOption::String(Some(SCRIPT_URL_INTRO.to_string()))),
            tsconfig: Some(TsConfig::Auto(false)),
            transform: Some(BundlerTransformOptions {
                target: Some(Either::Left(SCRIPT_TARGET.to_string())),
                ..Default::default()
            }),
            ..Default::default()
        },
        vec![Plugin::new_shared(plugin)],
    )
    .map_err(|errors| failure(errors.to_string()))?;
    let output = bundler.write().await.map_err(|errors| {
        let failures = recorded
            .lock()
            .map(|state| state.failures.join("\n"))
            .unwrap_or_default();
        let text = errors.to_string();
        failure(if !failures.is_empty() {
            failures
        } else if classic && text.contains("top-level await") {
            format!("{text}\n--classic writes a plain script, which cannot wait at its top level; move the await into a function, or drop --classic to write an ES module")
        } else {
            text
        })
    });
    let _ = bundler.close().await;
    let output = output?;
    warnings.extend(output.warnings.iter().map(|warning| {
        if classic && warning.kind().to_string() == "MISSING_NAME_OPTION_FOR_IIFE_EXPORT" {
            "the entry's exports are out of reach in a plain script, which keeps none; drop --classic to write an ES module whose exports a page can import".to_string()
        } else {
            warning.to_string()
        }
    }));

    let chunks: Vec<Arc<OutputChunk>> = output
        .assets
        .iter()
        .filter_map(|output| match output {
            Output::Chunk(chunk) => Some(chunk.clone()),
            Output::Asset(_) => None,
        })
        .collect();
    let mut scripts = Vec::new();
    let mut preloads: Vec<String> = Vec::new();
    for name in &names {
        let Some(entry) = chunks
            .iter()
            .find(|chunk| chunk.is_entry && chunk.name.as_str() == name)
        else {
            return Err(failure(format!(
                "the bundler wrote no entry chunk named {name}"
            )));
        };
        let url = format!("{}{}", options.base, entry.filename);
        scripts.push(url);
        let mut queue: Vec<String> = entry.imports.iter().map(ToString::to_string).collect();
        while let Some(import) = queue.pop() {
            let url = format!("{}{import}", options.base);
            if preloads.contains(&url) || scripts.contains(&url) {
                continue;
            }
            preloads.push(url);
            if let Some(chunk) = chunks
                .iter()
                .find(|chunk| chunk.filename.as_str() == import)
            {
                queue.extend(chunk.imports.iter().map(ToString::to_string));
            }
        }
    }
    preloads.sort();

    let (css_order, mut assets) = {
        let mut state = recorded
            .lock()
            .map_err(|_| failure("the build state was lost to an earlier failure".to_string()))?;
        let assets = std::mem::replace(&mut state.assets, Assets::new(out_dir.join("assets")));
        warnings.append(&mut state.warnings);
        (std::mem::take(&mut state.css_order), assets)
    };
    let mut stylesheets = page
        .styles
        .iter()
        .map(|style| page_file(&root, &style.url))
        .collect::<io::Result<Vec<PathBuf>>>()?;
    stylesheets.extend(css_order.iter().map(|id| PathBuf::from(path_of(id))));
    let stylesheet = if stylesheets.is_empty() {
        None
    } else {
        let bundled = css::bundle(
            &stylesheets,
            &css::Options {
                root: &root,
                base: &options.base,
                minify: options.minify,
            },
            &mut assets,
        )?;
        warnings.extend(bundled.warnings);
        if bundled.code.trim().is_empty() {
            None
        } else if let Some(script) = &options.script {
            let name = format!("{}.css", script.name);
            warnings.push(format!(
                "the script imports stylesheets that are not scoped, so they are written to {name}, which the page has to link; a stylesheet imported with ?scoped stays in the script"
            ));
            fs::write(out_dir.join(&name), bundled.code)?;
            Some(format!("{}{name}", options.base))
        } else {
            let name = format!("index-{}.css", css::short_hash(bundled.code.as_bytes()));
            fs::create_dir_all(out_dir.join("assets"))?;
            fs::write(out_dir.join("assets").join(&name), bundled.code)?;
            Some(format!("{}assets/{name}", options.base))
        }
    };

    if options.script.is_some() {
        let mut files = Vec::new();
        list(&out_dir, &out_dir, &mut files)?;
        files.sort_by(|a, b| a.path.cmp(&b.path));
        return Ok(Built {
            out_dir,
            files,
            warnings,
        });
    }
    let mut page_assets = Vec::new();
    for reference in &page.assets {
        page_assets.push(match css::locate(&root, &root, &reference.url) {
            Located::Public(path) => Some(format!("{}{}", css::public_url(&options.base, &path, 0), css::suffix(&reference.url))),
            Located::File(file) => Some(format!("{}assets/{}{}", options.base, assets.copy(&file)?, css::suffix(&reference.url))),
            Located::Missing => {
                warnings.push(format!(
                    "index.html refers to {}, which is in neither the public folder nor the project; it is left as written",
                    reference.url
                ));
                None
            }
        });
    }
    let public = root.join("public");
    if public.is_dir() {
        copy_folder(&public, &out_dir)?;
    }
    fs::write(
        out_dir.join("index.html"),
        html::rewrite(
            &page_source,
            &page,
            &html::Output {
                scripts: &scripts,
                stylesheet: stylesheet.as_deref(),
                preloads: &preloads,
                assets: &page_assets,
            },
        ),
    )?;
    let mut files = Vec::new();
    list(&out_dir, &out_dir, &mut files)?;
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(Built {
        out_dir,
        files,
        warnings,
    })
}

/// Runs the `build` command and prints what it wrote, each file with its size and, for text, its gzip size.
pub async fn run(options: &Options) -> io::Result<()> {
    let started = Instant::now();
    anstream::println!("{}", term::heading("build", &describe(options)));
    let built = build(options).await?;
    for warning in &built.warnings {
        anstream::eprintln!("{}", term::row("warning", term::caution, warning));
    }
    if !built.warnings.is_empty() {
        anstream::println!();
    }
    let here = std::env::current_dir()
        .and_then(|folder| css::canonical(&folder))
        .unwrap_or_default();
    let shown_out = match built.out_dir.strip_prefix(&here) {
        Ok(relative) if !here.as_os_str().is_empty() => {
            relative.to_string_lossy().replace('\\', "/")
        }
        _ => crate::server::display(&built.out_dir),
    };
    let prefix = if shown_out.is_empty() {
        String::new()
    } else {
        format!("{}/", shown_out.trim_end_matches('/'))
    };
    let width = built
        .files
        .iter()
        .map(|file| prefix.len() + file.path.len())
        .max()
        .unwrap_or(0);
    let size_width = built
        .files
        .iter()
        .map(|file| kilobytes(file.bytes).len())
        .max()
        .unwrap_or(0);
    let gzipped: Vec<Option<String>> = built
        .files
        .iter()
        .map(|file| {
            let extension = file.path.rsplit('.').next().unwrap_or("");
            COMPRESSED
                .contains(&extension)
                .then(|| gzip_size(&built.out_dir.join(&file.path)))
                .flatten()
                .map(kilobytes)
        })
        .collect();
    let gzip_width = gzipped.iter().flatten().map(String::len).max().unwrap_or(0);
    for (file, gzip) in built.files.iter().zip(&gzipped) {
        let name = format!("{prefix}{}", file.path);
        let padding = " ".repeat(width.saturating_sub(name.len()));
        let size = format!("{:>size_width$}", kilobytes(file.bytes));
        let gzip = gzip
            .as_ref()
            .map(|text| format!("  {}", term::muted(format!("gzip {text:>gzip_width$}"))))
            .unwrap_or_default();
        anstream::println!("  {}{padding}  {size}{gzip}", term::path(&name));
    }
    let project = css::canonical(&options.root)
        .ok()
        .and_then(|root| {
            root.file_name()
                .map(|name| name.to_string_lossy().into_owned())
        })
        .unwrap_or_else(|| crate::server::display(&options.root));
    anstream::println!(
        "\n  {} {} into {} in {} ms\n",
        term::success("built"),
        term::bold(project),
        if shown_out.is_empty() {
            "."
        } else {
            &shown_out
        },
        started.elapsed().as_millis()
    );
    Ok(())
}
