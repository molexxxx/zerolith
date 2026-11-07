//! Live reload: the client script injected into pages, the server-sent
//! stream of changes and problems, and the terminal line for each change.

use std::sync::Arc;

use axum::extract::State;
use axum::http::{StatusCode, header};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use tokio::sync::broadcast;
use tokio_stream::StreamExt;
use tokio_stream::wrappers::BroadcastStream;

use crate::problems::Problems;
use crate::term;
use crate::watch::Change;

use super::AppState;

const CLIENT: &str = include_str!("../client.js");
const CLIENT_TAG: &str = "<script type=\"module\" src=\"/__zerolith/client.js\"></script>";

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

/// One server-sent event of `kind` carrying `value` as JSON, or `None` for a value that does not serialize.
pub(super) fn event(
    kind: &'static str,
    value: &impl serde::Serialize,
) -> Option<Result<Event, std::convert::Infallible>> {
    serde_json::to_string(value)
        .ok()
        .map(|data| Ok(Event::default().event(kind).data(data)))
}

/// The live-reload stream: every problem still standing when the browser connects, then each change and each new problem as it happens.
pub(super) async fn events(State(state): State<Arc<AppState>>) -> Response {
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

pub(super) async fn client() -> Response {
    (
        [
            (header::CONTENT_TYPE, "text/javascript; charset=utf-8"),
            (header::CACHE_CONTROL, "no-cache"),
        ],
        CLIENT,
    )
        .into_response()
}

/// Prints a line for each change the browsers are told about, once per save even when an editor writes a file several times, and forgets the changed file's problem, so the next request reports it again if it stands.
pub(super) fn log_changes(sender: &broadcast::Sender<Change>, problems: Arc<Problems>) {
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
