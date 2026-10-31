//! The zerolith Agent Skill for coding agents: the repository's `skills/zerolith`, built into the command line so the copy it writes into a project describes this version.

use std::fs;
use std::io;
use std::path::Path;

use crate::term;

/// The skill's files, by their path inside the skill's folder; `npm run skills` keeps `templates/skill` equal to the repository's `skills/zerolith`.
pub const FILES: [(&str, &str); 22] = [
    ("SKILL.md", include_str!("../templates/skill/SKILL.md")),
    (
        "references/accessibility.md",
        include_str!("../templates/skill/references/accessibility.md"),
    ),
    (
        "references/agents.md",
        include_str!("../templates/skill/references/agents.md"),
    ),
    (
        "references/client.md",
        include_str!("../templates/skill/references/client.md"),
    ),
    (
        "references/command-line.md",
        include_str!("../templates/skill/references/command-line.md"),
    ),
    (
        "references/deploying.md",
        include_str!("../templates/skill/references/deploying.md"),
    ),
    (
        "references/dev-tools.md",
        include_str!("../templates/skill/references/dev-tools.md"),
    ),
    (
        "references/diagnostic-codes.md",
        include_str!("../templates/skill/references/diagnostic-codes.md"),
    ),
    (
        "references/diagnostics.md",
        include_str!("../templates/skill/references/diagnostics.md"),
    ),
    (
        "references/elements.md",
        include_str!("../templates/skill/references/elements.md"),
    ),
    (
        "references/forms.md",
        include_str!("../templates/skill/references/forms.md"),
    ),
    (
        "references/i18n.md",
        include_str!("../templates/skill/references/i18n.md"),
    ),
    (
        "references/introduction.md",
        include_str!("../templates/skill/references/introduction.md"),
    ),
    (
        "references/observability.md",
        include_str!("../templates/skill/references/observability.md"),
    ),
    (
        "references/routing.md",
        include_str!("../templates/skill/references/routing.md"),
    ),
    (
        "references/server-rendering.md",
        include_str!("../templates/skill/references/server-rendering.md"),
    ),
    (
        "references/signals.md",
        include_str!("../templates/skill/references/signals.md"),
    ),
    (
        "references/structure.md",
        include_str!("../templates/skill/references/structure.md"),
    ),
    (
        "references/styles.md",
        include_str!("../templates/skill/references/styles.md"),
    ),
    (
        "references/templates.md",
        include_str!("../templates/skill/references/templates.md"),
    ),
    (
        "references/testing.md",
        include_str!("../templates/skill/references/testing.md"),
    ),
    (
        "references/vite.md",
        include_str!("../templates/skill/references/vite.md"),
    ),
];

/// Where agents look for a project's skills: `.agents/skills`, which Codex, Cursor, GitHub Copilot, Gemini CLI, and most other agents read, and `.claude/skills`, which Claude Code reads.
pub const FOLDERS: [&str; 2] = [".agents/skills/zerolith", ".claude/skills/zerolith"];

/// The front matter key that records the version of zerolith a written copy describes.
const VERSION_KEY: &str = "  zerolith: ";

/// `SKILL.md` with this version recorded in its front matter, under `metadata`.
fn skill_md(source: &str) -> String {
    let version = format!(
        "metadata:\n{VERSION_KEY}\"{}\"\n",
        env!("CARGO_PKG_VERSION")
    );
    match source.get(4..).and_then(|rest| rest.find("\n---\n")) {
        Some(end) if source.starts_with("---\n") => {
            let close = 4 + end + 1;
            format!("{}{version}{}", &source[..close], &source[close..])
        }
        _ => source.to_string(),
    }
}

/// The version of zerolith a written `SKILL.md` describes, or none for a copy that records none, as one installed from the repository.
pub fn version_of(skill: &str) -> Option<&str> {
    let front = skill.strip_prefix("---\n")?;
    let front = &front[..front.find("\n---\n")?];
    let line = front.lines().find(|line| line.starts_with(VERSION_KEY))?;
    Some(line[VERSION_KEY.len()..].trim().trim_matches('"'))
}

/// Writes the skill into each of `FOLDERS` under `root`, replacing an earlier copy there.
pub fn write(root: &Path) -> io::Result<()> {
    for folder in FOLDERS {
        let target = root.join(folder);
        if target.exists() {
            fs::remove_dir_all(&target)?;
        }
        for (path, content) in FILES {
            let file = target.join(path);
            if let Some(parent) = file.parent() {
                fs::create_dir_all(parent)?;
            }
            if path == "SKILL.md" {
                fs::write(file, skill_md(content))?;
            } else {
                fs::write(file, content)?;
            }
        }
    }
    Ok(())
}

/// Runs the `skill` command: writes the skill into the project at `root`.
pub fn run(root: &Path) -> io::Result<()> {
    anstream::println!(
        "{}",
        term::heading("skill", "the zerolith skill for coding agents")
    );
    if !root.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!(
                "{} is not a folder; run the command in the project, or pass its folder",
                root.display()
            ),
        ));
    }
    write(root)?;
    for folder in FOLDERS {
        anstream::println!("{}", term::row("wrote", term::done, folder));
    }
    anstream::println!(
        "\n  Agents read the skill when a task involves zerolith; start a new session in an agent that was already running. Commit the folders so everyone's agents get it, and run this command again after upgrading zerolith.\n"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{FILES, FOLDERS, skill_md, version_of, write};
    use std::fs;
    use std::path::{Path, PathBuf};

    /// The files under `folder`, as paths relative to `prefix` with forward slashes.
    fn files_under(folder: &Path, prefix: &str, found: &mut Vec<String>) {
        for entry in fs::read_dir(folder).unwrap() {
            let entry = entry.unwrap();
            let name = format!("{prefix}{}", entry.file_name().to_string_lossy());
            if entry.path().is_dir() {
                files_under(&entry.path(), &format!("{name}/"), found);
            } else {
                found.push(name);
            }
        }
    }

    #[test]
    fn builds_in_every_file_of_the_skill() {
        let mut found = Vec::new();
        files_under(
            &Path::new(env!("CARGO_MANIFEST_DIR")).join("templates/skill"),
            "",
            &mut found,
        );
        found.sort();
        let mut listed: Vec<String> = FILES.iter().map(|(path, _)| (*path).to_string()).collect();
        listed.sort();
        assert_eq!(listed, found);
    }

    #[test]
    fn records_the_version_in_the_front_matter() {
        let written = skill_md(FILES[0].1);
        assert!(written.starts_with("---\nname: zerolith\n"), "{written}");
        assert_eq!(version_of(&written), Some(env!("CARGO_PKG_VERSION")));
        assert_eq!(version_of(FILES[0].1), None);
        assert_eq!(skill_md("no front matter"), "no front matter");
    }

    #[test]
    fn writes_every_folder_and_replaces_an_earlier_copy() {
        let root: PathBuf =
            std::env::temp_dir().join(format!("zerolith-skill-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(".claude/skills/zerolith/references")).unwrap();
        fs::write(
            root.join(".claude/skills/zerolith/references/stale.md"),
            "old",
        )
        .unwrap();
        fs::create_dir_all(root.join(".claude/skills/other")).unwrap();
        write(&root).unwrap();
        for folder in FOLDERS {
            let skill = fs::read_to_string(root.join(folder).join("SKILL.md")).unwrap();
            assert_eq!(version_of(&skill), Some(env!("CARGO_PKG_VERSION")));
            for (path, content) in &FILES[1..] {
                assert_eq!(
                    &fs::read_to_string(root.join(folder).join(path)).unwrap(),
                    content
                );
            }
        }
        assert!(
            !root
                .join(".claude/skills/zerolith/references/stale.md")
                .exists()
        );
        assert!(root.join(".claude/skills/other").is_dir());
        let _ = fs::remove_dir_all(&root);
    }
}
