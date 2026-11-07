//! The server behind `dev`, `serve`, and `preview`: files under a root with
//! directory indexes and a nearest-index fallback for client-side routes,
//! the `public` folder at the root, scripts through the module pipeline
//! for `dev` and `serve`, a small client script injected into HTML pages
//! when live reload is on, server-sent change events and each file's
//! compile error or stylesheet warnings, and Chrome's automatic-workspace
//! file.

use std::net::{Ipv4Addr, SocketAddr};
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};

use axum::Router;
use axum::body::Body;
use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderValue, Method, Request, StatusCode, Uri, header};
use axum::middleware::{self, Next};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{any, get};
use sha2::{Digest, Sha256};
use tokio::sync::broadcast;
use tokio_stream::StreamExt;
use tokio_stream::wrappers::BroadcastStream;

use crate::backend::{self, Backend, Backends, Guard};
use crate::config::ProxyRule;
use crate::css;
use crate::mime::content_type;
use crate::modules::{self, Pipeline};
use crate::problems::Problems;
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
    /// Host names the server answers besides localhost and IP addresses, from `allowedHosts` in `zerolith.json`.
    pub allowed_hosts: Vec<String>,
    /// The project folder, where the backends run.
    pub project: PathBuf,
    /// The commands that start the backends the proxy rules name with `run`, started once the port is bound and stopped with the server.
    pub backends: Vec<String>,
}

struct AppState {
    root: PathBuf,
    changes: Option<broadcast::Sender<Change>>,
    pipeline: Option<Arc<Pipeline>>,
    base: String,
    proxy: Vec<ProxyRule>,
    allowed_hosts: Vec<String>,
    problems: Arc<Problems>,
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

/// The host name of a `Host` header: lowercase, without its port, and without the brackets of an IPv6 address.
fn host_name(host: &str) -> String {
    let host = host.trim().to_ascii_lowercase();
    if let Some(rest) = host.strip_prefix('[') {
        return rest.split(']').next().unwrap_or_default().to_string();
    }
    match host.rsplit_once(':') {
        Some((name, port)) if port.bytes().all(|byte| byte.is_ascii_digit()) => name.to_string(),
        _ => host,
    }
}

/// True for a `Host` header another site cannot reach this server under by pointing its own name at the loopback address: an IP address, `localhost` or a name under it, or a name `allowed` lists, where an entry starting with a dot allows every name under it.
pub fn host_allowed(host: &str, allowed: &[String]) -> bool {
    let name = host_name(host);
    name.parse::<std::net::IpAddr>().is_ok()
        || name == "localhost"
        || name.ends_with(".localhost")
        || allowed.iter().any(|entry| {
            let entry = entry.to_ascii_lowercase();
            match entry.strip_prefix('.') {
                Some(domain) => name == domain || name.ends_with(&entry),
                None => name == entry,
            }
        })
}

/// Refuses a request whose `Host` header names a host the server does not answer, so a page on another site that points its own name at the loopback address, which is called DNS rebinding, cannot read the project.
async fn guard_host(
    State(state): State<Arc<AppState>>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let host = request
        .headers()
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    match host {
        Some(host) if !host_allowed(&host, &state.allowed_hosts) => {
            let name = host_name(&host);
            (
                StatusCode::FORBIDDEN,
                format!(
                    "Blocked a request for the host {name}. This server answers localhost, IP addresses, and the hosts zerolith.json lists under allowedHosts, so another site cannot read the project through DNS rebinding. To serve it under {name}, add \"allowedHosts\": [\"{name}\"] to zerolith.json.\n"
                ),
            )
                .into_response()
        }
        _ => next.run(request).await,
    }
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

/// One server-sent event of `kind` carrying `value` as JSON, or `None` for a value that does not serialize.
fn event(
    kind: &'static str,
    value: &impl serde::Serialize,
) -> Option<Result<Event, std::convert::Infallible>> {
    serde_json::to_string(value)
        .ok()
        .map(|data| Ok(Event::default().event(kind).data(data)))
}

/// The live-reload stream: every problem still standing when the browser connects, then each change and each new problem as it happens.
async fn events(State(state): State<Arc<AppState>>) -> Response {
    match &state.changes {
        Some(sender) => {
            let changes = BroadcastStream::new(sender.subscribe())
                .filter_map(|change| change.ok().and_then(|change| event("change", &change)));
            let reported = BroadcastStream::new(state.problems.subscribe())
                .filter_map(|problem| problem.ok().and_then(|problem| event("problem", &problem)));
            let standing = tokio_stream::iter(
                state
                    .problems
                    .current()
                    .iter()
                    .filter_map(|problem| event("problem", problem))
                    .collect::<Vec<_>>(),
            );
            Sse::new(standing.chain(changes.merge(reported)))
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
    throwing(message)
}

/// A module that throws `message` if it runs. A module that imports a name from it fails before it runs, so the problem is also sent over the live-reload stream.
fn throwing(message: &str) -> Response {
    fresh(
        format!("throw new Error({});\n", serde_json::Value::from(message)),
        content_type("js"),
    )
}

/// `message` with the file it is about leading, unless it names the file already, as a parse error's report does not.
fn about(root: &Path, path: &Path, message: String) -> String {
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");
    if !name.is_empty() && message.contains(name) {
        return message;
    }
    let shown = css::shown(root, path);
    if message.starts_with('\n') {
        format!("{shown}:{message}")
    } else {
        format!("{shown}: {message}")
    }
}

/// Records what the browser will skip of the stylesheet at `path`, served as `request_path`, or forgets it when there is nothing.
fn check_stylesheet(problems: &Problems, root: &Path, path: &Path, request_path: &str) {
    let Ok(source) = std::fs::read_to_string(path) else {
        return;
    };
    let found = css::problems(&source, &css::shown(root, path));
    if found.is_empty() {
        problems.clear(request_path);
    } else {
        problems.report(request_path, "warning", found.join("\n"));
    }
}

/// A file of the project's `public` folder, served at the root as the build copies it.
fn public_file(root: &Path, request_path: &str) -> Option<PathBuf> {
    Path::new(request_path).extension()?;
    resolve(&root.join("public"), request_path)
}

/// The dev server's answer for a module or a package file, or `None` for a file served as it is.
fn module_response(
    pipeline: &Pipeline,
    problems: &Problems,
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
        Ok(code) => {
            problems.clear(request_path);
            fresh(code, content_type("js"))
        }
        Err(message) => {
            let message = about(root, &path, message);
            problems.report(request_path, "error", message.clone());
            throwing(&message)
        }
    };
    let stylesheet = |result: Result<String, String>| match result {
        Ok(code) => {
            if !outside {
                check_stylesheet(problems, root, &path, request_path);
            }
            fresh(code, content_type("js"))
        }
        Err(message) => {
            problems.report(request_path, "error", message.clone());
            throwing(&message)
        }
    };
    if modules::wants(query, "scoped") {
        return Some(if extension == "css" {
            stylesheet(
                pipeline
                    .scoped(&path)
                    .map_err(|error| format!("{}: {error}", display(&path))),
            )
        } else {
            script(Err(format!(
                "{}: ?scoped applies to a stylesheet, a .css file",
                display(&path)
            )))
        });
    }
    if modules::wants(query, "import") && extension == "css" {
        return Some(stylesheet(
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
        let problems = state.problems.clone();
        let root = state.root.clone();
        let request_path = request_path.clone();
        let query = uri.query().unwrap_or("").to_string();
        match tokio::task::spawn_blocking(move || {
            module_response(&pipeline, &problems, &root, &request_path, &query)
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
    if state.pipeline.is_some() && extension == "css" {
        let found = css::problems(
            &String::from_utf8_lossy(&bytes),
            &css::shown(&state.root, &path),
        );
        if found.is_empty() {
            state.problems.clear(&request_path);
        } else {
            state
                .problems
                .report(&request_path, "warning", found.join("\n"));
        }
    }
    if state.changes.is_some() && (extension == "html" || extension == "htm") {
        return fresh(
            inject_client(&String::from_utf8_lossy(&bytes)),
            content_type(extension),
        );
    }
    fresh(bytes, content_type(extension))
}

/// Builds the application for a root, with change events when a sender is given, the module pipeline when one is, the base it is served under, the paths it forwards to backends, the host names it answers besides localhost and IP addresses, and the record of each file's problems.
fn app(
    root: PathBuf,
    changes: Option<broadcast::Sender<Change>>,
    pipeline: Option<Arc<Pipeline>>,
    base: String,
    proxy: Vec<ProxyRule>,
    allowed_hosts: Vec<String>,
    problems: Arc<Problems>,
) -> Router {
    let state = Arc::new(AppState {
        root,
        changes,
        pipeline,
        base,
        proxy,
        allowed_hosts,
        problems,
    });
    Router::new()
        .route("/__zerolith/events", get(events))
        .route("/__zerolith/client.js", get(client))
        .route(
            "/.well-known/appspecific/com.chrome.devtools.json",
            get(devtools_json),
        )
        .fallback(any(entry))
        .layer(middleware::from_fn_with_state(state.clone(), guard_host))
        .with_state(state)
}

/// Prints a line for each change the browsers are told about, once per save even when an editor writes a file several times, and forgets the changed file's problem, so the next request reports it again if it stands.
fn log_changes(sender: &broadcast::Sender<Change>, problems: Arc<Problems>) {
    let mut receiver = sender.subscribe();
    tokio::spawn(async move {
        let mut last: Option<(String, std::time::Instant, usize)> = None;
        loop {
            let change = match receiver.recv().await {
                Ok(change) => change,
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            };
            problems.clear(&change.path);
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
/// Serves until Ctrl+C, or on Unix a termination signal or a hangup, stopping the backends as soon as the signal arrives, since a stream one of them answers would keep the graceful shutdown waiting, and through the guard on any other way out.
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
    let backends: Backends = Arc::new(Mutex::new(start_backends(
        &options.backends,
        &options.project,
    )?));
    let guard = Guard(backends.clone());
    let watching = tokio::spawn(backend::watch(backends.clone()));
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
    for (index, command) in options.backends.iter().enumerate() {
        anstream::println!(
            "{}",
            term::row(
                if index == 0 { "Backend" } else { "" },
                term::label,
                command
            )
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
    let problems = Arc::new(Problems::new());
    if let Some(sender) = &sender {
        log_changes(sender, problems.clone());
    }
    let result = axum::serve(
        listener,
        app(
            root,
            sender,
            pipeline,
            options.base,
            options.proxy,
            options.allowed_hosts,
            problems,
        )
        .into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async move {
        shutdown().await;
        let held = backends
            .lock()
            .map(|mut list| std::mem::take(&mut *list))
            .unwrap_or_default();
        let _ = tokio::task::spawn_blocking(move || backend::stop_all(held)).await;
    })
    .await;
    watching.abort();
    drop(guard);
    drop(watcher);
    result
}

/// Starts each backend command in order; when one fails to start, the ones before it are stopped and the error names the command.
fn start_backends(commands: &[String], project: &Path) -> std::io::Result<Vec<Backend>> {
    let mut started = Vec::new();
    for command in commands {
        match Backend::start(command, project) {
            Ok(backend) => started.push(backend),
            Err(error) => {
                for backend in started {
                    backend.stop();
                }
                return Err(error);
            }
        }
    }
    Ok(started)
}

/// Resolves on Ctrl+C, and on Unix on a termination signal or a hangup too, as a process manager, a test, or a closed terminal stops the server, so the backends are stopped either way.
async fn shutdown() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
        match (
            signal(SignalKind::terminate()),
            signal(SignalKind::hangup()),
        ) {
            (Ok(mut terminate), Ok(mut hangup)) => {
                tokio::select! {
                    _ = tokio::signal::ctrl_c() => {}
                    _ = terminate.recv() => {}
                    _ = hangup.recv() => {}
                }
            }
            _ => {
                let _ = tokio::signal::ctrl_c().await;
            }
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}

#[cfg(test)]
mod tests {
    use super::{display, host_allowed, inject_client, percent_decode, resolve, workspace_uuid};
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
        assert_eq!(percent_decode("/%a\u{e9}"), "/%a\u{e9}");
        assert_eq!(percent_decode("/\u{e9}%2"), "/\u{e9}%2");
        assert_eq!(percent_decode("%+5%-1"), "%+5%-1");
        assert_eq!(percent_decode("/%C3%A9"), "/\u{e9}");
        let allowed = vec!["myapp.test".to_string(), ".example.dev".to_string()];
        for host in [
            "localhost",
            "LOCALHOST:8080",
            "app.localhost:8080",
            "127.0.0.1:8080",
            "[::1]:8080",
            "192.168.1.20",
            "myapp.test",
            "a.example.dev:443",
            "example.dev",
        ] {
            assert!(host_allowed(host, &allowed), "{host}");
        }
        for host in [
            "evil.example",
            "localhost.evil.example",
            "myapp.test.evil.example",
            "notexample.dev",
        ] {
            assert!(!host_allowed(host, &allowed), "{host}");
        }
        assert_eq!(percent_decode("/bad%zz"), "/bad%zz");
        let uuid = workspace_uuid(Path::new("/project"));
        assert_eq!(uuid.len(), 36);
        assert_eq!(uuid, workspace_uuid(Path::new("/project")));
        assert_ne!(uuid, workspace_uuid(Path::new("/other")));
        assert_eq!(display(Path::new(r"\\?\C:\x")), r"C:\x");
        assert_eq!(display(Path::new("/x")), "/x");
    }

    mod served {
        use super::super::{Mapped, app, log_changes, map_base};
        use crate::config::ProxyRule;
        use crate::modules::Pipeline;
        use crate::problems::Problems;
        use crate::watch::Change;
        use axum::Router;
        use axum::body::Body;
        use axum::http::{Request, Response, StatusCode, header};
        use axum::routing::{any, get};
        use hyper_util::rt::TokioIo;
        use std::net::SocketAddr;
        use std::sync::Arc;
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

        #[tokio::test]
        async fn answers_loopback_hosts_and_refuses_others() {
            let root =
                std::env::temp_dir().join(format!("zerolith-host-test-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&root);
            std::fs::create_dir_all(&root).unwrap();
            std::fs::write(root.join("index.html"), "<p>home</p>").unwrap();
            let address = listen(app(
                root.clone(),
                None,
                None,
                "/".to_string(),
                Vec::new(),
                vec!["myapp.test".to_string()],
                Arc::new(Problems::new()),
            ))
            .await;
            for host in [
                format!("127.0.0.1:{}", address.port()),
                format!("localhost:{}", address.port()),
                "app.localhost".to_string(),
                "[::1]:8080".to_string(),
                "myapp.test:8080".to_string(),
            ] {
                let response = exchange(
                    address,
                    &format!("GET / HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n"),
                )
                .await;
                assert!(response.starts_with("HTTP/1.1 200"), "{host}: {response}");
            }
            let refused = exchange(
                address,
                "GET / HTTP/1.1\r\nHost: evil.example\r\nConnection: close\r\n\r\n",
            )
            .await;
            assert!(refused.starts_with("HTTP/1.1 403"), "{refused}");
            assert!(refused.contains("allowedHosts"), "{refused}");
            let events = exchange(
                address,
                "GET /__zerolith/events HTTP/1.1\r\nHost: evil.example\r\nConnection: close\r\n\r\n",
            )
            .await;
            assert!(events.starts_with("HTTP/1.1 403"), "{events}");
            let _ = std::fs::remove_dir_all(&root);
        }

        /// Opens the live-reload stream and returns what it sent once `count` problems have arrived, or after five seconds.
        async fn problems_sent(address: SocketAddr, count: usize) -> String {
            let mut stream = TcpStream::connect(address).await.unwrap();
            stream
                .write_all(b"GET /__zerolith/events HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
                .await
                .unwrap();
            let mut seen = Vec::new();
            let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(5);
            while String::from_utf8_lossy(&seen)
                .matches("event: problem")
                .count()
                < count
            {
                let mut chunk = [0u8; 4096];
                match tokio::time::timeout_at(deadline, stream.read(&mut chunk)).await {
                    Ok(Ok(read)) if read > 0 => seen.extend_from_slice(&chunk[..read]),
                    _ => break,
                }
            }
            String::from_utf8_lossy(&seen).into_owned()
        }

        #[tokio::test]
        async fn sends_compile_errors_and_stylesheet_warnings_to_the_browser() {
            let folder =
                std::env::temp_dir().join(format!("zerolith-problems-test-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&folder);
            std::fs::create_dir_all(folder.join("src")).unwrap();
            let root = crate::css::canonical(&folder).unwrap();
            std::fs::write(root.join("src/broken.ts"), "export const a = ;\n").unwrap();
            std::fs::write(root.join("src/fine.ts"), "export const b = 1;\n").unwrap();
            std::fs::write(
                root.join("src/linked.css"),
                ".a { color: red; }\n.b:: { color: blue; }\n",
            )
            .unwrap();
            std::fs::write(root.join("src/imported.css"), ".c { color red; }\n").unwrap();
            std::fs::write(root.join("src/clean.css"), ".a { color: red; }\n").unwrap();
            let (sender, _) = tokio::sync::broadcast::channel(16);
            let problems = Arc::new(Problems::new());
            log_changes(&sender, problems.clone());
            let address = listen(app(
                root.clone(),
                Some(sender.clone()),
                Some(Arc::new(Pipeline::new(root.clone(), "development", "/"))),
                "/".to_string(),
                Vec::new(),
                Vec::new(),
                problems.clone(),
            ))
            .await;
            let get = |path: &str| {
                format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
            };
            let broken = exchange(address, &get("/src/broken.ts")).await;
            assert!(broken.contains("throw new Error"), "{broken}");
            for path in [
                "/src/fine.ts",
                "/src/linked.css",
                "/src/imported.css?import",
                "/src/clean.css",
                "/src/clean.css?import",
            ] {
                let response = exchange(address, &get(path)).await;
                assert!(response.starts_with("HTTP/1.1 200"), "{path}: {response}");
            }
            let sent = problems_sent(address, 3).await;
            let lines: Vec<&str> = sent
                .lines()
                .filter(|line| line.starts_with("data: "))
                .collect();
            assert_eq!(lines.len(), 3, "{sent}");
            assert!(
                lines[0].contains(
                    r#""path":"/src/broken.ts","level":"error","message":"src/broken.ts:\n"#
                ),
                "{sent}"
            );
            assert!(
                lines[1].contains(
                    r#""path":"/src/imported.css","level":"warning","message":"src/imported.css:1:"#
                ),
                "{sent}"
            );
            assert!(
                lines[2].contains(
                    r#""path":"/src/linked.css","level":"warning","message":"src/linked.css:2:"#
                ),
                "{sent}"
            );
            std::fs::write(root.join("src/broken.ts"), "export const a = 1;\n").unwrap();
            let fixed = exchange(address, &get("/src/broken.ts")).await;
            assert!(!fixed.contains("throw new Error"), "{fixed}");
            sender
                .send(Change {
                    path: "/src/linked.css".to_string(),
                })
                .unwrap();
            for _ in 0..100 {
                if problems.current().len() == 1 {
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
            assert_eq!(
                problems
                    .current()
                    .iter()
                    .map(|problem| problem.path.as_str())
                    .collect::<Vec<_>>(),
                ["/src/imported.css"]
            );
            std::fs::write(root.join("src/imported.css"), ".c { color: red; }\n").unwrap();
            let mended = exchange(address, &get("/src/imported.css?import")).await;
            assert!(mended.starts_with("HTTP/1.1 200"), "{mended}");
            assert!(problems.current().is_empty());
            let _ = std::fs::remove_dir_all(&folder);
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
            let server = listen(app(
                root.clone(),
                None,
                None,
                "/app/".to_string(),
                rules,
                vec!["dev.local".to_string()],
                Arc::new(Problems::new()),
            ))
            .await;

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
