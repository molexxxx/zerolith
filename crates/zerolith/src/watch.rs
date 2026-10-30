//! File watching for the dev server. Changes to files under the root are
//! announced to every connected browser as server-sent events; folders that
//! never hold served files, such as dependencies and build output, are
//! ignored.

use std::path::{Component, Path, PathBuf};

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tokio::sync::broadcast;

use crate::css;

/// One change, as sent to the browser.
#[derive(Clone, Debug, Serialize)]
pub struct Change {
    /// The changed file as a root-relative URL path.
    pub path: String,
}

const IGNORED: [&str; 8] = [
    "node_modules",
    ".git",
    "target",
    "site",
    "dist",
    "coverage",
    "test-results",
    ".vitest",
];

/// True for paths the dev server never serves, so their changes are not announced.
pub fn ignored(relative: &Path) -> bool {
    relative.components().any(|component| match component {
        Component::Normal(name) => IGNORED.iter().any(|folder| name == *folder),
        _ => false,
    })
}

/// The root-relative URL path for a changed file, or `None` when it lies outside the root or in an ignored folder. Either path may carry the `\\?\` prefix of a Windows canonical path.
pub fn url_path(root: &Path, changed: &Path) -> Option<String> {
    let root = css::plain(root);
    let changed = css::plain(changed);
    let relative = changed.strip_prefix(&root).ok()?;
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

/// True for the events that change what a page shows: a file created, written, renamed, or removed.
fn changes_content(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Any | EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
    )
}

/// Starts watching `root` recursively; the watcher stops when dropped.
pub fn start(
    root: PathBuf,
    sender: broadcast::Sender<Change>,
) -> notify::Result<RecommendedWatcher> {
    let base = css::plain(&root);
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        let Ok(event) = result else {
            return;
        };
        if !changes_content(&event.kind) {
            return;
        }
        for changed in event.paths {
            if changed.is_dir() {
                continue;
            }
            if let Some(path) = url_path(&base, &changed) {
                let _ = sender.send(Change { path });
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
        assert_eq!(
            url_path(root, Path::new("/project/app/main.js")),
            Some("/app/main.js".to_string())
        );
        assert_eq!(
            url_path(root, Path::new("/project/node_modules/x/index.js")),
            None
        );
        assert_eq!(url_path(root, Path::new("/project/dist/index.html")), None);
        assert_eq!(url_path(root, Path::new("/elsewhere/main.js")), None);
        assert!(ignored(Path::new("site/index.html")));
        assert!(!ignored(Path::new("examples/notes/index.html")));
    }

    #[cfg(windows)]
    #[test]
    fn matches_events_against_a_canonical_windows_root() {
        let changed = Path::new(r"C:\project\src\main.ts");
        assert_eq!(
            url_path(Path::new(r"\\?\C:\project"), changed),
            Some("/src/main.ts".to_string())
        );
        assert_eq!(
            url_path(
                Path::new(r"C:\project"),
                Path::new(r"\\?\C:\project\src\main.ts")
            ),
            Some("/src/main.ts".to_string())
        );
    }

    #[tokio::test]
    async fn announces_a_file_written_under_the_root() {
        let folder = std::env::temp_dir().join(format!("zerolith-watch-{}", std::process::id()));
        std::fs::create_dir_all(folder.join("src")).unwrap();
        let root = folder.canonicalize().unwrap();
        let (sender, mut receiver) = tokio::sync::broadcast::channel(16);
        let watcher = super::start(root, sender).unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        std::fs::write(folder.join("src").join("main.ts"), "export {};\n").unwrap();
        let change = tokio::time::timeout(std::time::Duration::from_secs(5), receiver.recv())
            .await
            .expect("a change event")
            .unwrap();
        assert_eq!(change.path, "/src/main.ts");
        drop(watcher);
        let _ = std::fs::remove_dir_all(&folder);
    }
}
