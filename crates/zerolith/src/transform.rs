//! Serving TypeScript and JSX without a build step. The dev server hands
//! `.ts`, `.tsx`, and `.jsx` sources through here: the JSX lowering of RFC
//! 0001 as text edits over the parser's tree, mirroring the Vite plugin so
//! both produce the same `html` calls, then type stripping through oxc's
//! transformer and code generation.

use std::fmt;
use std::path::Path;

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    Expression, JSXAttribute, JSXAttributeItem, JSXAttributeName, JSXAttributeValue, JSXChild,
    JSXElement, JSXElementName, JSXFragment, JSXMemberExpression, JSXMemberExpressionObject,
};
use oxc_ast_visit::Visit;
use oxc_codegen::{Codegen, CodegenOptions};
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::{GetSpan, SourceType, Span};
use oxc_transformer::{TransformOptions, Transformer};

/// The binding the lowered code imports `html` under, chosen not to clash with user code.
pub const HTML_BINDING: &str = "__zl_html";

/// Why a source could not be transformed.
#[derive(Debug)]
pub struct TransformError {
    pub message: String,
}

impl fmt::Display for TransformError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for TransformError {}

fn fail(message: impl Into<String>) -> TransformError {
    TransformError {
        message: message.into(),
    }
}

/// Whether the dev server transforms files with this extension.
pub fn transforms(extension: &str) -> bool {
    matches!(extension, "ts" | "mts" | "tsx" | "jsx")
}

/// Transforms one source as its extension says: JSX lowered, types stripped, JavaScript out.
pub fn transform(path: &Path, source: &str) -> Result<String, TransformError> {
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("");
    match extension {
        "tsx" => {
            let lowered = lower_jsx(source, SourceType::tsx())?;
            strip_types(path, &lowered)
        }
        "jsx" => lower_jsx(source, SourceType::jsx()),
        "ts" | "mts" => strip_types(path, source),
        _ => Ok(source.to_string()),
    }
}

fn parse_errors(diagnostics: oxc_diagnostics::Diagnostics, source: &str) -> Option<TransformError> {
    diagnostics
        .into_vec()
        .into_iter()
        .next()
        .map(|diagnostic| fail(diagnostic.render_with_source_code(source.to_string())))
}

/// Removes the types from a TypeScript module and prints it as JavaScript.
pub fn strip_types(path: &Path, source: &str) -> Result<String, TransformError> {
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, SourceType::ts()).parse();
    if let Some(error) = parse_errors(parsed.diagnostics, source) {
        return Err(error);
    }
    let mut program = parsed.program;
    let semantic = SemanticBuilder::new().build(&program);
    if let Some(error) = parse_errors(semantic.diagnostics, source) {
        return Err(error);
    }
    let scoping = semantic.semantic.into_scoping();
    let options = TransformOptions::default();
    let result =
        Transformer::new(&allocator, path, &options).build_with_scoping(scoping, &mut program);
    if let Some(error) = parse_errors(result.diagnostics, source) {
        return Err(error);
    }
    Ok(Codegen::new()
        .with_options(CodegenOptions::default())
        .build(&program)
        .code)
}

struct Edit {
    start: u32,
    end: u32,
    text: String,
}

fn apply_edits(text: &str, mut edits: Vec<Edit>) -> String {
    edits.sort_by(|a, b| a.start.cmp(&b.start).then(a.end.cmp(&b.end)));
    let mut out = String::with_capacity(text.len());
    let mut cursor = 0usize;
    for edit in edits {
        let start = edit.start as usize;
        let end = edit.end as usize;
        out.push_str(&text[cursor..start]);
        out.push_str(&edit.text);
        cursor = end;
    }
    out.push_str(&text[cursor..]);
    out
}

/// JSX text semantics: lines trimmed, whitespace-only lines dropped, the rest joined with one space.
fn clean_text(raw: &str) -> String {
    let lines: Vec<&str> = raw.split(['\n', '\r']).collect();
    let last_non_empty = lines
        .iter()
        .rposition(|line| line.chars().any(|c| c != ' ' && c != '\t'))
        .unwrap_or(0);
    let mut text = String::new();
    let count = lines.len();
    for (index, line) in lines.iter().enumerate() {
        let mut trimmed: String = line.replace('\t', " ");
        if index != 0 {
            trimmed = trimmed.trim_start_matches(' ').to_string();
        }
        if index != count - 1 {
            trimmed = trimmed.trim_end_matches(' ').to_string();
        }
        if !trimmed.is_empty() {
            text.push_str(&trimmed);
            if index != last_non_empty {
                text.push(' ');
            }
        }
    }
    text
}

/// Escapes text for the inside of a template literal.
fn literal(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace('`', "\\`")
        .replace("${", "\\${")
}

fn member_name(expression: &JSXMemberExpression<'_>) -> String {
    let object = match &expression.object {
        JSXMemberExpressionObject::IdentifierReference(identifier) => identifier.name.to_string(),
        JSXMemberExpressionObject::MemberExpression(inner) => member_name(inner),
        JSXMemberExpressionObject::ThisExpression(_) => "this".to_string(),
    };
    format!("{object}.{}", expression.property.name)
}

fn element_name(name: &JSXElementName<'_>) -> String {
    match name {
        JSXElementName::Identifier(identifier) => identifier.name.to_string(),
        JSXElementName::IdentifierReference(identifier) => identifier.name.to_string(),
        JSXElementName::NamespacedName(namespaced) => {
            format!("{}:{}", namespaced.namespace.name, namespaced.name.name)
        }
        JSXElementName::MemberExpression(member) => member_name(member),
        JSXElementName::ThisExpression(_) => "this".to_string(),
    }
}

fn is_component(name: &JSXElementName<'_>) -> bool {
    match name {
        JSXElementName::Identifier(identifier) => {
            let text = identifier.name.as_str();
            text.chars().next().is_some_and(|c| c.is_uppercase()) && !text.contains('-')
        }
        JSXElementName::NamespacedName(_) => false,
        _ => true,
    }
}

/// The template attribute spelling of a JSX attribute name: `prop:value` is `.value`, `on:click` is `@click`, `bool:open` is `?open`.
fn attribute_name(name: &JSXAttributeName<'_>) -> String {
    match name {
        JSXAttributeName::Identifier(identifier) => identifier.name.to_string(),
        JSXAttributeName::NamespacedName(namespaced) => {
            let local = namespaced.name.name.as_str();
            match namespaced.namespace.name.as_str() {
                "prop" => format!(".{local}"),
                "on" => format!("@{local}"),
                "bool" => format!("?{local}"),
                "attr" => local.to_string(),
                other => format!("{other}:{local}"),
            }
        }
    }
}

fn is_identifier(text: &str) -> bool {
    let mut chars = text.chars();
    chars
        .next()
        .is_some_and(|c| c.is_ascii_alphabetic() || c == '_' || c == '$')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$')
}

fn json(text: &str) -> String {
    serde_json::to_string(text).unwrap_or_else(|_| "\"\"".to_string())
}

enum JsxNode<'n, 'a> {
    Element(&'n JSXElement<'a>),
    Fragment(&'n JSXFragment<'a>),
}

struct Lowering<'s> {
    source: &'s str,
}

/// Collects the outermost JSX nodes under a node as edits relative to `base`.
struct Collector<'c, 's> {
    lowering: &'c Lowering<'s>,
    base: u32,
    edits: Vec<Edit>,
    error: Option<TransformError>,
}

impl<'c, 's> Collector<'c, 's> {
    fn record(&mut self, span: Span, node: JsxNode<'_, '_>) {
        if self.error.is_some() {
            return;
        }
        match self.lowering.view(node) {
            Ok(text) => self.edits.push(Edit {
                start: span.start - self.base,
                end: span.end - self.base,
                text,
            }),
            Err(error) => self.error = Some(error),
        }
    }
}

impl<'a> Visit<'a> for Collector<'_, '_> {
    fn visit_jsx_element(&mut self, it: &JSXElement<'a>) {
        self.record(it.span, JsxNode::Element(it));
    }

    fn visit_jsx_fragment(&mut self, it: &JSXFragment<'a>) {
        self.record(it.span, JsxNode::Fragment(it));
    }
}

impl Lowering<'_> {
    fn slice(&self, span: Span) -> &str {
        &self.source[span.start as usize..span.end as usize]
    }

    /// The source of an expression with every JSX inside it lowered.
    fn expression(&self, expression: &Expression<'_>) -> Result<String, TransformError> {
        let span = expression.span();
        let mut collector = Collector {
            lowering: self,
            base: span.start,
            edits: Vec::new(),
            error: None,
        };
        collector.visit_expression(expression);
        if let Some(error) = collector.error {
            return Err(error);
        }
        Ok(apply_edits(self.slice(span), collector.edits))
    }

    /// A whole JSX tree as an `html` call, padded to the lines it replaces.
    fn view(&self, node: JsxNode<'_, '_>) -> Result<String, TransformError> {
        let (span, inner) = match node {
            JsxNode::Element(element) => (element.span, self.element(element)?),
            JsxNode::Fragment(fragment) => (fragment.span, self.children(&fragment.children)?),
        };
        let call = format!("{HTML_BINDING}`{inner}`");
        let original_lines = self.slice(span).matches('\n').count();
        let padding = original_lines.saturating_sub(call.matches('\n').count());
        Ok(format!("({call}{})", "\n".repeat(padding)))
    }

    fn element(&self, element: &JSXElement<'_>) -> Result<String, TransformError> {
        let opening = &element.opening_element;
        if is_component(&opening.name) {
            return Ok(format!("${{{}}}", self.component(element)?));
        }
        let tag = element_name(&opening.name);
        let mut markup = format!("<{tag}");
        for attribute in &opening.attributes {
            match attribute {
                JSXAttributeItem::Attribute(attribute) => {
                    markup.push(' ');
                    markup.push_str(&self.attribute(attribute)?);
                }
                JSXAttributeItem::SpreadAttribute(spread) => {
                    return Err(fail(format!(
                        "spread attributes on <{tag}> cannot become a template; spread onto a component instead (offset {})",
                        spread.span.start
                    )));
                }
            }
        }
        if element.closing_element.is_none() {
            markup.push('>');
            return Ok(markup);
        }
        Ok(format!(
            "{markup}>{}</{tag}>",
            self.children(&element.children)?
        ))
    }

    fn attribute(&self, attribute: &JSXAttribute<'_>) -> Result<String, TransformError> {
        let name = attribute_name(&attribute.name);
        match &attribute.value {
            None => Ok(name),
            Some(JSXAttributeValue::StringLiteral(text)) => {
                Ok(format!("{name}={}", literal(self.slice(text.span))))
            }
            Some(JSXAttributeValue::ExpressionContainer(container)) => {
                match container.expression.as_expression() {
                    Some(expression) => Ok(format!("{name}=${{{}}}", self.expression(expression)?)),
                    None => Ok(name),
                }
            }
            Some(JSXAttributeValue::Element(element)) => Ok(format!(
                "{name}=${{{}}}",
                self.view(JsxNode::Element(element))?
            )),
            Some(JSXAttributeValue::Fragment(fragment)) => Ok(format!(
                "{name}=${{{}}}",
                self.view(JsxNode::Fragment(fragment))?
            )),
        }
    }

    fn children(&self, children: &[JSXChild<'_>]) -> Result<String, TransformError> {
        let mut markup = String::new();
        for child in children {
            match child {
                JSXChild::Text(text) => markup.push_str(&literal(&clean_text(&text.value))),
                JSXChild::Element(element) => markup.push_str(&self.element(element)?),
                JSXChild::Fragment(fragment) => {
                    markup.push_str(&self.children(&fragment.children)?)
                }
                JSXChild::ExpressionContainer(container) => {
                    if let Some(expression) = container.expression.as_expression() {
                        markup.push_str(&format!("${{{}}}", self.expression(expression)?));
                    }
                }
                JSXChild::Spread(spread) => {
                    return Err(fail(format!(
                        "spread children cannot become a template (offset {})",
                        spread.span.start
                    )));
                }
            }
        }
        Ok(markup)
    }

    fn child_value(&self, child: &JSXChild<'_>) -> Result<Option<String>, TransformError> {
        Ok(match child {
            JSXChild::Text(text) => {
                let cleaned = clean_text(&text.value);
                if cleaned.is_empty() {
                    None
                } else {
                    Some(json(&cleaned))
                }
            }
            JSXChild::Element(element) => Some(self.view(JsxNode::Element(element))?),
            JSXChild::Fragment(fragment) => Some(self.view(JsxNode::Fragment(fragment))?),
            JSXChild::ExpressionContainer(container) => {
                match container.expression.as_expression() {
                    Some(expression) => Some(self.expression(expression)?),
                    None => None,
                }
            }
            JSXChild::Spread(spread) => {
                return Err(fail(format!(
                    "spread children cannot become a template (offset {})",
                    spread.span.start
                )));
            }
        })
    }

    fn component(&self, element: &JSXElement<'_>) -> Result<String, TransformError> {
        let opening = &element.opening_element;
        let mut entries: Vec<String> = Vec::new();
        for attribute in &opening.attributes {
            match attribute {
                JSXAttributeItem::SpreadAttribute(spread) => {
                    entries.push(format!("...{}", self.expression(&spread.argument)?))
                }
                JSXAttributeItem::Attribute(attribute) => {
                    let key = match &attribute.name {
                        JSXAttributeName::Identifier(identifier) => identifier.name.to_string(),
                        JSXAttributeName::NamespacedName(namespaced) => {
                            format!("{}:{}", namespaced.namespace.name, namespaced.name.name)
                        }
                    };
                    let quoted = if is_identifier(&key) { key } else { json(&key) };
                    let value = match &attribute.value {
                        None => "true".to_string(),
                        Some(JSXAttributeValue::StringLiteral(text)) => match text.value.as_str() {
                            Some(value) => json(value),
                            None => self.slice(text.span).to_string(),
                        },
                        Some(JSXAttributeValue::ExpressionContainer(container)) => {
                            match container.expression.as_expression() {
                                Some(expression) => self.expression(expression)?,
                                None => "true".to_string(),
                            }
                        }
                        Some(JSXAttributeValue::Element(inner)) => {
                            self.view(JsxNode::Element(inner))?
                        }
                        Some(JSXAttributeValue::Fragment(inner)) => {
                            self.view(JsxNode::Fragment(inner))?
                        }
                    };
                    entries.push(format!("{quoted}: {value}"));
                }
            }
        }
        let mut values = Vec::new();
        for child in &element.children {
            if let Some(value) = self.child_value(child)? {
                values.push(value);
            }
        }
        match values.len() {
            0 => {}
            1 => entries.push(format!("children: {}", values[0])),
            _ => entries.push(format!("children: [{}]", values.join(", "))),
        }
        let arguments = if entries.is_empty() {
            "{}".to_string()
        } else {
            format!("{{ {} }}", entries.join(", "))
        };
        Ok(format!("{}({arguments})", element_name(&opening.name)))
    }
}

/// Lowers every JSX expression in a module to `html` calls and imports `html` under a private name; a module without JSX comes back unchanged.
pub fn lower_jsx(source: &str, source_type: SourceType) -> Result<String, TransformError> {
    if !source.contains('<') {
        return Ok(source.to_string());
    }
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, source_type).parse();
    if let Some(error) = parse_errors(parsed.diagnostics, source) {
        return Err(error);
    }
    let lowering = Lowering { source };
    let mut collector = Collector {
        lowering: &lowering,
        base: 0,
        edits: Vec::new(),
        error: None,
    };
    collector.visit_program(&parsed.program);
    if let Some(error) = collector.error {
        return Err(error);
    }
    if collector.edits.is_empty() {
        return Ok(source.to_string());
    }
    let mut edits = collector.edits;
    edits.push(Edit {
        start: 0,
        end: 0,
        text: format!("import {{ html as {HTML_BINDING} }} from \"zerolith\"; "),
    });
    Ok(apply_edits(source, edits))
}

#[cfg(test)]
mod tests {
    use super::{lower_jsx, strip_types, transform};
    use oxc_span::SourceType;
    use std::path::Path;

    fn lower(source: &str) -> String {
        lower_jsx(source, SourceType::tsx()).unwrap()
    }

    #[test]
    fn lowers_elements_namespaces_components_and_fragments() {
        assert_eq!(
            lower("const view = <main class=\"app\"><h1>Hello {name}</h1><p>plain</p></main>;\n"),
            "import { html as __zl_html } from \"zerolith\"; const view = (__zl_html`<main class=\"app\"><h1>Hello ${name}</h1><p>plain</p></main>`);\n"
        );
        let attributes = lower(
            "const v = <input id={id} prop:value={name} on:input={handle} bool:disabled={pending} ref={box} attr:title={t} autofocus data-x='1' />;",
        );
        assert!(attributes.contains("<input id=${id} .value=${name} @input=${handle} ?disabled=${pending} ref=${box} title=${t} autofocus data-x='1'>"));
        let component = lower(
            "const v = <Counter start={1} label=\"n\" live>\n    <b>child</b>\n    second\n    {third}\n</Counter>;",
        );
        assert!(component.contains("${Counter({ start: 1, label: \"n\", live: true, children: [(__zl_html`<b>child</b>`), \"second\", third] })}"));
        assert!(
            lower("const v = <Nav.Item {...props} active />;")
                .contains("${Nav.Item({ ...props, active: true })}")
        );
        assert!(lower("const v = <Empty />;").contains("${Empty({})}"));
        assert!(
            lower("const v = <><b>a</b> and <i>b</i></>;")
                .contains("(__zl_html`<b>a</b> and <i>b</i>`)")
        );
        let nested =
            lower("const v = <ul>{items.map((item) => <li key={item.id}>{item.name}</li>)}</ul>;");
        assert!(nested.contains(
            "<ul>${items.map((item) => (__zl_html`<li key=${item.id}>${item.name}</li>`))}</ul>"
        ));
        assert!(
            lower("const v = <Card title={<b>t</b>} />;")
                .contains("Card({ title: (__zl_html`<b>t</b>`) })")
        );
    }

    #[test]
    fn applies_whitespace_rules_escapes_and_keeps_line_counts() {
        assert!(
            lower("const v = (\n    <p>\n        first line\n        second line\n    </p>\n);\n")
                .contains("<p>first line second line</p>")
        );
        assert!(
            lower("const v = <p>{\"a\"} `tick` and ${not}</p>;")
                .contains("<p>${\"a\"} \\`tick\\` and $${not}</p>")
        );
        assert!(lower("const v = <p>{/* a comment */}x</p>;").contains("<p>x</p>"));
        let source = "const v = (\n    <main>\n        <h1>{title}</h1>\n    </main>\n);\nexport const after = 1;\n";
        let out = lower(source);
        assert_eq!(out.lines().count(), source.lines().count());
        assert_eq!(out.lines().nth(5), Some("export const after = 1;"));
        assert_eq!(lower("const a = 1 < 2;\n"), "const a = 1 < 2;\n");
    }

    #[test]
    fn refuses_spreads_on_elements_and_reports_parse_errors() {
        assert!(
            lower_jsx("const v = <div {...props} />;", SourceType::tsx())
                .unwrap_err()
                .message
                .contains("spread attributes on <div>")
        );
        assert!(
            lower_jsx("const v = <div>{...children}</div>;", SourceType::tsx())
                .unwrap_err()
                .message
                .contains("spread children")
        );
        assert!(lower_jsx("const v = <div>", SourceType::tsx()).is_err());
    }

    #[test]
    fn strips_types_and_transforms_by_extension() {
        let stripped = strip_types(Path::new("a.ts"), "export function add(a: number, b: number): number { return a + b; }\ninterface X { a: string }\nexport const x: X = { a: \"s\" };\n").unwrap();
        assert!(stripped.contains("export function add(a, b) {"));
        assert!(!stripped.contains("interface"));
        assert!(!stripped.contains(": number"));
        let tsx = transform(Path::new("c.tsx"), "import { signal } from \"zerolith\";\nexport function C({ n }: { n: number }) {\n    const count = signal(n);\n    return <p>{count}</p>;\n}\n").unwrap();
        assert!(tsx.contains("__zl_html`<p>${count}</p>`"));
        assert!(!tsx.contains(": number"));
        assert!(tsx.contains("import { html as __zl_html } from \"zerolith\""));
        let jsx = transform(Path::new("c.jsx"), "export const v = <p>{x}</p>;\n").unwrap();
        assert!(jsx.contains("__zl_html`<p>${x}</p>`"));
        assert_eq!(
            transform(Path::new("c.js"), "const a = 1;\n").unwrap(),
            "const a = 1;\n"
        );
    }
}
