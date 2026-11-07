//! The questions `zerolith new` asks for what the flags leave open, each
//! with a default.

use std::io::{self, BufRead, IsTerminal, Write};
use std::path::PathBuf;

use crate::term;

use super::{Choice, Start, Tool, package_manager};

/// What the command line settled before any question: each `None` is asked, or takes its default.
#[derive(Debug, Default)]
pub struct Answers {
    pub root: Option<PathBuf>,
    /// The starter or an example; `--example` sets it.
    pub start: Option<Start>,
    /// `tsx`, `ts`, `jsx`, or `js`.
    pub template: Option<String>,
    pub tool: Option<Tool>,
    pub devtools: Option<bool>,
    pub skill: Option<bool>,
    pub install: Option<bool>,
}

fn template_choice(template: &str) -> (bool, bool) {
    match template {
        "ts" => (true, false),
        "jsx" => (false, true),
        "js" => (false, false),
        _ => (true, true),
    }
}

/// Asks one question on the terminal and returns the answer, or the default for an empty line.
pub(super) fn ask(input: &mut impl BufRead, question: &str, default: &str) -> io::Result<String> {
    anstream::print!(
        "  {} {}: ",
        term::bold(question),
        term::muted(format!("({default})"))
    );
    io::stdout().flush()?;
    let mut line = String::new();
    input.read_line(&mut line)?;
    let answer = line.trim();
    Ok(if answer.is_empty() {
        default.to_string()
    } else {
        answer.to_string()
    })
}

/// Asks to pick one of `options` by number, the first being the default.
pub(super) fn pick(
    input: &mut impl BufRead,
    question: &str,
    options: &[&str],
) -> io::Result<usize> {
    anstream::println!("\n  {}", term::bold(question));
    for (index, option) in options.iter().enumerate() {
        anstream::println!("    {}  {option}", term::muted(index + 1));
    }
    loop {
        let answer = ask(input, &format!("Choose 1-{}", options.len()), "1")?;
        if let Ok(number) = answer.parse::<usize>()
            && (1..=options.len()).contains(&number)
        {
            return Ok(number - 1);
        }
        anstream::println!(
            "  {}",
            term::warning(format!("Type a number from 1 to {}.", options.len()))
        );
    }
}

pub(super) fn confirm(input: &mut impl BufRead, question: &str) -> io::Result<bool> {
    anstream::println!();
    let answer = ask(input, question, "Y/n")?;
    Ok(!matches!(answer.to_ascii_lowercase().as_str(), "n" | "no"))
}

/// The flags given that only the starter takes, as they were written, since an example is TypeScript on the command line.
fn starter_flags(answers: &Answers) -> Vec<String> {
    let mut flags = Vec::new();
    if let Some(template) = &answers.template {
        flags.push(format!("--template {template}"));
    }
    match answers.tool {
        Some(Tool::Vite) => flags.push("--vite".to_string()),
        Some(Tool::Unbundled) => flags.push("--buildless".to_string()),
        Some(Tool::CommandLine) | None => {}
    }
    if answers.devtools == Some(false) {
        flags.push("--no-devtools".to_string());
    }
    flags
}

/// Fills in what the flags left open: asked on a terminal, or the defaults elsewhere and with `--yes`.
pub fn settle(answers: Answers, interactive: bool) -> io::Result<(PathBuf, Choice, bool)> {
    let interactive = interactive && io::stdin().is_terminal() && io::stdout().is_terminal();
    settle_from(&mut io::stdin().lock(), answers, interactive)
}

/// `settle`, reading the answers to its questions from `input`. The starting point comes first, unless a flag only the starter takes already settled it.
pub(super) fn settle_from(
    input: &mut impl BufRead,
    mut answers: Answers,
    interactive: bool,
) -> io::Result<(PathBuf, Choice, bool)> {
    let starter_only = starter_flags(&answers);
    let start = match answers.start {
        Some(Start::Fullstack) if !starter_only.is_empty() => {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                format!(
                    "--example fullstack takes no {}, since the example comes as it is, TypeScript on the zerolith command line with the inspector; leave {} out, or drop --example to write the starter",
                    starter_only.join(" or "),
                    if starter_only.len() == 1 {
                        "the flag"
                    } else {
                        "the flags"
                    }
                ),
            ));
        }
        Some(start) => start,
        None if interactive && starter_only.is_empty() => match pick(
            input,
            "Starting point",
            &[
                "The starter: three pages in the brand style, in the language and with the tools you pick next",
                "The fullstack example: Harbor, a team's projects and tasks under /app/ with its own Node backend, in TypeScript on the command line",
            ],
        )? {
            1 => Start::Fullstack,
            _ => Start::Starter,
        },
        None => Start::Starter,
    };
    if answers.root.is_none() {
        answers.root = Some(PathBuf::from(if interactive {
            ask(input, "Project folder", "zerolith-app")?
        } else {
            "zerolith-app".to_string()
        }));
    }
    let choice = match start {
        Start::Fullstack => Choice::FULLSTACK,
        Start::Starter => starter_choice(input, &answers, interactive)?,
    };
    let skill = match answers.skill {
        Some(skill) => skill,
        None if interactive => confirm(input, "Add the zerolith skill for coding agents")?,
        None => true,
    };
    let choice = Choice { skill, ..choice };
    let install = match answers.install {
        Some(install) => install,
        None if interactive => confirm(
            input,
            &format!("Install the dependencies with {}", package_manager()),
        )?,
        None => true,
    };
    if interactive {
        anstream::println!();
    }
    Ok((answers.root.unwrap_or_default(), choice, install))
}

/// The starter's language, tools, and inspector: from the flags, asked on a terminal, or the defaults.
fn starter_choice(
    input: &mut impl BufRead,
    answers: &Answers,
    interactive: bool,
) -> io::Result<Choice> {
    let (typescript, jsx) = match &answers.template {
        Some(template) => template_choice(template),
        None if interactive => match pick(
            input,
            "Language",
            &[
                "TSX: TypeScript components written in JSX",
                "TS: TypeScript components written as html templates",
                "JSX: JavaScript components written in JSX",
                "JS: JavaScript components written as html templates",
            ],
        )? {
            1 => (true, false),
            2 => (false, true),
            3 => (false, false),
            _ => (Choice::DEFAULT.typescript, Choice::DEFAULT.jsx),
        },
        None => (Choice::DEFAULT.typescript, Choice::DEFAULT.jsx),
    };
    let tool = match answers.tool {
        Some(tool) => tool,
        None if interactive => match pick(
            input,
            "Dev server and build",
            &[
                "The zerolith command line: dev, build, and preview with nothing else",
                "Vite with @zerolith/vite: in-place component replacement and Vite plugins",
                "The zerolith command line, deploying the modules behind an import map instead of a bundle",
            ],
        )? {
            1 => Tool::Vite,
            2 => Tool::Unbundled,
            _ => Choice::DEFAULT.tool,
        },
        None => Choice::DEFAULT.tool,
    };
    let devtools = match answers.devtools {
        Some(devtools) => devtools,
        None if interactive => confirm(input, "Include the inspector from @zerolith/devtools")?,
        None => Choice::DEFAULT.devtools,
    };
    Ok(Choice {
        start: Start::Starter,
        tool,
        typescript,
        jsx,
        devtools,
        skill: Choice::DEFAULT.skill,
    })
}
