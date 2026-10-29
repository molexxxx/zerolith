//! The zerolith command line.
//!
//! `dev` and `serve` host a folder for the buildless path, `importmap`
//! vendors the installed packages and writes an import map with integrity
//! hashes, and `doctor` checks a project for the mistakes that are easy to
//! make without a build step.

mod doctor;
mod importmap;
mod mime;
mod server;
mod watch;

use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "zerolith", version, about = "The zerolith command line", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Serve a folder with live reload: changed stylesheets are swapped in place, and other changes reload the page with named signals restored.
    Dev {
        /// The folder to serve; index.html inside it is the application.
        #[arg(default_value = ".")]
        root: PathBuf,
        /// The port to listen on.
        #[arg(long, default_value_t = 8080)]
        port: u16,
    },
    /// Serve a folder without watching it.
    Serve {
        #[arg(default_value = ".")]
        root: PathBuf,
        #[arg(long, default_value_t = 8080)]
        port: u16,
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
    /// Check a project: index.html, its import map, the files it points at, and their integrity.
    Doctor {
        #[arg(default_value = ".")]
        root: PathBuf,
        /// Print findings as JSON.
        #[arg(long)]
        json: bool,
    },
}

#[tokio::main]
async fn main() -> ExitCode {
    let cli = Cli::parse();
    let result = match cli.command {
        Command::Dev { root, port } => {
            server::run(server::Options {
                root,
                port,
                reload: true,
            })
            .await
        }
        Command::Serve { root, port } => {
            server::run(server::Options {
                root,
                port,
                reload: false,
            })
            .await
        }
        Command::Importmap {
            root,
            out,
            development,
            html,
        } => importmap::run(&root, &out, development, html.as_deref()),
        Command::Doctor { root, json } => return doctor::run(&root, json),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("zerolith: {error}");
            ExitCode::FAILURE
        }
    }
}
