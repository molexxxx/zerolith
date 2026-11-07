//! A stylesheet imported with `?scoped`, as the module that hands its
//! rules to zerolith.

use std::path::PathBuf;

/// The rules of a stylesheet imported with `?scoped`, and what its module needs besides.
#[derive(Debug, Default)]
pub struct Scoped {
    pub code: String,
    /// The URLs, relative to the module, that the placeholders in `code` stand for, in order.
    pub spliced: Vec<String>,
    /// Every file read: the stylesheet and the ones it imports, sorted.
    pub files: Vec<PathBuf>,
    pub warnings: Vec<String>,
}

/// The start of a placeholder for a URL the module resolves when it runs.
pub(super) const PLACEHOLDER: &str = "__zerolith_url_";

impl Scoped {
    /// The rules as a JavaScript expression: a string, with each placeholder replaced by its URL resolved against the module's own, quoted so any URL can stand there.
    pub fn expression(&self) -> String {
        let quoted = |text: &str| serde_json::Value::from(text).to_string();
        let mut parts = Vec::new();
        let mut text = String::new();
        let mut rest = self.code.as_str();
        while let Some(at) = rest.find(PLACEHOLDER) {
            let after = &rest[at + PLACEHOLDER.len()..];
            let digits = after.len() - after.trim_start_matches(|c: char| c.is_ascii_digit()).len();
            let url = after[..digits]
                .parse::<usize>()
                .ok()
                .and_then(|index| self.spliced.get(index));
            match (url, after[digits..].strip_prefix("__")) {
                (Some(url), Some(tail)) => {
                    let before = &rest[..at];
                    let (before, tail) = match (before.strip_suffix('"'), tail.strip_prefix('"')) {
                        (Some(before), Some(tail)) => (before, tail),
                        _ => (before, tail),
                    };
                    text.push_str(before);
                    text.push('"');
                    parts.push(quoted(&text));
                    parts.push(format!("new URL({}, import.meta.url).href", quoted(url)));
                    text = String::from("\"");
                    rest = tail;
                }
                _ => {
                    text.push_str(&rest[..at + PLACEHOLDER.len()]);
                    rest = after;
                }
            }
        }
        text.push_str(rest);
        parts.push(quoted(&text));
        parts.join(" + ")
    }
}
