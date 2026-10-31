//! The server behind `dev`, `serve`, and `preview`: files under a root with
//! directory indexes and a nearest-index fallback for client-side routes,
//! the `public` folder at the root, scripts through the module pipeline
//! for `dev` and `serve`, a small client script injected into HTML pages
//! when live reload is on, server-sent change events, and Chrome's
//! automatic-workspace file.

use std::net::{Ipv4Addr, SocketAddr};
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

use axum::Router;
use axum::body::Body;
use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderValue, Method, Request, StatusCode, Uri, header};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{any, get};
use sha2::{Digest, Sha256};
use tokio::sync::broadcast;
use tokio_stream::StreamExt;
use tokio_stream::wrappers::BroadcastStream;

use crate::config::ProxyRule;
use crate::css;
use crate::mime::content_type;
use crate::modules::{self, Pipeline};
use crate::proxy;
use crate::term;
use crate::watch::{self, Change};

/// What `run` needs.
pub struct Options {
    pub root: PathBuf,
    pub port: u16,
    pub reload: bool,
    /// Serve scripts through the module pipeline; without it every file is served as it is, as a static host would.
    pub modules: bool,
    /// The public path the application is served under, starting and ending with `/`.
    pub base: String,
    /// Paths forwarded to a backend, longest prefix first.
    pub proxy: Vec<ProxyRule>,
    /// True when the port was asked for; otherwise a taken default moves to the next free port.
    pub port_fixed: bool,
}

struct AppState {
    root: PathBuf,
    changes: Option<broadcast::Sender<Change>>,
    pipeline: Option<Arc<Pipeline>>,
    base: String,
    proxy: Vec<ProxyRule>,
}

/// Where a request path falls relative to the base the application is served under.
#[derive(Debug, PartialEq, Eq)]
enum Mapped {
    /// Under the base: the path within the project, with the base removed.
    Inside(String),
    /// Outside the base: served only when a file exists there, such as a package module.
    Outside(String),
    /// The site root or the base without its slash, which go to the base.
    Redirect(String),
}

fn map_base(base: &str, path: &str) -> Mapped {
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
    resolve_with(root, request_path, true)
}

/// `resolve`, with the nearest-index fallback only when `fallback` is true.
fn resolve_with(root: &Path, request_path: &str, fallback: bool) -> Option<PathBuf> {
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
    if !fallback || candidate.extension().is_some() {
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

/// A response that is never cached.
fn fresh(body: impl Into<Body>, mime: &'static str) -> Response {
    let mut response = Response::new(body.into());
    response
        .headers_mut()
        .insert(header::CONTENT_TYPE, HeaderValue::from_static(mime));
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    response
}

/// A module that throws `message`, so a failure shows in the browser's console as well as the terminal.
fn failed(message: &str) -> Response {
    anstream::eprintln!("{}", term::row("error", term::failure, message));
    fresh(
        format!("throw new Error({});\n", serde_json::Value::from(message)),
        content_type("js"),
    )
}

/// A file of the project's `public` folder, served at the root as the build copies it.
fn public_file(root: &Path, request_path: &str) -> Option<PathBuf> {
    Path::new(request_path).extension()?;
    resolve(&root.join("public"), request_path)
}

/// The dev server's answer for a module or a package file, or `None` for a file served as it is.
fn module_response(
    pipeline: &Pipeline,
    root: &Path,
    request_path: &str,
    query: &str,
) -> Option<Response> {
    let outside = request_path.starts_with(modules::FS_PREFIX);
    let path = if outside {
        let Some(path) = pipeline.locate(request_path) else {
            return Some((StatusCode::NOT_FOUND, "Not found").into_response());
        };
        path
    } else {
        resolve(root, request_path).or_else(|| public_file(root, request_path))?
    };
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("");
    let script = |result: Result<String, String>| match result {
        Ok(code) => fresh(code, content_type("js")),
        Err(message) => failed(&message),
    };
    if modules::wants(query, "import") && extension == "css" {
        return Some(script(
            pipeline
                .stylesheet(&path)
                .map_err(|error| format!("{}: {error}", display(&path))),
        ));
    }
    if modules::wants(query, "url")
        || modules::wants(query, "raw")
        || (modules::wants(query, "import") && extension == "json")
    {
        return Some(script(
            pipeline
                .asset(&path, query)
                .map_err(|error| format!("{}: {error}", display(&path))),
        ));
    }
    if modules::is_script(&path) {
        return Some(script(
            pipeline.module(&path).map_err(|error| error.message),
        ));
    }
    if outside {
        return Some(match std::fs::read(&path) {
            Ok(bytes) => fresh(bytes, content_type(extension)),
            Err(_) => (StatusCode::NOT_FOUND, "Not found").into_response(),
        });
    }
    None
}

/// Every request no route claimed: a proxied path goes to its backend, and any other `GET` or `HEAD` to the files.
async fn entry(State(state): State<Arc<AppState>>, request: Request<Body>) -> Response {
    if let Some(rule) = state
        .proxy
        .iter()
        .find(|rule| rule.matches(request.uri().path()))
    {
        return proxy::forward(rule, request).await;
    }
    if request.method() != Method::GET && request.method() != Method::HEAD {
        return StatusCode::METHOD_NOT_ALLOWED.into_response();
    }
    let uri = request.uri().clone();
    file(&state, &uri).await
}

async fn file(state: &Arc<AppState>, uri: &Uri) -> Response {
    let (request_path, fallback) = match map_base(&state.base, uri.path()) {
        Mapped::Inside(path) => (path, true),
        Mapped::Outside(path) => (path, false),
        Mapped::Redirect(to) => {
            let location = match uri.query() {
                Some(query) => format!("{to}?{query}"),
                None => to,
            };
            return Response::builder()
                .status(StatusCode::FOUND)
                .header(header::LOCATION, location)
                .body(Body::empty())
                .unwrap_or_else(|_| StatusCode::FOUND.into_response());
        }
    };
    if let Some(pipeline) = &state.pipeline {
        let pipeline = pipeline.clone();
        let root = state.root.clone();
        let request_path = request_path.clone();
        let query = uri.query().unwrap_or("").to_string();
        match tokio::task::spawn_blocking(move || {
            module_response(&pipeline, &root, &request_path, &query)
        })
        .await
        {
            Ok(Some(response)) => return response,
            Ok(None) => {}
            Err(error) => return failed(&error.to_string()),
        }
    }
    let Some(path) = resolve_with(&state.root, &request_path, fallback)
        .or_else(|| public_file(&state.root, &request_path))
    else {
        return (StatusCode::NOT_FOUND, "Not found").into_response();
    };
    let Ok(bytes) = tokio::fs::read(&path).await else {
        return (StatusCode::NOT_FOUND, "Not found").into_response();
    };
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("");
    if state.changes.is_some() && (extension == "html" || extension == "htm") {
        return fresh(
            inject_client(&String::from_utf8_lossy(&bytes)),
            content_type(extension),
        );
    }
    fresh(bytes, content_type(extension))
}

/// Builds the application for a root, with change events when a sender is given, the module pipeline when one is, the base it is served under, and the paths it forwards to backends.
fn app(
    root: PathBuf,
    changes: Option<broadcast::Sender<Change>>,
    pipeline: Option<Arc<Pipeline>>,
    base: String,
    proxy: Vec<ProxyRule>,
) -> Router {
    let state = Arc::new(AppState {
        root,
        changes,
        pipeline,
        base,
        proxy,
    });
    Router::new()
        .route("/__zerolith/events", get(events))
        .route("/__zerolith/client.js", get(client))
        .route(
            "/.well-known/appspecific/com.chrome.devtools.json",
            get(devtools_json),
        )
        .fallback(any(entry))
        .with_state(state)
}

/// Prints a line for each change the browsers are told about, once per save even when an editor writes a file several times.
fn log_changes(sender: &broadcast::Sender<Change>) {
    let mut receiver = sender.subscribe();
    tokio::spawn(async move {
        let mut last: Option<(String, std::time::Instant, usize)> = None;
        loop {
            let change = match receiver.recv().await {
                Ok(change) => change,
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            };
            let now = std::time::Instant::now();
            let count = match &mut last {
                Some((path, at, count)) if *path == change.path => {
                    let repeat = now.duration_since(*at) < std::time::Duration::from_millis(500);
                    *at = now;
                    if repeat {
                        continue;
                    }
                    *count += 1;
                    *count
                }
                _ => {
                    last = Some((change.path.clone(), now, 1));
                    1
                }
            };
            let verb = if change.path.ends_with(".css") {
                "update"
            } else {
                "reload"
            };
            let shown = term::path(change.path.trim_start_matches('/'));
            let times = if count > 1 {
                format!(" {}", term::muted(format!("x{count}")))
            } else {
                String::new()
            };
            anstream::println!("{}{times}", term::row(verb, term::done, shown));
        }
    });
}

/// Serves `options.root` until the process is interrupted.
pub async fn run(options: Options) -> std::io::Result<()> {
    let started = std::time::Instant::now();
    let root = css::canonical(&options.root)?;
    let pipeline = options
        .modules
        .then(|| Arc::new(Pipeline::new(root.clone(), "development", &options.base)));
    let (sender, watcher) = if options.reload {
        let (sender, _) = broadcast::channel::<Change>(64);
        let watcher = watch::start(root.clone(), sender.clone()).map_err(std::io::Error::other)?;
        (Some(sender), Some(watcher))
    } else {
        (None, None)
    };
    let mut port = options.port;
    let listener = loop {
        match tokio::net::TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, port))).await {
            Ok(listener) => break listener,
            Err(error)
                if !options.port_fixed
                    && port != 0
                    && port < options.port.saturating_add(20)
                    && matches!(
                        error.kind(),
                        std::io::ErrorKind::AddrInUse | std::io::ErrorKind::PermissionDenied
                    ) =>
            {
                port += 1;
            }
            Err(error) if error.kind() == std::io::ErrorKind::AddrInUse => {
                return Err(std::io::Error::new(
                    error.kind(),
                    format!(
                        "port {port} is already in use; stop the server using it, or pass --port with another number"
                    ),
                ));
            }
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
                return Err(std::io::Error::new(
                    error.kind(),
                    format!(
                        "port {port} is reserved by the system or held by another program; pass --port with another number"
                    ),
                ));
            }
            Err(error) => return Err(error),
        }
    };
    let address = listener.local_addr()?;
    let title = match (options.reload, options.modules) {
        (true, _) => "dev server",
        (false, true) => "server",
        (false, false) => "preview",
    };
    let detail = format!(
        "v{}, ready in {} ms",
        env!("CARGO_PKG_VERSION"),
        started.elapsed().as_millis()
    );
    anstream::println!("{}", term::heading(title, &detail));
    anstream::println!(
        "{}",
        term::row(
            "Local",
            term::label,
            term::success(format!("http://{address}{}", options.base))
        )
    );
    if port != options.port {
        anstream::println!(
            "{}",
            term::row(
                "Port",
                term::label,
                format!("{port}, since {} was taken", options.port)
            )
        );
    }
    anstream::println!("{}", term::row("Root", term::label, display(&root)));
    for (index, rule) in options.proxy.iter().enumerate() {
        let shown = format!(
            "{} to {}{}{}",
            rule.prefix,
            rule.target.origin(),
            rule.target.path,
            if rule.strip_prefix {
                ", without the prefix"
            } else {
                ""
            }
        );
        anstream::println!(
            "{}",
            term::row(if index == 0 { "Proxy" } else { "" }, term::label, shown)
        );
    }
    if options.reload {
        anstream::println!(
            "{}",
            term::row(
                "Reload",
                term::label,
                "on: edits reload the page, stylesheets update in place"
            )
        );
    }
    anstream::println!("\n  {}\n", term::muted("Press Ctrl+C to stop."));
    if let Some(sender) = &sender {
        log_changes(sender);
    }
    let result = axum::serve(
        listener,
        app(root, sender, pipeline, options.base, options.proxy)
            .into_make_service_with_connect_info::<SocketAddr>(),
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
        assert_eq!(
            resolve(&root, "/app/typed.js"),
            Some(root.join("app/typed.ts"))
        );
        assert_eq!(
            resolve(&root, "/app/typed.ts"),
            Some(root.join("app/typed.ts"))
        );
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

    mod served {
        use super::super::{Mapped, app, map_base};
        use crate::config::ProxyRule;
        use axum::Router;
        use axum::body::Body;
        use axum::http::{Request, Response, StatusCode, header};
        use axum::routing::{any, get};
        use hyper_util::rt::TokioIo;
        use std::net::SocketAddr;
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::{TcpListener, TcpStream};

        async fn listen(router: Router) -> SocketAddr {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            tokio::spawn(async move {
                let _ = axum::serve(
                    listener,
                    router.into_make_service_with_connect_info::<SocketAddr>(),
                )
                .await;
            });
            address
        }

        /// Sends raw HTTP/1.1 and returns everything the server wrote before closing.
        async fn exchange(address: SocketAddr, request: &str) -> String {
            let mut stream = TcpStream::connect(address).await.unwrap();
            stream.write_all(request.as_bytes()).await.unwrap();
            let mut response = Vec::new();
            stream.read_to_end(&mut response).await.unwrap();
            String::from_utf8_lossy(&response).into_owned()
        }

        async fn echo(request: Request<Body>) -> Response<Body> {
            let host = request.headers().get(header::HOST).cloned();
            let forwarded = request.headers().get("x-forwarded-host").cloned();
            let line = format!(
                "{} {} host={} forwarded={}",
                request.method(),
                request.uri(),
                host.and_then(|value| value.to_str().ok().map(str::to_string))
                    .unwrap_or_default(),
                forwarded
                    .and_then(|value| value.to_str().ok().map(str::to_string))
                    .unwrap_or_default()
            );
            let body = axum::body::to_bytes(request.into_body(), 1 << 20)
                .await
                .unwrap();
            Response::new(Body::from(format!(
                "{line} body={}",
                String::from_utf8_lossy(&body)
            )))
        }

        async fn upgrade(mut request: Request<Body>) -> Response<Body> {
            let pending = request
                .extensions_mut()
                .remove::<hyper::upgrade::OnUpgrade>()
                .unwrap();
            tokio::spawn(async move {
                if let Ok(upgraded) = pending.await {
                    let mut io = TokioIo::new(upgraded);
                    let mut buffer = [0u8; 5];
                    if io.read_exact(&mut buffer).await.is_ok() {
                        let _ = io.write_all(&buffer).await;
                    }
                }
            });
            Response::builder()
                .status(StatusCode::SWITCHING_PROTOCOLS)
                .header(header::CONNECTION, "upgrade")
                .header(header::UPGRADE, "echo")
                .body(Body::empty())
                .unwrap()
        }

        #[test]
        fn maps_request_paths_against_the_base() {
            assert_eq!(map_base("/", "/x"), Mapped::Inside("/x".into()));
            assert_eq!(map_base("/app/", "/"), Mapped::Redirect("/app/".into()));
            assert_eq!(map_base("/app/", "/app"), Mapped::Redirect("/app/".into()));
            assert_eq!(
                map_base("/app/", "/app/notes/1"),
                Mapped::Inside("/notes/1".into())
            );
            assert_eq!(
                map_base("/app/", "/apple"),
                Mapped::Outside("/apple".into())
            );
            assert_eq!(
                map_base("/app/", "/@fs/x.js"),
                Mapped::Outside("/@fs/x.js".into())
            );
        }

        #[tokio::test]
        async fn forwards_requests_redirects_and_upgrades_and_serves_under_the_base() {
            let backend = listen(
                Router::new()
                    .route("/api/echo", any(echo))
                    .route("/v1/echo", any(echo))
                    .route("/api/upgrade", get(upgrade))
                    .route(
                        "/api/redirect",
                        get(|request: Request<Body>| async move {
                            let host = request
                                .headers()
                                .get(header::HOST)
                                .unwrap()
                                .to_str()
                                .unwrap()
                                .to_string();
                            Response::builder()
                                .status(StatusCode::FOUND)
                                .header(
                                    header::LOCATION,
                                    format!("http://{host}/api/echo?from=redirect"),
                                )
                                .body(Body::empty())
                                .unwrap()
                        }),
                    ),
            )
            .await;
            let root =
                std::env::temp_dir().join(format!("zerolith-proxy-test-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&root);
            std::fs::create_dir_all(&root).unwrap();
            std::fs::write(root.join("index.html"), "<main id=\"app\"></main>").unwrap();
            std::fs::write(root.join("robots.txt"), "User-agent: *").unwrap();
            let target = format!("http://127.0.0.1:{}", backend.port());
            let closed = TcpListener::bind("127.0.0.1:0")
                .await
                .unwrap()
                .local_addr()
                .unwrap();
            let rules = vec![
                ProxyRule::new("/api", &target, false).unwrap(),
                ProxyRule::new("/old", &format!("{target}/v1"), true).unwrap(),
                ProxyRule::new(
                    "/down",
                    &format!("http://127.0.0.1:{}", closed.port()),
                    false,
                )
                .unwrap(),
            ];
            let server = listen(app(root.clone(), None, None, "/app/".to_string(), rules)).await;

            let echoed = exchange(
                server,
                "GET /api/echo?q=1 HTTP/1.1\r\nHost: dev.local\r\nConnection: close\r\n\r\n",
            )
            .await;
            assert!(echoed.starts_with("HTTP/1.1 200"), "{echoed}");
            assert!(
                echoed.contains(&format!(
                    "GET /api/echo?q=1 host=127.0.0.1:{} forwarded=dev.local",
                    backend.port()
                )),
                "{echoed}"
            );

            let posted = exchange(server, "POST /api/echo HTTP/1.1\r\nHost: dev.local\r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello").await;
            assert!(
                posted.contains("POST /api/echo") && posted.contains("body=hello"),
                "{posted}"
            );

            let stripped = exchange(
                server,
                "GET /old/echo HTTP/1.1\r\nHost: dev.local\r\nConnection: close\r\n\r\n",
            )
            .await;
            assert!(stripped.contains("GET /v1/echo"), "{stripped}");

            let redirected = exchange(
                server,
                "GET /api/redirect HTTP/1.1\r\nHost: dev.local\r\nConnection: close\r\n\r\n",
            )
            .await;
            assert!(redirected.starts_with("HTTP/1.1 302"), "{redirected}");
            assert!(
                redirected
                    .to_ascii_lowercase()
                    .contains("location: /api/echo?from=redirect\r\n"),
                "{redirected}"
            );

            let down = exchange(
                server,
                "GET /down/x HTTP/1.1\r\nHost: dev.local\r\nConnection: close\r\n\r\n",
            )
            .await;
            assert!(down.starts_with("HTTP/1.1 502"), "{down}");

            let mut stream = TcpStream::connect(server).await.unwrap();
            stream
                .write_all(b"GET /api/upgrade HTTP/1.1\r\nHost: dev.local\r\nConnection: Upgrade\r\nUpgrade: echo\r\n\r\n")
                .await
                .unwrap();
            let mut head = Vec::new();
            while !head.ends_with(b"\r\n\r\n") {
                let mut byte = [0u8; 1];
                stream.read_exact(&mut byte).await.unwrap();
                head.push(byte[0]);
            }
            assert!(
                String::from_utf8_lossy(&head).starts_with("HTTP/1.1 101"),
                "{}",
                String::from_utf8_lossy(&head)
            );
            stream.write_all(b"hello").await.unwrap();
            let mut echoed = [0u8; 5];
            stream.read_exact(&mut echoed).await.unwrap();
            assert_eq!(&echoed, b"hello");

            let home = exchange(
                server,
                "GET / HTTP/1.1\r\nHost: dev.local\r\nConnection: close\r\n\r\n",
            )
            .await;
            assert!(
                home.starts_with("HTTP/1.1 302")
                    && home.to_ascii_lowercase().contains("location: /app/\r\n"),
                "{home}"
            );
            let route = exchange(
                server,
                "GET /app/notes/1 HTTP/1.1\r\nHost: dev.local\r\nConnection: close\r\n\r\n",
            )
            .await;
            assert!(
                route.starts_with("HTTP/1.1 200") && route.contains("<main id=\"app\">"),
                "{route}"
            );
            let outside_file = exchange(
                server,
                "GET /robots.txt HTTP/1.1\r\nHost: dev.local\r\nConnection: close\r\n\r\n",
            )
            .await;
            assert!(outside_file.starts_with("HTTP/1.1 200"), "{outside_file}");
            let outside_route = exchange(
                server,
                "GET /notes/1 HTTP/1.1\r\nHost: dev.local\r\nConnection: close\r\n\r\n",
            )
            .await;
            assert!(outside_route.starts_with("HTTP/1.1 404"), "{outside_route}");
            let posted_file = exchange(server, "POST /app/ HTTP/1.1\r\nHost: dev.local\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;
            assert!(posted_file.starts_with("HTTP/1.1 405"), "{posted_file}");
            let _ = std::fs::remove_dir_all(&root);
        }
    }
}
