//! The server's tests: paths and hosts, and a running server over TCP.

use super::hosts::host_allowed;
use super::live::inject_client;
use super::paths::{display, percent_decode, resolve, workspace_uuid};
use std::fs;
use std::path::Path;

fn fixture() -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!("zerolith-server-test-{}", std::process::id()));
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
        injected
            .contains("<script type=\"module\" src=\"/__zerolith/client.js\"></script>\n</head>")
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
    use super::super::app;
    use super::super::live::log_changes;
    use super::super::paths::{Mapped, map_base};
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
        let root = std::env::temp_dir().join(format!("zerolith-host-test-{}", std::process::id()));
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
            lines[0]
                .contains(r#""path":"/src/broken.ts","level":"error","message":"src/broken.ts:\n"#),
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
        let root = std::env::temp_dir().join(format!("zerolith-proxy-test-{}", std::process::id()));
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
