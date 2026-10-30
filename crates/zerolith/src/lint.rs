//! The template lint of the Vite plugin, ported from its `lint.ts`: a signal
//! read with `.get()` bound in a template, which freezes the value when the
//! template is created, and the accessibility defects visible in static
//! markup. `zerolith doctor` runs it over a project's sources, and a shared
//! fixture holds both implementations to the same findings.

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    ArrowFunctionExpression, CallExpression, Expression, Function, TaggedTemplateExpression,
};
use oxc_ast_visit::{Visit, walk};
use oxc_parser::Parser;
use oxc_semantic::ScopeFlags;
use oxc_span::SourceType;

use crate::transform::parse_errors;

/// The tags the lint reads: `html`, and the binding the JSX lowering imports it under.
const TAGS: [&str; 2] = ["html", "__zl_html"];

/// What stands in for an expression when the markup of a template is read as one string.
const HOLE: char = '\u{0}';

const FROZEN_READ: &str = "A .get() read is bound in a template, so the value is read once when the template is created and never updates. Bind the signal itself, or computed(() => ...) for a derived value.";
const IMAGE_WITHOUT_ALT: &str =
    "<img> has no alt attribute; give it alternative text or alt=\"\" when it is decorative.";
const FRAME_WITHOUT_TITLE: &str = "<iframe> has no title attribute; name what it embeds.";
const BUTTON_WITHOUT_NAME: &str =
    "<button> has no content and no aria-label; a button needs an accessible name.";

/// One finding: a stable code, the message the Vite plugin prints, and the byte offset in the module.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LintFinding {
    pub code: &'static str,
    pub message: &'static str,
    pub offset: u32,
}

/// Whitespace as JavaScript's `\s` defines it, so the markup checks match the plugin's regular expressions.
fn is_js_space(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
    )
}

/// Finds the first `.get()` call with no arguments in an expression, outside any function in it.
struct FrozenRead {
    found: Option<u32>,
}

impl<'a> Visit<'a> for FrozenRead {
    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        if self.found.is_some() {
            return;
        }
        if it.arguments.is_empty()
            && let Expression::StaticMemberExpression(member) = &it.callee
            && member.property.name == "get"
        {
            self.found = Some(it.span.start);
            return;
        }
        walk::walk_call_expression(self, it);
    }

    fn visit_arrow_function_expression(&mut self, _it: &ArrowFunctionExpression<'a>) {}

    fn visit_function(&mut self, _it: &Function<'a>, _flags: ScopeFlags) {}
}

/// The attributes of a start tag: the tag with `<` and its name removed.
fn attributes(tag: &str) -> &str {
    let name_end = tag
        .char_indices()
        .skip(2)
        .find(|(_, c)| is_js_space(*c) || *c == '/' || *c == '>')
        .map_or(tag.len(), |(index, _)| index);
    &tag[name_end..]
}

/// True when a start tag carries the attribute, in any case, with or without a value.
fn has_attribute(tag: &str, name: &str) -> bool {
    let chars: Vec<char> = attributes(tag).chars().collect();
    for (index, c) in chars.iter().enumerate() {
        if !is_js_space(*c) || chars.len() < index + 1 + name.len() {
            continue;
        }
        let candidate: String = chars[index + 1..index + 1 + name.len()].iter().collect();
        if !candidate.eq_ignore_ascii_case(name) {
            continue;
        }
        match chars.get(index + 1 + name.len()) {
            None => return true,
            Some(next) if is_js_space(*next) || matches!(next, '=' | '/' | '>') => return true,
            Some(_) => {}
        }
    }
    false
}

/// The index of the first `</button>` closing tag in the text, allowing space before `>`.
fn closing_button(text: &str) -> Option<usize> {
    let lower = text.to_ascii_lowercase();
    let mut from = 0;
    while let Some(found) = lower[from..].find("</button") {
        let start = from + found;
        let rest = &text[start + "</button".len()..];
        if rest.trim_start_matches(is_js_space).starts_with('>') {
            return Some(start);
        }
        from = start + 1;
    }
    None
}

/// The static markup checks over a template's text, with every expression replaced by a marker so a bound attribute still counts.
fn markup(template: &TaggedTemplateExpression<'_>, findings: &mut Vec<LintFinding>) {
    let parts: Vec<(u32, &str)> = template
        .quasi
        .quasis
        .iter()
        .map(|quasi| (quasi.span.start, quasi.value.raw.as_str()))
        .collect();
    let mut text = String::new();
    for (index, (_, raw)) in parts.iter().enumerate() {
        if index > 0 {
            text.push(HOLE);
        }
        text.push_str(raw);
    }
    let offset_of = |index: usize| -> u32 {
        let mut remaining = index;
        for (start, raw) in &parts {
            if remaining <= raw.len() {
                return start + remaining as u32;
            }
            remaining -= raw.len() + HOLE.len_utf8();
        }
        template.span.start
    };
    let bytes = text.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] != b'<' {
            index += 1;
            continue;
        }
        let name = ["img", "button", "iframe"].into_iter().find(|name| {
            let end = index + 1 + name.len();
            bytes.len() >= end
                && bytes[index + 1..end].eq_ignore_ascii_case(name.as_bytes())
                && !bytes
                    .get(end)
                    .is_some_and(|next| next.is_ascii_alphanumeric() || *next == b'_')
        });
        let Some(name) = name else {
            index += 1;
            continue;
        };
        let Some(close) = text[index..].find('>') else {
            break;
        };
        let end = index + close + 1;
        let tag = &text[index..end];
        let offset = offset_of(index);
        match name {
            "img" if !has_attribute(tag, "alt") => findings.push(LintFinding {
                code: "image_without_alt",
                message: IMAGE_WITHOUT_ALT,
                offset,
            }),
            "iframe" if !has_attribute(tag, "title") => findings.push(LintFinding {
                code: "frame_without_title",
                message: FRAME_WITHOUT_TITLE,
                offset,
            }),
            "button"
                if !has_attribute(tag, "aria-label")
                    && !has_attribute(tag, "aria-labelledby")
                    && !has_attribute(tag, "title") =>
            {
                let after = &text[end..];
                if let Some(close) = closing_button(after)
                    && after[..close].trim_matches(is_js_space).is_empty()
                {
                    findings.push(LintFinding {
                        code: "button_without_name",
                        message: BUTTON_WITHOUT_NAME,
                        offset,
                    });
                }
            }
            _ => {}
        }
        index = end;
    }
}

/// Collects the findings of every `html` template in a module.
struct Templates {
    findings: Vec<LintFinding>,
}

impl<'a> Visit<'a> for Templates {
    fn visit_tagged_template_expression(&mut self, it: &TaggedTemplateExpression<'a>) {
        if let Expression::Identifier(tag) = &it.tag
            && TAGS.contains(&tag.name.as_str())
        {
            for expression in &it.quasi.expressions {
                let mut read = FrozenRead { found: None };
                read.visit_expression(expression);
                if let Some(offset) = read.found {
                    self.findings.push(LintFinding {
                        code: "template_frozen_read",
                        message: FROZEN_READ,
                        offset,
                    });
                }
            }
            markup(it, &mut self.findings);
        }
        walk::walk_tagged_template_expression(self, it);
    }
}

/// Checks every `html` template of a module. Returns the findings in source order; a module without templates, or one that does not parse, yields none.
pub fn lint(source: &str, source_type: SourceType) -> Vec<LintFinding> {
    if !source.contains("html`") && !source.contains("__zl_html`") {
        return Vec::new();
    }
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, source_type).parse();
    if parse_errors(parsed.diagnostics, source).is_some() {
        return Vec::new();
    }
    let mut templates = Templates {
        findings: Vec::new(),
    };
    templates.visit_program(&parsed.program);
    templates.findings.sort_by_key(|finding| finding.offset);
    templates.findings
}

/// The line and column, 1-based, of a byte offset, the column counted in UTF-16 units as the Vite plugin counts it.
pub fn position(source: &str, offset: u32) -> (usize, usize) {
    let head = &source[..(offset as usize).min(source.len())];
    let line = head.matches('\n').count() + 1;
    let line_start = head.rfind('\n').map_or(0, |index| index + 1);
    (line, head[line_start..].encode_utf16().count() + 1)
}

#[cfg(test)]
mod tests {
    use super::{lint, position};
    use oxc_span::SourceType;
    use std::fs;
    use std::path::Path;

    fn codes(source: &str, source_type: SourceType) -> Vec<&'static str> {
        lint(source, source_type)
            .iter()
            .map(|finding| finding.code)
            .collect()
    }

    #[test]
    fn reads_typescript_and_skips_functions_and_other_tags() {
        let source = "import { html, signal } from \"zerolith\";\nconst count = signal<number>(0);\nexport const a = html`<p>${count.get() as number}</p>`;\nexport const b = html`<p @click=${(): void => count.set(count.get() + 1)}>${count}</p>`;\nexport const c = other`<p>${count.get()}</p>`;\n";
        assert_eq!(
            codes(source, SourceType::ts()),
            vec!["template_frozen_read"]
        );
        assert!(lint("const v = 1;\n", SourceType::mjs()).is_empty());
        assert!(lint("const v = html`<p>${", SourceType::mjs()).is_empty());
    }

    #[test]
    fn counts_columns_in_utf16_units() {
        let source = "const s = \"\u{1f600}\"; const t = html`<img>`;\n";
        let finding = &lint(source, SourceType::mjs())[0];
        assert_eq!(position(source, finding.offset), (1, 32));
    }

    #[test]
    fn matches_the_vite_plugin_on_the_shared_fixture() {
        let fixture =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages/vite/test/fixture-lint");
        let Ok(input) = fs::read_to_string(fixture.join("input.js")) else {
            return;
        };
        let expected: Vec<serde_json::Value> =
            serde_json::from_str(&fs::read_to_string(fixture.join("expected.json")).unwrap())
                .unwrap();
        let found: Vec<serde_json::Value> = lint(&input, SourceType::mjs())
            .iter()
            .map(|finding| {
                let (line, column) = position(&input, finding.offset);
                serde_json::json!({ "code": finding.code, "line": line, "column": column, "message": finding.message })
            })
            .collect();
        assert_eq!(found, expected);
    }
}
