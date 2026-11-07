//! The output folder: the base the app is served under, where the build
//! writes, and what it clears and copies before it does.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::css;

use super::Written;
use super::plugin::{failure, normalized, path_of};

/// Normalizes a base path: `./` and the empty string mean URLs relative to the page, anything else gets a leading and a trailing slash.
pub fn normalize_base(base: &str) -> io::Result<String> {
    let trimmed = base.trim();
    if trimmed.contains("://") || trimmed.starts_with("//") {
        return Err(failure(format!(
            "the base {trimmed} is a URL; it is the path the app is served under, such as /app/, or ./ for files opened from any folder"
        )));
    }
    if trimmed.is_empty() || trimmed == "." || trimmed == "./" {
        return Ok("./".to_string());
    }
    let inner = trimmed.trim_matches('/');
    Ok(if inner.is_empty() {
        "/".to_string()
    } else {
        format!("/{inner}/")
    })
}

/// The file a script or stylesheet URL in `index.html` names, without its query or fragment.
pub(super) fn page_file(root: &Path, url: &str) -> io::Result<PathBuf> {
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
pub(super) fn copy_folder(from: &Path, to: &Path) -> io::Result<()> {
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
pub(super) fn list(out_dir: &Path, folder: &Path, files: &mut Vec<Written>) -> io::Result<()> {
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
/// The output folder as the file system names it: `out` against the project, with its `.` and `..` resolved and its nearest existing folder canonical, so `..`, a link, or another letter case cannot hide that it holds the project.
pub fn resolve_out_dir(root: &Path, out: &Path) -> io::Result<PathBuf> {
    let joined = normalized(&root.join(out));
    let mut existing = joined.clone();
    let mut missing = Vec::new();
    while !existing.exists() {
        let Some(name) = existing.file_name().map(ToOwned::to_owned) else {
            break;
        };
        missing.push(name);
        existing.pop();
    }
    let mut resolved = css::canonical(&existing).unwrap_or(existing);
    for name in missing.iter().rev() {
        resolved.push(name);
    }
    Ok(resolved)
}

/// Readies the output folder, refusing one that holds the project, that is or lies inside the public folder, or that holds a source the page loads, and emptying it first when it is inside the project or `empty` asks for it.
pub fn prepare_out_dir(
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
    if out_dir.starts_with(root.join("public")) {
        return Err(failure(format!(
            "the output folder {} is in the public folder, whose files the build copies into the output; choose another folder, such as dist",
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
