//! The static server behind `dev` and `serve`: files under a root with
//! directory indexes and a nearest-index fallback for client-side routes,
//! a small client script injected into HTML pages when live reload is on,
//! server-sent change events, and Chrome's automatic-workspace file.

use std::net::{Ipv4Addr, SocketAddr};
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

use axum::Router;
use axum::body::Body;
use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderValue, StatusCode, Uri, header};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use sha2::{Digest, Sha256};
use tokio::sync::broadcast;
use tokio_stream::StreamExt;
use tokio_stream::wrappers::BroadcastStream;

use crate::mime::content_type;
use crate::transform;
use crate::watch::{self, Change};

/// What `run` needs.
pub struct Options {
    pub root: PathBuf,
    pub port: u16,
    pub reload: bool,
}

struct AppState {
    root: PathBuf,
    changes: Option<broadcast::Sender<Change>>,
}

const CLIENT: &str = include_str!("client.js");
const CLIENT_TAG: &str = "<script type=\"module\" src=\"/__zerolith/client.js\"></script>";

/// Decodes `%XX` escapes; invalid escapes are kept as they are.
pub fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = &input[i + 1..i + 3];
            if let Ok(value) = u8::from_str_radix(hex, 16) {
                out.push(value);
                i += 3;
                continue;
            }
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
    if candidate.extension().is_some() {
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

/// Adds the live-reload client to an HTML document, before `</head>` when there is one.
pub fn inject_client(html: &str) -> String {
    if html.contains(CLIENT_TAG) {
        return html.to_string();
    }
    match html.find("</head>") {
        Some(index) => format!("{}{}\n{}", &html[..index], CLIENT_TAG, &html[index..]),
        None => format!("{CLIENT_TAG}\n{html}"),
    }
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

async fn events(State(state): State<Arc<AppState>>) -> Response {
    match &state.changes {
        Some(sender) => {
            let stream = BroadcastStream::new(sender.subscribe()).filter_map(|change| {
                change.ok().and_then(|change| {
                    serde_json::to_string(&change).ok().map(|data| {
                        Ok::<Event, std::convert::Infallible>(
                            Event::default().event("change").data(data),
                        )
                    })
                })
            });
            Sse::new(stream)
                .keep_alive(KeepAlive::default())
                .into_response()
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn client() -> Response {
    (
        [
            (header::CONTENT_TYPE, "text/javascript; charset=utf-8"),
            (header::CACHE_CONTROL, "no-cache"),
        ],
        CLIENT,
    )
        .into_response()
}

async fn devtools_json(
    State(state): State<Arc<AppState>>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
) -> Response {
    if !address.ip().is_loopback() {
        return StatusCode::NOT_FOUND.into_response();
    }
    let root = state.root.canonicalize().unwrap_or(state.root.clone());
    let body = serde_json::json!({ "workspace": { "root": display(&root), "uuid": workspace_uuid(&root) } });
    (
        [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
        body.to_string(),
    )
        .into_response()
}

async fn file(State(state): State<Arc<AppState>>, uri: Uri) -> Response {
    let Some(path) = resolve(&state.root, uri.path()) else {
        return (StatusCode::NOT_FOUND, "Not found").into_response();
    };
    let Ok(bytes) = tokio::fs::read(&path).await else {
        return (StatusCode::NOT_FOUND, "Not found").into_response();
    };
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("");
    let mime = if transform::transforms(extension) {
        content_type("js")
    } else {
        content_type(extension)
    };
    let body = if state.changes.is_some() && (extension == "html" || extension == "htm") {
        Body::from(inject_client(&String::from_utf8_lossy(&bytes)))
    } else if transform::transforms(extension) {
        match transform::transform(&path, &String::from_utf8_lossy(&bytes)) {
            Ok(code) => Body::from(code),
            Err(error) => {
                let message = format!("{}: {error}", display(&path));
                eprintln!("zerolith: {message}");
                return (StatusCode::INTERNAL_SERVER_ERROR, message).into_response();
            }
        }
    } else {
        Body::from(bytes)
    };
    let mut response = Response::new(body);
    response
        .headers_mut()
        .insert(header::CONTENT_TYPE, HeaderValue::from_static(mime));
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    response
}

/// Builds the application for a root, with change events when a sender is given.
pub fn app(root: PathBuf, changes: Option<broadcast::Sender<Change>>) -> Router {
    let state = Arc::new(AppState { root, changes });
    Router::new()
        .route("/__zerolith/events", get(events))
        .route("/__zerolith/client.js", get(client))
        .route(
            "/.well-known/appspecific/com.chrome.devtools.json",
            get(devtools_json),
        )
        .fallback(get(file))
        .with_state(state)
}

/// Serves `options.root` until the process is interrupted.
pub async fn run(options: Options) -> std::io::Result<()> {
    let root = options.root.canonicalize()?;
    let (sender, watcher) = if options.reload {
        let (sender, _) = broadcast::channel::<Change>(64);
        let watcher = watch::start(root.clone(), sender.clone()).map_err(std::io::Error::other)?;
        (Some(sender), Some(watcher))
    } else {
        (None, None)
    };
    let listener =
        tokio::net::TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, options.port)))
            .await?;
    let address = listener.local_addr()?;
    println!(
        "zerolith: serving {} at http://{address}/{}",
        display(&root),
        if options.reload {
            " with live reload"
        } else {
            ""
        }
    );
    let result = axum::serve(
        listener,
        app(root, sender).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async {
        let _ = tokio::signal::ctrl_c().await;
    })
    .await;
    drop(watcher);
    result
}

#[cfg(test)]
mod tests {
    use super::{display, inject_client, percent_decode, resolve, workspace_uuid};
    use std::fs;
    use std::path::Path;

    fn fixture() -> std::path::PathBuf {
        let root =
            std::env::temp_dir().join(format!("zerolith-server-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("app/deep")).unwrap();
        fs::write(
            root.join("index.html"),
            "<html><head></head><body></body></html>",
        )
        .unwrap();
        fs::write(root.join("app/index.html"), "<html></html>").unwrap();
        fs::write(root.join("app/main.js"), "export {};").unwrap();
        fs::write(root.join("app/typed.ts"), "export const a: number = 1;").unwrap();
        root
    }

    #[test]
    fn resolves_files_indexes_and_route_fallbacks() {
        let root = fixture();
        assert_eq!(
            resolve(&root, "/app/main.js"),
            Some(root.join("app/main.js"))
        );
        assert_eq!(resolve(&root, "/app/"), Some(root.join("app/index.html")));
        assert_eq!(resolve(&root, "/app"), Some(root.join("app/index.html")));
        assert_eq!(
            resolve(&root, "/app/deep/route/here"),
            Some(root.join("app/index.html"))
        );
        assert_eq!(
            resolve(&root, "/other/route"),
            Some(root.join("index.html"))
        );
        assert_eq!(resolve(&root, "/app/missing.js"), None);
        assert_eq!(resolve(&root, "/app/typed.js"), Some(root.join("app/typed.ts")));
        assert_eq!(resolve(&root, "/app/typed.ts"), Some(root.join("app/typed.ts")));
        assert_eq!(resolve(&root, "/../secret"), None);
        assert_eq!(
            resolve(&root, "/app/%6Dain.js"),
            Some(root.join("app/main.js"))
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn injects_the_client_once_before_head_end() {
        let injected = inject_client("<html><head><title>x</title></head><body></body></html>");
        assert!(
            injected.contains(
                "<script type=\"module\" src=\"/__zerolith/client.js\"></script>\n</head>"
            )
        );
        assert_eq!(inject_client(&injected), injected);
        assert!(inject_client("<p>no head</p>").starts_with("<script"));
    }

    #[test]
    fn decodes_percent_escapes_and_derives_stable_uuids() {
        assert_eq!(percent_decode("/a%20b/c%2Fd"), "/a b/c/d");
        assert_eq!(percent_decode("/bad%zz"), "/bad%zz");
        let uuid = workspace_uuid(Path::new("/project"));
        assert_eq!(uuid.len(), 36);
        assert_eq!(uuid, workspace_uuid(Path::new("/project")));
        assert_ne!(uuid, workspace_uuid(Path::new("/other")));
        assert_eq!(display(Path::new(r"\\?\C:\x")), r"C:\x");
        assert_eq!(display(Path::new("/x")), "/x");
    }
}
