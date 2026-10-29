//! Project checks for the buildless path. Every finding has a stable code,
//! a one-line cause, and a one-line fix, like the runtime's diagnostics.

use std::fs;
use std::path::Path;
use std::process::ExitCode;

use serde::Serialize;

use crate::importmap::{ImportMap, integrity};

/// One finding.
#[derive(Debug, Serialize)]
pub struct Finding {
    pub code: &'static str,
    pub severity: &'static str,
    pub cause: String,
    pub fix: &'static str,
}

fn error(code: &'static str, cause: String, fix: &'static str) -> Finding {
    Finding { code, severity: "error", cause, fix }
}

fn warning(code: &'static str, cause: String, fix: &'static str) -> Finding {
    Finding { code, severity: "warning", cause, fix }
}

/// Extracts the inline import map from an HTML document.
pub fn import_map_of(html: &str) -> Option<&str> {
    let start = html.find("<script type=\"importmap\">")? + "<script type=\"importmap\">".len();
    let end = html[start..].find("</script>")? + start;
    Some(html[start..end].trim())
}

/// Runs every check against `root`.
pub fn check(root: &Path) -> Vec<Finding> {
    let mut findings = Vec::new();
    let index = root.join("index.html");
    let Ok(html) = fs::read_to_string(&index) else {
        findings.push(error("index_missing", format!("{} does not exist", index.display()), "Create index.html with an import map and a module script, or pass the folder that holds it."));
        return findings;
    };
    let Some(raw) = import_map_of(&html) else {
        findings.push(error("importmap_missing", "index.html has no <script type=\"importmap\">".to_string(), "Run `zerolith importmap --html index.html` to vendor the packages and write one."));
        return findings;
    };
    let map: ImportMap = match serde_json::from_str(raw) {
        Ok(map) => map,
        Err(problem) => {
            findings.push(error("importmap_invalid", format!("the import map is not valid JSON: {problem}"), "Regenerate it with `zerolith importmap --html index.html`."));
            return findings;
        }
    };
    for (specifier, url) in &map.imports {
        if !url.starts_with('/') {
            continue;
        }
        let file = root.join(url.trim_start_matches('/'));
        if !file.is_file() {
            findings.push(error("importmap_target_missing", format!("\"{specifier}\" maps to {url}, which does not exist"), "Run `zerolith importmap --html index.html` again, or fix the path."));
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
                findings.push(error("integrity_target_missing", format!("{url} has an integrity hash but does not exist"), "Regenerate the import map."));
            }
        }
    }
    if !html.contains("<script type=\"module\"") {
        findings.push(warning("module_script_missing", "index.html has no <script type=\"module\">".to_string(), "Load the application with <script type=\"module\" src=\"/app.js\"></script>."));
    }
    for package in ["zerolith", "@zerolith/router", "@zerolith/devtools"] {
        let vendored = map.imports.keys().any(|specifier| specifier == package || specifier.starts_with(&format!("{package}/")));
        if !vendored {
            continue;
        }
        let installed = fs::read_to_string(root.join("node_modules").join(package).join("package.json"))
            .ok()
            .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
            .and_then(|manifest| manifest.get("version").and_then(|version| version.as_str().map(str::to_string)));
        let vendored_version = map
            .imports
            .get(package)
            .and_then(|url| url.strip_prefix('/'))
            .and_then(|path| Path::new(path).ancestors().find_map(|folder| fs::read_to_string(root.join(folder).join("VERSION")).ok()))
            .map(|text| text.trim().to_string());
        if let (Some(installed), Some(vendored)) = (installed, vendored_version) {
            if installed != vendored {
                findings.push(warning("package_outdated", format!("{package} {vendored} is vendored but {installed} is installed"), "Run `zerolith importmap --html index.html` to vendor the installed version."));
            }
        }
    }
    findings
}

/// Runs the `doctor` command and maps findings to an exit code.
pub fn run(root: &Path, json: bool) -> ExitCode {
    let findings = check(root);
    if json {
        println!("{}", serde_json::to_string_pretty(&findings).unwrap_or_default());
    } else if findings.is_empty() {
        println!("zerolith doctor: no problems found in {}", root.display());
    } else {
        for finding in &findings {
            println!("{} {}: {}\n  fix: {}", finding.severity, finding.code, finding.cause, finding.fix);
        }
    }
    if findings.iter().any(|finding| finding.severity == "error") { ExitCode::FAILURE } else { ExitCode::SUCCESS }
}

#[cfg(test)]
mod tests {
    use super::{check, import_map_of};
    use std::fs;

    #[test]
    fn reports_missing_targets_and_bad_hashes() {
        let root = std::env::temp_dir().join(format!("zerolith-doctor-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("vendor")).unwrap();
        fs::write(root.join("vendor/a.js"), "export {}").unwrap();
        fs::write(
            root.join("index.html"),
            "<html><head><script type=\"importmap\">{\"imports\":{\"a\":\"/vendor/a.js\",\"b\":\"/vendor/b.js\"},\"integrity\":{\"/vendor/a.js\":\"sha256-wrong\"}}</script></head><body><script type=\"module\" src=\"/app.js\"></script></body></html>",
        )
        .unwrap();
        let codes: Vec<&str> = check(&root).iter().map(|finding| finding.code).collect();
        assert_eq!(codes, vec!["importmap_target_missing", "integrity_mismatch"]);
        assert_eq!(import_map_of("<script type=\"importmap\"> {\"imports\":{}} </script>"), Some("{\"imports\":{}}"));
        assert_eq!(check(&root.join("nowhere"))[0].code, "index_missing");
        let _ = fs::remove_dir_all(&root);
    }
}
