//! Paths as the stylesheets and the build use them: canonical and shown
//! forms, URL encoding, and where a reference in a stylesheet points.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::server::percent_decode;

/// A canonical path without the verbatim prefix Windows adds, which the bundler's resolver does not use either.
pub fn canonical(path: &Path) -> io::Result<PathBuf> {
    Ok(plain(&path.canonicalize()?))
}

/// A path without the `\\?\` prefix Windows gives canonical paths, so it compares equal to the paths tools and file events use.
pub fn plain(path: &Path) -> PathBuf {
    match path.to_str().and_then(|text| text.strip_prefix(r"\\?\")) {
        Some(rest) if !rest.starts_with("UNC") => PathBuf::from(rest),
        _ => path.to_path_buf(),
    }
}

/// The first eight hex digits of a SHA-256 digest, for file names.
pub fn short_hash(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .take(4)
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// A path relative to the project, with forward slashes, as messages show it.
pub fn shown(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

/// An error of reading `file`, with the file's path in the project in front of the reason.
pub fn located(root: &Path, file: &Path, error: io::Error) -> io::Error {
    io::Error::new(error.kind(), format!("{}: {error}", shown(root, file)))
}

/// The path from `folder` to `file`, with forward slashes and `..` to climb out; a file on another drive keeps only its name.
pub fn relative(folder: &Path, file: &Path) -> String {
    let (folder, file) = (plain(folder), plain(file));
    let folder: Vec<_> = folder.components().collect();
    let file: Vec<_> = file.components().collect();
    let shared = folder.iter().zip(&file).take_while(|(a, b)| a == b).count();
    if shared == 0 {
        return file
            .last()
            .map(|part| part.as_os_str().to_string_lossy().into_owned())
            .unwrap_or_default();
    }
    let mut parts: Vec<String> = vec!["..".to_string(); folder.len() - shared];
    parts.extend(
        file[shared..]
            .iter()
            .map(|part| part.as_os_str().to_string_lossy().into_owned()),
    );
    parts.join("/")
}

/// A file's path from the project folder, as `styleFile` keys a stylesheet: `src/card.css`, or `../ui/card.css` for one in a package of the workspace.
pub fn project_path(root: &Path, file: &Path) -> String {
    relative(root, file)
}

/// A file path written as a URL path: every byte outside the characters a path segment may hold as they are, such as `#`, `?`, `%`, a space, or a letter outside ASCII, is percent-encoded, so `c#.svg` becomes `c%23.svg` and is not read as `c` with a fragment.
pub fn encoded(path: &str) -> String {
    let mut out = String::with_capacity(path.len());
    for byte in path.bytes() {
        if byte.is_ascii_alphanumeric() || b"-._~!$&'()*+,;=:@/".contains(&byte) {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

/// A name for a copied asset that needs no encoding in a URL: every character other than an ASCII letter, a digit, `-`, `_`, or `.` becomes `_`.
pub(super) fn url_safe(name: &str) -> String {
    name.chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '_'
            }
        })
        .collect()
}

/// True for a URL that names no file of the project: remote, protocol-relative, a data URL, or a fragment.
pub fn is_remote(url: &str) -> bool {
    url.contains("://") || url.starts_with("//") || url.starts_with("data:") || url.starts_with('#')
}

/// Where a local URL points.
#[derive(Debug, PartialEq, Eq)]
pub enum Located {
    /// A file of the public folder, by its path inside it, percent-encoded for a URL; it is copied as it is and keeps its URL.
    Public(String),
    /// A file of the project, copied under a hashed name.
    File(PathBuf),
    /// Nothing; the URL is left as written.
    Missing,
}

/// Finds the file a local URL names: a root-absolute URL in the public folder first and then in the project, a relative one next to the file that holds it. The query and fragment are not part of the lookup.
/// Refuses a file that a dependency, a file installed under a `node_modules` folder, refers to outside that folder, so a package's stylesheet or `?raw` import cannot copy a file of the project, such as `.env`, or of the disk into the build's output. Paths are compared once links are resolved, so a package of the workspace that `node_modules` links to is the project's own, and the outermost `node_modules` above the file counts, so one installed package may refer to another's files.
pub fn reach(root: &Path, referrer: &Path, target: &Path) -> io::Result<()> {
    let referrer = canonical(referrer).unwrap_or_else(|_| referrer.to_path_buf());
    let Some(installed) = referrer
        .ancestors()
        .filter(|folder| {
            folder
                .file_name()
                .is_some_and(|name| name == "node_modules")
        })
        .last()
    else {
        return Ok(());
    };
    let target = canonical(target).unwrap_or_else(|_| target.to_path_buf());
    if target.starts_with(installed) {
        return Ok(());
    }
    Err(io::Error::new(
        io::ErrorKind::PermissionDenied,
        format!(
            "{}: refers to {}, outside the node_modules folder it is installed in; a dependency may refer only to installed files, so the build does not copy a file of the project or of the disk into its output",
            shown(root, &referrer),
            shown(root, &target)
        ),
    ))
}

pub fn locate(root: &Path, folder: &Path, url: &str) -> Located {
    let path = percent_decode(url.split(['?', '#']).next().unwrap_or(url));
    if let Some(absolute) = path.strip_prefix('/') {
        if root.join("public").join(absolute).is_file() {
            return Located::Public(encoded(absolute));
        }
        if root.join(absolute).is_file() {
            return Located::File(root.join(absolute));
        }
        return Located::Missing;
    }
    let file = folder.join(&path);
    if file.is_file() {
        Located::File(file)
    } else {
        Located::Missing
    }
}

/// The query and fragment of a URL, kept on the rewritten URL.
pub fn suffix(url: &str) -> &str {
    url.find(['?', '#']).map_or("", |at| &url[at..])
}

/// The URL of a public file, as seen from a file `depth` folders below the output root.
pub fn public_url(base: &str, path: &str, depth: usize) -> String {
    if base == "./" {
        if depth == 0 {
            format!("./{path}")
        } else {
            format!("{}{path}", "../".repeat(depth))
        }
    } else {
        format!("{base}{path}")
    }
}

/// Resolves an `@import`: relative to the stylesheet, root-absolute against the project, and a bare name in the nearest `node_modules` above the stylesheet, through a package's `style` field.
pub fn find_import(root: &Path, folder: &Path, url: &str) -> Option<PathBuf> {
    let path = percent_decode(url.split(['?', '#']).next().unwrap_or(url));
    if let Some(absolute) = path.strip_prefix('/') {
        let file = root.join(absolute);
        return file.is_file().then_some(file);
    }
    let relative = folder.join(&path);
    if relative.is_file() {
        return Some(relative);
    }
    if path.starts_with('.') {
        return None;
    }
    for ancestor in folder.ancestors() {
        let package = ancestor.join("node_modules").join(&path);
        if package.is_file() {
            return Some(package);
        }
        if package.is_dir() {
            let style = fs::read_to_string(package.join("package.json"))
                .ok()
                .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
                .and_then(|manifest| manifest.get("style")?.as_str().map(str::to_string));
            let file = package.join(style.as_deref().unwrap_or("index.css"));
            return file.is_file().then_some(file);
        }
    }
    None
}
