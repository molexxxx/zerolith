//! The template scanner, ported from the core's `scan.ts` character for
//! character: the static strings of an `html` literal become markup with
//! markers and a part table. `zerolith build` runs it ahead of time so the
//! browser never does, and the parity test holds it to the TypeScript one.

use std::fmt;

pub const CHILD: u8 = 0;
pub const ATTRIBUTE: u8 = 1;
pub const BOOLEAN: u8 = 2;
pub const PROPERTY: u8 = 3;
pub const EVENT: u8 = 4;
pub const REF: u8 = 5;

/// Where each diagnostic code has its page; the core's `DIAGNOSTIC_URL`.
pub const DIAGNOSTIC_URL: &str = "https://molexxxx.github.io/zerolith/e/";

const MARK: &str = "zl$";
const CHILD_MARKER: &str = "<!--zl$-->";
const RAW_TAGS: [&str; 3] = ["style", "textarea", "title"];
const UNSAFE_PROPERTIES: [&str; 3] = ["innerHTML", "outerHTML", "srcdoc"];

/// Where and how one or more expressions bind into the template.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Part {
    pub kind: u8,
    /// Attribute, property, or event name as written in the source.
    pub name: String,
    /// Static text around the expressions of an attribute value; empty for a child.
    pub strings: Vec<String>,
}

/// The scanner's output: markup with markers, and the parts in source order.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Scanned {
    pub markup: String,
    pub parts: Vec<Part>,
}

/// A template the scanner refuses, named by the core's diagnostic code.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ScanError {
    pub code: &'static str,
    pub detail: Option<String>,
}

impl fmt::Display for ScanError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.detail {
            Some(detail) => write!(f, "{} ({detail}) {DIAGNOSTIC_URL}{}", self.code, self.code),
            None => write!(f, "{} {DIAGNOSTIC_URL}{}", self.code, self.code),
        }
    }
}

impl std::error::Error for ScanError {}

fn refuse(code: &'static str) -> ScanError {
    ScanError { code, detail: None }
}

fn refuse_with(code: &'static str, detail: String) -> ScanError {
    ScanError {
        code,
        detail: Some(detail),
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum State {
    Text,
    Tag,
    Equals,
    Double,
    Single,
    Unquoted,
    Comment,
    Raw,
}

struct Bound {
    name: String,
    strings: Vec<String>,
    start: usize,
}

fn is_space(c: char) -> bool {
    matches!(c, ' ' | '\n' | '\t' | '\r' | '\u{c}')
}

fn is_name_start(c: char) -> bool {
    c.is_ascii_alphabetic()
}

fn attribute_spec(name: &str, strings: Vec<String>) -> Result<Part, ScanError> {
    let mut kind = ATTRIBUTE;
    let mut actual = name.to_string();
    match name.chars().next() {
        Some('.') => {
            kind = PROPERTY;
            actual = name[1..].to_string();
        }
        Some('?') => {
            kind = BOOLEAN;
            actual = name[1..].to_string();
        }
        Some('@') => {
            kind = EVENT;
            actual = name[1..].to_string();
        }
        _ => {
            if name.eq_ignore_ascii_case("ref") {
                kind = REF;
            }
        }
    }
    if kind != ATTRIBUTE && (strings.len() != 2 || !strings[0].is_empty() || !strings[1].is_empty())
    {
        return Err(refuse_with("binding_not_single", format!("name={name}")));
    }
    if kind == PROPERTY && UNSAFE_PROPERTIES.contains(&actual.as_str()) {
        return Err(refuse_with(
            "unsafe_property_binding",
            format!("name={actual}"),
        ));
    }
    let lower = actual.to_lowercase();
    if kind == ATTRIBUTE && (lower == "srcdoc" || lower.starts_with("on")) {
        return Err(refuse_with(
            "unsafe_attribute_binding",
            format!("name={actual}"),
        ));
    }
    Ok(Part {
        kind,
        name: actual,
        strings,
    })
}

/// Scans the static strings of a template literal.
pub fn scan(strings: &[String]) -> Result<Scanned, ScanError> {
    let mut parts: Vec<Part> = Vec::new();
    let mut markup = String::new();
    let mut state = State::Text;
    let mut tag = String::new();
    let mut closing = false;
    let mut in_tag_name = false;
    let mut attr = String::new();
    let mut in_attr_name = false;
    let mut attr_start = 0usize;
    let mut segment = 0usize;
    let mut bound: Option<Bound> = None;
    let mut raw = String::new();

    for (i, s) in strings.iter().enumerate() {
        let chars: Vec<char> = s.chars().collect();
        let mut j = 0usize;
        while j < chars.len() {
            let c = chars[j];
            let pos = markup.len();
            let mut append = true;
            match state {
                State::Text => {
                    if c == '<' {
                        let next = chars.get(j + 1).copied();
                        if chars[j + 1..].starts_with(&['!', '-', '-']) {
                            state = State::Comment;
                        } else if let Some(next) = next
                            && (is_name_start(next) || next == '/')
                        {
                            state = State::Tag;
                            tag.clear();
                            in_tag_name = true;
                            closing = next == '/';
                        }
                    }
                }
                State::Comment => {
                    if c == '>' && markup.ends_with("--") {
                        state = State::Text;
                    }
                }
                State::Raw => {
                    if c == '<' {
                        let ahead: String = chars[j + 1..]
                            .iter()
                            .take(1 + raw.chars().count())
                            .collect::<String>()
                            .to_lowercase();
                        if ahead == format!("/{raw}") {
                            state = State::Tag;
                            tag.clear();
                            in_tag_name = true;
                            closing = true;
                        }
                    }
                }
                State::Tag => {
                    let mut handled = false;
                    if in_tag_name {
                        if c == '/' && tag.is_empty() {
                            handled = true;
                        } else if is_space(c) || c == '>' || c == '/' {
                            in_tag_name = false;
                        } else {
                            tag.extend(c.to_lowercase());
                            handled = true;
                        }
                    }
                    if !handled && in_attr_name {
                        if c == '=' || is_space(c) || c == '>' || c == '/' {
                            in_attr_name = false;
                        } else {
                            attr.push(c);
                            handled = true;
                        }
                    }
                    if !handled {
                        if c == '=' {
                            state = State::Equals;
                        } else if c == '>' {
                            state = State::Text;
                            if !closing {
                                if tag == "script" {
                                    return Err(refuse("script_in_template"));
                                }
                                if RAW_TAGS.contains(&tag.as_str()) {
                                    state = State::Raw;
                                    raw = tag.clone();
                                }
                            }
                        } else if is_space(c) || c == '/' {
                        } else {
                            in_attr_name = true;
                            attr.clear();
                            attr.push(c);
                            attr_start = pos;
                        }
                    }
                }
                State::Equals => {
                    if is_space(c) {
                    } else if c == '"' {
                        state = State::Double;
                        segment = pos + 1;
                    } else if c == '\'' {
                        state = State::Single;
                        segment = pos + 1;
                    } else {
                        state = State::Unquoted;
                        segment = pos;
                    }
                }
                State::Double | State::Single => {
                    let quote = if state == State::Double { '"' } else { '\'' };
                    if c == quote {
                        let had = bound.is_some();
                        finish(&mut markup, &mut parts, &mut bound, segment, pos)?;
                        state = State::Tag;
                        if had {
                            append = false;
                        }
                    }
                }
                State::Unquoted => {
                    if is_space(c) || c == '>' {
                        finish(&mut markup, &mut parts, &mut bound, segment, pos)?;
                        state = State::Tag;
                        continue;
                    }
                }
            }
            if append {
                markup.push(c);
            }
            j += 1;
        }

        if i < strings.len() - 1 {
            match state {
                State::Text => {
                    if markup.ends_with('<') {
                        return Err(refuse("binding_in_tag_position"));
                    }
                    markup.push_str(CHILD_MARKER);
                    parts.push(Part {
                        kind: CHILD,
                        name: String::new(),
                        strings: Vec::new(),
                    });
                }
                State::Equals => {
                    state = State::Unquoted;
                    segment = markup.len();
                    bind(&markup, &mut bound, &attr, attr_start, &mut segment);
                }
                State::Double | State::Single | State::Unquoted => {
                    bind(&markup, &mut bound, &attr, attr_start, &mut segment);
                }
                State::Comment => return Err(refuse("binding_in_comment")),
                State::Raw => {
                    return Err(refuse_with("binding_in_raw_text", format!("tag={raw}")));
                }
                State::Tag => return Err(refuse("binding_in_tag_position")),
            }
        }
    }

    if state != State::Text {
        return Err(refuse("template_unclosed_tag"));
    }
    Ok(Scanned { markup, parts })
}

fn finish(
    markup: &mut String,
    parts: &mut Vec<Part>,
    bound: &mut Option<Bound>,
    segment: usize,
    end: usize,
) -> Result<(), ScanError> {
    let Some(mut current) = bound.take() else {
        return Ok(());
    };
    current.strings.push(markup[segment..end].to_string());
    let spec = attribute_spec(&current.name, current.strings)?;
    let replaced = format!(
        "{}{MARK}{}{}",
        &markup[..current.start],
        parts.len(),
        &markup[end..]
    );
    *markup = replaced;
    parts.push(spec);
    Ok(())
}

fn bind(
    markup: &str,
    bound: &mut Option<Bound>,
    attr: &str,
    attr_start: usize,
    segment: &mut usize,
) {
    let current = bound.get_or_insert_with(|| Bound {
        name: attr.to_string(),
        strings: Vec::new(),
        start: attr_start,
    });
    current.strings.push(markup[*segment..].to_string());
    *segment = markup.len();
}

#[cfg(test)]
mod tests {
    use super::{ATTRIBUTE, BOOLEAN, CHILD, EVENT, PROPERTY, Part, REF, scan};

    fn strings(pieces: &[&str]) -> Vec<String> {
        pieces.iter().map(|piece| piece.to_string()).collect()
    }

    fn part(kind: u8, name: &str, pieces: &[&str]) -> Part {
        Part {
            kind,
            name: name.to_string(),
            strings: strings(pieces),
        }
    }

    #[test]
    fn marks_children_and_attributes_of_every_kind() {
        let scanned = scan(&strings(&["<p class=\"", "\">", "</p>"])).unwrap();
        assert_eq!(scanned.markup, "<p zl$0><!--zl$--></p>");
        assert_eq!(
            scanned.parts,
            vec![part(ATTRIBUTE, "class", &["", ""]), part(CHILD, "", &[])]
        );
        let scanned = scan(&strings(&[
            "<input .value=",
            " ?disabled=",
            " @input=\"",
            "\" ref=",
            " title='a ",
            " b'>",
        ]))
        .unwrap();
        assert_eq!(scanned.markup, "<input zl$0 zl$1 zl$2 zl$3 zl$4>");
        assert_eq!(
            scanned.parts,
            vec![
                part(PROPERTY, "value", &["", ""]),
                part(BOOLEAN, "disabled", &["", ""]),
                part(EVENT, "input", &["", ""]),
                part(REF, "ref", &["", ""]),
                part(ATTRIBUTE, "title", &["a ", " b"]),
            ]
        );
    }

    #[test]
    fn keeps_comments_raw_text_and_self_closing_tags() {
        let scanned = scan(&strings(&["<!-- <b> --><br/><title>a < b</title>", ""])).unwrap();
        assert_eq!(
            scanned.markup,
            "<!-- <b> --><br/><title>a < b</title><!--zl$-->"
        );
        assert_eq!(scanned.parts.len(), 1);
    }

    #[test]
    fn refuses_what_the_runtime_refuses() {
        let code = |pieces: &[&str]| scan(&strings(pieces)).unwrap_err().code;
        assert_eq!(code(&["<p ", "></p>"]), "binding_in_tag_position");
        assert_eq!(code(&["<", "></p>"]), "binding_in_tag_position");
        assert_eq!(code(&["<!-- ", " -->"]), "binding_in_comment");
        assert_eq!(code(&["<style>", "</style>"]), "binding_in_raw_text");
        assert_eq!(code(&["<script></script>"]), "script_in_template");
        assert_eq!(code(&["<p"]), "template_unclosed_tag");
        assert_eq!(code(&["<p ?a=\"x", "\"></p>"]), "binding_not_single");
        assert_eq!(
            code(&["<p .innerHTML=", "></p>"]),
            "unsafe_property_binding"
        );
        assert_eq!(code(&["<p onclick=", "></p>"]), "unsafe_attribute_binding");
        assert_eq!(
            code(&["<iframe srcdoc=", "></iframe>"]),
            "unsafe_attribute_binding"
        );
    }
}
