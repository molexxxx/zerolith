//! Which files the output holds: every source under the project but the
//! tooling folders and development files, the vendored packages, and the
//! sources each page loads.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::transform;
use crate::{css, modules};

use super::Built;
use super::rewrite::{Defines, Imports, prepared, rewrite, rewrite_html};

/// Folders never copied into the output.
const SKIPPED: [&str; 6] = ["node_modules", "dist", "target", ".git", "test", "tests"];

/// Files that belong to development, not to the served output.
const DEVELOPMENT_FILES: [&str; 6] = [
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "zerolith.json",
    "AGENTS.md",
    "README.md",
];

fn is_development_file(name: &str) -> bool {
    name.starts_with('.')
        || DEVELOPMENT_FILES.contains(&name)
        || [
            ".config.ts",
            ".config.js",
            ".config.mts",
            ".config.mjs",
            ".d.ts",
            ".d.mts",
        ]
        .iter()
        .any(|suffix| name.ends_with(suffix))
}

pub(super) fn walk(
    root: &Path,
    folder: &Path,
    out: &Path,
    built: &mut Built,
    prepare_templates: bool,
    defines: &Defines,
    imports: &mut Imports,
) -> io::Result<()> {
    for entry in fs::read_dir(folder)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if path.is_dir() {
            if SKIPPED.contains(&name.as_str()) || name.starts_with('.') || path == out {
                continue;
            }
            if path.join("importmap.json").is_file() {
                copy_vendored(root, &path, out, built, path == root.join("vendor"))?;
                continue;
            }
            walk(root, &path, out, built, prepare_templates, defines, imports)?;
            continue;
        }
        let claim = |built: &mut Built, target: &Path| built.claim(root, out, target, &path);
        if is_development_file(&name) {
            continue;
        }
        let relative = path.strip_prefix(root).map_err(io::Error::other)?;
        let extension = path
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or("");
        if let Ok(public) = relative.strip_prefix("public") {
            let target = out.join(public);
            claim(built, &target)?;
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(&path, &target)?;
            built.copied += 1;
            continue;
        }
        let target = out.join(relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        let replace =
            |code: String| modules::replace_defines(&code, &defines.env, &defines.node_env);
        let read =
            |path: &Path| fs::read_to_string(path).map_err(|error| css::located(root, path, error));
        if transform::transforms(extension) {
            claim(built, &target.with_extension("js"))?;
            let source = read(&path)?;
            let code = transform::transform(&path, &source)
                .and_then(|code| rewrite(&code, root, &path, imports))
                .map(replace)
                .and_then(|code| prepared(code, prepare_templates))
                .map_err(|error| io::Error::other(format!("{}: {error}", relative.display())))?;
            fs::write(target.with_extension("js"), code)?;
            built.own_modules.push(target.with_extension("js"));
            built.modules += 1;
            built.transformed += 1;
        } else if extension == "js" || extension == "mjs" {
            claim(built, &target)?;
            let source = read(&path)?;
            let code = rewrite(&source, root, &path, imports)
                .map(replace)
                .and_then(|code| prepared(code, prepare_templates))
                .map_err(|error| io::Error::other(format!("{}: {error}", relative.display())))?;
            fs::write(&target, code)?;
            built.own_modules.push(target.clone());
            built.modules += 1;
        } else if extension == "html" || extension == "htm" {
            claim(built, &target)?;
            fs::write(&target, rewrite_html(&read(&path)?))?;
            built.html += 1;
            built.pages.push(target);
        } else {
            claim(built, &target)?;
            fs::copy(&path, &target)?;
            built.copied += 1;
        }
    }
    Ok(())
}

/// Copies a folder `zerolith importmap` wrote, which its `importmap.json` marks, as it is, since the page's import map names its modules with integrity hashes that a rewritten byte would fail. Hidden files are left out, and so are, at the top of the project's own `vendor/` folder, `importmap.json` and the zerolith packages, which the build writes anew into the output's.
fn copy_vendored(
    root: &Path,
    folder: &Path,
    out: &Path,
    built: &mut Built,
    own: bool,
) -> io::Result<()> {
    for entry in fs::read_dir(folder)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.')
            || (own
                && (["importmap.json", "zerolith", "@zerolith"].contains(&name.as_str())
                    || name.starts_with("zerolith@")))
        {
            continue;
        }
        if path.is_dir() {
            copy_vendored(root, &path, out, built, false)?;
            continue;
        }
        let target = out.join(path.strip_prefix(root).map_err(io::Error::other)?);
        built.claim(root, out, &target, &path)?;
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(&path, &target)?;
        built.copied += 1;
    }
    Ok(())
}

/// The files the project's `index.html` loads as module scripts, which the output folder must not hold.
pub(super) fn page_sources(root: &Path) -> Vec<PathBuf> {
    let Ok(html) = fs::read_to_string(root.join("index.html")) else {
        return Vec::new();
    };
    crate::html::scan(&html)
        .scripts
        .iter()
        .chain(crate::html::scan(&html).styles.iter())
        .map(|reference| {
            let path = crate::server::percent_decode(
                reference
                    .url
                    .split(['?', '#'])
                    .next()
                    .unwrap_or(&reference.url),
            );
            root.join(path.trim_start_matches('/'))
        })
        .collect()
}
