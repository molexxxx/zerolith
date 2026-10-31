//! The dev server's proxy. A request under a configured path goes to a
//! backend over HTTP/1, so a page reaches its API on its own origin while
//! developing: there is no CORS to configure, and cookies and redirects
//! behave as they will behind the production server. Responses stream
//! through as they arrive, server-sent events included, and WebSocket and
//! other upgraded connections are joined end to end.

use std::net::SocketAddr;

use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::{HeaderMap, HeaderValue, Request, Response, StatusCode, Version, header};
use hyper_util::rt::TokioIo;
use tokio::net::TcpStream;

use crate::config::ProxyRule;
use crate::term;

type Failure = Box<dyn std::error::Error + Send + Sync>;

/// Headers that describe one connection and are never forwarded across the proxy.
const HOP_BY_HOP: [&str; 8] = [
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "proxy-connection",
    "te",
    "trailer",
    "transfer-encoding",
];

/// True when the request asks to switch protocols, as a WebSocket handshake does.
fn wants_upgrade(headers: &HeaderMap) -> bool {
    headers.contains_key(header::UPGRADE)
        && headers.get_all(header::CONNECTION).iter().any(|value| {
            value
                .to_str()
                .is_ok_and(|text| text.to_ascii_lowercase().contains("upgrade"))
        })
}

/// Removes the hop-by-hop headers and the ones `Connection` names, keeping `Upgrade` for a protocol switch.
fn strip_hop_by_hop(headers: &mut HeaderMap, keep_upgrade: bool) {
    let listed: Vec<String> = headers
        .get_all(header::CONNECTION)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(','))
        .map(|name| name.trim().to_ascii_lowercase())
        .filter(|name| !name.is_empty())
        .collect();
    for name in HOP_BY_HOP
        .iter()
        .copied()
        .chain(listed.iter().map(String::as_str))
    {
        if !(keep_upgrade && name == "upgrade") {
            headers.remove(name);
        }
    }
    if !keep_upgrade {
        headers.remove(header::UPGRADE);
    }
}

/// Forwards one request to the rule's backend and returns the backend's response, or a 502 that says why it could not.
pub async fn forward(rule: &ProxyRule, mut request: Request<Body>) -> Response<Body> {
    let path = request.uri().path().to_string();
    let forwarded = rule.forwarded(&path, request.uri().query());
    match send(rule, &mut request, &forwarded).await {
        Ok(response) => response,
        Err(error) => {
            let message = format!("{path} to {}: {error}", rule.target.origin());
            anstream::eprintln!("{}", term::row("proxy", term::failure, &message));
            let mut response = Response::new(Body::from(format!(
                "zerolith dev could not reach the backend: {message}\n"
            )));
            *response.status_mut() = StatusCode::BAD_GATEWAY;
            response.headers_mut().insert(
                header::CONTENT_TYPE,
                HeaderValue::from_static("text/plain; charset=utf-8"),
            );
            response
        }
    }
}

async fn send(
    rule: &ProxyRule,
    request: &mut Request<Body>,
    forwarded: &str,
) -> Result<Response<Body>, Failure> {
    let upgrade = wants_upgrade(request.headers());
    let client_upgrade = if upgrade {
        request
            .extensions_mut()
            .remove::<hyper::upgrade::OnUpgrade>()
    } else {
        None
    };
    let client_address = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|info| info.0.ip());
    let mut headers = std::mem::take(request.headers_mut());
    let original_host = headers.get(header::HOST).cloned();
    strip_hop_by_hop(&mut headers, upgrade);
    if upgrade {
        headers.insert(header::CONNECTION, HeaderValue::from_static("upgrade"));
    }
    headers.insert(
        header::HOST,
        HeaderValue::from_str(&rule.target.authority())?,
    );
    if let Some(host) = original_host {
        headers.insert("x-forwarded-host", host);
    }
    headers.insert("x-forwarded-proto", HeaderValue::from_static("http"));
    if let Some(address) = client_address {
        let value = match headers
            .get("x-forwarded-for")
            .and_then(|value| value.to_str().ok())
        {
            Some(earlier) => format!("{earlier}, {address}"),
            None => address.to_string(),
        };
        headers.insert("x-forwarded-for", HeaderValue::from_str(&value)?);
    }
    let body = std::mem::replace(request.body_mut(), Body::empty());
    let mut outgoing = Request::builder()
        .method(request.method().clone())
        .uri(forwarded)
        .version(Version::HTTP_11)
        .body(body)?;
    *outgoing.headers_mut() = headers;

    let stream = TcpStream::connect((rule.target.host.as_str(), rule.target.port)).await?;
    let (mut sender, connection) =
        hyper::client::conn::http1::handshake::<_, Body>(TokioIo::new(stream)).await?;
    tokio::spawn(async move {
        let _ = connection.with_upgrades().await;
    });
    let mut response = sender.send_request(outgoing).await?;

    if response.status() == StatusCode::SWITCHING_PROTOCOLS {
        let backend_upgrade = hyper::upgrade::on(&mut response);
        if let Some(client_upgrade) = client_upgrade {
            tokio::spawn(async move {
                if let (Ok(client), Ok(backend)) = (client_upgrade.await, backend_upgrade.await) {
                    let _ = tokio::io::copy_bidirectional(
                        &mut TokioIo::new(client),
                        &mut TokioIo::new(backend),
                    )
                    .await;
                }
            });
        }
        let (parts, _) = response.into_parts();
        return Ok(Response::from_parts(parts, Body::empty()));
    }

    let (mut parts, incoming) = response.into_parts();
    strip_hop_by_hop(&mut parts.headers, false);
    let origin = rule.target.origin();
    let relocated = parts
        .headers
        .get(header::LOCATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|location| location.strip_prefix(origin.as_str()))
        .map(|local| {
            if local.is_empty() {
                "/".to_string()
            } else {
                local.to_string()
            }
        });
    if let Some(local) = relocated {
        parts
            .headers
            .insert(header::LOCATION, HeaderValue::from_str(&local)?);
    }
    Ok(Response::from_parts(parts, Body::new(incoming)))
}

#[cfg(test)]
mod tests {
    use super::{strip_hop_by_hop, wants_upgrade};
    use axum::http::{HeaderMap, HeaderValue, header};

    #[test]
    fn drops_connection_headers_and_keeps_an_upgrade() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::CONNECTION,
            HeaderValue::from_static("keep-alive, x-trace, Upgrade"),
        );
        headers.insert("x-trace", HeaderValue::from_static("1"));
        headers.insert("keep-alive", HeaderValue::from_static("timeout=5"));
        headers.insert(header::UPGRADE, HeaderValue::from_static("websocket"));
        headers.insert(header::ACCEPT, HeaderValue::from_static("text/html"));
        assert!(wants_upgrade(&headers));
        let mut forwarded = headers.clone();
        strip_hop_by_hop(&mut forwarded, true);
        assert!(forwarded.get("x-trace").is_none());
        assert!(forwarded.get(header::CONNECTION).is_none());
        assert_eq!(forwarded.get(header::UPGRADE).unwrap(), "websocket");
        strip_hop_by_hop(&mut headers, false);
        assert!(headers.get(header::UPGRADE).is_none());
        assert_eq!(headers.get(header::ACCEPT).unwrap(), "text/html");
    }
}
