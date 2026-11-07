//! Request paths: the base the application is served under, percent
//! escapes, and the file a path names under the root, with the nearest
//! index for a client-side route.

use std::path::{Component, Path, PathBuf};

use sha2::{Digest, Sha256};

/// Where a request path falls relative to the base the application is served under.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum Mapped {
    /// Under the base: the path within the project, with the base removed.
    Inside(String),
    /// Outside the base: served only when a file exists there, such as a package module.
    Outside(String),
    /// The site root or the base without its slash, which go to the base.
    Redirect(String),
}

pub(super) fn map_base(base: &str, path: &str) -> Mapped {
    if base == "/" {
        return Mapped::Inside(path.to_string());
    }
    let bare = base.trim_end_matches('/');
    if path == "/" || path == bare {
        return Mapped::Redirect(base.to_string());
    }
    match path.strip_prefix(bare) {
        Some(rest) if rest.starts_with('/') => Mapped::Inside(rest.to_string()),
        _ => Mapped::Outside(path.to_string()),
    }
}

/// The value of an ASCII hex digit.
fn hex_digit(byte: u8) -> Option<u8> {
    char::from(byte)
        .to_digit(16)
        .and_then(|digit| u8::try_from(digit).ok())
}

/// Decodes `%XX` escapes of exactly two hex digits, over bytes, so a path holding any text decodes without splitting a character; invalid escapes are kept as they are.
pub fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && i + 2 < bytes.len()
            && let (Some(high), Some(low)) = (hex_digit(bytes[i + 1]), hex_digit(bytes[i + 2]))
        {
            out.push(high << 4 | low);
            i += 3;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Maps a request path to a file under `root`: a directory serves its index.html, and a missing
/// extensionless path serves the nearest index.html above it so client-side routes load directly.
/// Paths that try to leave the root resolve to `None`.
pub fn resolve(root: &Path, request_path: &str) -> Option<PathBuf> {
    resolve_with(root, request_path, Fallback::Route)
}

/// When a missing file falls back to the nearest index.html.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Fallback {
    /// Never, for a path outside the base the application is served under.
    None,
    /// For a path whose last segment has no extension, which names a route rather than a file.
    Route,
    /// For any path, since the browser is loading a page: a route's last segment can hold a dot, as `/releases/2.3.0` does.
    Page,
}

/// `resolve`, falling back to the nearest index.html as `fallback` says.
pub(super) fn resolve_with(root: &Path, request_path: &str, fallback: Fallback) -> Option<PathBuf> {
    let decoded = percent_decode(request_path);
    let relative = Path::new(decoded.trim_start_matches('/'));
    if relative
        .components()
        .any(|component| !matches!(component, Component::Normal(_) | Component::CurDir))
    {
        return None;
    }
    let candidate = root.join(relative);
    if candidate.is_dir() {
        let index = candidate.join("index.html");
        return if index.is_file() { Some(index) } else { None };
    }
    if candidate.is_file() {
        return Some(candidate);
    }
    if candidate
        .extension()
        .is_some_and(|extension| extension == "js")
    {
        for source in ["ts", "tsx", "jsx", "mts"] {
            let sibling = candidate.with_extension(source);
            if sibling.is_file() {
                return Some(sibling);
            }
        }
    }
    if fallback == Fallback::None
        || (fallback == Fallback::Route && candidate.extension().is_some())
    {
        return None;
    }
    let mut folder = candidate.parent();
    while let Some(current) = folder {
        if !current.starts_with(root) {
            break;
        }
        let index = current.join("index.html");
        if index.is_file() {
            return Some(index);
        }
        if current == root {
            break;
        }
        folder = current.parent();
    }
    None
}

/// A path as text without the `\\?\` verbatim prefix Windows canonicalization adds.
pub fn display(path: &Path) -> String {
    let text = path.to_string_lossy();
    text.strip_prefix(r"\\?\").unwrap_or(&text).to_string()
}

/// A stable UUID-shaped identifier derived from the root path, for Chrome's automatic workspaces.
pub fn workspace_uuid(root: &Path) -> String {
    let digest = Sha256::digest(root.to_string_lossy().as_bytes());
    let mut bytes = [0u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let hex: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    )
}

/// A file of the project's `public` folder, served at the root as the build copies it.
pub(super) fn public_file(root: &Path, request_path: &str) -> Option<PathBuf> {
    Path::new(request_path).extension()?;
    resolve(&root.join("public"), request_path)
}

#[cfg(test)]
mod properties {
    use super::percent_decode;
    use proptest::prelude::*;

    /// The rule, applied one character at a time: `%` and two hex digits become that byte, and every other character stays as it is.
    fn reference(text: &str) -> String {
        let characters: Vec<char> = text.chars().collect();
        let mut bytes = Vec::new();
        let mut index = 0;
        while index < characters.len() {
            let digit = |at: usize| {
                characters
                    .get(at)
                    .and_then(|character| character.to_digit(16))
            };
            if characters[index] == '%'
                && let (Some(high), Some(low)) = (digit(index + 1), digit(index + 2))
            {
                bytes.push(u8::try_from(high * 16 + low).expect("two hex digits make a byte"));
                index += 3;
                continue;
            }
            let mut buffer = [0; 4];
            bytes.extend_from_slice(characters[index].encode_utf8(&mut buffer).as_bytes());
            index += 1;
        }
        String::from_utf8_lossy(&bytes).into_owned()
    }

    proptest! {
        /// Encoding every byte of any text, in either case of hex digit, and decoding it gives the text back.
        #[test]
        fn decoding_reverses_encoding_every_byte(text in any::<String>(), upper in any::<bool>()) {
            let encoded: String = text
                .bytes()
                .map(|byte| if upper { format!("%{byte:02X}") } else { format!("%{byte:02x}") })
                .collect();
            prop_assert_eq!(percent_decode(&encoded), text);
        }

        /// Any input, escapes cut short and invalid ones included, decodes as the reference decodes it.
        #[test]
        fn decoding_matches_the_reference(text in "(%[0-9a-fA-Fg-z%]{0,2}|[^%]){0,40}") {
            prop_assert_eq!(percent_decode(&text), reference(&text));
        }

        /// Any text at all decodes as the reference decodes it.
        #[test]
        fn decoding_matches_the_reference_on_any_text(text in any::<String>()) {
            prop_assert_eq!(percent_decode(&text), reference(&text));
        }
    }
}
