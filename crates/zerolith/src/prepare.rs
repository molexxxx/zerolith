//! The template prepare pass for `zerolith build`, mirroring
//! `prepare.ts` in the Vite plugin: every `html` literal is scanned ahead
//! of time, and the lowered module registers the markup and the part table
//! next to the literal through the core's `prepared`, so the browser binds
//! the template without scanning it. The parity test holds the output to
//! the plugin's, byte for byte.

use std::collections::{BTreeSet, HashSet};

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    BindingIdentifier, Expression, IdentifierReference, ImportDeclarationSpecifier, Program,
    Statement, StaticMemberExpression, TaggedTemplateExpression,
};
use oxc_ast_visit::{Visit, walk};
use oxc_parser::Parser;
use oxc_span::{GetSpan, SourceType, Span};

use crate::scan::scan;
use crate::transform::{Edit, TransformError, apply_edits, fail, json, parse_errors};

/// The binding the lowered code imports `prepared` under, chosen not to clash with user code.
pub const PREPARED_BINDING: &str = "__zl_prepared";
/// The prefix of the hoisted template bindings, numbered per module.
pub const TEMPLATE_BINDING: &str = "__zl_t";

const SPECIFIER: &str = "zerolith";

struct Template {
    span: Span,
    tag: Span,
    strings: Option<Vec<String>>,
    expressions: Vec<Span>,
}

struct Finder<'s> {
    source: &'s str,
    locals: HashSet<String>,
    namespaces: HashSet<String>,
    allowed: BTreeSet<u32>,
    templates: Vec<Template>,
    error: Option<TransformError>,
}

fn position(source: &str, offset: u32) -> (usize, usize) {
    let head = &source[..(offset as usize).min(source.len())];
    let line = head.matches('\n').count() + 1;
    let column = head
        .rfind('\n')
        .map_or(head.len(), |index| head.len() - index - 1)
        + 1;
    (line, column)
}

fn newlines(text: &str) -> String {
    "\n".repeat(text.matches('\n').count())
}

impl Finder<'_> {
    fn refuse(&mut self, message: &str, offset: u32) {
        if self.error.is_none() {
            let (line, column) = position(self.source, offset);
            self.error = Some(fail(format!("{message} ({line}:{column})")));
        }
    }

    fn is_tag(&self, expression: &Expression<'_>) -> bool {
        match expression {
            Expression::Identifier(identifier) => self.locals.contains(identifier.name.as_str()),
            Expression::StaticMemberExpression(member) => self.is_namespace_html(member),
            _ => false,
        }
    }

    fn is_namespace_html(&self, member: &StaticMemberExpression<'_>) -> bool {
        match &member.object {
            Expression::Identifier(object) => {
                self.namespaces.contains(object.name.as_str()) && member.property.name == "html"
            }
            _ => false,
        }
    }
}

impl<'a> Visit<'a> for Finder<'_> {
    fn visit_tagged_template_expression(&mut self, it: &TaggedTemplateExpression<'a>) {
        if self.error.is_some() {
            return;
        }
        if self.is_tag(&it.tag) {
            self.allowed.insert(it.tag.span().start);
            let strings: Option<Vec<String>> = it
                .quasi
                .quasis
                .iter()
                .map(|quasi| {
                    quasi
                        .value
                        .cooked
                        .and_then(|cooked| cooked.as_str())
                        .map(str::to_string)
                })
                .collect();
            self.templates.push(Template {
                span: it.span,
                tag: it.tag.span(),
                strings,
                expressions: it
                    .quasi
                    .expressions
                    .iter()
                    .map(|expression| expression.span())
                    .collect(),
            });
        }
        walk::walk_tagged_template_expression(self, it);
    }

    fn visit_static_member_expression(&mut self, it: &StaticMemberExpression<'a>) {
        if self.error.is_some() {
            return;
        }
        if self.is_namespace_html(it) && !self.allowed.contains(&it.span.start) {
            self.refuse(
                "html from zerolith is used here other than as a template tag, which the prepare pass cannot follow",
                it.span.start,
            );
            return;
        }
        walk::walk_static_member_expression(self, it);
    }

    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        if self.error.is_none()
            && self.locals.contains(it.name.as_str())
            && !self.allowed.contains(&it.span.start)
        {
            self.refuse(
                "html from zerolith is used here other than as a template tag, which the prepare pass cannot follow",
                it.span.start,
            );
        }
    }

    fn visit_binding_identifier(&mut self, it: &BindingIdentifier<'a>) {
        if self.error.is_none()
            && self.locals.contains(it.name.as_str())
            && !self.allowed.contains(&it.span.start)
        {
            self.refuse(
                "html from zerolith is declared here as something else, which the prepare pass cannot follow",
                it.span.start,
            );
        }
    }
}

fn collect_imports(program: &Program<'_>, finder: &mut Finder<'_>) -> Option<u32> {
    let mut first_statement = None;
    for statement in &program.body {
        let Statement::ImportDeclaration(declaration) = statement else {
            first_statement.get_or_insert(statement.span().start);
            continue;
        };
        if declaration.source.value != SPECIFIER {
            continue;
        }
        let Some(specifiers) = &declaration.specifiers else {
            continue;
        };
        for specifier in specifiers {
            match specifier {
                ImportDeclarationSpecifier::ImportSpecifier(import) => {
                    finder.allowed.insert(import.local.span.start);
                    if import.imported.name() == "html" {
                        finder.locals.insert(import.local.name.to_string());
                    }
                }
                ImportDeclarationSpecifier::ImportNamespaceSpecifier(import) => {
                    finder.allowed.insert(import.local.span.start);
                    finder.namespaces.insert(import.local.name.to_string());
                }
                ImportDeclarationSpecifier::ImportDefaultSpecifier(import) => {
                    finder.allowed.insert(import.local.span.start);
                }
            }
        }
    }
    first_statement
}

/// Prepares every `html` literal of a JavaScript module; a module that imports no `html` from zerolith comes back unchanged.
pub fn prepare(source: &str) -> Result<String, TransformError> {
    if !source.contains(SPECIFIER) {
        return Ok(source.to_string());
    }
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, SourceType::mjs()).parse();
    if let Some(error) = parse_errors(parsed.diagnostics, source) {
        return Err(error);
    }
    let mut finder = Finder {
        source,
        locals: HashSet::new(),
        namespaces: HashSet::new(),
        allowed: BTreeSet::new(),
        templates: Vec::new(),
        error: None,
    };
    let first_statement = collect_imports(&parsed.program, &mut finder);
    if finder.locals.is_empty() && finder.namespaces.is_empty() {
        return Ok(source.to_string());
    }
    finder.visit_program(&parsed.program);
    if let Some(error) = finder.error {
        return Err(error);
    }
    if finder.templates.is_empty() {
        return Ok(source.to_string());
    }
    let mut edits = vec![Edit {
        start: 0,
        end: 0,
        text: format!("import {{ prepared as {PREPARED_BINDING} }} from \"{SPECIFIER}\";"),
    }];
    let mut hoisted = String::new();
    for (index, template) in finder.templates.iter().enumerate() {
        let Some(strings) = &template.strings else {
            let (line, column) = position(source, template.span.start);
            return Err(fail(format!(
                "this template has an escape sequence with no value, which the prepare pass cannot lower ({line}:{column})"
            )));
        };
        let scanned = scan(strings).map_err(|error| {
            let (line, column) = position(source, template.span.start);
            fail(format!("{error} ({line}:{column})"))
        })?;
        let name = format!("{TEMPLATE_BINDING}{index}");
        let table: Vec<(u8, &str, &[String])> = scanned
            .parts
            .iter()
            .map(|part| (part.kind, part.name.as_str(), part.strings.as_slice()))
            .collect();
        hoisted.push_str(&format!(
            "const {name} = {PREPARED_BINDING}({}, {}, {});",
            serde_json::to_string(strings).unwrap_or_else(|_| "[]".to_string()),
            json(&scanned.markup),
            serde_json::to_string(&table).unwrap_or_else(|_| "[]".to_string())
        ));
        let slice = |span: Span| &source[span.start as usize..span.end as usize];
        let tag = slice(template.tag);
        let Some(first) = template.expressions.first() else {
            edits.push(Edit {
                start: template.span.start,
                end: template.span.end,
                text: format!("{tag}({name}{})", newlines(slice(template.span))),
            });
            continue;
        };
        edits.push(Edit {
            start: template.span.start,
            end: first.start,
            text: format!(
                "{tag}({name},{} ",
                newlines(&source[template.span.start as usize..first.start as usize])
            ),
        });
        for pair in template.expressions.windows(2) {
            let (previous, next) = (pair[0], pair[1]);
            edits.push(Edit {
                start: previous.end,
                end: next.start,
                text: format!(
                    ",{} ",
                    newlines(&source[previous.end as usize..next.start as usize])
                ),
            });
        }
        let last = template.expressions[template.expressions.len() - 1];
        edits.push(Edit {
            start: last.end,
            end: template.span.end,
            text: format!(
                "{})",
                newlines(&source[last.end as usize..template.span.end as usize])
            ),
        });
    }
    let at = first_statement.unwrap_or(source.len() as u32);
    edits.push(Edit {
        start: at,
        end: at,
        text: hoisted,
    });
    Ok(apply_edits(source, edits))
}

#[cfg(test)]
mod tests {
    use super::prepare;
    use std::fs;
    use std::path::Path;

    #[test]
    fn hoists_the_scan_and_calls_html_with_it() {
        let out = prepare("import { html } from \"zerolith\";\nexport const view = (cls, name) => html`<p class=\"${cls}\">${name}</p>`;\n").unwrap();
        assert!(out.starts_with(
            "import { prepared as __zl_prepared } from \"zerolith\";import { html } from \"zerolith\";\n"
        ));
        assert!(out.contains("const __zl_t0 = __zl_prepared([\"<p class=\\\"\",\"\\\">\",\"</p>\"], \"<p zl$0><!--zl$--></p>\", [[1,\"class\",[\"\",\"\"]],[0,\"\",[]]]);"));
        assert!(out.contains("export const view = (cls, name) => html(__zl_t0, cls, name);"));
    }

    #[test]
    fn keeps_line_counts_follows_aliases_and_hoists_before_the_first_statement() {
        let source = "import { html } from \"zerolith\";\n\nexport const list = (items) => html`\n    <ul>\n        ${items.map((item) => html`<li>${item}</li>`)}\n    </ul>\n`;\n";
        let out = prepare(source).unwrap();
        assert_eq!(out.lines().count(), source.lines().count());
        assert!(out.contains("html(__zl_t0,\n\n items.map((item) => html(__zl_t1, item))\n\n)"));
        assert!(
            prepare("import { html as h } from \"zerolith\";\nexport const v = h`<p></p>`;\n")
                .unwrap()
                .contains("export const v = h(__zl_t0);")
        );
        assert!(
            prepare("import * as z from \"zerolith\";\nexport const v = z.html`<p></p>`;\n")
                .unwrap()
                .contains("export const v = z.html(__zl_t0);")
        );
        let top = prepare(
            "import { html, render } from \"zerolith\";\nrender(html`<p></p>`, \"#app\");\n",
        )
        .unwrap();
        assert_eq!(
            top.lines().nth(1),
            Some(
                "const __zl_t0 = __zl_prepared([\"<p></p>\"], \"<p></p>\", []);render(html(__zl_t0), \"#app\");"
            )
        );
        assert_eq!(
            prepare("import { render } from \"zerolith\";\nrender(1, \"#app\");\n").unwrap(),
            "import { render } from \"zerolith\";\nrender(1, \"#app\");\n"
        );
    }

    #[test]
    fn refuses_other_uses_of_html_and_templates_the_scanner_refuses() {
        let value = prepare("import { html } from \"zerolith\";\nconst tag = html;\n").unwrap_err();
        assert!(
            value.message.contains(
                "other than as a template tag, which the prepare pass cannot follow (2:13)"
            ),
            "{}",
            value.message
        );
        let shadow =
            prepare("import { html } from \"zerolith\";\nexport function f(html) { return 1; }\n")
                .unwrap_err();
        assert!(shadow.message.contains(
            "declared here as something else, which the prepare pass cannot follow (2:19)"
        ));
        let member =
            prepare("import * as z from \"zerolith\";\nconst tag = z.html;\n").unwrap_err();
        assert!(
            member.message.contains(
                "other than as a template tag, which the prepare pass cannot follow (2:13)"
            )
        );
        let key = prepare("import { html } from \"zerolith\";\nexport const o = { html: 1 };\nexport const p = o.html;\n").unwrap();
        assert!(key.contains("{ html: 1 }"));
        let bad = prepare(
            "import { html } from \"zerolith\";\nexport const v = (x) => html`<p ${x}></p>`;\n",
        )
        .unwrap_err();
        assert!(
            bad.message.contains("binding_in_tag_position"),
            "{}",
            bad.message
        );
        assert!(bad.message.contains("(2:25)"), "{}", bad.message);
    }

    #[test]
    fn matches_the_vite_plugin_on_the_shared_fixture() {
        let fixture =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages/vite/test/fixture-prepare");
        let Ok(input) = fs::read_to_string(fixture.join("input.js")) else {
            return;
        };
        let expected = fs::read_to_string(fixture.join("output.js")).unwrap();
        assert_eq!(prepare(&input).unwrap(), expected);
    }
}
