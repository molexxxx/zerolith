//! Terminal output in the brand's style. The `zerolith` badge is chartreuse
//! with basalt text, the one place chartreuse appears; severities use the
//! basic ANSI colors so each terminal theme tunes them to its background.
//! Lines go through `anstream`, which drops every style when `NO_COLOR` is
//! set or the output is not a terminal and makes the codes work on Windows
//! consoles, so piped output and logs stay plain text.

use std::fmt::Display;
use std::sync::OnceLock;

use anstyle::{Ansi256Color, AnsiColor, Color, RgbColor, Style};

/// The width labels are padded to, so the values after them line up.
pub const LABEL_WIDTH: usize = 9;

/// True when the terminal shows 24-bit color: Windows consoles since 2017, and terminals that say so.
fn truecolor() -> bool {
    static TRUECOLOR: OnceLock<bool> = OnceLock::new();
    *TRUECOLOR.get_or_init(|| {
        let variable = |name: &str| std::env::var(name).unwrap_or_default();
        cfg!(windows)
            || matches!(variable("COLORTERM").as_str(), "truecolor" | "24bit")
            || std::env::var_os("WT_SESSION").is_some()
            || matches!(
                variable("TERM_PROGRAM").as_str(),
                "vscode" | "WezTerm" | "iTerm.app" | "ghostty"
            )
    })
}

fn paint(style: Style, text: impl Display) -> String {
    format!("{style}{text}{style:#}")
}

/// The `zerolith` badge that opens every command's output: chartreuse with basalt text, in bold.
pub fn badge() -> String {
    let (background, foreground): (Color, Color) = if truecolor() {
        (
            RgbColor(0xAA, 0xCF, 0x16).into(),
            RgbColor(0x0F, 0x11, 0x14).into(),
        )
    } else {
        (Ansi256Color(148).into(), Ansi256Color(233).into())
    };
    paint(
        Style::new()
            .bold()
            .bg_color(Some(background))
            .fg_color(Some(foreground)),
        " zerolith ",
    )
}

/// Text in bold, for what the line is about.
pub fn bold(text: impl Display) -> String {
    paint(Style::new().bold(), text)
}

/// Green, for addresses and completed steps.
pub fn success(text: impl Display) -> String {
    paint(
        Style::new().bold().fg_color(Some(AnsiColor::Green.into())),
        text,
    )
}

/// Red, for errors.
pub fn error(text: impl Display) -> String {
    paint(
        Style::new().bold().fg_color(Some(AnsiColor::Red.into())),
        text,
    )
}

/// Yellow, for warnings.
pub fn warning(text: impl Display) -> String {
    paint(
        Style::new().bold().fg_color(Some(AnsiColor::Yellow.into())),
        text,
    )
}

/// Blue, for the fix under a finding.
pub fn hint(text: impl Display) -> String {
    paint(Style::new().fg_color(Some(AnsiColor::Blue.into())), text)
}

/// Bright black, for labels and details.
pub fn muted(text: impl Display) -> String {
    paint(
        Style::new().fg_color(Some(AnsiColor::BrightBlack.into())),
        text,
    )
}

/// The line every command opens with, after a blank line: the badge, the command in bold, and a muted detail.
pub fn heading(command: &str, detail: &str) -> String {
    if detail.is_empty() {
        format!("\n{} {}\n", badge(), bold(command))
    } else {
        format!("\n{} {}  {}\n", badge(), bold(command), muted(detail))
    }
}

/// An indented line with a label padded to `LABEL_WIDTH`, styled by `style`, then the value.
pub fn row(label: &str, style: fn(&str) -> String, value: impl Display) -> String {
    let padded = format!("{label:<LABEL_WIDTH$}");
    format!("  {} {value}", style(&padded))
}

/// A label in the muted style, as `row` takes it.
pub fn label(text: &str) -> String {
    muted(text)
}

/// A step that completed, as `row` takes it.
pub fn done(text: &str) -> String {
    success(text)
}

/// An error, as `row` takes it.
pub fn failure(text: &str) -> String {
    error(text)
}

/// A warning, as `row` takes it.
pub fn caution(text: &str) -> String {
    warning(text)
}

/// A file path with its folders muted and the file name in the normal color.
pub fn path(text: &str) -> String {
    match text.rfind(['/', '\\']) {
        Some(index) => format!("{}{}", muted(&text[..=index]), &text[index + 1..]),
        None => text.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::{done, heading, path, row, success};

    fn plain(text: &str) -> String {
        anstream::adapter::strip_str(text).to_string()
    }

    #[test]
    fn reads_as_plain_text_once_the_styles_are_dropped() {
        assert_eq!(
            plain(&heading("dev server", "ready in 4 ms")),
            "\n zerolith  dev server  ready in 4 ms\n"
        );
        assert_eq!(plain(&heading("new", "")), "\n zerolith  new\n");
        assert_eq!(
            plain(&row("Local", done, "http://127.0.0.1:8080/")),
            "  Local     http://127.0.0.1:8080/"
        );
        assert_eq!(
            plain(&path("dist/assets/index-1a2b.js")),
            "dist/assets/index-1a2b.js"
        );
        assert_eq!(plain(&path("index.html")), "index.html");
    }

    #[test]
    fn styles_with_codes_that_reset_after_the_text() {
        let styled = success("ok");
        assert!(styled.starts_with('\u{1b}'));
        assert!(styled.ends_with("\u{1b}[0m"));
    }
}
