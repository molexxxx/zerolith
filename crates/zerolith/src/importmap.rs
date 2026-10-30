//! Vendors the installed zerolith packages and writes an import map with
//! integrity hashes and preload links, so a page runs with no build step
//! and no reference into node_modules.

use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::Path;

use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// The packages vendored by default, in dependency order.
/// The packages the import map vendors and the doctor checks.
pub const PACKAGES: [&str; 5] = [
    "zerolith",
    "@zerolith/router",
    "@zerolith/forms",
    "@zerolith/client",
    "@zerolith/devtools",
];

/// The generated import map, written as `importmap.json` next to the vendored files.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct ImportMap {
    pub imports: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub integrity: BTreeMap<String, String>,
}

/// What `vendor` produced.
#[derive(Debug, Default)]
pub struct Vendored {
    pub map: ImportMap,
    /// Root-relative URLs of the modules reachable from the mapped entries, for `modulepreload` links.
    pub modules: Vec<String>,
    /// Package name to version, for `doctor`.
    pub versions: BTreeMap<String, String>,
}

/// The relative specifiers a module imports or re-exports statically.
pub fn relative_imports(source: &str) -> Vec<String> {
    let mut found = Vec::new();
    for quote in ['"', '\''] {
        let marker = format!("from {quote}");
        let mut rest = source;
        while let Some(start) = rest.find(&marker) {
            let after = &rest[start + marker.len()..];
            if let Some(end) = after.find(quote) {
                let specifier = &after[..end];
                if specifier.starts_with("./") || specifier.starts_with("../") {
                    found.push(specifier.to_string());
                }
                rest = &after[end..];
            } else {
                break;
            }
        }
    }
    found
}

/// Resolves a relative specifier against the URL of the importing module.
fn resolve_url(from: &str, specifier: &str) -> String {
    let mut segments: Vec<&str> = from.split('/').collect();
    segments.pop();
    for part in specifier.split('/') {
        match part {
            "." | "" => {}
            ".." => {
                segments.pop();
            }
            name => segments.push(name),
        }
    }
    segments.join("/")
}

/// Every module reachable from the entry URLs through static relative imports, given the URL to file mapping.
fn reachable(entries: &[String], files: &BTreeMap<String, Vec<u8>>) -> Vec<String> {
    let mut seen: Vec<String> = Vec::new();
    let mut queue: Vec<String> = entries.to_vec();
    while let Some(url) = queue.pop() {
        if seen.contains(&url) {
            continue;
        }
        let Some(bytes) = files.get(&url) else {
            continue;
        };
        seen.push(url.clone());
        for specifier in relative_imports(&String::from_utf8_lossy(bytes)) {
            queue.push(resolve_url(&url, &specifier));
        }
    }
    seen.sort();
    seen
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

/// Copies a package's modules, and with `prepare` runs the template prepare pass over each one and puts the scanner's stand-in in the scanner's place.
fn copy_tree(
    from: &Path,
    to: &Path,
    prefix: &str,
    files: &mut BTreeMap<String, Vec<u8>>,
    prepare: bool,
) -> io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if path.is_dir() {
            copy_tree(
                &path,
                &to.join(&name),
                &format!("{prefix}/{name}"),
                files,
                prepare,
            )?;
            continue;
        }
        if !name.ends_with(".js") && !name.ends_with(".d.ts") {
            continue;
        }
        let bytes = if prepare && name == "scan.js" && from.join("scan.unprepared.js").is_file() {
            fs::read(from.join("scan.unprepared.js"))?
        } else if prepare && name.ends_with(".js") {
            let text = fs::read_to_string(&path)?;
            crate::prepare::prepare(&text)
                .map_err(|error| io::Error::other(format!("{}: {error}", path.display())))?
                .into_bytes()
        } else {
            fs::read(&path)?
        };
        fs::write(to.join(&name), &bytes)?;
        if name.ends_with(".js") {
            files.insert(format!("{prefix}/{name}"), bytes);
        }
    }
    Ok(())
}

/// Copies each installed package's published modules into `out` under the project root and returns the import map.
pub fn vendor(root: &Path, out: &Path, development: bool) -> io::Result<Vendored> {
    vendor_from(&root.join("node_modules"), root, out, development, false)
}

/// Like `vendor`, reading the packages from `packages` (a node_modules folder) and writing under `root/out`, so a build can vendor into its output folder; with `prepare`, every vendored module goes through the template prepare pass and the core's scanner is replaced by its stand-in.
pub fn vendor_from(
    packages: &Path,
    root: &Path,
    out: &Path,
    development: bool,
    prepare: bool,
) -> io::Result<Vendored> {
    let mut vendored = Vendored::default();
    let mut files: BTreeMap<String, Vec<u8>> = BTreeMap::new();
    let base = format!(
        "/{}",
        out.to_string_lossy().replace('\\', "/").trim_matches('/')
    );
    for package in PACKAGES {
        let folder = packages.join(package);
        let manifest_path = folder.join("package.json");
        if !manifest_path.is_file() {
            continue;
        }
        let manifest: Manifest =
            serde_json::from_str(&fs::read_to_string(&manifest_path)?).map_err(io::Error::other)?;
        vendored
            .versions
            .insert(package.to_string(), manifest.version.clone());
        let target = root.join(out).join(package);
        let prefix = format!("{base}/{package}");
        let mut copied_dist = false;
        for (subpath, entry) in &manifest.exports {
            if subpath == "./package.json" {
                continue;
            }
            let Some(file) = resolve_export(entry, development) else {
                continue;
            };
            let file = file.trim_start_matches("./").to_string();
            let specifier = if subpath == "." {
                package.to_string()
            } else {
                format!("{package}/{}", subpath.trim_start_matches("./"))
            };
            vendored
                .map
                .imports
                .insert(specifier, format!("{prefix}/{file}"));
            if !copied_dist {
                let dist = folder.join("dist");
                if dist.is_dir() {
                    copy_tree(
                        &dist,
                        &target.join("dist"),
                        &format!("{prefix}/dist"),
                        &mut files,
                        prepare,
                    )?;
                    copied_dist = true;
                }
            }
        }
        fs::write(target.join("VERSION"), format!("{}\n", manifest.version))?;
    }
    if vendored.map.imports.is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            "no zerolith packages found under node_modules; run npm install first",
        ));
    }
    let entries: Vec<String> = vendored.map.imports.values().cloned().collect();
    vendored.modules = reachable(&entries, &files);
    for url in &vendored.modules {
        if let Some(bytes) = files.get(url) {
            vendored.map.integrity.insert(url.clone(), integrity(bytes));
        }
    }
    fs::create_dir_all(root.join(out))?;
    fs::write(
        root.join(out).join("importmap.json"),
        format!(
            "{}\n",
            serde_json::to_string_pretty(&vendored.map).map_err(io::Error::other)?
        ),
    )?;
    Ok(vendored)
}

/// The script and preload tags for an HTML head. Each preload carries the integrity hash the map gives its module: a browser reuses a preload only when its integrity matches the module request's, which takes the hash from the map.
pub fn html_tags(vendored: &Vendored) -> String {
    let map = serde_json::to_string(&vendored.map).unwrap_or_default();
    let mut out = format!("<script type=\"importmap\">{map}</script>\n");
    for module in &vendored.modules {
        let integrity = vendored
            .map
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

/// Replaces the import map and the previously generated preload links in an HTML document, or inserts them before `</head>`.
pub fn update_html(html: &str, tags: &str) -> String {
    let stripped: String = html
        .lines()
        .filter(|line| {
            !(line.contains("rel=\"modulepreload\"") && line.contains("data-zerolith-preload"))
        })
        .map(|line| format!("{line}\n"))
        .collect();
    let mut result = String::new();
    let mut rest = stripped.as_str();
    let mut replaced = false;
    while let Some(start) = rest.find("<script type=\"importmap\">") {
        let Some(end_offset) = rest[start..].find("</script>") else {
            break;
        };
        let end = start + end_offset + "</script>".len();
        result.push_str(&rest[..start]);
        if !replaced {
            result.push_str(tags.trim_end());
            replaced = true;
        }
        rest = &rest[end..];
        if replaced && rest.starts_with('\n') && result.ends_with('\n') {
            rest = &rest[1..];
        }
    }
    result.push_str(rest);
    if !replaced {
        match result.find("</head>") {
            Some(index) => result.insert_str(index, tags),
            None => result.insert_str(0, tags),
        }
    }
    result
}

/// Runs the `importmap` command.
pub fn run(root: &Path, out: &Path, development: bool, html: Option<&Path>) -> io::Result<()> {
    let vendored = vendor(root, out, development)?;
    let tags = html_tags(&vendored);
    match html {
        Some(file) => {
            let path = root.join(file);
            let current = fs::read_to_string(&path)?;
            fs::write(&path, update_html(&current, &tags))?;
            println!(
                "zerolith: vendored {} packages into {} and updated {}",
                vendored.versions.len(),
                out.display(),
                file.display()
            );
        }
        None => {
            println!(
                "zerolith: vendored {} packages into {}; add this to the head of your HTML:\n{tags}",
                vendored.versions.len(),
                out.display()
            );
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        ImportMap, Vendored, html_tags, integrity, relative_imports, resolve_export, resolve_url,
        update_html, vendor,
    };
    use std::fs;

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
        assert_eq!(
            relative_imports(source),
            vec!["./a.js", "../up.js", "./b.js"]
        );
        assert_eq!(
            resolve_url("/vendor/pkg/dist/index.js", "./x.js"),
            "/vendor/pkg/dist/x.js"
        );
        assert_eq!(
            resolve_url("/vendor/pkg/dist/index.js", "../up.js"),
            "/vendor/pkg/up.js"
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

        let vendored = vendor(&root, std::path::Path::new("vendor"), false).unwrap();
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
            &html_tags(&Vendored {
                map: ImportMap::default(),
                modules: vec![],
                versions: Default::default(),
            }),
        );
        assert!(inserted.contains("<script type=\"importmap\">"));
        let _ = fs::remove_dir_all(&root);
    }
}
