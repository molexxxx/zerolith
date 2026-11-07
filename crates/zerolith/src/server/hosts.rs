//! The `Host` header check that keeps another site from reaching the dev
//! server through a name it points at this machine.

use std::sync::Arc;

use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, StatusCode, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use super::AppState;

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
pub(super) async fn guard_host(
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
