//! `zerolith build`: bundles the modules `index.html`
//! loads with Rolldown, the bundler Vite is built on, applying the same JSX
//! lowering, template preparation, and split check as the Vite plugin. The
//! output is minified, tree-shaken chunks with hashed names, one stylesheet
//! made from the stylesheets the page links and the modules import, the
//! files they reference, the public folder, and an `index.html` that loads
//! them.

use std::borrow::Cow;
use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Instant;

use oxc_span::SourceType;
use rolldown::plugin::{
    HookGenerateBundleArgs, HookLoadArgs, HookLoadOutput, HookLoadReturn, HookNoopReturn,
    HookResolveIdArgs, HookResolveIdOutput, HookResolveIdReturn, HookTransformArgs,
    HookTransformOutput, HookTransformReturn, HookUsage, Plugin, PluginContext,
    SharedLoadPluginContext, SharedTransformPluginContext,
};
use rolldown::{
    Bundler, BundlerOptions, BundlerTransformOptions, Either, InputItem, ModuleType, OutputFormat,
    Platform, PreserveEntrySignatures, RawMinifyOptions, ResolveOptions, SourceMapType, TsConfig,
};
use rolldown_common::{Output, OutputChunk};

use crate::css::{self, Assets, Located};
use crate::scan::DIAGNOSTIC_URL;
use crate::split::{SplitKind, split_imports};
use crate::{html, prepare, transform};

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

/// The extensions an import turns into a URL, as in Vite.
const ASSET_EXTENSIONS: [&str; 34] = [
    "apng",
    "bmp",
    "png",
    "jpg",
    "jpeg",
    "jfif",
    "pjpeg",
    "pjp",
    "gif",
    "svg",
    "ico",
    "webp",
    "avif",
    "cur",
    "jxl",
    "mp4",
    "webm",
    "ogg",
    "mp3",
    "wav",
    "flac",
    "aac",
    "opus",
    "mov",
    "m4a",
    "vtt",
    "woff",
    "woff2",
    "eot",
    "ttf",
    "otf",
    "webmanifest",
    "pdf",
    "txt",
];

/// The syntax the output keeps; newer syntax, such as `using` declarations, is lowered. Targeting the oldest supported browsers instead would turn every class field into a `defineProperty` call, since their engines ship class fields with bugs the compatibility data excludes until Chrome 98 and Safari 16.
const SCRIPT_TARGET: &str = "es2022";

/// The suffixes an import may carry to ask for a file's URL or its text.
const QUERIES: [&str; 2] = ["?url", "?raw"];

/// What the plugin records while Rolldown runs.
#[derive(Debug)]
struct Recorded {
    /// Each lazy import by its resolved module id, with the module that loads it lazily and why.
    splits: Vec<(String, String, SplitKind)>,
    /// The CSS modules imported from code.
    css: HashSet<String>,
    /// Those CSS modules in the order the module graph imports them.
    css_order: Vec<String>,
    /// The files imported for their URL, shared with the stylesheet.
    assets: Assets,
}

/// The plugin that applies zerolith's transforms and checks inside Rolldown.
#[derive(Debug)]
struct Zerolith {
    prepare: bool,
    production: bool,
    root: PathBuf,
    base: String,
    /// The input names, in the order the page loads the entries.
    entries: Vec<String>,
    recorded: Arc<Mutex<Recorded>>,
}

/// The path part of a module id, without a query or a fragment.
fn path_of(id: &str) -> &str {
    id.split(['?', '#']).next().unwrap_or(id)
}

fn is_dependency(id: &str) -> bool {
    id.contains("/node_modules/") || id.contains("\\node_modules\\")
}

fn extension_of(id: &str) -> Option<&str> {
    Path::new(path_of(id)).extension()?.to_str()
}

/// The source type a module id names by its extension, for the passes that read a module before Rolldown does.
fn source_type(id: &str) -> Option<SourceType> {
    match extension_of(id)? {
        "js" | "mjs" => Some(SourceType::mjs()),
        "jsx" => Some(SourceType::jsx()),
        "ts" | "mts" => Some(SourceType::ts()),
        "tsx" => Some(SourceType::tsx()),
        _ => None,
    }
}

/// True for the core module that imports the scanner, which the prepare pass points at the stand-in.
fn imports_scanner(importer: &str) -> bool {
    let normalized = importer.replace('\\', "/");
    normalized.ends_with("/zerolith/dist/template.js")
        || normalized.ends_with("/zerolith/dist/production/template.js")
}

/// True for a module of the development build of the core: anything under `zerolith/dist/` that is not under `production/`.
fn is_development_module(id: &str) -> bool {
    let normalized = id.replace('\\', "/");
    normalized
        .find("/zerolith/dist/")
        .is_some_and(|at| !normalized[at + "/zerolith/dist/".len()..].starts_with("production/"))
}

/// A module id as messages show it: relative to the project, with forward slashes.
fn shown(root: &Path, id: &str) -> String {
    css::shown(root, Path::new(id))
}

fn failure(message: String) -> io::Error {
    io::Error::other(message)
}

fn quoted(text: &str) -> String {
    serde_json::Value::from(text).to_string()
}

/// A path with its `.` and `..` components resolved lexically, for a folder that may not exist yet.
fn normalized(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other),
        }
    }
    out
}

impl Zerolith {
    fn recorded(&self) -> io::Result<MutexGuard<'_, Recorded>> {
        self.recorded
            .lock()
            .map_err(|_| failure("the build state was lost to an earlier failure".to_string()))
    }

    /// The module code an imported file becomes: its URL, or its text with `?raw`.
    fn asset_module(&self, id: &str) -> io::Result<String> {
        let file = Path::new(path_of(id));
        if id.ends_with("?raw") {
            return Ok(format!(
                "export default {};",
                quoted(&fs::read_to_string(file)?)
            ));
        }
        let name = self.recorded()?.assets.copy(file)?;
        Ok(if self.base == "./" {
            format!(
                "export default new URL({}, import.meta.url).href;",
                quoted(&format!("./{name}"))
            )
        } else {
            format!(
                "export default {};",
                quoted(&format!("{}assets/{name}", self.base))
            )
        })
    }

    /// Visits the modules reachable from one through static imports, recording CSS modules in the order they run and queueing dynamic imports for later.
    fn visit_css(
        &self,
        ctx: &PluginContext,
        id: &str,
        seen: &mut HashSet<String>,
        css: &HashSet<String>,
        order: &mut Vec<String>,
        later: &mut Vec<String>,
    ) {
        if !seen.insert(id.to_string()) {
            return;
        }
        if css.contains(id) {
            order.push(id.to_string());
            return;
        }
        let Some(info) = ctx.get_module_info(id) else {
            return;
        };
        for next in &info.imported_ids {
            self.visit_css(ctx, next.as_str(), seen, css, order, later);
        }
        later.extend(
            info.dynamically_imported_ids
                .iter()
                .map(|next| next.as_str().to_string()),
        );
    }
}

impl Plugin for Zerolith {
    fn name(&self) -> Cow<'static, str> {
        Cow::Borrowed("zerolith")
    }

    fn register_hook_usage(&self) -> HookUsage {
        HookUsage::ResolveId | HookUsage::Load | HookUsage::Transform | HookUsage::GenerateBundle
    }

    async fn resolve_id(
        &self,
        ctx: &PluginContext,
        args: &HookResolveIdArgs<'_>,
    ) -> HookResolveIdReturn {
        if let Some(query) = QUERIES
            .iter()
            .find(|query| args.specifier.ends_with(*query))
        {
            let specifier = &args.specifier[..args.specifier.len() - query.len()];
            if let Ok(resolved) = ctx.resolve(specifier, args.importer, None).await? {
                return Ok(Some(HookResolveIdOutput {
                    id: format!("{}{query}", resolved.id.as_str()).into(),
                    ..Default::default()
                }));
            }
            return Ok(None);
        }
        if self.prepare
            && args.specifier == "./scan.js"
            && let Some(importer) = args.importer
            && imports_scanner(importer)
        {
            let stand_in = Path::new(importer).with_file_name("scan.unprepared.js");
            if stand_in.is_file() {
                return Ok(Some(HookResolveIdOutput {
                    id: stand_in.to_string_lossy().into_owned().into(),
                    ..Default::default()
                }));
            }
        }
        Ok(None)
    }

    async fn load(&self, _ctx: SharedLoadPluginContext, args: &HookLoadArgs<'_>) -> HookLoadReturn {
        let id = args.id;
        if id.starts_with('\0') {
            return Ok(None);
        }
        let queried = QUERIES.iter().any(|query| id.ends_with(query));
        let code = if queried
            || (!id.contains('?')
                && extension_of(id).is_some_and(|extension| ASSET_EXTENSIONS.contains(&extension)))
        {
            self.asset_module(id)?
        } else if !id.contains('?') && extension_of(id) == Some("css") {
            self.recorded()?.css.insert(id.to_string());
            String::new()
        } else {
            return Ok(None);
        };
        Ok(Some(HookLoadOutput {
            code: code.into(),
            module_type: Some(ModuleType::Js),
            ..Default::default()
        }))
    }

    async fn transform(
        &self,
        ctx: SharedTransformPluginContext,
        args: &HookTransformArgs<'_>,
    ) -> HookTransformReturn {
        if args.id.starts_with('\0') || args.id.contains('?') {
            return Ok(None);
        }
        let Some(source_type) = source_type(args.id) else {
            return Ok(None);
        };
        let user = !is_dependency(args.id);
        let mut code = Cow::Borrowed(args.code.as_str());
        if user && source_type.is_jsx() {
            let lowered = transform::lower_jsx(&code, source_type)
                .map_err(|error| failure(format!("{}: {error}", shown(&self.root, args.id))))?;
            code = Cow::Owned(lowered);
        }
        if self.prepare {
            let prepared = prepare::prepare_source(&code, source_type)
                .map_err(|error| failure(format!("{}: {error}", shown(&self.root, args.id))))?;
            if prepared != *code {
                code = Cow::Owned(prepared);
            }
        }
        if user {
            for split in split_imports(&code, source_type) {
                if let Ok(resolved) = ctx.resolve(&split.specifier, Some(args.id), None).await? {
                    let id = resolved.id.as_str().to_string();
                    self.recorded()?
                        .splits
                        .push((id, args.id.to_string(), split.kind));
                }
            }
        }
        Ok(match code {
            Cow::Borrowed(_) => None,
            Cow::Owned(code) => Some(HookTransformOutput {
                code: Some(code),
                ..Default::default()
            }),
        })
    }

    async fn generate_bundle(
        &self,
        ctx: &PluginContext,
        args: &mut HookGenerateBundleArgs<'_>,
    ) -> HookNoopReturn {
        let splits = self.recorded()?.splits.clone();
        let mut merged = Vec::new();
        for (id, importer, kind) in &splits {
            let importers: Vec<String> = ctx
                .get_module_info(id)
                .map(|info| {
                    info.importers
                        .iter()
                        .map(|module| shown(&self.root, module.as_str()))
                        .collect()
                })
                .unwrap_or_default();
            if !importers.is_empty() {
                let what = match kind {
                    SplitKind::Route => "a route view loaded with lazy()",
                    SplitKind::Locale => "a locale of a compiled message index",
                };
                merged.push(format!(
                    "{} is {what} in {} but is also imported statically by {}",
                    shown(&self.root, id),
                    shown(&self.root, importer),
                    importers.join(" and ")
                ));
            }
        }
        if !merged.is_empty() {
            return Err(failure(format!(
                "lazy_module_not_split: {}. The bundler puts such a module in the importing chunk instead of a chunk of its own; import only its types with import type, or remove the static import. {DIAGNOSTIC_URL}lazy_module_not_split",
                merged.join("; ")
            ))
            .into());
        }
        let mut entries = Vec::new();
        for output in args.bundle.iter() {
            if let Output::Chunk(chunk) = output {
                if self.production
                    && let Some(leaked) = chunk
                        .module_ids
                        .iter()
                        .find(|id| is_development_module(id.as_str()))
                {
                    return Err(failure(format!(
                        "the development build of zerolith reached the production output through {}; the build resolves the production build unless --mode names another mode",
                        shown(&self.root, leaked.as_str())
                    ))
                    .into());
                }
                if chunk.is_entry
                    && let Some(facade) = &chunk.facade_module_id
                {
                    let position = self
                        .entries
                        .iter()
                        .position(|name| name == chunk.name.as_str());
                    entries.push((position, facade.as_str().to_string()));
                }
            }
        }
        entries.sort();
        let css = self.recorded()?.css.clone();
        if !css.is_empty() {
            let mut seen = HashSet::new();
            let mut order = Vec::new();
            let mut pending: Vec<String> = entries.into_iter().map(|(_, id)| id).collect();
            while !pending.is_empty() {
                let mut later = Vec::new();
                for id in &pending {
                    self.visit_css(ctx, id, &mut seen, &css, &mut order, &mut later);
                }
                pending = later;
            }
            self.recorded()?.css_order = order;
        }
        Ok(())
    }
}

/// Normalizes a base path: `./` and the empty string mean URLs relative to the page, anything else gets a leading and a trailing slash.
pub fn normalize_base(base: &str) -> String {
    let trimmed = base.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == "./" {
        return "./".to_string();
    }
    let inner = trimmed.trim_matches('/');
    if inner.is_empty() {
        "/".to_string()
    } else {
        format!("/{inner}/")
    }
}

/// The file a script or stylesheet URL in `index.html` names, without its query or fragment.
fn page_file(root: &Path, url: &str) -> io::Result<PathBuf> {
    let path = crate::server::percent_decode(path_of(url));
    let file = root.join(path.trim_start_matches('/'));
    if file.is_file() {
        Ok(file)
    } else {
        Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!("index.html refers to {url}, which does not exist"),
        ))
    }
}

/// Copies a folder's files into another, keeping their paths.
fn copy_folder(from: &Path, to: &Path) -> io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let path = entry.path();
        let target = to.join(entry.file_name());
        if path.is_dir() {
            copy_folder(&path, &target)?;
        } else {
            fs::copy(&path, &target)?;
        }
    }
    Ok(())
}

/// The files under a folder with their sizes, paths relative to `out_dir`.
fn list(out_dir: &Path, folder: &Path, files: &mut Vec<Written>) -> io::Result<()> {
    for entry in fs::read_dir(folder)? {
        let path = entry?.path();
        if path.is_dir() {
            list(out_dir, &path, files)?;
        } else {
            files.push(Written {
                path: css::shown(out_dir, &path),
                bytes: fs::metadata(&path)?.len(),
            });
        }
    }
    Ok(())
}

/// Prepares the output folder: it must not hold the project or its sources, and it is emptied when it is inside the project or `empty` is set.
fn prepare_out_dir(
    root: &Path,
    out_dir: &Path,
    entries: &[PathBuf],
    empty: bool,
    warnings: &mut Vec<String>,
) -> io::Result<()> {
    if root.starts_with(out_dir) {
        return Err(failure(format!(
            "the output folder {} holds the project; choose a folder inside it, such as dist, or next to it",
            out_dir.display()
        )));
    }
    if let Some(entry) = entries.iter().find(|entry| entry.starts_with(out_dir)) {
        return Err(failure(format!(
            "the output folder {} holds {}, a source the page loads; choose another folder",
            out_dir.display(),
            entry.display()
        )));
    }
    if out_dir.exists() {
        if out_dir.starts_with(root) || empty {
            fs::remove_dir_all(out_dir)?;
        } else {
            warnings.push(format!(
                "{} is outside the project, so it was not emptied first; pass --empty-out-dir to empty it",
                out_dir.display()
            ));
        }
    }
    fs::create_dir_all(out_dir)
}

/// Bundles the project into its output folder.
pub async fn build(options: &Options) -> io::Result<Built> {
    let root = css::canonical(&options.root)?;
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
    let out_dir = normalized(&root.join(&options.out));
    let mut warnings = Vec::new();
    prepare_out_dir(
        &root,
        &out_dir,
        &entries,
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
    let env = serde_json::json!({
        "MODE": options.mode,
        "DEV": !production,
        "PROD": production,
        "BASE_URL": options.base,
    });
    let define: Vec<(String, String)> = vec![
        ("import.meta.env".to_string(), env.to_string()),
        ("import.meta.env.MODE".to_string(), quoted(&options.mode)),
        ("import.meta.env.DEV".to_string(), (!production).to_string()),
        ("import.meta.env.PROD".to_string(), production.to_string()),
        (
            "import.meta.env.BASE_URL".to_string(),
            quoted(&options.base),
        ),
        ("process.env.NODE_ENV".to_string(), quoted(node_env)),
    ];
    let recorded = Arc::new(Mutex::new(Recorded {
        splits: Vec::new(),
        css: HashSet::new(),
        css_order: Vec::new(),
        assets: Assets::new(out_dir.join("assets")),
    }));
    let plugin = Zerolith {
        prepare: options.prepare,
        production,
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
    let output = bundler
        .write()
        .await
        .map_err(|errors| failure(errors.to_string()));
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

/// Runs the `build` command and prints what it wrote.
pub async fn run(options: &Options) -> io::Result<()> {
    let started = Instant::now();
    let built = build(options).await?;
    for warning in &built.warnings {
        eprintln!("zerolith: warning: {warning}");
    }
    let shown_out = crate::server::display(&built.out_dir);
    println!(
        "zerolith: built {} into {shown_out} in {} ms",
        crate::server::display(&options.root),
        started.elapsed().as_millis()
    );
    let width = built
        .files
        .iter()
        .map(|file| file.path.len())
        .max()
        .unwrap_or(0);
    for file in &built.files {
        println!(
            "  {:<width$}  {:>9.2} kB",
            file.path,
            file.bytes as f64 / 1000.0
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{Options, build, normalize_base};
    use std::fs;
    use std::path::{Path, PathBuf};

    /// A project with a TypeScript entry, a JSX component, a lazy route, a compiled locale, stylesheets linked and imported, assets, a public folder, and stand-ins for the zerolith packages.
    fn project(name: &str, main: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("zerolith-bundle-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let files: [(&str, &str); 22] = [
            (
                "index.html",
                "<!doctype html>\n<html>\n<head>\n    <link rel=\"icon\" href=\"/favicon.svg\">\n    <link rel=\"stylesheet\" href=\"/src/styles.css\">\n    <script type=\"importmap\">{\"imports\":{}}</script>\n</head>\n<body>\n    <div id=\"app\"></div>\n    <script type=\"module\" src=\"/src/main.ts\"></script>\n</body>\n</html>\n",
            ),
            ("src/main.ts", main),
            (
                "src/app.tsx",
                "import { prefix } from \"./prefix.ts\";\nimport \"./app.css\";\nexport function App(props: { name: string }): unknown\n{\n    return <section class=\"app\"><h1>{prefix}{props.name}</h1></section>;\n}\n",
            ),
            (
                "src/prefix.ts",
                "export const prefix: string = \"Hello, \";\nexport const unused: string = \"UNUSED_EXPORT\";\n",
            ),
            (
                "src/views/notes.ts",
                "import { html } from \"zerolith\";\nimport \"./notes.css\";\nexport const view = (): unknown => html`<p>notes view</p>`;\n",
            ),
            ("src/views/notes.css", ".notes { color: green; }\n"),
            (
                "src/messages/index.ts",
                "// Generated by @zerolith/i18n. Do not edit; regenerate instead.\nexport const loaders = { en: () => import(\"./en.ts\") };\n",
            ),
            (
                "src/messages/en.ts",
                "export const hello = (): string => \"LOCALE_EN\";\n",
            ),
            (
                "src/styles.css",
                "@import \"./base.css\";\nbody { background: url(./grain.png); color: #e8eaed; }\n",
            ),
            ("src/base.css", "html { margin: 0; }\n"),
            ("src/app.css", ".app { & h1 { font-weight: 600; } }\n"),
            ("src/grain.png", "PNG"),
            ("src/logo.svg", "<svg/>"),
            ("src/notes.md", "# Notes"),
            ("src/extra.css", ".extra { color: red; }\n"),
            ("public/favicon.svg", "<svg></svg>"),
            (
                "node_modules/zerolith/package.json",
                "{\"name\":\"zerolith\",\"type\":\"module\",\"exports\":{\".\":{\"development\":\"./dist/index.js\",\"default\":\"./dist/production/index.js\"}}}",
            ),
            (
                "node_modules/zerolith/dist/index.js",
                "export * from \"./production/index.js\";\nexport const build = \"DEVELOPMENT_CORE\";\n",
            ),
            (
                "node_modules/zerolith/dist/production/index.js",
                "export { html, prepared, render } from \"./template.js\";\nexport const build = \"PRODUCTION_CORE\";\n",
            ),
            (
                "node_modules/zerolith/dist/production/template.js",
                "import { scan } from \"./scan.js\";\nconst scans = new WeakMap();\nexport function prepared(strings, markup, parts) { scans.set(strings, { markup, parts }); return strings; }\nexport function html(strings, ...values) { return { markup: (scans.get(strings) ?? scan(strings)).markup, values }; }\nexport function render(view, target) { document.querySelector(target).textContent = view.markup; }\n",
            ),
            (
                "node_modules/zerolith/dist/production/scan.js",
                "export function scan(strings) { return { markup: \"SCANNER_MARKER\" + strings.join(\"\") }; }\n",
            ),
            (
                "node_modules/zerolith/dist/production/scan.unprepared.js",
                "export function scan() { throw new Error(\"STAND_IN_MARKER\"); }\n",
            ),
        ];
        for (path, text) in files {
            let file = root.join(path);
            fs::create_dir_all(file.parent().unwrap()).unwrap();
            fs::write(file, text).unwrap();
        }
        fs::create_dir_all(root.join("node_modules/@zerolith/router/dist")).unwrap();
        fs::write(root.join("node_modules/@zerolith/router/package.json"), "{\"name\":\"@zerolith/router\",\"type\":\"module\",\"exports\":{\".\":\"./dist/index.js\"}}").unwrap();
        fs::write(
            root.join("node_modules/@zerolith/router/dist/index.js"),
            "export function lazy(load) { return { lazy: load }; }\n",
        )
        .unwrap();
        root
    }

    const MAIN: &str = "import \"./extra.css\";\nimport { html, render, build } from \"zerolith\";\nimport { lazy } from \"@zerolith/router\";\nimport { App } from \"./app.tsx\";\nimport { loaders } from \"./messages/index.ts\";\nimport logo from \"./logo.svg\";\nimport notes from \"./notes.md?raw\";\nexport const routes = { notes: lazy(() => import(\"./views/notes.ts\")) };\nrender(html`<main>${App({ name: \"zerolith\" })}</main>`, \"#app\");\nconsole.log(routes, loaders, build, logo, notes, import.meta.env.MODE, import.meta.env.BASE_URL, process.env.NODE_ENV);\n";

    fn options(root: &Path, base: &str, mode: &str) -> Options {
        Options {
            root: root.to_path_buf(),
            out: PathBuf::from("dist"),
            empty_out_dir: false,
            base: normalize_base(base),
            mode: mode.to_string(),
            minify: true,
            sourcemap: false,
            prepare: true,
        }
    }

    fn read_all(folder: &Path, extension: &str) -> String {
        let mut text = String::new();
        for entry in fs::read_dir(folder).unwrap() {
            let path = entry.unwrap().path();
            if path.extension().is_some_and(|found| found == extension) {
                text.push_str(&fs::read_to_string(&path).unwrap());
                text.push('\n');
            }
        }
        text
    }

    #[tokio::test]
    async fn bundles_minifies_splits_and_rewrites_the_page() {
        let root = project("main", MAIN);
        let built = build(&options(&root, "/", "production")).await.unwrap();
        let paths: Vec<&str> = built.files.iter().map(|file| file.path.as_str()).collect();
        assert!(
            paths.contains(&"index.html") && paths.contains(&"favicon.svg"),
            "{paths:?}"
        );
        for chunk in ["assets/index-", "assets/notes-", "assets/en-"] {
            assert!(
                paths
                    .iter()
                    .any(|path| path.starts_with(chunk) && path.ends_with(".js")),
                "{chunk} missing from {paths:?}"
            );
        }
        assert!(
            paths
                .iter()
                .any(|path| path.starts_with("assets/logo-") && path.ends_with(".svg")),
            "{paths:?}"
        );
        assert!(built.warnings.is_empty(), "{:?}", built.warnings);
        let page = fs::read_to_string(root.join("dist/index.html")).unwrap();
        assert!(
            page.contains("<script type=\"module\" src=\"/assets/index-"),
            "{page}"
        );
        assert!(
            page.contains("<link rel=\"stylesheet\" href=\"/assets/index-"),
            "{page}"
        );
        assert!(
            page.contains("<link rel=\"icon\" href=\"/favicon.svg\">"),
            "{page}"
        );
        assert!(
            !page.contains("importmap") && !page.contains("/src/"),
            "{page}"
        );
        assert_eq!(
            paths.iter().filter(|path| path.ends_with(".js")).count(),
            3,
            "the core stays in the entry chunk that the lazy chunks import from: {paths:?}"
        );
        let code = read_all(&root.join("dist/assets"), "js");
        assert!(
            code.contains("<main><!--zl$--></main>") && code.contains("<p>notes view</p>"),
            "{code}"
        );
        assert!(
            code.contains("PRODUCTION_CORE") && !code.contains("DEVELOPMENT_CORE"),
            "{code}"
        );
        assert!(
            code.contains("STAND_IN_MARKER") && !code.contains("SCANNER_MARKER"),
            "{code}"
        );
        assert!(
            !code.contains("UNUSED_EXPORT") && !code.contains("html`"),
            "{code}"
        );
        assert!(
            code.contains("/assets/logo-") && code.contains("# Notes"),
            "{code}"
        );
        assert!(
            !code.contains("import.meta.env") && !code.contains("process.env"),
            "{code}"
        );
        let css = read_all(&root.join("dist/assets"), "css");
        let at = |needle: &str| {
            css.find(needle)
                .unwrap_or_else(|| panic!("{needle} missing from {css}"))
        };
        assert!(
            at("html{margin:0}") < at("body{")
                && at("body{") < at(".extra{")
                && at(".extra{") < at(".app h1{")
                && at(".app h1{") < at(".notes{"),
            "{css}"
        );
        assert!(css.contains("url(grain-"), "{css}");
        let _ = fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn serves_under_a_base_and_builds_other_modes_from_the_development_core() {
        let root = project("base", MAIN);
        build(&options(&root, "app", "staging")).await.unwrap();
        let page = fs::read_to_string(root.join("dist/index.html")).unwrap();
        assert!(
            page.contains("src=\"/app/assets/index-") && page.contains("href=\"/app/assets/index-"),
            "{page}"
        );
        assert!(
            page.contains("<link rel=\"icon\" href=\"/app/favicon.svg\">"),
            "{page}"
        );
        let code = read_all(&root.join("dist/assets"), "js");
        assert!(
            code.contains("DEVELOPMENT_CORE") && code.contains("/app/assets/logo-"),
            "{code}"
        );
        build(&options(&root, "./", "production")).await.unwrap();
        let page = fs::read_to_string(root.join("dist/index.html")).unwrap();
        assert!(
            page.contains("src=\"./assets/index-") && page.contains("href=\"./favicon.svg\""),
            "{page}"
        );
        let code = read_all(&root.join("dist/assets"), "js");
        assert!(code.contains("import.meta.url"), "{code}");
        assert_eq!(normalize_base(""), "./");
        assert_eq!(normalize_base("/"), "/");
        assert_eq!(normalize_base("/app"), "/app/");
        let _ = fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn fails_when_a_lazy_view_is_also_imported_statically() {
        let root = project(
            "eager",
            &format!("import {{ view }} from \"./views/notes.ts\";\nconsole.log(view);\n{MAIN}"),
        );
        let error = build(&options(&root, "/", "production"))
            .await
            .unwrap_err()
            .to_string();
        assert!(
            error.contains("lazy_module_not_split")
                && error.contains(
                    "src/views/notes.ts is a route view loaded with lazy() in src/main.ts"
                ),
            "{error}"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn refuses_an_output_folder_that_holds_the_project_or_its_sources() {
        let root = project("guard", MAIN);
        let mut unsafe_out = options(&root, "/", "production");
        unsafe_out.out = PathBuf::from("..");
        assert!(
            build(&unsafe_out)
                .await
                .unwrap_err()
                .to_string()
                .contains("holds the project")
        );
        unsafe_out.out = PathBuf::from("src");
        assert!(
            build(&unsafe_out)
                .await
                .unwrap_err()
                .to_string()
                .contains("a source the page loads")
        );
        assert!(root.join("src/main.ts").is_file());
        let _ = fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn keeps_class_fields_lowers_newer_syntax_and_writes_source_maps() {
        let root = project(
            "syntax",
            "class Counter\n{\n    count = 0;\n    static { Counter.made = true; }\n    static made = false;\n}\nfunction open(): { [Symbol.dispose](): void }\n{\n    return { [Symbol.dispose]() {} };\n}\n{\n    using handle = open();\n    console.log(new Counter().count, handle);\n}\n",
        );
        let mut readable = options(&root, "/", "production");
        readable.minify = false;
        readable.sourcemap = true;
        let built = build(&readable).await.unwrap();
        assert!(
            built.files.iter().any(
                |file| file.path.starts_with("assets/index-") && file.path.ends_with(".js.map")
            ),
            "{:?}",
            built.files
        );
        let code = read_all(&root.join("dist/assets"), "js");
        assert!(
            code.contains("count = 0;") && code.contains("static {"),
            "{code}"
        );
        assert!(
            !code.contains("using handle") && !code.contains("defineProperty"),
            "{code}"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn preloads_the_chunk_two_entries_share() {
        let root = project("entries", MAIN);
        let page = fs::read_to_string(root.join("index.html")).unwrap().replace(
            "<script type=\"module\" src=\"/src/main.ts\"></script>",
            "<script type=\"module\" src=\"/src/main.ts\"></script>\n    <script type=\"module\" src=\"/src/widget.ts\"></script>",
        );
        fs::write(root.join("index.html"), page).unwrap();
        fs::write(
            root.join("src/widget.ts"),
            "import { App } from \"./app.tsx\";\nconsole.log(App({ name: \"widget\" }));\n",
        )
        .unwrap();
        let built = build(&options(&root, "/", "production")).await.unwrap();
        let page = fs::read_to_string(root.join("dist/index.html")).unwrap();
        assert!(
            page.contains("<script type=\"module\" src=\"/assets/main-")
                && page.contains("<script type=\"module\" src=\"/assets/widget-"),
            "{page}"
        );
        let shared: Vec<&str> = built
            .files
            .iter()
            .map(|file| file.path.as_str())
            .filter(|path| {
                path.ends_with(".js")
                    && ![
                        "assets/main-",
                        "assets/widget-",
                        "assets/notes-",
                        "assets/en-",
                    ]
                    .iter()
                    .any(|entry| path.starts_with(entry))
            })
            .collect();
        assert!(!shared.is_empty(), "{:?}", built.files);
        for chunk in shared {
            assert!(
                page.contains(&format!(
                    "<link rel=\"modulepreload\" crossorigin href=\"/{chunk}\">"
                )),
                "{chunk} is not preloaded: {page}"
            );
        }
        let _ = fs::remove_dir_all(&root);
    }
}
