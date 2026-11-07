//! The tests of `zerolith new`: the files each choice writes, the text they
//! hold, and the questions.

use super::config::VITEST_CONFIG;
use super::docs::agents_md;
use super::files::{scaffold, starter_files};
use super::fullstack::FULLSTACK_FILES;
use super::manifest::{TOOL_VERSIONS, display_name, package_json, package_name};
use super::prompts::{ask, confirm, pick, settle_from};
use super::templates::FAVICON;
use super::{Answers, Choice, Start, Tool, settle};
use std::fs;
use std::io::{self, Cursor};
use std::path::{Path, PathBuf};

/// A guide of the repository, which the starter is held to, or none outside the repository, as in the published crate, which ships no guides.
fn guide(name: &str) -> Option<String> {
    let repository = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    if !repository.join("package.json").is_file() {
        return None;
    }
    Some(
        fs::read_to_string(repository.join("docs/guide").join(name))
            .expect("a guide the starter is held to"),
    )
}

#[test]
fn writes_the_agents_md_the_structure_guide_shows() {
    let Some(guide) = guide("structure.md") else {
        return;
    };
    let written = agents_md("my-app", Choice::DEFAULT);
    assert!(
        guide.contains(&format!("```markdown AGENTS.md\n{written}```")),
        "docs/guide/structure.md should show the AGENTS.md the default starter gets:
{written}"
    );
}

#[test]
fn writes_the_vitest_config_the_testing_guide_shows() {
    let Some(guide) = guide("testing.md") else {
        return;
    };
    assert!(
        guide.contains(&format!("```ts\n{VITEST_CONFIG}```")),
        "docs/guide/testing.md should show the vitest.config.ts the default starter gets:
{VITEST_CONFIG}"
    );
}

#[test]
fn writes_the_layout_the_structure_guide_shows() {
    let Some(guide) = guide("structure.md") else {
        return;
    };
    let tree = guide
        .split_once("```tree\n")
        .and_then(|(_, rest)| rest.split_once("```"))
        .map(|(tree, _)| tree)
        .expect("docs/guide/structure.md should draw the starter in a tree block");
    let mut shown: Vec<String> = Vec::new();
    let mut folders: Vec<String> = Vec::new();
    for line in tree.lines().skip(1).filter(|line| !line.trim().is_empty()) {
        let depth = (line.len() - line.trim_start().len()) / 4;
        let name = line.trim_start().split("  ").next().unwrap_or_default();
        folders.truncate(depth.saturating_sub(1));
        shown.push(format!("{}{name}", folders.concat()));
        if name.ends_with('/') {
            folders.push(name.to_string());
        }
    }
    let mut written: Vec<String> =
        starter_files("my-app", &display_name("my-app"), Choice::DEFAULT)
            .into_iter()
            .map(|(relative, _)| relative)
            .collect();
    written.extend(
        crate::skill::FOLDERS
            .iter()
            .map(|folder| format!("{folder}/SKILL.md")),
    );
    let collapsed: Vec<&String> = shown
        .iter()
        .filter(|path| {
            path.ends_with('/')
                && !shown
                    .iter()
                    .any(|other| other != *path && other.starts_with(path.as_str()))
        })
        .collect();
    for file in &written {
        assert!(
            shown.contains(file)
                || collapsed
                    .iter()
                    .any(|folder| file.starts_with(folder.as_str())),
            "docs/guide/structure.md should show {file}, which the default starter writes"
        );
    }
    for path in &shown {
        assert!(
            written.iter().any(
                |file| file == path || (path.ends_with('/') && file.starts_with(path.as_str()))
            ),
            "docs/guide/structure.md shows {path}, which the default starter does not write"
        );
    }
}

/// The files under `folder` as paths relative to `prefix`, leaving out build output and installed packages.
fn files_under(folder: &Path, prefix: &str, found: &mut Vec<String>) {
    for entry in fs::read_dir(folder).unwrap() {
        let entry = entry.unwrap();
        let name = entry.file_name().to_string_lossy().to_string();
        if entry.path().is_dir() {
            if !matches!(name.as_str(), "dist" | "node_modules") {
                files_under(&entry.path(), &format!("{prefix}{name}/"), found);
            }
        } else {
            found.push(format!("{prefix}{name}"));
        }
    }
}

#[test]
fn tells_yarn_to_install_into_node_modules() {
    assert_eq!(
        super::manager_settings("yarn"),
        Some((".yarnrc.yml", "nodeLinker: node-modules\n"))
    );
    assert_eq!(super::manager_settings("npm"), None);
    assert_eq!(super::manager_settings("pnpm"), None);
}

#[test]
fn writes_each_choice_with_the_name_and_pinned_versions() {
    let base = std::env::temp_dir().join(format!("zerolith-new-test-{}", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    let choices = [
        (
            "tsx-app",
            Choice::DEFAULT,
            "src/main.ts",
            "tsx",
            "zerolith dev",
        ),
        (
            "ts-app",
            Choice {
                jsx: false,
                ..Choice::DEFAULT
            },
            "src/main.ts",
            "ts",
            "zerolith dev",
        ),
        (
            "jsx-app",
            Choice {
                typescript: false,
                ..Choice::DEFAULT
            },
            "src/main.js",
            "jsx",
            "zerolith dev",
        ),
        (
            "js-app",
            Choice {
                typescript: false,
                jsx: false,
                devtools: false,
                ..Choice::DEFAULT
            },
            "src/main.js",
            "js",
            "zerolith dev",
        ),
        (
            "plain-app",
            Choice {
                tool: Tool::Unbundled,
                ..Choice::DEFAULT
            },
            "src/main.ts",
            "tsx",
            "zerolith dev",
        ),
        (
            "vite-app",
            Choice {
                tool: Tool::Vite,
                ..Choice::DEFAULT
            },
            "src/main.ts",
            "tsx",
            "vite",
        ),
    ];
    for (folder, choice, entry, component, develop) in choices {
        let root = base.join(folder);
        let files = scaffold(&root, folder, choice).unwrap();
        assert!(
            files.iter().any(|file| file == entry),
            "{folder} lacks {entry}"
        );
        let manifest = fs::read_to_string(root.join("package.json")).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&manifest).unwrap();
        assert_eq!(parsed["name"], folder);
        assert_eq!(parsed["scripts"]["dev"], develop);
        assert_eq!(
            parsed["scripts"]["build"]
                .as_str()
                .unwrap()
                .ends_with("--unbundled"),
            choice.tool == Tool::Unbundled
        );
        assert!(
            parsed["devDependencies"]["@zerolith/cli"].is_string()
                && parsed["devDependencies"]["@zerolith/test"].is_string()
        );
        assert_eq!(
            parsed["devDependencies"]["vite"].as_str(),
            Some(super::manifest::version_of("vite").as_str())
        );
        assert!(parsed["devDependencies"]["@zerolith/vite"].is_string());
        assert_eq!(
            parsed["dependencies"]["@zerolith/devtools"].is_string(),
            choice.devtools
        );
        assert!(!manifest.contains("latest"));
        assert!(
            crate::doctor::lint_sources(&root).is_empty(),
            "{folder} has template findings"
        );
        let html = fs::read_to_string(root.join("index.html")).unwrap();
        assert!(
            !html.contains("importmap") && html.contains(&format!("src=\"/{entry}\"")),
            "{html}"
        );
        assert_eq!(
            root.join("vite.config.ts").exists(),
            choice.tool == Tool::Vite
        );
        assert!(
            root.join("public/favicon.svg").is_file()
                && root.join("public/data/packages.json").is_file()
        );
        for page in ["layout", "home", "counter", "packages", "not-found"] {
            let source =
                fs::read_to_string(root.join(format!("src/components/{page}.{component}")))
                    .unwrap();
            assert!(
                !source.contains("__"),
                "{folder}/{page} keeps a placeholder: {source}"
            );
            assert_eq!(source.contains("html`"), !choice.jsx, "{folder}/{page}");
            assert_eq!(
                source.contains("): View"),
                choice.typescript,
                "{folder}/{page}"
            );
        }
        let main = fs::read_to_string(root.join(entry)).unwrap();
        assert_eq!(main.contains("mountDevtools"), choice.devtools);
        let readme = fs::read_to_string(root.join("README.md")).unwrap();
        let (develop, _, preview) = super::docs::commands(choice.tool);
        assert!(
            readme.contains("## Deploy") && readme.contains(preview),
            "{readme}"
        );
        let home =
            fs::read_to_string(root.join(format!("src/components/home.{component}"))).unwrap();
        assert!(home.contains(&format!("<code>{develop}</code>")), "{home}");
        let agents = fs::read_to_string(root.join("AGENTS.md")).unwrap();
        assert!(agents.contains(&format!("# {folder}: guide for coding agents")));
        assert!(agents.contains("--out src/api.ts"), "{agents}");
        assert_eq!(
            agents.contains("zerolith-i18n messages --out src/messages --js"),
            !choice.typescript,
            "{agents}"
        );
    }
    assert!(scaffold(&base.join("tsx-app"), "tsx-app", Choice::DEFAULT).is_err());
    let _ = fs::remove_dir_all(&base);
}

#[test]
fn writes_the_fullstack_example_as_a_project_of_its_own() {
    let root = std::env::temp_dir().join(format!("zerolith-new-fullstack-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    let mut files = scaffold(&root, "My Harbor", Choice::FULLSTACK).unwrap();
    files.sort();
    let mut found = Vec::new();
    files_under(&root, "", &mut found);
    found.sort();
    assert_eq!(files, found);
    assert_eq!(
        files,
        [
            ".gitignore",
            ".oxlintrc.json",
            "AGENTS.md",
            "README.md",
            "index.html",
            "package.json",
            "server/api.ts",
            "server/app.ts",
            "server/data.ts",
            "server/events.ts",
            "server/main.ts",
            "server/node.ts",
            "server/static.ts",
            "shared/api.ts",
            "shared/model.ts",
            "shared/schema.ts",
            "src/components/dashboard.ts",
            "src/components/not-found.ts",
            "src/components/project.css",
            "src/components/project.ts",
            "src/components/projects.ts",
            "src/components/shell.ts",
            "src/components/sign-in.ts",
            "src/components/ui.ts",
            "src/env.d.ts",
            "src/locale.ts",
            "src/main.ts",
            "src/router.ts",
            "src/routes.ts",
            "src/store.ts",
            "src/styles.css",
            "test/app.browser.test.ts",
            "test/server.test.ts",
            "tsconfig.json",
            "vitest.config.ts",
            "zerolith.json",
        ]
    );
    for (relative, content) in FULLSTACK_FILES {
        assert_eq!(
            fs::read_to_string(root.join(relative)).unwrap(),
            content,
            "{relative}"
        );
    }

    let manifest: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(root.join("package.json")).unwrap()).unwrap();
    assert_eq!(manifest["name"], "my-harbor");
    let scripts = manifest["scripts"].as_object().unwrap();
    let mut names: Vec<&str> = scripts.keys().map(String::as_str).collect();
    names.sort_unstable();
    assert_eq!(
        names,
        [
            "api",
            "build",
            "check",
            "dev",
            "lint",
            "start",
            "test",
            "typecheck"
        ]
    );
    assert_eq!(scripts["dev"], "zerolith dev");
    assert_eq!(scripts["api"], "node --watch server/main.ts");
    assert_eq!(scripts["build"], "zerolith build");
    assert_eq!(scripts["start"], "node server/main.ts --production");
    let starter: serde_json::Value =
        serde_json::from_str(&package_json("starter", Choice::DEFAULT)).unwrap();
    for script in ["check", "typecheck", "lint", "test"] {
        assert_eq!(scripts[script], starter["scripts"][script], "{script}");
    }

    let framework = env!("CARGO_PKG_VERSION");
    let versions: serde_json::Value = serde_json::from_str(TOOL_VERSIONS).unwrap();
    let pinned = |list: &str| -> Vec<(String, String)> {
        let mut pinned: Vec<(String, String)> = manifest[list]
            .as_object()
            .unwrap()
            .iter()
            .map(|(name, version)| (name.clone(), version.as_str().unwrap().to_string()))
            .collect();
        pinned.sort();
        pinned
    };
    assert_eq!(
        pinned("dependencies"),
        [
            ("@zerolith/a11y".to_string(), framework.to_string()),
            ("@zerolith/client".to_string(), framework.to_string()),
            ("@zerolith/devtools".to_string(), framework.to_string()),
            ("@zerolith/forms".to_string(), framework.to_string()),
            ("@zerolith/i18n".to_string(), framework.to_string()),
            ("@zerolith/router".to_string(), framework.to_string()),
            ("zerolith".to_string(), framework.to_string()),
        ]
    );
    let dev = pinned("devDependencies");
    assert_eq!(
        dev.iter()
            .map(|(name, _)| name.as_str())
            .collect::<Vec<_>>(),
        [
            "@types/node",
            "@vitest/browser-playwright",
            "@zerolith/cli",
            "@zerolith/test",
            "@zerolith/vite",
            "oxlint",
            "playwright",
            "typescript",
            "vite",
            "vitest",
        ]
    );
    for (name, version) in &dev {
        let expected = if name.starts_with("@zerolith/") {
            framework
        } else {
            versions[name].as_str().unwrap()
        };
        assert_eq!(version, expected, "{name}");
    }

    let config = crate::config::Config::load(&root).unwrap();
    assert_eq!(config.base.as_deref(), Some("/app/"));
    let rules = config.proxy_rules(&[]).unwrap();
    assert_eq!(
        (rules[0].prefix.as_str(), rules[0].target.port),
        ("/api", 3001)
    );
    let tsconfig = fs::read_to_string(root.join("tsconfig.json")).unwrap();
    assert!(
        tsconfig.contains("\"types\": [\"node\"]")
            && tsconfig.contains(
                "\"include\": [\"server\", \"shared\", \"src\", \"test\", \"vitest.config.ts\"]"
            ),
        "{tsconfig}"
    );
    assert!(crate::doctor::lint_sources(&root).is_empty());
    for relative in &files {
        let text = fs::read_to_string(root.join(relative)).unwrap();
        assert!(
            !text.contains("../../packages")
                && !text.contains("../../scripts")
                && !text.contains("examples/fullstack")
                && !text.contains("scripts/zerolith")
                && !text.contains("npm run fullstack")
                && !text.contains("__"),
            "{relative} refers to the repository or keeps a placeholder"
        );
    }
    let readme = fs::read_to_string(root.join("README.md")).unwrap();
    assert!(readme.starts_with("# My Harbor\n"));
    for section in ["## Develop", "## Build", "## Run the build", "## Deploy"] {
        assert!(readme.contains(section), "README.md lacks {section}");
    }
    assert!(readme.contains("npm run api") && readme.contains("npm run dev"));
    let agents = fs::read_to_string(root.join("AGENTS.md")).unwrap();
    assert!(agents.starts_with("# My Harbor: guide for coding agents\n"));
    assert!(agents.contains("runs both") && agents.contains("--no-backends"));
    assert!(scaffold(&root, "My Harbor", Choice::FULLSTACK).is_err());
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn the_fullstack_copy_matches_the_example() {
    let example = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/fullstack");
    if !example.is_dir() {
        return;
    }
    let adaptations = [
        (
            "zerolith.json",
            "\"../../packages/cli/zerolith.schema.json\"",
            "\"./node_modules/@zerolith/cli/zerolith.schema.json\"",
        ),
        (
            "zerolith.json",
            "\"npm run fullstack:api\"",
            "\"npm run api\"",
        ),
    ];
    let mut found = Vec::new();
    files_under(&example, "", &mut found);
    found.retain(|relative| {
        relative != "README.md"
            && relative != "test/fullstack.cli.test.ts"
            && !relative.starts_with("dist/")
            && !relative.starts_with("node_modules/")
    });
    found.sort();
    let mut copied: Vec<&str> = FULLSTACK_FILES
        .iter()
        .map(|(relative, _)| *relative)
        .collect();
    copied.sort();
    assert_eq!(
        found, copied,
        "examples/fullstack and its copy in templates/examples/fullstack hold different files"
    );
    for (relative, copy) in FULLSTACK_FILES {
        let mut source = fs::read_to_string(example.join(relative)).unwrap();
        for (file, from, to) in adaptations {
            if file == relative {
                assert!(
                    source.contains(from),
                    "examples/fullstack/{file} no longer has {from}"
                );
                source = source.replace(from, to);
            }
        }
        assert_eq!(
            copy, source,
            "templates/examples/fullstack/{relative} drifted from examples/fullstack/{relative}"
        );
    }
}

#[test]
fn writes_the_skill_unless_told_not_to_and_points_agents_md_at_it() {
    let base = std::env::temp_dir().join(format!("zerolith-new-skill-{}", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    for start in [Start::Starter, Start::Fullstack] {
        let choice = if start == Start::Fullstack {
            Choice::FULLSTACK
        } else {
            Choice::DEFAULT
        };
        let with = base.join(format!("{start:?}-with"));
        super::run(&with, choice, false).unwrap();
        for folder in crate::skill::FOLDERS {
            let skill = fs::read_to_string(with.join(folder).join("SKILL.md")).unwrap();
            assert_eq!(
                crate::skill::version_of(&skill),
                Some(env!("CARGO_PKG_VERSION"))
            );
        }
        let agents = fs::read_to_string(with.join("AGENTS.md")).unwrap();
        assert!(agents.contains("in the zerolith skill in `.agents/skills/zerolith/`, also at `.claude/skills/zerolith/` for Claude Code"), "{agents}");
        let without = base.join(format!("{start:?}-without"));
        super::run(
            &without,
            Choice {
                skill: false,
                ..choice
            },
            false,
        )
        .unwrap();
        assert!(!without.join(".agents").exists() && !without.join(".claude").exists());
        let agents = fs::read_to_string(without.join("AGENTS.md")).unwrap();
        assert!(
            agents.contains("which `npx zerolith skill` adds to the project"),
            "{agents}"
        );
    }
    let _ = fs::remove_dir_all(&base);
}

#[test]
fn settles_flags_and_defaults_without_asking() {
    let (root, choice, install) = settle(
        Answers {
            template: Some("js".to_string()),
            tool: Some(Tool::Vite),
            devtools: Some(false),
            install: Some(false),
            ..Answers::default()
        },
        false,
    )
    .unwrap();
    assert_eq!(root, PathBuf::from("zerolith-app"));
    assert_eq!(
        choice,
        Choice {
            start: Start::Starter,
            tool: Tool::Vite,
            typescript: false,
            jsx: false,
            devtools: false,
            skill: true
        }
    );
    assert!(!install);
    let (_, defaults, install) = settle(Answers::default(), false).unwrap();
    assert_eq!(defaults, Choice::DEFAULT);
    assert!(install);
}

#[test]
fn keeps_the_starter_under_yes_and_asks_for_the_starting_point_first() {
    let (_, choice, _) = settle(
        Answers {
            install: Some(false),
            ..Answers::default()
        },
        false,
    )
    .unwrap();
    assert_eq!(choice.start, Start::Starter);
    let mut input = Cursor::new("2\nnotes\n\nn\n");
    assert_eq!(
        settle_from(&mut input, Answers::default(), true).unwrap(),
        (PathBuf::from("notes"), Choice::FULLSTACK, false)
    );
    let mut input = Cursor::new("\n\n\n\n\n\n\n");
    assert_eq!(
        settle_from(&mut input, Answers::default(), true).unwrap(),
        (PathBuf::from("zerolith-app"), Choice::DEFAULT, true)
    );
    let mut input = Cursor::new("2\n\n\n\n");
    let (_, choice, _) = settle_from(
        &mut input,
        Answers {
            root: Some(PathBuf::from("site")),
            template: Some("ts".to_string()),
            ..Answers::default()
        },
        true,
    )
    .unwrap();
    assert_eq!(
        (choice.start, choice.tool, choice.jsx),
        (Start::Starter, Tool::Vite, false)
    );
}

#[test]
fn takes_the_example_with_its_own_settings_and_refuses_starter_flags() {
    let (_, choice, install) = settle(
        Answers {
            start: Some(Start::Fullstack),
            ..Answers::default()
        },
        false,
    )
    .unwrap();
    assert_eq!(choice, Choice::FULLSTACK);
    let refused = settle(
        Answers {
            start: Some(Start::Fullstack),
            devtools: Some(false),
            ..Answers::default()
        },
        false,
    )
    .unwrap_err()
    .to_string();
    assert!(
        refused.contains("takes no --no-devtools, since"),
        "{refused}"
    );
    assert!(install);
    assert_eq!(Start::example("fullstack"), Some(Start::Fullstack));
    assert_eq!(Start::example("starter"), None);
    for (template, tool, named) in [
        (Some("ts"), None, "takes no --template ts, since"),
        (None, Some(Tool::Vite), "takes no --vite, since"),
        (None, Some(Tool::Unbundled), "takes no --buildless, since"),
        (
            Some("js"),
            Some(Tool::Vite),
            "takes no --template js or --vite, since",
        ),
    ] {
        let error = settle(
            Answers {
                start: Some(Start::Fullstack),
                template: template.map(str::to_string),
                tool,
                ..Answers::default()
            },
            false,
        )
        .unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::InvalidInput);
        let message = error.to_string();
        assert!(
            message.contains(named) && message.contains("TypeScript on the zerolith command line"),
            "{message}"
        );
    }
}

#[test]
fn asks_until_an_answer_is_valid_and_takes_defaults_on_enter() {
    let mut input = Cursor::new("9\n2\n\nn\nmy-site\n");
    assert_eq!(pick(&mut input, "Language", &["a", "b", "c"]).unwrap(), 1);
    assert!(confirm(&mut input, "Install").unwrap());
    assert!(!confirm(&mut input, "Inspector").unwrap());
    assert_eq!(
        ask(&mut input, "Folder", "zerolith-app").unwrap(),
        "my-site"
    );
    assert_eq!(
        ask(&mut input, "Folder", "zerolith-app").unwrap(),
        "zerolith-app"
    );
}

#[test]
fn makes_any_folder_name_a_package_name() {
    assert_eq!(package_name("My App"), "my-app");
    assert_eq!(package_name("--"), "app");
    assert_eq!(package_name("site.v2"), "site.v2");
}

#[test]
fn tool_versions_and_the_favicon_match_their_sources() {
    let repository = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let Ok(source) = fs::read_to_string(repository.join("package.json")) else {
        return;
    };
    let manifest: serde_json::Value = serde_json::from_str(&source).unwrap();
    let versions: serde_json::Value = serde_json::from_str(TOOL_VERSIONS).unwrap();
    for (name, version) in versions.as_object().unwrap() {
        assert_eq!(
            &manifest["devDependencies"][name], version,
            "{name} drifted"
        );
    }
    assert_eq!(
        fs::read_to_string(repository.join("LICENSE")).unwrap(),
        fs::read_to_string(repository.join("crates/zerolith/LICENSE")).unwrap(),
        "crates/zerolith/LICENSE drifted from the repository's LICENSE"
    );
    let favicon = fs::read_to_string(repository.join("brand/app-icon/favicon.svg")).unwrap();
    assert_eq!(
        FAVICON, favicon,
        "templates/favicon.svg drifted from brand/app-icon/favicon.svg"
    );
}
