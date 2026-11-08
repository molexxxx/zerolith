//! What a module binds to a name among its own top-level declarations and
//! imports, and what it exports under a name, so the template lint over a
//! project reports a capitalized name bound as content only when it is a
//! function, wherever the module that defines it is.

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    Declaration, ExportDefaultDeclarationKind, Expression, ImportDeclarationSpecifier, Program,
    Statement, StringLiteral,
};
use oxc_parser::Parser;
use oxc_span::SourceType;

use crate::transform::parse_errors;

/// What a module binds to a name.
#[derive(Debug, PartialEq, Eq)]
pub enum Binding {
    /// A function or a class, which bound as content fails when the page renders.
    Function,
    /// Any other value, such as a string, a view, an enum, or a namespace.
    Value,
    /// An import or a re-export: the specifier, and the name the other module exports, `default` for its default export.
    From { specifier: String, name: String },
    /// Not bound here, but exported by none or one of the modules `export *` names.
    Stars(Vec<String>),
}

/// A string literal's text; one holding a lone surrogate, which names no file, as empty.
fn text(literal: &StringLiteral<'_>) -> String {
    literal.value.as_str().unwrap_or("").to_string()
}

/// Parses a module and runs `read` over it; `None` when it does not parse.
fn with_program<T>(
    source: &str,
    source_type: SourceType,
    read: impl FnOnce(&Program<'_>) -> Option<T>,
) -> Option<T> {
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, source_type).parse();
    if parse_errors(parsed.diagnostics, source).is_some() {
        return None;
    }
    read(&parsed.program)
}

/// What one declaration binds to `name`, when it declares it.
fn declaration(declaration: &Declaration<'_>, name: &str) -> Option<Binding> {
    match declaration {
        Declaration::FunctionDeclaration(function)
            if function.id.as_ref().is_some_and(|id| id.name == name) =>
        {
            Some(Binding::Function)
        }
        Declaration::ClassDeclaration(class)
            if class.id.as_ref().is_some_and(|id| id.name == name) =>
        {
            Some(Binding::Function)
        }
        Declaration::VariableDeclaration(variables) => variables
            .declarations
            .iter()
            .find(|declarator| {
                declarator
                    .id
                    .get_identifier_name()
                    .is_some_and(|id| id == name)
            })
            .map(|declarator| match declarator.init {
                Some(
                    Expression::ArrowFunctionExpression(_)
                    | Expression::FunctionExpression(_)
                    | Expression::ClassExpression(_),
                ) => Binding::Function,
                _ => Binding::Value,
            }),
        Declaration::TSEnumDeclaration(enumeration) if enumeration.id.name == name => {
            Some(Binding::Value)
        }
        _ => None,
    }
}

/// What a parsed module binds to `name` at its top level, by a declaration, exported or not, or an import.
fn declared(program: &Program<'_>, name: &str) -> Option<Binding> {
    for statement in &program.body {
        let found = match statement {
            Statement::ExportDeclaration(export) => declaration(&export.declaration, name),
            Statement::ImportDeclaration(import) if !import.import_kind.is_type() => import
                .specifiers
                .iter()
                .flatten()
                .find_map(|specifier| match specifier {
                    ImportDeclarationSpecifier::ImportSpecifier(imported)
                        if imported.local.name == name && !imported.import_kind.is_type() =>
                    {
                        Some(Binding::From {
                            specifier: text(&import.source),
                            name: imported.imported.name().to_string(),
                        })
                    }
                    ImportDeclarationSpecifier::ImportDefaultSpecifier(imported)
                        if imported.local.name == name =>
                    {
                        Some(Binding::From {
                            specifier: text(&import.source),
                            name: "default".to_string(),
                        })
                    }
                    ImportDeclarationSpecifier::ImportNamespaceSpecifier(imported)
                        if imported.local.name == name =>
                    {
                        Some(Binding::Value)
                    }
                    _ => None,
                }),
            other => other
                .as_declaration()
                .and_then(|found| declaration(found, name)),
        };
        if found.is_some() {
            return found;
        }
    }
    None
}

/// What a parsed module exports under `name`, `default` for its default export.
fn exported(program: &Program<'_>, name: &str) -> Option<Binding> {
    let mut stars = Vec::new();
    for statement in &program.body {
        match statement {
            Statement::ExportDeclaration(export) => {
                if let Some(found) = declaration(&export.declaration, name) {
                    return Some(found);
                }
            }
            Statement::ExportNamedDeclaration(export) if !export.export_kind.is_type() => {
                if let Some(specifier) = export.specifiers.iter().find(|specifier| {
                    specifier.exported.name() == name && !specifier.export_kind.is_type()
                }) {
                    return declared(program, &specifier.local.name());
                }
            }
            Statement::ExportFromDeclaration(export) if !export.export_kind.is_type() => {
                if let Some(specifier) = export.specifiers.iter().find(|specifier| {
                    specifier.exported.name() == name && !specifier.export_kind.is_type()
                }) {
                    return Some(Binding::From {
                        specifier: text(&export.source),
                        name: specifier.local.name().to_string(),
                    });
                }
            }
            Statement::ExportDefaultDeclaration(export) if name == "default" => {
                return match &export.declaration {
                    ExportDefaultDeclarationKind::FunctionDeclaration(_)
                    | ExportDefaultDeclarationKind::ClassDeclaration(_)
                    | ExportDefaultDeclarationKind::ArrowFunctionExpression(_)
                    | ExportDefaultDeclarationKind::FunctionExpression(_)
                    | ExportDefaultDeclarationKind::ClassExpression(_) => Some(Binding::Function),
                    ExportDefaultDeclarationKind::Identifier(local) => {
                        declared(program, &local.name)
                    }
                    _ => Some(Binding::Value),
                };
            }
            Statement::ExportAllDeclaration(export) if !export.export_kind.is_type() => {
                match &export.exported {
                    Some(namespace) if namespace.name() == name => return Some(Binding::Value),
                    Some(_) => {}
                    None => stars.push(text(&export.source)),
                }
            }
            _ => {}
        }
    }
    (!stars.is_empty()).then_some(Binding::Stars(stars))
}

/// What a module binds to `name` at its top level; `None` when it binds nothing there or does not parse.
pub fn local(source: &str, source_type: SourceType, name: &str) -> Option<Binding> {
    with_program(source, source_type, |program| declared(program, name))
}

/// What a module exports under `name`, `default` for its default export; `None` when it exports nothing under it or does not parse.
pub fn export(source: &str, source_type: SourceType, name: &str) -> Option<Binding> {
    with_program(source, source_type, |program| exported(program, name))
}

#[cfg(test)]
mod tests {
    use super::{Binding, export, local};
    use oxc_span::SourceType;

    fn from(specifier: &str, name: &str) -> Option<Binding> {
        Some(Binding::From {
            specifier: specifier.to_string(),
            name: name.to_string(),
        })
    }

    #[test]
    fn tells_an_exported_function_from_an_exported_value() {
        let module = r#"
import { html } from "zerolith";
export const APP_NAME = "Tips";
export const Logo = html`<b>Tips</b>`;
export enum Status { Ready = "ready" }
export function Footer() { return html`<p></p>`; }
export const Side = () => html`<aside></aside>`;
export class Panel {}
const Hidden = function () { return html``; };
const Plain = 3;
export { Hidden as Shown, Plain as Number };
export type Props = { label: string };
"#;
        let ts = SourceType::ts();
        assert_eq!(export(module, ts, "APP_NAME"), Some(Binding::Value));
        assert_eq!(export(module, ts, "Logo"), Some(Binding::Value));
        assert_eq!(export(module, ts, "Status"), Some(Binding::Value));
        assert_eq!(export(module, ts, "Footer"), Some(Binding::Function));
        assert_eq!(export(module, ts, "Side"), Some(Binding::Function));
        assert_eq!(export(module, ts, "Panel"), Some(Binding::Function));
        assert_eq!(export(module, ts, "Shown"), Some(Binding::Function));
        assert_eq!(export(module, ts, "Number"), Some(Binding::Value));
        assert_eq!(export(module, ts, "Hidden"), None);
        assert_eq!(export(module, ts, "Props"), None);
        assert_eq!(export(module, ts, "Missing"), None);
    }

    #[test]
    fn follows_re_exports_defaults_and_stars_by_name() {
        let ts = SourceType::ts();
        let barrel = r#"
import { Footer } from "./footer.ts";
export { Footer as Bottom };
export { Side as Edge, default as Main } from "./parts.ts";
export * from "./more.ts";
export * as icons from "./icons.ts";
"#;
        assert_eq!(export(barrel, ts, "Bottom"), from("./footer.ts", "Footer"));
        assert_eq!(export(barrel, ts, "Edge"), from("./parts.ts", "Side"));
        assert_eq!(export(barrel, ts, "Main"), from("./parts.ts", "default"));
        assert_eq!(export(barrel, ts, "icons"), Some(Binding::Value));
        assert_eq!(
            export(barrel, ts, "Anything"),
            Some(Binding::Stars(vec!["./more.ts".to_string()]))
        );
        assert_eq!(
            export("export default function () {}", ts, "default"),
            Some(Binding::Function)
        );
        assert_eq!(
            export("const Card = () => 1; export default Card;", ts, "default"),
            Some(Binding::Function)
        );
        assert_eq!(
            export("export default { title: 'x' };", ts, "default"),
            Some(Binding::Value)
        );
    }

    #[test]
    fn reads_what_a_module_imports_a_name_from() {
        let module = r#"
import Card, { Footer as Bottom, type Props } from "./parts.ts";
import * as Icons from "./icons.ts";
import type { Shape } from "./shape.ts";
function Local() {}
"#;
        let ts = SourceType::ts();
        assert_eq!(local(module, ts, "Card"), from("./parts.ts", "default"));
        assert_eq!(local(module, ts, "Bottom"), from("./parts.ts", "Footer"));
        assert_eq!(local(module, ts, "Icons"), Some(Binding::Value));
        assert_eq!(local(module, ts, "Local"), Some(Binding::Function));
        assert_eq!(local(module, ts, "Props"), None);
        assert_eq!(local(module, ts, "Shape"), None);
        assert_eq!(local("this is not ( valid", ts, "Card"), None);
    }
}
