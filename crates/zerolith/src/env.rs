//! The values a project gives its modules through `import.meta.env`, read
//! the same way by `zerolith dev` and `zerolith build`. `MODE`, `DEV`,
//! `PROD`, and `BASE_URL` come from the command; anything else comes from
//! the `.env` files and the environment, and only under the `PUBLIC_`
//! prefix, so a server secret in the same file never reaches the browser.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

/// The prefix a variable needs to reach the browser.
pub const PREFIX: &str = "PUBLIC_";

/// Reads one `.env` file: `KEY=value` lines, with `#` comments, an optional `export`, and optional quotes.
fn parse(text: &str, into: &mut BTreeMap<String, String>) {
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.strip_prefix("export ").unwrap_or(line);
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        let value = value.trim();
        let value = if value.len() >= 2
            && ((value.starts_with('"') && value.ends_with('"'))
                || (value.starts_with('\'') && value.ends_with('\'')))
        {
            value[1..value.len() - 1].to_string()
        } else {
            value
                .split_once(" #")
                .map_or(value, |(before, _)| before)
                .trim_end()
                .to_string()
        };
        into.insert(key.to_string(), value);
    }
}

/// The `PUBLIC_` variables for a mode: `.env`, `.env.local`, `.env.<mode>`, and `.env.<mode>.local` in the project folder, each overriding the one before, and the process environment over all of them.
pub fn variables(root: &Path, mode: &str) -> BTreeMap<String, String> {
    let mut found = BTreeMap::new();
    for name in [
        ".env".to_string(),
        ".env.local".to_string(),
        format!(".env.{mode}"),
        format!(".env.{mode}.local"),
    ] {
        if let Ok(text) = fs::read_to_string(root.join(name)) {
            parse(&text, &mut found);
        }
    }
    for (key, value) in std::env::vars() {
        if key.starts_with(PREFIX) {
            found.insert(key, value);
        }
    }
    found.retain(|key, _| key.starts_with(PREFIX));
    found
}

/// The whole `import.meta.env` object: the command's values and the project's variables.
pub fn object(mode: &str, base: &str, variables: &BTreeMap<String, String>) -> serde_json::Value {
    let production = mode == "production";
    let mut env = serde_json::Map::new();
    env.insert("MODE".to_string(), mode.into());
    env.insert("DEV".to_string(), (!production).into());
    env.insert("PROD".to_string(), production.into());
    env.insert("BASE_URL".to_string(), base.into());
    for (key, value) in variables {
        env.insert(key.clone(), value.clone().into());
    }
    serde_json::Value::Object(env)
}

#[cfg(test)]
mod tests {
    use super::{object, variables};
    use std::fs;

    #[test]
    fn reads_prefixed_variables_with_later_files_winning() {
        let root = std::env::temp_dir().join(format!("zerolith-env-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join(".env"),
            "# shared\nPUBLIC_API=https://api.example\nSECRET=hidden\nexport PUBLIC_TITLE=\"Notes # one\"\nPUBLIC_EMPTY=\n",
        )
        .unwrap();
        fs::write(
            root.join(".env.staging"),
            "PUBLIC_API=https://staging.example # comment\n",
        )
        .unwrap();
        fs::write(root.join(".env.staging.local"), "PUBLIC_FLAG='on'\n").unwrap();
        let found = variables(&root, "staging");
        assert_eq!(
            found.get("PUBLIC_API").map(String::as_str),
            Some("https://staging.example")
        );
        assert_eq!(
            found.get("PUBLIC_TITLE").map(String::as_str),
            Some("Notes # one")
        );
        assert_eq!(found.get("PUBLIC_FLAG").map(String::as_str), Some("on"));
        assert_eq!(found.get("PUBLIC_EMPTY").map(String::as_str), Some(""));
        assert!(!found.contains_key("SECRET"));
        let env = object("staging", "/app/", &found);
        assert_eq!(env["MODE"], "staging");
        assert_eq!(env["DEV"], true);
        assert_eq!(env["PROD"], false);
        assert_eq!(env["BASE_URL"], "/app/");
        assert_eq!(env["PUBLIC_FLAG"], "on");
        let _ = fs::remove_dir_all(&root);
    }
}
