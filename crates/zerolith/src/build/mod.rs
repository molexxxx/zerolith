//! `zerolith build`: bundles the modules `index.html`
//! loads with Rolldown, the bundler Vite is built on, applying the same JSX
//! lowering, template preparation, and split check as the Vite plugin. The
//! output is minified, tree-shaken chunks with hashed names, one stylesheet
//! made from the stylesheets the page links and the modules import, the
//! files they reference, the public folder, and an `index.html` that loads
//! them.

use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use rolldown::plugin::Plugin;
use rolldown::{
    Bundler, BundlerOptions, BundlerTransformOptions, Either, InputItem, OutputFormat, Platform,
    PreserveEntrySignatures, RawMinifyOptions, ResolveOptions, SourceMapType, TsConfig,
};
use rolldown_common::{Output, OutputChunk};

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

/// Bundles the project into its output folder.
pub async fn build(options: &Options) -> io::Result<Built> {
    let root = css::canonical(&options.root)?;
    if options.prepare {
        check_core_version(&root)?;
    }
    let page_path = root.join("index.html");
    let page_source = fs::read_to_string(&page_path).map_err(|error| {
        io::Error::new(
            error.kind(),
            format!(
                "{} could not be read ({error}); zerolith build starts from index.html, or pass --unbundled to transform the sources file by file",
                page_path.display()
            ),
        )
    })?;
    let mut page = html::scan(&page_source);
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
        let name = if entries.len() == 1 {
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
    let mut define: Vec<(String, String)> = vec![
        ("import.meta.env".to_string(), env.to_string()),
        ("process.env.NODE_ENV".to_string(), quoted(node_env)),
    ];
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
        recorded: recorded.clone(),
    };
    let mut bundler = Bundler::with_plugins(
        BundlerOptions {
            input: Some(inputs),
            cwd: Some(root.clone()),
            dir: Some(out_dir.to_string_lossy().into_owned()),
            format: Some(OutputFormat::Esm),
            platform: Some(Platform::Browser),
            minify: Some(if options.minify {
                RawMinifyOptions::Bool(true)
            } else {
                RawMinifyOptions::DeadCodeEliminationOnly
            }),
            sourcemap: options.sourcemap.then_some(SourceMapType::File),
            entry_filenames: Some("assets/[name]-[hash].js".to_string().into()),
            chunk_filenames: Some("assets/[name]-[hash].js".to_string().into()),
            asset_filenames: Some("assets/[name]-[hash][extname]".to_string().into()),
            resolve: Some(ResolveOptions {
                condition_names: Some(conditions),
                ..Default::default()
            }),
            define: Some(define.into_iter().collect()),
            clean_dir: Some(false),
            preserve_entry_signatures: Some(PreserveEntrySignatures::False),
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
        failure(if failures.is_empty() {
            errors.to_string()
        } else {
            failures
        })
    });
    let _ = bundler.close().await;
    let output = output?;
    warnings.extend(output.warnings.iter().map(ToString::to_string));

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
        } else {
            let name = format!("index-{}.css", css::short_hash(bundled.code.as_bytes()));
            fs::create_dir_all(out_dir.join("assets"))?;
            fs::write(out_dir.join("assets").join(&name), bundled.code)?;
            Some(format!("{}assets/{name}", options.base))
        }
    };

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
