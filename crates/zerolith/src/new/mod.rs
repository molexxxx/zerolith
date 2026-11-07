//! `zerolith new`: writes a starter application in the brand style, with
//! the layout the structure guide describes, three pages that show the
//! patterns a project grows from, a browser test, a README that walks
//! through developing, building, previewing, and deploying, and an
//! AGENTS.md, then installs its dependencies. It asks for what the flags
//! leave open, with a default for every question: the starter, TSX on the
//! command line, the inspector included, and the dependencies installed.
//! `--example fullstack` writes the fullstack example instead, an app with
//! its own Node backend, as a project of its own.

use std::fs;
use std::io;
use std::path::Path;
use std::process::Command;

use crate::{skill, term};

mod config;
mod docs;
mod files;
mod fullstack;
mod manifest;
mod prompts;
mod templates;
#[cfg(test)]
mod tests;

#[cfg(test)]
pub use config::PROJECT_CONFIG;
use docs::commands;
use files::scaffold;
pub use prompts::{Answers, settle};

/// What `dev`, `build`, and `preview` run in the new project.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tool {
    /// `zerolith dev`, `zerolith build`, and `zerolith preview`.
    CommandLine,
    /// The same, with a build that writes the modules as they are behind an import map.
    Unbundled,
    /// `vite`, `vite build`, and `vite preview`, with `@zerolith/vite`.
    Vite,
}

/// What the new project starts from.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Start {
    /// The starter, written in the language and for the tools chosen.
    Starter,
    /// The fullstack example: Harbor, a team's projects and tasks under `/app/`, with its own Node backend.
    Fullstack,
}

impl Start {
    /// The example `--example` names.
    pub fn example(name: &str) -> Option<Start> {
        match name {
            "fullstack" => Some(Start::Fullstack),
            _ => None,
        }
    }
}

/// The project to write.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Choice {
    /// The starter or an example; an example fixes the other fields.
    pub start: Start,
    pub tool: Tool,
    pub typescript: bool,
    /// Components written in JSX, in `.tsx` or `.jsx` files, instead of `html` templates.
    pub jsx: bool,
    /// Mount the inspector from `@zerolith/devtools`.
    pub devtools: bool,
    /// Write the zerolith skill for coding agents into `.agents/skills` and `.claude/skills`.
    pub skill: bool,
}

impl Choice {
    /// The starter in TSX on the command line, with the inspector: what every question defaults to.
    pub const DEFAULT: Choice = Choice {
        start: Start::Starter,
        tool: Tool::CommandLine,
        typescript: true,
        jsx: true,
        devtools: true,
        skill: true,
    };

    /// The fullstack example as it is: TypeScript with `html` templates on the command line, with the inspector.
    pub const FULLSTACK: Choice = Choice {
        start: Start::Fullstack,
        tool: Tool::CommandLine,
        typescript: true,
        jsx: false,
        devtools: true,
        skill: true,
    };

    fn ext(self) -> &'static str {
        if self.typescript { "ts" } else { "js" }
    }

    fn component_ext(self) -> &'static str {
        match (self.typescript, self.jsx) {
            (true, true) => "tsx",
            (true, false) => "ts",
            (false, true) => "jsx",
            (false, false) => "js",
        }
    }
}

/// The package manager that ran the command, from the user agent npm, pnpm, Yarn, and Bun set, or npm.
fn package_manager() -> &'static str {
    let agent = std::env::var("npm_config_user_agent").unwrap_or_default();
    ["pnpm", "yarn", "bun"]
        .into_iter()
        .find(|name| agent.starts_with(name))
        .unwrap_or("npm")
}

/// The settings file a package manager needs before it installs: Yarn 2 and later install with Plug'n'Play unless told otherwise, and the command line resolves packages from `node_modules`. Yarn 1 ignores the file.
fn manager_settings(manager: &str) -> Option<(&'static str, &'static str)> {
    (manager == "yarn").then_some((".yarnrc.yml", "nodeLinker: node-modules\n"))
}

/// Runs `<manager> install` in the new project, through `cmd` on Windows, where the managers are batch files.
fn install(root: &Path, manager: &str) -> io::Result<bool> {
    let status = if cfg!(windows) {
        Command::new("cmd")
            .args(["/C", manager, "install"])
            .current_dir(root)
            .status()?
    } else {
        Command::new(manager)
            .arg("install")
            .current_dir(root)
            .status()?
    };
    Ok(status.success())
}

/// Runs the `new` command: writes the starter or the example and, when asked to, installs its dependencies.
pub fn run(root: &Path, choice: Choice, install_dependencies: bool) -> io::Result<()> {
    let name = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("app")
        .to_string();
    let files = scaffold(root, &name, choice)?;
    anstream::println!(
        "{}",
        term::row(
            "wrote",
            term::done,
            format!("{} files to {}", files.len(), term::bold(root.display()))
        )
    );
    if choice.skill {
        skill::write(root)?;
        anstream::println!(
            "{}",
            term::row(
                "wrote",
                term::done,
                format!(
                    "the zerolith skill for coding agents to {}",
                    skill::FOLDERS.join(" and ")
                )
            )
        );
    }
    let manager = package_manager();
    if let Some((file, settings)) = manager_settings(manager) {
        fs::write(root.join(file), settings)?;
        anstream::println!(
            "{}",
            term::row(
                "wrote",
                term::done,
                format!("{file}, so {manager} installs into node_modules")
            )
        );
    }
    let mut installed = false;
    if install_dependencies {
        anstream::println!(
            "{}\n",
            term::row("install", term::label, format!("{manager} install"))
        );
        installed = install(root, manager).unwrap_or(false);
        if installed {
            anstream::println!(
                "\n{}",
                term::row("installed", term::done, "the dependencies")
            );
        } else {
            anstream::eprintln!(
                "\n{}",
                term::row(
                    "warning",
                    term::caution,
                    format!(
                        "{manager} install did not finish; run it in {} before starting",
                        root.display()
                    )
                )
            );
        }
    }
    anstream::println!("\n  {}", term::muted("Next:"));
    anstream::println!("    {}", term::bold(format!("cd {}", root.display())));
    if !installed {
        anstream::println!("    {}", term::bold(format!("{manager} install")));
    }
    let steps = next_steps(choice);
    let width = steps
        .iter()
        .map(|(command, _)| command.len())
        .max()
        .unwrap_or(0)
        + 3;
    for (command, what) in &steps {
        let padding = " ".repeat(width.saturating_sub(command.len()));
        anstream::println!("    {}{padding}{}", term::bold(command), term::muted(what));
    }
    anstream::println!();
    Ok(())
}

/// The commands the new project runs on, each with what it does, as the closing lines list them.
fn next_steps(choice: Choice) -> Vec<(String, &'static str)> {
    if choice.start == Start::Fullstack {
        return vec![
            (
                "npm run dev".to_string(),
                "serve the app and start the backend, which answers /api",
            ),
            (
                "npm run build".to_string(),
                "write the production build to dist/",
            ),
            (
                "npm start".to_string(),
                "serve the API and the build from the backend",
            ),
        ];
    }
    let (develop, build, preview) = commands(choice.tool);
    let prefix = if choice.tool == Tool::Vite || on_path("zerolith") {
        ""
    } else {
        "npx "
    };
    vec![
        (format!("{prefix}{develop}"), "serve the app while you work"),
        (
            format!("{prefix}{build}"),
            "write the production build to dist/",
        ),
        (format!("{prefix}{preview}"), "serve dist/ to check it"),
    ]
}

/// True when a program of this name is on `PATH` for good, as a global npm install puts the command line there; the folders npx and npm scripts add for one run do not count.
fn on_path(program: &str) -> bool {
    let Some(paths) = std::env::var_os("PATH") else {
        return false;
    };
    std::env::split_paths(&paths).any(|folder| {
        let text = folder.to_string_lossy().replace('\\', "/");
        !text.contains("/_npx/")
            && !text.trim_end_matches('/').ends_with("node_modules/.bin")
            && ["", ".exe", ".cmd"]
                .iter()
                .any(|suffix| folder.join(format!("{program}{suffix}")).is_file())
    })
}
