//! The server behind `dev`, `serve`, and `preview`: files under a root with
//! directory indexes and a nearest-index fallback for client-side routes,
//! the `public` folder at the root, scripts through the module pipeline
//! for `dev` and `serve`, a small client script injected into HTML pages
//! when live reload is on, server-sent change events and each file's
//! compile error or stylesheet warnings, and Chrome's automatic-workspace
//! file.

use std::net::{Ipv4Addr, SocketAddr};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use axum::Router;
use axum::extract::{ConnectInfo, State};
use axum::http::{StatusCode, header};
use axum::middleware;
use axum::response::{IntoResponse, Response};
use axum::routing::{any, get};
use tokio::sync::broadcast;

use crate::backend::{self, Backend, Backends, Guard};
use crate::config::ProxyRule;
use crate::css;
use crate::modules::Pipeline;
use crate::problems::Problems;
use crate::term;
use crate::watch::{self, Change};

mod files;
mod hosts;
mod live;
mod paths;
#[cfg(test)]
mod tests;

use files::entry;
use hosts::guard_host;
use live::{client, events, log_changes};
use paths::workspace_uuid;
pub use paths::{display, percent_decode, resolve};

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
    pub backends: Vec<BackendCommand>,
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

/// A backend a proxy rule names with `run`: its command, and where it listens.
#[derive(Debug, Clone)]
pub struct BackendCommand {
    pub command: String,
    pub address: Option<(String, u16)>,
}

/// True when something accepts a connection at the address, as a backend that `zerolith dev` or a terminal already runs does, so a second copy would find its port taken.
fn answers(address: &(String, u16)) -> bool {
    use std::net::ToSocketAddrs;
    (address.0.as_str(), address.1)
        .to_socket_addrs()
        .is_ok_and(|mut found| {
            found.any(|socket| {
                std::net::TcpStream::connect_timeout(&socket, std::time::Duration::from_millis(250))
                    .is_ok()
            })
        })
}

/// Fails with what to do when the folder `zerolith preview` would serve does not exist.
fn check_preview_folder(folder: &std::path::Path) -> std::io::Result<()> {
    if folder.is_dir() {
        return Ok(());
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        format!(
            "{} does not exist, so there is nothing to preview; run zerolith build first, or name another folder with --out",
            display(folder)
        ),
    ))
}

/// What to say of a folder `zerolith preview` serves that holds no page, as after `zerolith build --entry`.
fn preview_note(folder: &std::path::Path) -> Option<&'static str> {
    (!folder.join("index.html").is_file())
        .then_some("no index.html here, so a path that names no file answers 404, as after zerolith build --entry")
}

/// Serves `options.root` until the process is interrupted.
/// Serves until Ctrl+C, or on Unix a termination signal or a hangup, stopping the backends as soon as the signal arrives, since a stream one of them answers would keep the graceful shutdown waiting, and through the guard on any other way out.
pub async fn run(options: Options) -> std::io::Result<()> {
    let started = std::time::Instant::now();
    if !options.modules {
        check_preview_folder(&options.root)?;
    }
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
    let (running, to_start): (Vec<&BackendCommand>, Vec<&BackendCommand>) = options
        .backends
        .iter()
        .partition(|backend| backend.address.as_ref().is_some_and(answers));
    let commands: Vec<String> = to_start
        .iter()
        .map(|backend| backend.command.clone())
        .collect();
    let backends: Backends = Arc::new(Mutex::new(start_backends(&commands, &options.project)?));
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
    if !options.modules
        && let Some(note) = preview_note(&root)
    {
        anstream::println!("{}", term::row("Note", term::caution, note));
    }
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
    let shown = commands
        .iter()
        .cloned()
        .chain(running.iter().map(|backend| {
            let (host, port) = backend.address.clone().unwrap_or_default();
            format!(
                "{}, left as it is, since {host}:{port} already answers",
                backend.command
            )
        }));
    for (index, line) in shown.enumerate() {
        anstream::println!(
            "{}",
            term::row(if index == 0 { "Backend" } else { "" }, term::label, line)
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
