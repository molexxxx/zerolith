//! `zerolith build --unbundled`: the buildless path's production output. Every source
//! under the project is copied into an output folder, with `.ts`, `.tsx`,
//! `.jsx`, and `.mts` files transformed to JavaScript and renamed, the
//! relative specifiers that named them rewritten to `.js`, HTML module
//! scripts pointed at the renamed files, and the installed packages vendored
//! into the output with an import map carrying integrity hashes. The result
//! serves from any static host.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::importmap::{html_tags, update_html, vendor_from};
use crate::prepare;
use crate::transform;

/// Folders never copied into the output.
const SKIPPED: [&str; 7] = [
    "node_modules",
    "vendor",
    "dist",
    "target",
    ".git",
    "test",
    "tests",
];

/// Files that belong to development, not to the served output.
const DEVELOPMENT_FILES: [&str; 5] = [
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "AGENTS.md",
    "README.md",
];

fn is_development_file(name: &str) -> bool {
    name.starts_with('.')
        || DEVELOPMENT_FILES.contains(&name)
        || [".config.ts", ".config.js", ".config.mts", ".config.mjs"]
            .iter()
            .any(|suffix| name.ends_with(suffix))
}

/// What `build` wrote.
#[derive(Debug, Default)]
pub struct Built {
    pub copied: usize,
    pub transformed: usize,
    pub html: usize,
}

fn rewrite_html(html: &str) -> String {
    let mut out = html.to_string();
    for extension in [".ts", ".tsx", ".jsx", ".mts"] {
        for quote in ['"', '\''] {
            let needle = format!("{extension}{quote}");
            let mut result = String::with_capacity(out.len());
            let mut rest = out.as_str();
            while let Some(index) = rest.find(&needle) {
                let before = &rest[..index];
                let attribute = before.rfind("src=").map(|at| &before[at + 4..]);
                let is_source = attribute
                    .is_some_and(|value| value.starts_with(quote) && !value[1..].contains(quote));
                result.push_str(before);
                result.push_str(if is_source { ".js" } else { extension });
                result.push(quote);
                rest = &rest[index + needle.len()..];
            }
            result.push_str(rest);
            out = result;
        }
    }
    out
}

/// Runs the template prepare pass over a module unless the build keeps the scanner.
fn prepared(code: String, prepare_templates: bool) -> Result<String, transform::TransformError> {
    if prepare_templates {
        prepare::prepare(&code)
    } else {
        Ok(code)
    }
}

fn walk(
    root: &Path,
    folder: &Path,
    out: &Path,
    built: &mut Built,
    prepare_templates: bool,
) -> io::Result<()> {
    for entry in fs::read_dir(folder)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if path.is_dir() {
            if SKIPPED.contains(&name.as_str()) || name.starts_with('.') || path == out {
                continue;
            }
            walk(root, &path, out, built, prepare_templates)?;
            continue;
        }
        if is_development_file(&name) {
            continue;
        }
        let relative = path.strip_prefix(root).map_err(io::Error::other)?;
        let extension = path
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or("");
        let target = out.join(relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        if transform::transforms(extension) {
            let source = fs::read_to_string(&path)?;
            let code = transform::transform(&path, &source)
                .and_then(|code| transform::rewrite_specifiers(&code))
                .and_then(|code| prepared(code, prepare_templates))
                .map_err(|error| io::Error::other(format!("{}: {error}", relative.display())))?;
            fs::write(target.with_extension("js"), code)?;
            built.transformed += 1;
        } else if extension == "js" || extension == "mjs" {
            let source = fs::read_to_string(&path)?;
            let code = transform::rewrite_specifiers(&source)
                .and_then(|code| prepared(code, prepare_templates))
                .map_err(|error| io::Error::other(format!("{}: {error}", relative.display())))?;
            fs::write(&target, code)?;
            built.copied += 1;
        } else if extension == "html" || extension == "htm" {
            fs::write(&target, rewrite_html(&fs::read_to_string(&path)?))?;
            built.html += 1;
        } else {
            fs::copy(&path, &target)?;
            built.copied += 1;
        }
    }
    Ok(())
}

/// Builds `root` into `root/out`.
pub fn build(root: &Path, out: &Path, prepare_templates: bool) -> io::Result<(PathBuf, Built)> {
    let root = root.canonicalize()?;
    let out_dir = root.join(out);
    if out_dir == root {
        return Err(io::Error::other(
            "the output folder must differ from the project folder",
        ));
    }
    if out_dir.exists() {
        fs::remove_dir_all(&out_dir)?;
    }
    fs::create_dir_all(&out_dir)?;
    let mut built = Built::default();
    walk(&root, &root, &out_dir, &mut built, prepare_templates)?;
    let packages = root.join("node_modules");
    if packages.join("zerolith").is_dir() {
        let vendored = vendor_from(
            &packages,
            &out_dir,
            Path::new("vendor"),
            false,
            prepare_templates,
        )?;
        let tags = html_tags(&vendored);
        for entry in fs::read_dir(&out_dir)? {
            let path = entry?.path();
            if path
                .extension()
                .is_some_and(|extension| extension == "html")
            {
                let current = fs::read_to_string(&path)?;
                fs::write(&path, update_html(&current, &tags))?;
            }
        }
    }
    Ok((out_dir, built))
}

/// Runs the `build` command.
pub fn run(root: &Path, out: &Path, prepare_templates: bool) -> io::Result<()> {
    let (out_dir, built) = build(root, out, prepare_templates)?;
    println!(
        "zerolith: built {} into {} ({} transformed, {} copied, {} pages)",
        root.display(),
        crate::server::display(&out_dir),
        built.transformed,
        built.copied,
        built.html
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{build, rewrite_html};
    use std::fs;

    #[test]
    fn rewrites_module_script_sources_only() {
        let html = "<script type=\"module\" src=\"/src/main.tsx\"></script><a href=\"notes.ts\">x</a><script src='./b.ts'></script>";
        assert_eq!(
            rewrite_html(html),
            "<script type=\"module\" src=\"/src/main.js\"></script><a href=\"notes.ts\">x</a><script src='./b.js'></script>"
        );
    }

    #[test]
    fn transforms_renames_rewrites_and_copies() {
        let root = std::env::temp_dir().join(format!("zerolith-build-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("src")).unwrap();
        fs::create_dir_all(root.join("node_modules/zerolith/dist")).unwrap();
        fs::write(root.join("node_modules/zerolith/package.json"), "{\"name\":\"zerolith\",\"version\":\"0.0.0\",\"exports\":{\".\":{\"development\":\"./dist/index.js\",\"default\":\"./dist/index.js\"}}}").unwrap();
        fs::write(
            root.join("node_modules/zerolith/dist/index.js"),
            "export const html = 1;",
        )
        .unwrap();
        fs::write(
            root.join("node_modules/zerolith/dist/scan.js"),
            "export const scanner = 1;",
        )
        .unwrap();
        fs::write(
            root.join("node_modules/zerolith/dist/scan.unprepared.js"),
            "export const stub = 1;",
        )
        .unwrap();
        fs::write(
            root.join("index.html"),
            "<!doctype html><script type=\"module\" src=\"/src/main.ts\"></script>",
        )
        .unwrap();
        fs::write(
            root.join("src/main.ts"),
            "import { html } from \"zerolith\";\nimport { App } from \"./app.tsx\";\nexport const n: number = 1;\nexport const v = html`<p>${n}</p>`;\n",
        )
        .unwrap();
        fs::write(
            root.join("src/app.tsx"),
            "export function App(): unknown { return <p>{1}</p>; }\n",
        )
        .unwrap();
        fs::write(root.join("src/plain.js"), "import \"./app.tsx\";\n").unwrap();
        fs::write(root.join("styles.css"), "body {}").unwrap();
        let (out, built) = build(&root, std::path::Path::new("dist"), true).unwrap();
        assert_eq!((built.transformed, built.copied, built.html), (2, 2, 1));
        assert!(
            fs::read_to_string(out.join("src/main.js"))
                .unwrap()
                .contains("from \"./app.js\"")
        );
        assert!(
            !fs::read_to_string(out.join("src/main.js"))
                .unwrap()
                .contains(": number")
        );
        assert!(
            fs::read_to_string(out.join("src/app.js"))
                .unwrap()
                .contains("__zl_html(__zl_t0, 1)")
        );
        assert!(
            fs::read_to_string(out.join("src/main.js"))
                .unwrap()
                .contains("html(__zl_t0, n)")
        );
        assert_eq!(
            fs::read_to_string(out.join("vendor/zerolith/dist/scan.js")).unwrap(),
            "export const stub = 1;"
        );
        assert!(
            fs::read_to_string(out.join("src/plain.js"))
                .unwrap()
                .contains("\"./app.js\"")
        );
        assert!(
            fs::read_to_string(out.join("index.html"))
                .unwrap()
                .contains("src=\"/src/main.js\"")
        );
        assert!(out.join("styles.css").is_file());
        assert!(out.join("vendor/importmap.json").is_file());
        assert!(
            fs::read_to_string(out.join("index.html"))
                .unwrap()
                .contains("\"zerolith\":\"/vendor/zerolith/dist/index.js\"")
        );
        assert!(!out.join("node_modules").exists());
        assert!(!out.join("src/main.ts").exists());
        assert!(build(&root, std::path::Path::new("."), true).is_err());
        let (plain, _) = build(&root, std::path::Path::new("plain"), false).unwrap();
        assert!(
            fs::read_to_string(plain.join("src/main.js"))
                .unwrap()
                .contains("html`<p>${n}</p>`")
        );
        assert_eq!(
            fs::read_to_string(plain.join("vendor/zerolith/dist/scan.js")).unwrap(),
            "export const scanner = 1;"
        );
        let _ = fs::remove_dir_all(&root);
    }
}
