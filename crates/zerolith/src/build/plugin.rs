//! The Rolldown plugin `zerolith build` runs: how a module is resolved,
//! loaded, lowered, and prepared, and what it records about the stylesheets
//! and assets the bundle uses.

use std::borrow::Cow;
use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};

use oxc_span::SourceType;
use rolldown::ModuleType;
use rolldown::plugin::{
    HookGenerateBundleArgs, HookLoadArgs, HookLoadOutput, HookLoadReturn, HookNoopReturn,
    HookResolveIdArgs, HookResolveIdOutput, HookResolveIdReturn, HookTransformArgs,
    HookTransformOutput, HookTransformOutputMap, HookTransformReturn, HookUsage, Plugin,
    PluginContext, SharedLoadPluginContext, SharedTransformPluginContext,
};
use rolldown_common::Output;

use crate::css::{self, Assets};
use crate::scan::DIAGNOSTIC_URL;
use crate::split::{SplitKind, split_imports};
use crate::{prepare, transform};

/// The syntax the output keeps; newer syntax, such as `using` declarations, is lowered. Targeting the oldest supported browsers instead would turn every class field into a `defineProperty` call, since their engines ship class fields with bugs the compatibility data excludes until Chrome 98 and Safari 16.
pub(super) const SCRIPT_TARGET: &str = "es2022";

/// The suffixes an import may carry to ask for a file's URL, its text, or a stylesheet's rules scoped to a component.
const QUERIES: [&str; 3] = ["?url", "?raw", "?scoped"];

/// What the plugin records while Rolldown runs.
#[derive(Debug)]
pub(super) struct Recorded {
    /// Each lazy import by its resolved module id, with the module that loads it lazily and why.
    pub(super) splits: Vec<(String, String, SplitKind)>,
    /// The CSS modules imported from code.
    pub(super) css: HashSet<String>,
    /// Those CSS modules in the order the module graph imports them.
    pub(super) css_order: Vec<String>,
    /// The files imported for their URL, shared with the stylesheet.
    pub(super) assets: Assets,
    /// What reading the stylesheets imported with `?scoped` reported.
    pub(super) warnings: Vec<String>,
    /// The load hook's failures, whose messages Rolldown replaces with its own.
    pub(super) failures: Vec<String>,
}

/// The plugin that applies zerolith's transforms and checks inside Rolldown.
#[derive(Debug)]
pub(super) struct Zerolith {
    pub(super) prepare: bool,
    pub(super) production: bool,
    pub(super) minify: bool,
    pub(super) root: PathBuf,
    pub(super) base: String,
    /// The input names, in the order the page loads the entries.
    pub(super) entries: Vec<String>,
    pub(super) recorded: Arc<Mutex<Recorded>>,
}

/// The path part of a module id, without a query or a fragment.
pub(super) fn path_of(id: &str) -> &str {
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

/// The zerolith package a module belongs to, `zerolith` or `@zerolith/<name>` as its own `package.json` names it, so a workspace package linked under another folder name counts, when the module is in the package's development build: under its `dist/` folder but not under `dist/production/`, which the package has, so a package published without the split, or any other package, is never reported.
pub(super) fn development_module_of(id: &str) -> Option<String> {
    let normalized = id.replace('\\', "/");
    let at = normalized.rfind("/dist/")?;
    if normalized[at + "/dist/".len()..].starts_with("production/") {
        return None;
    }
    let package = Path::new(&normalized[..at]);
    if !package.join("dist").join("production").is_dir() {
        return None;
    }
    let manifest: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(package.join("package.json")).ok()?).ok()?;
    let name = manifest.get("name")?.as_str()?;
    (name == "zerolith" || name.starts_with("@zerolith/")).then(|| name.to_string())
}

/// A module id as messages show it: relative to the project, with forward slashes.
pub(super) fn shown(root: &Path, id: &str) -> String {
    css::shown(root, Path::new(id))
}

pub(super) fn failure(message: String) -> io::Error {
    io::Error::other(message)
}

pub(super) fn quoted(text: &str) -> String {
    serde_json::Value::from(text).to_string()
}

/// A path with its `.` and `..` components resolved lexically, for a folder that may not exist yet.
pub(super) fn normalized(path: &Path) -> PathBuf {
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

    /// Records a failure of the load hook, so the build reports its message rather than Rolldown's; a failure of the file system, whose message names no file, gets the module's path in front.
    fn reported(&self, id: &str, result: io::Result<String>) -> io::Result<String> {
        if let Err(error) = &result
            && let Ok(mut recorded) = self.recorded.lock()
        {
            recorded.failures.push(if error.get_ref().is_none() {
                format!("{}: {error}", shown(&self.root, path_of(id)))
            } else {
                error.to_string()
            });
        }
        result
    }

    /// The module a stylesheet imported with `?scoped` becomes: its rules, processed as the combined stylesheet is, handed to zerolith's `styleFile` with the file's path in the project.
    fn scoped_module(&self, id: &str) -> io::Result<String> {
        let file = Path::new(path_of(id));
        if extension_of(id) != Some("css") {
            return Err(failure(format!(
                "{}: ?scoped applies to a stylesheet, a .css file",
                shown(&self.root, path_of(id))
            )));
        }
        let mut recorded = self.recorded()?;
        let scoped = css::bundle_scoped(
            file,
            &css::Options {
                root: &self.root,
                base: &self.base,
                minify: self.minify,
            },
            &mut recorded.assets,
        )?;
        let rules = scoped.expression();
        recorded.warnings.extend(scoped.warnings);
        Ok(format!(
            "import {{ styleFile }} from \"zerolith/internal\";\nexport default styleFile({}, {rules});\n",
            quoted(&css::project_path(&self.root, file))
        ))
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
                if let Some(importer) = args.importer {
                    css::reach(
                        &self.root,
                        Path::new(importer),
                        Path::new(resolved.id.as_str()),
                    )?;
                }
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
        let code = if id.ends_with("?scoped") {
            self.reported(id, self.scoped_module(id))?
        } else if queried
            || (!id.contains('?') && extension_of(id).is_some_and(crate::modules::is_asset))
        {
            self.reported(id, self.asset_module(id))?
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
                map: HookTransformOutputMap::Null,
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
                    && let Some((package, leaked)) = chunk.module_ids.iter().find_map(|id| {
                        development_module_of(id.as_str()).map(|package| (package, id))
                    })
                {
                    return Err(failure(format!(
                        "the development build of {package} reached the production output through {}; the build resolves the production build unless --mode names another mode",
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
