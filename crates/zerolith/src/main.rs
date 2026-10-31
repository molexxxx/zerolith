//! The zerolith command line.
//!
//! `dev` serves a project with its packages resolved from `node_modules`
//! and live reload, `build` bundles and minifies it for production or, with
//! `--unbundled`, writes it file by file with an import map, `preview`
//! serves the output, `importmap` vendors the installed packages behind an
//! import map with integrity hashes, `doctor` checks a project for the
//! mistakes that are easy to make, and `new` writes the standard
//! application layout.

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
mod proxy;
mod scan;
mod server;
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
        /// An HTML file whose import map and preload links are replaced or inserted.
        #[arg(long)]
        html: Option<PathBuf>,
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
        /// The output folder, relative to the project unless absolute; dist unless zerolith.json sets build.out. It is emptied first when it is inside the project.
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
        #[arg(long, conflicts_with_all = ["empty_out_dir", "base", "mode", "sourcemap", "no_minify"])]
        unbundled: bool,
    },
    /// Write a starter application and install its dependencies, asking for what the flags leave open: TSX on the command line, with the inspector, by default.
    New {
        /// The folder to create; its name becomes the application's name.
        root: Option<PathBuf>,
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
        );
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
        } => importmap::run(&root, &out, development, html.as_deref()),
        Command::Doctor { root, json } => return doctor::run(&root, json),
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
                    unbundled::run(&root, &out, !no_prepare)
                } else {
                    let base = base.or(config.base).unwrap_or_else(|| "/".to_string());
                    build::run(&build::Options {
                        root,
                        out,
                        empty_out_dir,
                        base: build::normalize_base(&base),
                        mode,
                        minify: !no_minify,
                        sourcemap,
                        prepare: !no_prepare,
                    })
                    .await
                }
            }
        },
        Command::New {
            root,
            template,
            vite,
            buildless,
            no_devtools,
            no_install,
            yes,
        } => {
            anstream::println!("{}", term::heading("new", "a starter application"));
            new::settle(
                new::Answers {
                    root,
                    template,
                    tool: if vite {
                        Some(new::Tool::Vite)
                    } else if buildless {
                        Some(new::Tool::Unbundled)
                    } else {
                        None
                    },
                    devtools: no_devtools.then_some(false),
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
