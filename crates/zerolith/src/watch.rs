//! File watching for the dev server. Changes under the root are announced
//! to every connected browser as server-sent events; folders that never
//! hold served files are ignored.

use std::path::{Component, Path, PathBuf};

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tokio::sync::broadcast;

/// One change, as sent to the browser.
#[derive(Clone, Debug, Serialize)]
pub struct Change {
    /// The changed file as a root-relative URL path.
    pub path: String,
}

const IGNORED: [&str; 5] = ["node_modules", ".git", "target", "site", ".vitest"];

/// True for paths the dev server never serves, so their changes are not announced.
pub fn ignored(relative: &Path) -> bool {
    relative.components().any(|component| match component {
        Component::Normal(name) => IGNORED.iter().any(|folder| name == *folder),
        _ => false,
    })
}

/// The root-relative URL path for a changed file, or `None` when it lies outside the root or in an ignored folder.
pub fn url_path(root: &Path, changed: &Path) -> Option<String> {
    let relative = changed.strip_prefix(root).ok()?;
    if ignored(relative) {
        return None;
    }
    let mut url = String::from("/");
    let mut first = true;
    for component in relative.components() {
        if let Component::Normal(name) = component {
            if !first {
                url.push('/');
            }
            url.push_str(&name.to_string_lossy());
            first = false;
        }
    }
    Some(url)
}

/// Starts watching `root` recursively; the watcher stops when dropped.
pub fn start(root: PathBuf, sender: broadcast::Sender<Change>) -> notify::Result<RecommendedWatcher> {
    let canonical = root.canonicalize().unwrap_or(root.clone());
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        if let Ok(event) = result {
            for changed in event.paths {
                if let Some(path) = url_path(&canonical, &changed) {
                    let _ = sender.send(Change { path });
                }
            }
        }
    })?;
    watcher.watch(&root, RecursiveMode::Recursive)?;
    Ok(watcher)
}

#[cfg(test)]
mod tests {
    use super::{ignored, url_path};
    use std::path::Path;

    #[test]
    fn builds_url_paths_and_ignores_tooling_folders() {
        let root = Path::new("/project");
        assert_eq!(url_path(root, Path::new("/project/app/main.js")), Some("/app/main.js".to_string()));
        assert_eq!(url_path(root, Path::new("/project/node_modules/x/index.js")), None);
        assert_eq!(url_path(root, Path::new("/elsewhere/main.js")), None);
        assert!(ignored(Path::new("site/index.html")));
        assert!(!ignored(Path::new("examples/notes/index.html")));
    }
}
