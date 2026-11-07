//! What the server answers for a file: a module or stylesheet through the
//! pipeline, a page with the live-reload client, or the file as it is, and
//! the problems a module or stylesheet has, recorded as it is served.

use std::path::Path;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::State;
use axum::http::{HeaderValue, Method, Request, StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};

use crate::css;
use crate::mime::content_type;
use crate::modules::{self, Pipeline};
use crate::problems::Problems;
use crate::proxy;
use crate::term;

use super::AppState;
use super::live::inject_client;
use super::paths::{Mapped, display, map_base, public_file, resolve, resolve_with};

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
pub(super) fn about(root: &Path, path: &Path, message: String) -> String {
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
pub(super) async fn entry(State(state): State<Arc<AppState>>, request: Request<Body>) -> Response {
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

pub(super) async fn file(state: &Arc<AppState>, uri: &Uri) -> Response {
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
