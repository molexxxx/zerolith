//! The zerolith command line.
//!
//! `dev` serves a project with its packages resolved from `node_modules`
//! and live reload, `build` bundles and minifies it for production or, with
//! `--unbundled`, writes it file by file with an import map, `preview`
//! serves the output, `importmap` vendors the installed packages behind an
//! import map with integrity hashes, `doctor` checks a project for the
//! mistakes that are easy to make, and `new` writes the standard
//! application layout.

mod backend;
mod build;
mod config;
mod css;
mod doctor;
mod env;
mod html;
mod importmap;
mod lint;
mod mime;
mod modules;
mod new;
mod prepare;
mod problems;
mod proxy;
mod scan;
mod server;
mod skill;
mod split;
mod term;
mod transform;
mod unbundled;
mod watch;

use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "zerolith", bin_name = "zerolith", version, about = "The zerolith command line", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Serve a project while developing: packages resolve from node_modules, TypeScript and JSX become JavaScript, and edits reload the page with named signals restored, stylesheets in place.
    Dev {
        /// The project folder; index.html inside it is the application.
        #[arg(default_value = ".")]
        root: PathBuf,
        #[command(flatten)]
        server: ServerFlags,
    },
    /// Serve a project the way dev does, without watching it.
    Serve {
        #[arg(default_value = ".")]
        root: PathBuf,
        #[command(flatten)]
        server: ServerFlags,
    },
    /// Serve a build's output as a static host would, to check it before deploying.
    Preview {
        /// The project folder.
        #[arg(default_value = ".")]
        root: PathBuf,
        /// The output folder, relative to the project unless absolute; dist unless zerolith.json sets build.out.
        #[arg(long)]
        out: Option<PathBuf>,
        #[command(flatten)]
        server: ServerFlags,
    },
    /// Copy the installed zerolith packages into a vendor folder and write an import map with integrity hashes and preload links.
    Importmap {
        /// The project folder holding node_modules and index.html.
        #[arg(default_value = ".")]
        root: PathBuf,
        /// Where to copy the packages, relative to the root; it becomes the URL prefix too.
        #[arg(long, default_value = "vendor")]
        out: PathBuf,
        /// Use the development entries (diagnostic text and the inspector) instead of the production ones.
        #[arg(long)]
        development: bool,
        /// An HTML file whose import map and preload links are replaced or inserted; give it once per page of the site, so every page follows the vendored files.
        #[arg(long)]
        html: Vec<PathBuf>,
    },
    /// Write the zerolith skill for coding agents into a project, describing this version: into .agents/skills, which Codex, Cursor, GitHub Copilot, Gemini CLI, and most other agents read, and .claude/skills, which Claude Code reads. Run it again after upgrading zerolith.
    Skill {
        #[arg(default_value = ".")]
        root: PathBuf,
    },
    /// Check a project: index.html, its import map, the files it points at, and their integrity, then the templates in its sources.
    Doctor {
        #[arg(default_value = ".")]
        root: PathBuf,
        /// Print findings as JSON.
        #[arg(long)]
        json: bool,
    },
    /// Build the project for production: the modules index.html loads bundled into minified chunks with hashed names, lazy routes split out, and the stylesheets combined into one.
    Build {
        /// The project folder, holding index.html.
        #[arg(default_value = ".")]
        root: PathBuf,
        /// The output folder, relative to the project unless absolute; dist unless zerolith.json sets build.out. It is emptied first when it is inside the project, and one that holds the project, the public folder, or a source the page loads is refused.
        #[arg(long)]
        out: Option<PathBuf>,
        /// Empty an output folder outside the project before writing into it.
        #[arg(long)]
        empty_out_dir: bool,
        /// The public path the app is served under, such as /app/, unless zerolith.json sets base; ./ makes every URL relative to the page.
        #[arg(long)]
        base: Option<String>,
        /// The mode: production builds use the production entries of the packages, any other mode the development ones.
        #[arg(long, default_value = "production")]
        mode: String,
        /// Write a source map next to each chunk.
        #[arg(long)]
        sourcemap: bool,
        /// Keep the output readable: dead code is still removed, but names and whitespace stay.
        #[arg(long)]
        no_minify: bool,
        /// Keep the template scanner and leave `html` literals as they are, for a project that passes `html` around as a value.
        #[arg(long)]
        no_prepare: bool,
        /// Write the sources file by file, transformed to JavaScript, with the packages vendored behind an import map, instead of bundling.
        #[arg(long, conflicts_with_all = ["base", "mode", "sourcemap", "no_minify"])]
        unbundled: bool,
    },
    /// Write a starter application, or an example as a project of its own, and install its dependencies, asking for what the flags leave open: the starter in TSX on the command line, with the inspector, by default.
    New {
        /// The folder to create; its name becomes the application's name.
        root: Option<PathBuf>,
        /// Start from an example instead of the starter: fullstack, an app under /app/ with its own Node backend. It is TypeScript on the command line with the inspector, so it takes no --template, --vite, --buildless, or --no-devtools.
        #[arg(long, value_parser = ["fullstack"])]
        example: Option<String>,
        /// The language and syntax: tsx, ts with html templates, jsx, or js with html templates.
        #[arg(long, value_parser = ["tsx", "ts", "jsx", "js"])]
        template: Option<String>,
        /// Develop and build on Vite with @zerolith/vite instead of the command line.
        #[arg(long)]
        vite: bool,
        /// Deploy the modules as they are behind an import map instead of a bundle.
        #[arg(long, conflicts_with = "vite")]
        buildless: bool,
        /// Leave out the inspector from @zerolith/devtools.
        #[arg(long)]
        no_devtools: bool,
        /// Leave out the zerolith skill for coding agents, which `zerolith skill` adds later.
        #[arg(long)]
        no_skill: bool,
        /// Write the files without installing the dependencies.
        #[arg(long)]
        no_install: bool,
        /// Take the default for everything the flags leave open instead of asking.
        #[arg(long, short)]
        yes: bool,
    },
}

/// The flags `dev`, `serve`, and `preview` share; each overrides the project's zerolith.json.
#[derive(clap::Args)]
struct ServerFlags {
    /// The port to listen on: 8080 for dev and serve and 4173 for preview, or the next free one when that is taken, unless zerolith.json sets one.
    #[arg(long)]
    port: Option<u16>,
    /// The public path the app is served under, such as /app/, unless zerolith.json sets base.
    #[arg(long)]
    base: Option<String>,
    /// Forward a path to a backend, such as --proxy /api=http://127.0.0.1:3000; repeat it for more paths.
    #[arg(long, value_name = "PATH=URL")]
    proxy: Vec<String>,
    /// Start none of the backends the proxy rules name with `run`, for one that already runs, as under a debugger.
    #[arg(long)]
    no_backends: bool,
}

/// Which server command runs, with the output folder `preview` serves.
enum Kind {
    Dev,
    Serve,
    Preview(Option<PathBuf>),
}

impl ServerFlags {
    /// The server's options: these flags over the project's zerolith.json over the defaults.
    fn options(self, root: &std::path::Path, kind: Kind) -> std::io::Result<server::Options> {
        let config = config::Config::load(root)?;
        let (section, default_port) = match &kind {
            Kind::Preview(_) => (&config.preview, 4173),
            Kind::Dev | Kind::Serve => (&config.dev, 8080),
        };
        let port_fixed = self.port.is_some() || section.port.is_some();
        let port = self.port.or(section.port).unwrap_or(default_port);
        let base = build::normalize_base(
            &self
                .base
                .or_else(|| config.base.clone())
                .unwrap_or_else(|| "/".to_string()),
        )?;
        let base = if base.starts_with('/') {
            base
        } else {
            "/".to_string()
        };
        let proxy = config.proxy_rules(&self.proxy)?;
        let served = match &kind {
            Kind::Preview(out) => root.join(
                out.clone()
                    .or_else(|| config.build.out.clone())
                    .unwrap_or_else(|| PathBuf::from("dist")),
            ),
            Kind::Dev | Kind::Serve => root.to_path_buf(),
        };
        Ok(server::Options {
            root: served,
            port,
            reload: matches!(kind, Kind::Dev),
            modules: !matches!(kind, Kind::Preview(_)),
            base,
            proxy,
            port_fixed,
            allowed_hosts: config.allowed_hosts.clone(),
            project: root.to_path_buf(),
            backends: if self.no_backends {
                Vec::new()
            } else {
                config.backends(&self.proxy)
            },
        })
    }
}

#[tokio::main]
async fn main() -> ExitCode {
    let cli = Cli::parse();
    let result = match cli.command {
        Command::Dev { root, server } => match server.options(&root, Kind::Dev) {
            Ok(options) => server::run(options).await,
            Err(error) => Err(error),
        },
        Command::Serve { root, server } => match server.options(&root, Kind::Serve) {
            Ok(options) => server::run(options).await,
            Err(error) => Err(error),
        },
        Command::Preview { root, out, server } => match server.options(&root, Kind::Preview(out)) {
            Ok(options) => server::run(options).await,
            Err(error) => Err(error),
        },
        Command::Importmap {
            root,
            out,
            development,
            html,
        } => importmap::run(&root, &out, development, &html),
        Command::Doctor { root, json } => return doctor::run(&root, json),
        Command::Skill { root } => skill::run(&root),
        Command::Build {
            root,
            out,
            empty_out_dir,
            base,
            mode,
            sourcemap,
            no_minify,
            no_prepare,
            unbundled,
        } => match config::Config::load(&root) {
            Err(error) => Err(error),
            Ok(config) => {
                let out = out
                    .or(config.build.out)
                    .unwrap_or_else(|| PathBuf::from("dist"));
                if unbundled {
                    if let Some(configured) = config.base.filter(|base| base != "/") {
                        anstream::eprintln!(
                            "{}",
                            term::row(
                                "warning",
                                term::caution,
                                format!(
                                    "zerolith.json sets base {configured}, which build --unbundled does not apply; its output is served from the root"
                                )
                            )
                        );
                    }
                    unbundled::run(&root, &out, !no_prepare, empty_out_dir)
                } else {
                    let base = base.or(config.base).unwrap_or_else(|| "/".to_string());
                    match build::normalize_base(&base) {
                        Err(error) => Err(error),
                        Ok(base) => {
                            build::run(&build::Options {
                                root,
                                out,
                                empty_out_dir,
                                base,
                                mode,
                                minify: !no_minify,
                                sourcemap,
                                prepare: !no_prepare,
                            })
                            .await
                        }
                    }
                }
            }
        },
        Command::New {
            root,
            example,
            template,
            vite,
            buildless,
            no_devtools,
            no_skill,
            no_install,
            yes,
        } => {
            let start = example.as_deref().and_then(new::Start::example);
            let detail = match start {
                Some(new::Start::Fullstack) => "the fullstack example",
                _ => "a starter application",
            };
            anstream::println!("{}", term::heading("new", detail));
            new::settle(
                new::Answers {
                    root,
                    start,
                    template,
                    tool: if vite {
                        Some(new::Tool::Vite)
                    } else if buildless {
                        Some(new::Tool::Unbundled)
                    } else {
                        None
                    },
                    devtools: no_devtools.then_some(false),
                    skill: no_skill.then_some(false),
                    install: no_install.then_some(false),
                },
                !yes,
            )
            .and_then(|(root, choice, install)| new::run(&root, choice, install))
        }
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            anstream::eprintln!("\n{} {} {error}\n", term::badge(), term::error("error"));
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Cli;
    use clap::CommandFactory;
    use std::collections::{BTreeMap, BTreeSet};
    use std::path::{Path, PathBuf};

    /// The files a reader learns the command line from: the guides, the tutorial, the READMEs, the skill, and the text `zerolith new` writes.
    fn documents(root: &Path) -> Vec<PathBuf> {
        let mut files = vec![
            root.join("README.md"),
            root.join("crates/zerolith/README.md"),
            root.join("skills/zerolith/SKILL.md"),
        ];
        for entry in std::fs::read_dir(root.join("crates/zerolith/src/new"))
            .expect("the new command's folder")
        {
            files.push(entry.expect("a folder entry").path());
        }
        for folder in ["docs/guide", "docs/learn", "packages", "examples"] {
            for entry in std::fs::read_dir(root.join(folder)).expect("a docs folder") {
                let path = entry.expect("a folder entry").path();
                if path.is_dir() && folder == "docs/learn" {
                    for page in std::fs::read_dir(&path).expect("a tutorial's folder") {
                        files.push(page.expect("a folder entry").path());
                    }
                } else if path.is_dir() {
                    files.push(path.join("README.md"));
                } else if path.extension().is_some_and(|extension| extension == "md") {
                    files.push(path);
                }
            }
        }
        files.retain(|file| file.is_file());
        files
    }

    /// Each `--flag` written after a `zerolith <command>` on one line, up to the end of the code span or command.
    fn written_flags(line: &str) -> Vec<(&str, &str)> {
        let mut found = Vec::new();
        let mut rest = line;
        while let Some(at) = rest.find("zerolith") {
            rest = &rest[at + "zerolith".len()..];
            let mut after = rest.strip_prefix("/cli").unwrap_or(rest);
            if let Some(tagged) = after.strip_prefix('@') {
                after = tagged.trim_start_matches(|c: char| !c.is_whitespace());
            }
            if !after.starts_with(' ') {
                continue;
            }
            let command = after
                .split(['`', '|', ';', '&', '"', '\''])
                .next()
                .unwrap_or("");
            let mut words = command.split_whitespace();
            let Some(name) = words.next() else {
                continue;
            };
            for word in words {
                if let Some(flag) = word.strip_prefix("--") {
                    let flag = flag.split('=').next().unwrap_or("");
                    let flag = flag.trim_end_matches(|c: char| !c.is_ascii_alphanumeric());
                    if !flag.is_empty() {
                        found.push((name, flag));
                    }
                }
            }
        }
        found
    }

    /// Each command's long flags, `--help` included.
    fn long_flags() -> BTreeMap<String, BTreeSet<String>> {
        Cli::command()
            .get_subcommands()
            .map(|command| {
                let mut longs: BTreeSet<String> = command
                    .get_arguments()
                    .filter_map(|argument| argument.get_long().map(str::to_string))
                    .collect();
                longs.insert("help".to_string());
                (command.get_name().to_string(), longs)
            })
            .collect()
    }

    #[test]
    fn docs_write_only_flags_the_command_line_has() {
        let flags = long_flags();
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let mut unknown = Vec::new();
        let mut checked = 0;
        for file in documents(&root) {
            let text = std::fs::read_to_string(&file).expect("a readable document");
            for (index, line) in text.lines().enumerate() {
                for (name, flag) in written_flags(line) {
                    let Some(known) = flags.get(name) else {
                        continue;
                    };
                    checked += 1;
                    if !known.contains(flag) {
                        unknown.push(format!(
                            "{}:{}: zerolith {name} has no --{flag}",
                            file.strip_prefix(&root).unwrap_or(&file).display(),
                            index + 1
                        ));
                    }
                }
            }
        }
        assert!(checked > 20, "only {checked} flags found in the docs");
        assert!(unknown.is_empty(), "{}", unknown.join("\n"));
    }

    #[test]
    fn the_command_line_guide_documents_every_flag_in_its_command_section() {
        let flags = long_flags();
        let guide = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../docs/guide/command-line.md");
        let text = std::fs::read_to_string(guide).expect("the command line guide");
        let mut sections: Vec<(Vec<&str>, String)> = Vec::new();
        for line in text.lines() {
            if let Some(heading) = line.strip_prefix("## ") {
                let named = heading
                    .split(|c: char| !c.is_ascii_alphanumeric())
                    .filter(|word| flags.contains_key(*word))
                    .collect();
                sections.push((named, String::new()));
            } else if let Some((_, body)) = sections.last_mut() {
                body.push_str(line);
                body.push('\n');
            }
        }
        let mut problems = Vec::new();
        for (command, longs) in &flags {
            let bodies: Vec<&str> = sections
                .iter()
                .filter(|(named, _)| named.contains(&command.as_str()))
                .map(|(_, body)| body.as_str())
                .collect();
            if bodies.is_empty() {
                problems.push(format!("{command} has no section"));
            }
            for flag in longs.iter().filter(|flag| *flag != "help") {
                if !bodies
                    .iter()
                    .any(|body| body.contains(&format!("`--{flag}")))
                {
                    problems.push(format!(
                        "{command} --{flag} is not documented in its section"
                    ));
                }
            }
        }
        for (named, body) in &sections {
            for row in body.lines().filter_map(|line| line.strip_prefix("| `--")) {
                let flag = row
                    .split(|c: char| !(c.is_ascii_alphanumeric() || c == '-'))
                    .next()
                    .unwrap_or("");
                if !named.iter().any(|command| flags[*command].contains(flag)) {
                    problems.push(format!(
                        "--{flag} is listed under {named:?}, which has no such flag"
                    ));
                }
            }
        }
        assert!(problems.is_empty(), "{}", problems.join("\n"));
    }

    #[test]
    fn written_flags_reads_commands_in_code_and_prose() {
        assert_eq!(
            written_flags("run `npx @zerolith/cli@alpha new my-app --template tsx --yes` first"),
            vec![("new", "template"), ("new", "yes")]
        );
        assert_eq!(
            written_flags("`zerolith build --out=public` then `zerolith dev`"),
            vec![("build", "out")]
        );
        assert_eq!(
            written_flags("zerolith.json and zerolith-client --input"),
            Vec::<(&str, &str)>::new()
        );
    }
}
