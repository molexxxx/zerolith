//! The dev server's module pipeline. Modules are served as the browser asks
//! for them, resolved the way `zerolith build` bundles them: TypeScript and
//! JSX become JavaScript, package imports resolve from `node_modules` with
//! the build's resolver and conditions, stylesheets, JSON, and other files
//! imported from code become modules, and `import.meta.env` carries the mode,
//! the base, and the project's `PUBLIC_` variables. A page needs one module
//! script and no import map.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use oxc_allocator::Allocator;
use oxc_ast::ast::{Expression, SimpleAssignmentTarget, StaticMemberExpression};
use oxc_ast_visit::{Visit, walk};
use oxc_parser::Parser;
use oxc_resolver::{ResolveOptions, Resolver};
use oxc_span::{SourceType, Span};

use crate::server::percent_decode;
use crate::transform::{Edit, TransformError, apply_edits};
use crate::{css, env, transform};

/// The URL prefix for files outside the project folder, such as the packages a workspace links from elsewhere.
pub const FS_PREFIX: &str = "/@fs/";

/// The extensions served as JavaScript modules.
const SCRIPTS: [&str; 6] = ["js", "mjs", "ts", "mts", "tsx", "jsx"];

/// The extensions an import turns into a URL, as in `zerolith build`.
const ASSETS: [&str; 34] = [
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

/// True for a file served as a JavaScript module.
pub fn is_script(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| SCRIPTS.contains(&extension))
}

/// True when a request's query asks for one of the module forms: `import`, `url`, or `raw`.
pub fn wants(query: &str, form: &str) -> bool {
    query.split('&').any(|part| part == form)
}

fn extension_of(specifier: &str) -> Option<&str> {
    let path = specifier.split(['?', '#']).next().unwrap_or(specifier);
    Path::new(path).extension()?.to_str()
}

/// What an import specifier becomes in a served module, when it changes.
enum Rewrite {
    Keep,
    To(String),
}

struct Cached {
    modified: SystemTime,
    length: u64,
    code: String,
}

/// Finds `import.meta.env` and `process.env.NODE_ENV` outside assignment targets.
#[derive(Default)]
struct Defines {
    meta_env: Vec<Span>,
    node_env: Vec<Span>,
}

impl<'a> Visit<'a> for Defines {
    fn visit_static_member_expression(&mut self, it: &StaticMemberExpression<'a>) {
        if it.property.name == "env" && matches!(&it.object, Expression::ImportMeta(_)) {
            self.meta_env.push(it.span);
            return;
        }
        if it.property.name == "NODE_ENV"
            && let Expression::StaticMemberExpression(inner) = &it.object
            && inner.property.name == "env"
            && matches!(&inner.object, Expression::Identifier(name) if name.name == "process")
        {
            self.node_env.push(it.span);
            return;
        }
        walk::walk_static_member_expression(self, it);
    }

    fn visit_simple_assignment_target(&mut self, _it: &SimpleAssignmentTarget<'a>) {}
}

/// Serves a project's modules for `zerolith dev`.
pub struct Pipeline {
    root: PathBuf,
    resolver: Resolver,
    /// The folders outside the root that modules may be served from: the packages that imports resolved to.
    packages: Mutex<HashSet<PathBuf>>,
    cache: Mutex<HashMap<PathBuf, Cached>>,
    /// The `import.meta.env` object as a JavaScript expression.
    env: String,
    node_env: String,
}

impl Pipeline {
    /// A pipeline for a project folder, which must be canonical.
    pub fn new(root: PathBuf, mode: &str, base: &str) -> Self {
        let production = mode == "production";
        let condition = if production {
            "production"
        } else {
            "development"
        };
        let resolver = Resolver::new(ResolveOptions {
            condition_names: [condition, "browser", "import", "module", "default"]
                .into_iter()
                .map(String::from)
                .collect(),
            main_fields: ["browser", "module", "main"]
                .into_iter()
                .map(String::from)
                .collect(),
            alias_fields: vec![vec!["browser".to_string()]],
            extensions: [".js", ".mjs", ".ts", ".tsx", ".jsx", ".mts", ".json"]
                .into_iter()
                .map(String::from)
                .collect(),
            ..ResolveOptions::default()
        });
        let env = env::object(mode, base, &env::variables(&root, mode)).to_string();
        Self {
            root,
            resolver,
            packages: Mutex::new(HashSet::new()),
            cache: Mutex::new(HashMap::new()),
            env: format!("({env})"),
            node_env: if production {
                "\"production\""
            } else {
                "\"development\""
            }
            .to_string(),
        }
    }

    /// The URL a file is served at: its path under the root, or under `/@fs/` when it lies outside.
    pub fn url_of(&self, file: &Path) -> String {
        match file.strip_prefix(&self.root) {
            Ok(relative) => format!("/{}", relative.to_string_lossy().replace('\\', "/")),
            Err(_) => {
                let absolute = file.to_string_lossy().replace('\\', "/");
                format!("{FS_PREFIX}{}", absolute.trim_start_matches('/'))
            }
        }
    }

    /// The file an `/@fs/` request names, when it lies in a package folder an import resolved to.
    pub fn locate(&self, request_path: &str) -> Option<PathBuf> {
        let decoded = percent_decode(request_path.strip_prefix(FS_PREFIX)?);
        let file = if cfg!(windows) {
            PathBuf::from(decoded)
        } else {
            PathBuf::from(format!("/{decoded}"))
        };
        let file = css::canonical(&file).ok()?;
        let packages = self.packages.lock().ok()?;
        (file.is_file() && packages.iter().any(|folder| file.starts_with(folder))).then_some(file)
    }

    /// Lets the `/@fs/` route serve a file outside the root, through the whole package that holds it.
    fn allow(&self, file: &Path) {
        if file.starts_with(&self.root) {
            return;
        }
        if let (Some(folder), Ok(mut packages)) = (package_folder(file), self.packages.lock()) {
            packages.insert(folder);
        }
    }

    /// The URL a bare specifier resolves to from a module in `folder`, the way `zerolith build` resolves it.
    fn resolve(&self, folder: &Path, specifier: &str) -> Result<String, String> {
        let resolution = self
            .resolver
            .resolve(folder, specifier)
            .map_err(|error| error.to_string())?;
        let path = css::canonical(resolution.path()).map_err(|error| error.to_string())?;
        self.allow(&path);
        let suffix = format!(
            "{}{}",
            resolution.query().unwrap_or(""),
            resolution.fragment().unwrap_or("")
        );
        Ok(format!("{}{suffix}", self.url_of(&path)))
    }

    /// What a specifier in a served module becomes.
    fn rewrite(&self, file: &Path, specifier: &str) -> Result<Rewrite, String> {
        if specifier.is_empty() || specifier.contains(':') || specifier.starts_with("//") {
            return Ok(Rewrite::Keep);
        }
        let folder = file.parent().unwrap_or(&self.root);
        if !(specifier.starts_with('.') || specifier.starts_with('/')) {
            return self.resolve(folder, specifier).map(Rewrite::To);
        }
        if specifier.contains('?') {
            return Ok(Rewrite::Keep);
        }
        Ok(match extension_of(specifier) {
            Some("css" | "json") => Rewrite::To(format!("{specifier}?import")),
            Some(extension) if ASSETS.contains(&extension) => {
                Rewrite::To(format!("{specifier}?url"))
            }
            _ => Rewrite::Keep,
        })
    }

    /// A script as the browser gets it, cached until the file changes.
    pub fn module(&self, file: &Path) -> Result<String, TransformError> {
        let metadata = fs::metadata(file).map_err(|error| fail(file, &error.to_string()))?;
        let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        if let Ok(cache) = self.cache.lock()
            && let Some(cached) = cache.get(file)
            && cached.modified == modified
            && cached.length == metadata.len()
        {
            return Ok(cached.code.clone());
        }
        let source = fs::read_to_string(file).map_err(|error| fail(file, &error.to_string()))?;
        let code = self.transform(file, &source)?;
        if let Ok(mut cache) = self.cache.lock() {
            cache.insert(
                file.to_path_buf(),
                Cached {
                    modified,
                    length: metadata.len(),
                    code: code.clone(),
                },
            );
        }
        Ok(code)
    }

    /// Transforms one script: types and JSX first, then specifiers and the replaced values.
    pub fn transform(&self, file: &Path, source: &str) -> Result<String, TransformError> {
        let code = transform::transform(file, source)?;
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, &code, SourceType::mjs()).parse();
        if !parsed.diagnostics.is_empty() {
            if transform::transforms(
                file.extension()
                    .and_then(|extension| extension.to_str())
                    .unwrap_or(""),
            ) {
                return Err(transform::parse_errors(parsed.diagnostics, &code)
                    .unwrap_or_else(|| fail(file, "the transformed module does not parse")));
            }
            return Ok(code);
        }
        if !parsed.module_record.has_module_syntax
            && (code.contains("module.exports") || code.contains("require("))
        {
            return Err(fail(
                file,
                "is CommonJS, which a browser cannot load as a module; zerolith dev serves ES modules, so import a package's ES module build",
            ));
        }
        let mut spans: Vec<Span> = parsed
            .module_record
            .requested_modules
            .values()
            .flat_map(|requests| requests.iter().map(|request| request.span))
            .collect();
        spans.extend(
            parsed
                .module_record
                .dynamic_imports
                .iter()
                .map(|dynamic| dynamic.module_request),
        );
        let mut edits = Vec::new();
        for span in spans {
            let text = &code[span.start as usize..span.end as usize];
            let Some(quote) = text.chars().next().filter(|c| *c == '"' || *c == '\'') else {
                continue;
            };
            if text.len() < 2 || !text.ends_with(quote) {
                continue;
            }
            let specifier = &text[1..text.len() - 1];
            match self.rewrite(file, specifier) {
                Ok(Rewrite::Keep) => {}
                Ok(Rewrite::To(url)) => edits.push(Edit {
                    start: span.start,
                    end: span.end,
                    text: serde_json::Value::from(url).to_string(),
                }),
                Err(error) => {
                    return Err(fail(
                        file,
                        &format!(
                            "imports \"{specifier}\", which does not resolve ({error}); install the package or fix the path"
                        ),
                    ));
                }
            }
        }
        let mut defines = Defines::default();
        defines.visit_program(&parsed.program);
        edits.extend(defines.meta_env.iter().map(|span| Edit {
            start: span.start,
            end: span.end,
            text: self.env.clone(),
        }));
        edits.extend(defines.node_env.iter().map(|span| Edit {
            start: span.start,
            end: span.end,
            text: self.node_env.clone(),
        }));
        Ok(apply_edits(&code, edits))
    }

    /// A stylesheet imported from code, as a module that puts it in a `<style>` element, or replaces the text of the one it put there before. Its references point at absolute URLs, since a `<style>` element resolves them against the page.
    pub fn stylesheet(&self, file: &Path) -> io::Result<String> {
        let text = css::absolute_urls(file, &self.root, |found| {
            self.allow(found);
            self.url_of(found)
        })?;
        let id = serde_json::Value::from(self.url_of(file)).to_string();
        let text = serde_json::Value::from(text).to_string();
        Ok(format!(
            "const id = {id};\nlet style = Array.from(document.querySelectorAll(\"style[data-zerolith-css]\")).find((element) => element.dataset.zerolithCss === id);\nif (style === undefined)\n{{\n    style = document.createElement(\"style\");\n    style.dataset.zerolithCss = id;\n    document.head.append(style);\n}}\nstyle.textContent = {text};\n"
        ))
    }

    /// A file imported for its URL, its text with `?raw`, or its value when it is JSON.
    pub fn asset(&self, file: &Path, query: &str) -> io::Result<String> {
        if wants(query, "raw") {
            let text = fs::read_to_string(file)?;
            return Ok(format!(
                "export default {};\n",
                serde_json::Value::from(text)
            ));
        }
        if wants(query, "import")
            && file
                .extension()
                .is_some_and(|extension| extension == "json")
        {
            let text = fs::read_to_string(file)?;
            let value: serde_json::Value = serde_json::from_str(&text).map_err(|error| {
                io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!("{} is not valid JSON: {error}", file.display()),
                )
            })?;
            return Ok(format!("export default {value};\n"));
        }
        Ok(format!(
            "export default {};\n",
            serde_json::Value::from(self.url_of(file))
        ))
    }
}

/// The package a file belongs to: the folder directly in a `node_modules` folder, scoped names included, or else the nearest folder whose `package.json` has a name, as a workspace package linked from elsewhere has.
fn package_folder(file: &Path) -> Option<PathBuf> {
    let named = |folder: &Path| {
        folder
            .file_name()
            .and_then(|name| name.to_str())
            .map(str::to_string)
    };
    for folder in file.ancestors().skip(1) {
        let Some(parent) = folder.parent() else {
            break;
        };
        let parent_name = named(parent);
        if parent_name.as_deref() == Some("node_modules")
            && !named(folder).is_some_and(|name| name.starts_with('@'))
        {
            return Some(folder.to_path_buf());
        }
        if parent_name.is_some_and(|name| name.starts_with('@'))
            && parent.parent().and_then(named).as_deref() == Some("node_modules")
        {
            return Some(folder.to_path_buf());
        }
    }
    file.ancestors().skip(1).find_map(|folder| {
        let manifest = fs::read_to_string(folder.join("package.json")).ok()?;
        let value: serde_json::Value = serde_json::from_str(&manifest).ok()?;
        value.get("name").is_some().then(|| folder.to_path_buf())
    })
}

fn fail(file: &Path, message: &str) -> TransformError {
    TransformError {
        message: format!("{} {message}", file.display()),
    }
}

#[cfg(test)]
mod tests {
    use super::{FS_PREFIX, Pipeline};
    use std::fs;
    use std::path::{Path, PathBuf};

    /// A workspace: the project in `app/`, and packages installed one folder up, as npm workspaces hoist them.
    fn workspace(name: &str) -> (PathBuf, PathBuf) {
        let top =
            std::env::temp_dir().join(format!("zerolith-modules-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&top);
        let files = [
            (
                "node_modules/lib/package.json",
                "{\"name\":\"lib\",\"type\":\"module\",\"exports\":{\".\":{\"development\":\"./dev.js\",\"default\":\"./prod.js\"},\"./extra\":\"./extra.js\"}}",
            ),
            (
                "node_modules/lib/dev.js",
                "import { other } from \"other\";\nexport const lib = \"dev \" + other + process.env.NODE_ENV;\n",
            ),
            ("node_modules/lib/prod.js", "export const lib = \"prod\";\n"),
            ("node_modules/lib/extra.js", "export const extra = 1;\n"),
            (
                "node_modules/other/package.json",
                "{\"name\":\"other\",\"module\":\"./esm.js\",\"main\":\"./cjs.js\"}",
            ),
            (
                "node_modules/other/esm.js",
                "export const other = \"esm\";\n",
            ),
            (
                "node_modules/other/cjs.js",
                "module.exports = { other: \"cjs\" };\n",
            ),
            (
                "node_modules/old/package.json",
                "{\"name\":\"old\",\"main\":\"./index.js\"}",
            ),
            (
                "node_modules/old/index.js",
                "module.exports = function old() {};\n",
            ),
            (
                "app/src/main.ts",
                "import { lib } from \"lib\";\nimport { extra } from \"lib/extra\";\nimport \"./styles.css\";\nimport logo from \"./logo.svg\";\nimport data from \"./data.json\";\nimport text from \"./notes.md?raw\";\nconst count: number = 1;\nconsole.log(lib, extra, logo, data, text, count, import.meta.env.MODE, import.meta.env.PUBLIC_API);\nexport const later = () => import(\"./later.ts\");\n",
            ),
            ("app/src/later.ts", "export const later = 1;\n"),
            (
                "app/src/styles.css",
                "@import \"./base.css\";\nbody { background: url(./grain.png); }\n.icon { background: url(/icons/a.svg); }\n",
            ),
            ("app/src/base.css", "html { margin: 0; }\n"),
            ("app/src/grain.png", "PNG"),
            ("app/src/logo.svg", "<svg/>"),
            ("app/src/data.json", "{ \"ok\": true }"),
            ("app/src/notes.md", "# Notes"),
            (
                "app/.env",
                "PUBLIC_API=https://api.example\nSECRET=hidden\n",
            ),
        ];
        for (path, text) in files {
            let file = top.join(path);
            fs::create_dir_all(file.parent().unwrap()).unwrap();
            fs::write(file, text).unwrap();
        }
        let app = crate::css::canonical(&top.join("app")).unwrap();
        (top, app)
    }

    #[test]
    fn resolves_packages_and_turns_other_imports_into_modules() {
        let (top, app) = workspace("main");
        let pipeline = Pipeline::new(app.clone(), "development", "/");
        let code = pipeline.module(&app.join("src/main.ts")).unwrap();
        let lib =
            pipeline.url_of(&crate::css::canonical(&top.join("node_modules/lib/dev.js")).unwrap());
        assert!(lib.starts_with(FS_PREFIX), "{lib}");
        assert!(code.contains(&format!("from \"{lib}\"")), "{code}");
        assert!(code.contains("/node_modules/lib/extra.js\""), "{code}");
        assert!(code.contains("import \"./styles.css?import\""), "{code}");
        assert!(
            code.contains("from \"./logo.svg?url\"")
                && code.contains("from \"./data.json?import\""),
            "{code}"
        );
        assert!(
            code.contains("from \"./notes.md?raw\"") && code.contains("import(\"./later.ts\")"),
            "{code}"
        );
        assert!(
            code.contains("\"MODE\":\"development\"")
                && code.contains("\"PUBLIC_API\":\"https://api.example\""),
            "{code}"
        );
        assert!(
            !code.contains("SECRET") && !code.contains(": number"),
            "{code}"
        );
        let served = pipeline.locate(&lib).unwrap();
        let dependency = pipeline.module(&served).unwrap();
        assert!(
            dependency.contains("/node_modules/other/esm.js\"")
                && dependency.contains("\"development\""),
            "{dependency}"
        );
        assert!(
            pipeline
                .locate(&format!(
                    "{FS_PREFIX}{}",
                    top.join("app/.env")
                        .to_string_lossy()
                        .replace('\\', "/")
                        .trim_start_matches('/')
                ))
                .is_none()
        );
        let production = Pipeline::new(app.clone(), "production", "/");
        assert!(
            production
                .module(&app.join("src/main.ts"))
                .unwrap()
                .contains("/node_modules/lib/prod.js\"")
        );
        let _ = fs::remove_dir_all(&top);
    }

    #[test]
    fn serves_stylesheets_assets_and_json_as_modules() {
        let (top, app) = workspace("assets");
        let pipeline = Pipeline::new(app.clone(), "development", "/");
        let style = pipeline.stylesheet(&app.join("src/styles.css")).unwrap();
        assert!(style.contains("const id = \"/src/styles.css\""), "{style}");
        assert!(
            style.contains("/src/base.css")
                && style.contains("/src/grain.png")
                && style.contains("/icons/a.svg"),
            "{style}"
        );
        assert_eq!(
            pipeline.asset(&app.join("src/logo.svg"), "url").unwrap(),
            "export default \"/src/logo.svg\";\n"
        );
        assert_eq!(
            pipeline.asset(&app.join("src/notes.md"), "raw").unwrap(),
            "export default \"# Notes\";\n"
        );
        assert_eq!(
            pipeline
                .asset(&app.join("src/data.json"), "import")
                .unwrap(),
            "export default {\"ok\":true};\n"
        );
        let _ = fs::remove_dir_all(&top);
    }

    #[test]
    fn reports_missing_packages_and_common_js() {
        let (top, app) = workspace("errors");
        let pipeline = Pipeline::new(app.clone(), "development", "/");
        let missing = pipeline
            .transform(
                Path::new(&app.join("src/x.js")),
                "import { y } from \"not-installed\";\n",
            )
            .unwrap_err()
            .to_string();
        assert!(
            missing.contains("imports \"not-installed\", which does not resolve"),
            "{missing}"
        );
        let old = crate::css::canonical(&top.join("node_modules/old/index.js")).unwrap();
        let error = pipeline.module(&old).unwrap_err().to_string();
        assert!(error.contains("is CommonJS"), "{error}");
        let classic = pipeline
            .transform(
                Path::new(&app.join("legacy.js")),
                "with (Math) { console.log(PI); }\n",
            )
            .unwrap();
        assert!(classic.contains("with (Math)"));
        let _ = fs::remove_dir_all(&top);
    }
}
