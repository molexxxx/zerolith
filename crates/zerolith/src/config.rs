//! The project's `zerolith.json`: the settings `dev`, `serve`, `build`, and
//! `preview` share, written once instead of on every command line. A flag
//! given on the command line overrides the file, and a project without the
//! file uses the defaults.

use std::collections::BTreeMap;
use std::io;
use std::path::{Path, PathBuf};

use serde::Deserialize;

/// The file's name, in the project folder.
pub const FILE: &str = "zerolith.json";

/// The contents of `zerolith.json`.
#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    /// The JSON schema an editor validates the file against; ignored here.
    #[serde(rename = "$schema")]
    pub _schema: Option<String>,
    /// The public path the application is served under, for `dev`, `build`, and `preview` alike.
    pub base: Option<String>,
    /// Paths `dev`, `serve`, and `preview` forward to a backend, by the path prefix they start with.
    #[serde(default)]
    pub proxy: BTreeMap<String, ProxyEntry>,
    #[serde(default)]
    pub dev: ServerSection,
    #[serde(default)]
    pub preview: ServerSection,
    #[serde(default)]
    pub build: BuildSection,
}

/// Settings of a server command.
#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ServerSection {
    pub port: Option<u16>,
}

/// Settings of `build`.
#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BuildSection {
    /// The output folder, relative to the project unless absolute.
    pub out: Option<PathBuf>,
}

/// One proxy entry: the backend's address, or an object with options.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum ProxyEntry {
    Target(String),
    Detailed(DetailedProxy),
}

/// A proxy entry with options.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DetailedProxy {
    pub target: String,
    /// Remove the matched prefix before forwarding, so `/api/notes` reaches the backend as `/notes`.
    #[serde(default)]
    pub strip_prefix: bool,
}

impl Config {
    /// Reads `zerolith.json` from the project folder, or the defaults when there is none.
    pub fn load(root: &Path) -> io::Result<Config> {
        let path = root.join(FILE);
        let text = match std::fs::read_to_string(&path) {
            Ok(text) => text,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Config::default()),
            Err(error) => return Err(error),
        };
        serde_json::from_str(&text).map_err(|error| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!("{}: {error}", path.display()),
            )
        })
    }

    /// The proxy rules: the file's entries with the command line's `--proxy` values over them, longest prefix first.
    pub fn proxy_rules(&self, flags: &[String]) -> io::Result<Vec<ProxyRule>> {
        let mut entries: BTreeMap<String, (String, bool)> = self
            .proxy
            .iter()
            .map(|(prefix, entry)| {
                let value = match entry {
                    ProxyEntry::Target(target) => (target.clone(), false),
                    ProxyEntry::Detailed(detailed) => {
                        (detailed.target.clone(), detailed.strip_prefix)
                    }
                };
                (prefix.clone(), value)
            })
            .collect();
        for flag in flags {
            let Some((prefix, target)) = flag.split_once('=') else {
                return Err(invalid(format!(
                    "--proxy {flag}: expected a path and an address, such as --proxy /api=http://127.0.0.1:3000"
                )));
            };
            entries.insert(prefix.to_string(), (target.to_string(), false));
        }
        let mut rules = entries
            .into_iter()
            .map(|(prefix, (target, strip_prefix))| ProxyRule::new(&prefix, &target, strip_prefix))
            .collect::<io::Result<Vec<_>>>()?;
        rules.sort_by_key(|rule| std::cmp::Reverse(rule.prefix.len()));
        Ok(rules)
    }
}

fn invalid(message: String) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}

/// Where a proxy rule sends requests.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Target {
    pub host: String,
    pub port: u16,
    /// The address's path without a trailing slash, empty for the root.
    pub path: String,
}

impl Target {
    /// The host and port as the `Host` header names them.
    pub fn authority(&self) -> String {
        if self.host.contains(':') {
            format!("[{}]:{}", self.host, self.port)
        } else {
            format!("{}:{}", self.host, self.port)
        }
    }

    /// The origin, as a `Location` header from the backend would start.
    pub fn origin(&self) -> String {
        format!("http://{}", self.authority())
    }
}

/// One path prefix forwarded to a backend.
#[derive(Clone, Debug)]
pub struct ProxyRule {
    /// Starts with `/`; a request matches it at a segment boundary.
    pub prefix: String,
    pub target: Target,
    pub strip_prefix: bool,
}

impl ProxyRule {
    /// Checks a prefix and parses an `http://host:port/path` address.
    pub fn new(prefix: &str, target: &str, strip_prefix: bool) -> io::Result<ProxyRule> {
        if !prefix.starts_with('/') {
            return Err(invalid(format!(
                "proxy {prefix}: the path must start with /, such as /api"
            )));
        }
        let rest = if let Some(rest) = target.strip_prefix("http://") {
            rest
        } else if target.starts_with("https://") {
            return Err(invalid(format!(
                "proxy {prefix}: {target} is an https address, which the proxy does not support yet; forward to the backend's http address, such as http://127.0.0.1:3000"
            )));
        } else {
            return Err(invalid(format!(
                "proxy {prefix}: {target} is not an http address, such as http://127.0.0.1:3000"
            )));
        };
        let (authority, path) = match rest.find('/') {
            Some(index) => (&rest[..index], rest[index..].trim_end_matches('/')),
            None => (rest, ""),
        };
        let (host, port_text) = match authority.strip_prefix('[') {
            Some(bracketed) => match bracketed.split_once(']') {
                Some((host, rest)) => (host, rest.strip_prefix(':')),
                None => (bracketed, None),
            },
            None => match authority.rsplit_once(':') {
                Some((host, port)) => (host, Some(port)),
                None => (authority, None),
            },
        };
        let port = match port_text {
            Some(text) => text
                .parse::<u16>()
                .map_err(|_| invalid(format!("proxy {prefix}: {target} has an invalid port")))?,
            None => 80,
        };
        if host.is_empty() {
            return Err(invalid(format!("proxy {prefix}: {target} names no host")));
        }
        let prefix = if prefix.len() > 1 {
            prefix.trim_end_matches('/')
        } else {
            prefix
        };
        Ok(ProxyRule {
            prefix: prefix.to_string(),
            target: Target {
                host: host.to_string(),
                port,
                path: path.to_string(),
            },
            strip_prefix,
        })
    }

    /// True when a request path falls under this rule's prefix.
    pub fn matches(&self, path: &str) -> bool {
        self.prefix == "/"
            || path == self.prefix
            || path
                .strip_prefix(self.prefix.as_str())
                .is_some_and(|rest| rest.starts_with('/'))
    }

    /// The path and query the backend receives for a request.
    pub fn forwarded(&self, path: &str, query: Option<&str>) -> String {
        let kept = if self.strip_prefix && self.prefix != "/" {
            path.strip_prefix(self.prefix.as_str()).unwrap_or(path)
        } else {
            path
        };
        let kept = if kept.is_empty() { "/" } else { kept };
        let mut forwarded = format!("{}{kept}", self.target.path);
        if let Some(query) = query {
            forwarded.push('?');
            forwarded.push_str(query);
        }
        forwarded
    }
}

#[cfg(test)]
mod tests {
    use super::{Config, ProxyRule};
    use std::fs;

    #[test]
    fn reads_the_file_and_lets_flags_override_it() {
        let root =
            std::env::temp_dir().join(format!("zerolith-config-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        assert!(Config::load(&root).unwrap().proxy.is_empty());
        fs::write(
            root.join("zerolith.json"),
            r#"{
                "$schema": "./node_modules/@zerolith/cli/zerolith.schema.json",
                "base": "/app/",
                "proxy": {
                    "/api": "http://127.0.0.1:3000",
                    "/auth": { "target": "http://localhost:4000/v1/", "stripPrefix": true }
                },
                "dev": { "port": 5000 },
                "build": { "out": "../server/public" }
            }"#,
        )
        .unwrap();
        let config = Config::load(&root).unwrap();
        assert_eq!(config.base.as_deref(), Some("/app/"));
        assert_eq!(config.dev.port, Some(5000));
        let rules = config
            .proxy_rules(&[
                "/api=http://127.0.0.1:3999".to_string(),
                "/api/v2=http://[::1]:5000".to_string(),
            ])
            .unwrap();
        let shown: Vec<(String, String, u16, String, bool)> = rules
            .iter()
            .map(|rule| {
                (
                    rule.prefix.clone(),
                    rule.target.host.clone(),
                    rule.target.port,
                    rule.target.path.clone(),
                    rule.strip_prefix,
                )
            })
            .collect();
        assert_eq!(
            shown,
            vec![
                ("/api/v2".into(), "::1".into(), 5000, "".into(), false),
                ("/auth".into(), "localhost".into(), 4000, "/v1".into(), true),
                ("/api".into(), "127.0.0.1".into(), 3999, "".into(), false),
            ]
        );
        fs::write(root.join("zerolith.json"), r#"{ "proxi": {} }"#).unwrap();
        let error = Config::load(&root).unwrap_err().to_string();
        assert!(
            error.contains("zerolith.json") && error.contains("proxi"),
            "{error}"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn the_schema_the_parser_and_the_starter_agree() {
        let starter: Config = serde_json::from_str(crate::new::PROJECT_CONFIG).unwrap();
        assert!(starter.proxy.is_empty());
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../packages/cli/zerolith.schema.json"
        );
        let Ok(text) = fs::read_to_string(path) else {
            return;
        };
        let schema: serde_json::Value = serde_json::from_str(&text).unwrap();
        let keys = |value: &serde_json::Value| -> Vec<String> {
            let mut keys: Vec<String> = value["properties"]
                .as_object()
                .unwrap()
                .keys()
                .cloned()
                .collect();
            keys.sort();
            keys
        };
        assert_eq!(
            keys(&schema),
            ["$schema", "base", "build", "dev", "preview", "proxy"]
        );
        assert_eq!(keys(&schema["properties"]["dev"]), ["port"]);
        assert_eq!(keys(&schema["properties"]["preview"]), ["port"]);
        assert_eq!(keys(&schema["properties"]["build"]), ["out"]);
        let detailed = &schema["properties"]["proxy"]["additionalProperties"]["oneOf"][1];
        assert_eq!(keys(detailed), ["stripPrefix", "target"]);
        let everything = r#"{ "$schema": "x", "base": "/", "proxy": { "/a": "http://h:1", "/b": { "target": "http://h:2", "stripPrefix": true } }, "dev": { "port": 1 }, "preview": { "port": 2 }, "build": { "out": "dist" } }"#;
        serde_json::from_str::<Config>(everything).unwrap();
    }

    #[test]
    fn matches_whole_segments_and_forwards_the_path() {
        let rule = ProxyRule::new("/api", "http://127.0.0.1:3000", false).unwrap();
        assert!(rule.matches("/api"));
        assert!(rule.matches("/api/notes"));
        assert!(!rule.matches("/apiary"));
        assert_eq!(rule.forwarded("/api/notes", Some("q=1")), "/api/notes?q=1");
        let stripped = ProxyRule::new("/api/", "http://127.0.0.1:3000/v1", true).unwrap();
        assert_eq!(stripped.prefix, "/api");
        assert_eq!(stripped.forwarded("/api/notes", None), "/v1/notes");
        assert_eq!(stripped.forwarded("/api", None), "/v1/");
        assert!(ProxyRule::new("api", "http://127.0.0.1:3000", false).is_err());
        let https = ProxyRule::new("/api", "https://api.example.com", false).unwrap_err();
        assert!(https.to_string().contains("https"));
        assert_eq!(
            ProxyRule::new("/x", "http://backend", false)
                .unwrap()
                .target
                .port,
            80
        );
    }
}
