//! Project checks for the buildless path. Every finding has a stable code,
//! a one-line cause, and a one-line fix, like the runtime's diagnostics.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use oxc_span::SourceType;
use serde::Serialize;

use crate::importmap::{ImportMap, PACKAGES, integrity};
use crate::scan::DIAGNOSTIC_URL;
use crate::{lint, transform};

/// Folders the template lint does not enter, besides hidden ones.
const SKIPPED: [&str; 6] = ["node_modules", "vendor", "dist", "target", "test", "tests"];

/// One finding.
#[derive(Debug, Serialize)]
pub struct Finding {
    pub code: &'static str,
    pub severity: &'static str,
    pub cause: String,
    pub fix: String,
}

fn error(code: &'static str, cause: String, fix: impl Into<String>) -> Finding {
    Finding {
        code,
        severity: "error",
        cause,
        fix: fix.into(),
    }
}

fn warning(code: &'static str, cause: String, fix: impl Into<String>) -> Finding {
    Finding {
        code,
        severity: "warning",
        cause,
        fix: fix.into(),
    }
}

/// Collects the JavaScript and TypeScript sources under `folder`, in path order, skipping dependencies, output, tests, and hidden folders.
fn sources(folder: &Path, found: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(folder) else {
        return;
    };
    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            if !SKIPPED.contains(&name.as_str()) {
                sources(&path, found);
            }
            continue;
        }
        let extension = path
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or("");
        let declaration = name.ends_with(".d.ts") || name.ends_with(".d.mts");
        if !declaration && matches!(extension, "js" | "mjs" | "jsx" | "ts" | "mts" | "tsx") {
            found.push(path);
        }
    }
}

/// The template lint of the Vite plugin over a project's sources, as warnings that name the file, line, and column. JSX is lowered first, keeping its lines, so the findings point into the source.
pub(crate) fn lint_sources(root: &Path) -> Vec<Finding> {
    let mut files = Vec::new();
    sources(root, &mut files);
    let mut findings = Vec::new();
    for file in files {
        let Ok(source) = fs::read_to_string(&file) else {
            continue;
        };
        let extension = file
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or("");
        let (code, source_type) = match extension {
            "tsx" | "jsx" => {
                let source_type = if extension == "tsx" {
                    SourceType::tsx()
                } else {
                    SourceType::jsx()
                };
                match transform::lower_jsx(&source, source_type) {
                    Ok(code) => (code, source_type),
                    Err(_) => continue,
                }
            }
            "ts" | "mts" => (source, SourceType::ts()),
            _ => (source, SourceType::mjs()),
        };
        let shown = file
            .strip_prefix(root)
            .unwrap_or(&file)
            .to_string_lossy()
            .replace('\\', "/");
        for finding in lint::lint(&code, source_type) {
            let (line, column) = lint::position(&code, finding.offset);
            findings.push(warning(
                finding.code,
                format!("{shown}:{line}:{column}: {}", finding.message),
                format!("See {DIAGNOSTIC_URL}{}", finding.code),
            ));
        }
    }
    findings
}

/// Extracts the inline import map from an HTML document.
pub fn import_map_of(html: &str) -> Option<&str> {
    let start = html.find("<script type=\"importmap\">")? + "<script type=\"importmap\">".len();
    let end = html[start..].find("</script>")? + start;
    Some(html[start..end].trim())
}

/// The value of a double-quoted attribute in one tag.
fn attribute<'t>(tag: &'t str, name: &str) -> Option<&'t str> {
    let marker = format!(" {name}=\"");
    let start = tag.find(&marker)? + marker.len();
    let end = tag[start..].find('"')? + start;
    Some(&tag[start..end])
}

/// The `modulepreload` link tags of a page.
fn preload_links(html: &str) -> Vec<&str> {
    let mut links = Vec::new();
    let mut rest = html;
    while let Some(start) = rest.find("<link") {
        let Some(end) = rest[start..].find('>') else {
            break;
        };
        let tag = &rest[start..start + end + 1];
        if attribute(tag, "rel") == Some("modulepreload") {
            links.push(tag);
        }
        rest = &rest[start + end + 1..];
    }
    links
}

/// Runs every check against `root`: the page and its import map, then the template lint over the sources.
pub fn check(root: &Path) -> Vec<Finding> {
    let mut findings = page_checks(root);
    findings.extend(lint_sources(root));
    findings
}

/// The checks of `index.html`, its import map, the files the map points at, and the vendored packages.
fn page_checks(root: &Path) -> Vec<Finding> {
    let mut findings = Vec::new();
    let index = root.join("index.html");
    let Ok(html) = fs::read_to_string(&index) else {
        findings.push(error("index_missing", format!("{} does not exist", index.display()), "Create index.html with an import map and a module script, or pass the folder that holds it."));
        return findings;
    };
    let Some(raw) = import_map_of(&html) else {
        findings.push(error(
            "importmap_missing",
            "index.html has no <script type=\"importmap\">".to_string(),
            "Run `zerolith importmap --html index.html` to vendor the packages and write one.",
        ));
        return findings;
    };
    let map: ImportMap = match serde_json::from_str(raw) {
        Ok(map) => map,
        Err(problem) => {
            findings.push(error(
                "importmap_invalid",
                format!("the import map is not valid JSON: {problem}"),
                "Regenerate it with `zerolith importmap --html index.html`.",
            ));
            return findings;
        }
    };
    for (specifier, url) in &map.imports {
        if !url.starts_with('/') {
            continue;
        }
        let file = root.join(url.trim_start_matches('/'));
        if !file.is_file() {
            findings.push(error(
                "importmap_target_missing",
                format!("\"{specifier}\" maps to {url}, which does not exist"),
                "Run `zerolith importmap --html index.html` again, or fix the path.",
            ));
        }
    }
    for (url, expected) in &map.integrity {
        let file = root.join(url.trim_start_matches('/'));
        match fs::read(&file) {
            Ok(bytes) if &integrity(&bytes) != expected => {
                findings.push(error("integrity_mismatch", format!("{url} no longer matches its integrity hash"), "The file changed after the import map was written; regenerate the import map or restore the file."));
            }
            Ok(_) => {}
            Err(_) => {
                findings.push(error(
                    "integrity_target_missing",
                    format!("{url} has an integrity hash but does not exist"),
                    "Regenerate the import map.",
                ));
            }
        }
    }
    for link in preload_links(&html) {
        let Some(href) = attribute(link, "href") else {
            continue;
        };
        if let Some(expected) = map.integrity.get(href)
            && attribute(link, "integrity") != Some(expected.as_str())
        {
            findings.push(warning(
                "preload_integrity_mismatch",
                format!("the preload link for {href} lacks the integrity hash the import map gives it, so the browser downloads the module twice"),
                "Run `zerolith importmap --html index.html` again, which writes the hash on every preload link.",
            ));
        }
    }
    if !html.contains("<script type=\"module\"") {
        findings.push(warning(
            "module_script_missing",
            "index.html has no <script type=\"module\">".to_string(),
            "Load the application with <script type=\"module\" src=\"/app.js\"></script>.",
        ));
    }
    for package in PACKAGES {
        let vendored = map
            .imports
            .keys()
            .any(|specifier| specifier == package || specifier.starts_with(&format!("{package}/")));
        if !vendored {
            continue;
        }
        let installed =
            fs::read_to_string(root.join("node_modules").join(package).join("package.json"))
                .ok()
                .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
                .and_then(|manifest| {
                    manifest
                        .get("version")
                        .and_then(|version| version.as_str().map(str::to_string))
                });
        let vendored_version = map
            .imports
            .get(package)
            .and_then(|url| url.strip_prefix('/'))
            .and_then(|path| {
                Path::new(path)
                    .ancestors()
                    .find_map(|folder| fs::read_to_string(root.join(folder).join("VERSION")).ok())
            })
            .map(|text| text.trim().to_string());
        if let (Some(installed), Some(vendored)) = (installed, vendored_version)
            && installed != vendored
        {
            findings.push(warning(
                "package_outdated",
                format!("{package} {vendored} is vendored but {installed} is installed"),
                "Run `zerolith importmap --html index.html` to vendor the installed version.",
            ));
        }
    }
    findings
}

/// Runs the `doctor` command and maps findings to an exit code.
pub fn run(root: &Path, json: bool) -> ExitCode {
    let findings = check(root);
    if json {
        println!(
            "{}",
            serde_json::to_string_pretty(&findings).unwrap_or_default()
        );
    } else if findings.is_empty() {
        println!("zerolith doctor: no problems found in {}", root.display());
    } else {
        for finding in &findings {
            println!(
                "{} {}: {}\n  fix: {}",
                finding.severity, finding.code, finding.cause, finding.fix
            );
        }
    }
    if findings.iter().any(|finding| finding.severity == "error") {
        ExitCode::FAILURE
    } else {
        ExitCode::SUCCESS
    }
}

#[cfg(test)]
mod tests {
    use super::{check, import_map_of};
    use std::fs;

    #[test]
    fn lints_templates_in_sources_and_skips_dependencies_and_tests() {
        let root =
            std::env::temp_dir().join(format!("zerolith-doctor-lint-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        for folder in ["src", "node_modules/dep", "test", ".cache"] {
            fs::create_dir_all(root.join(folder)).unwrap();
        }
        let frozen = "import { html, signal } from \"zerolith\";
const count = signal<number>(0);
export const view = html`<p>${count.get()}</p>`;
";
        fs::write(root.join("src/app.ts"), frozen).unwrap();
        fs::write(
            root.join("src/view.tsx"),
            "export const View = (): unknown => (
    <main>
        <img src=\"/a.png\" />
    </main>
);
",
        )
        .unwrap();
        fs::write(root.join("src/types.d.ts"), frozen).unwrap();
        fs::write(root.join("node_modules/dep/index.js"), frozen).unwrap();
        fs::write(root.join("test/app.test.ts"), frozen).unwrap();
        fs::write(root.join(".cache/app.js"), frozen).unwrap();
        let findings = super::lint_sources(&root);
        let shown: Vec<String> = findings
            .iter()
            .map(|finding| {
                let at = finding.cause.split(": ").next().unwrap_or("");
                format!("{} {at}", finding.code)
            })
            .collect();
        assert_eq!(shown.len(), 2, "{shown:?}");
        assert_eq!(shown[0], "template_frozen_read src/app.ts:3:31");
        assert!(
            shown[1].starts_with("image_without_alt src/view.tsx:2:"),
            "{shown:?}"
        );
        assert!(findings.iter().all(|finding| finding.severity == "warning"));
        assert!(findings[0].fix.ends_with("/e/template_frozen_read"));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn reports_missing_targets_and_bad_hashes() {
        let root =
            std::env::temp_dir().join(format!("zerolith-doctor-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("vendor")).unwrap();
        fs::write(root.join("vendor/a.js"), "export {}").unwrap();
        fs::write(
            root.join("index.html"),
            "<html><head><script type=\"importmap\">{\"imports\":{\"a\":\"/vendor/a.js\",\"b\":\"/vendor/b.js\"},\"integrity\":{\"/vendor/a.js\":\"sha256-wrong\"}}</script><link rel=\"modulepreload\" href=\"/vendor/a.js\"><link rel=\"modulepreload\" href=\"/vendor/b.js\"></head><body><script type=\"module\" src=\"/app.js\"></script></body></html>",
        )
        .unwrap();
        let codes: Vec<&str> = check(&root).iter().map(|finding| finding.code).collect();
        assert_eq!(
            codes,
            vec![
                "importmap_target_missing",
                "integrity_mismatch",
                "preload_integrity_mismatch"
            ]
        );
        fs::write(
            root.join("index.html"),
            "<html><head><script type=\"importmap\">{\"imports\":{\"a\":\"/vendor/a.js\"},\"integrity\":{\"/vendor/a.js\":\"sha256-wrong\"}}</script><link rel=\"modulepreload\" href=\"/vendor/a.js\" integrity=\"sha256-wrong\"></head><body><script type=\"module\" src=\"/app.js\"></script></body></html>",
        )
        .unwrap();
        let codes: Vec<&str> = check(&root).iter().map(|finding| finding.code).collect();
        assert_eq!(codes, vec!["integrity_mismatch"]);
        assert_eq!(
            import_map_of("<script type=\"importmap\"> {\"imports\":{}} </script>"),
            Some("{\"imports\":{}}")
        );
        assert_eq!(check(&root.join("nowhere"))[0].code, "index_missing");
        let _ = fs::remove_dir_all(&root);
    }
}
