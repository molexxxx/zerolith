//! The imports a module makes, read with the parser: static ones,
//! re-exports, and dynamic imports with a literal specifier.

use std::collections::BTreeMap;

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    BindingPattern, Expression, ImportExpression, Statement, VariableDeclarationKind,
};
use oxc_ast_visit::{Visit, walk};
use oxc_parser::Parser;
use oxc_span::SourceType;

/// The paths a module imports, read with the parser, so minified code such as `from"./x.js"` and an import for its effects alone count, and text that only looks like an import does not.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Imports {
    /// The relative imports and re-exports, in source order, which load before the module runs.
    pub statically: Vec<String>,
    /// The literal relative paths `import()` loads when the module asks for them, in source order.
    pub dynamically: Vec<String>,
    /// The bare specifiers imported or re-exported, such as `zerolith`, which an import map resolves, in source order.
    pub bare: Vec<String>,
    /// The bare specifiers `import()` loads with a literal, in source order.
    pub bare_dynamically: Vec<String>,
    /// The root-relative paths imported or re-exported, such as `/src/app.js`, in source order.
    pub rooted: Vec<String>,
    /// The root-relative paths `import()` loads with a literal, in source order.
    pub rooted_dynamically: Vec<String>,
    /// True when an `import()` names its module with an expression the module does not state, as `import(name)` with a name computed at run time does; a literal, a template without expressions, and a top-level `const` holding one are followed.
    pub computed: bool,
}

/// The path an `import()` call names, when it is a string or a template with no substitutions, as a minifier may write one. The split check reads strings only, as the Vite plugin does; vendoring reads published, minified modules.
/// The text of a string literal or a template without expressions.
fn literal_text<'a>(expression: &Expression<'a>) -> Option<&'a str> {
    match expression {
        Expression::StringLiteral(literal) => literal.value.as_str(),
        Expression::TemplateLiteral(template) if template.expressions.is_empty() => template
            .quasis
            .first()
            .and_then(|quasi| quasi.value.cooked)
            .and_then(|cooked| cooked.as_str()),
        _ => None,
    }
}

/// Collects the paths of `import()` calls anywhere in a module: literals, and identifiers of the module's top-level `const` declarations that hold one; any other argument marks the imports computed.
struct DynamicImports<'c> {
    constants: &'c BTreeMap<String, String>,
    paths: Vec<String>,
    computed: bool,
}

impl<'a> Visit<'a> for DynamicImports<'_> {
    fn visit_import_expression(&mut self, it: &ImportExpression<'a>) {
        let path = match &it.source {
            Expression::Identifier(identifier) => {
                self.constants.get(identifier.name.as_str()).cloned()
            }
            source => literal_text(source).map(str::to_string),
        };
        match path {
            Some(path) => self.paths.push(path),
            None => self.computed = true,
        }
        walk::walk_import_expression(self, it);
    }
}

/// True for a specifier that names a file relative to the module.
fn is_relative(specifier: &str) -> bool {
    specifier.starts_with("./") || specifier.starts_with("../")
}

/// True for a bare specifier, one an import map resolves: not relative, not a root-relative or protocol-relative path, and not a URL with a scheme.
fn is_bare(specifier: &str) -> bool {
    !specifier.is_empty()
        && !is_relative(specifier)
        && !specifier.starts_with('/')
        && !specifier.contains(':')
}

/// True for a root-relative path, which the browser resolves against the origin; `//` starts a protocol-relative URL instead.
fn is_rooted(specifier: &str) -> bool {
    specifier.starts_with('/') && !specifier.starts_with("//")
}

/// A module's relative imports. A module that does not parse is an error with the parser's message and the line and column where it stopped, without the code frame other parse errors show, since a minified module is one long line; a dependency missed here would load without its integrity hash.
pub fn relative_imports(source: &str) -> Result<Imports, String> {
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, SourceType::mjs()).parse();
    if let Some(diagnostic) = parsed.diagnostics.into_vec().into_iter().next() {
        return Err(match diagnostic.labels.first() {
            Some(label) => {
                let (line, column) = crate::lint::position(source, label.offset());
                format!("{diagnostic} at line {line}, column {column}")
            }
            None => diagnostic.to_string(),
        });
    }
    let loaded: Vec<&str> = parsed
        .program
        .body
        .iter()
        .filter_map(|statement| match statement {
            Statement::ImportDeclaration(declaration) => declaration.source.value.as_str(),
            Statement::ExportFromDeclaration(declaration) => declaration.source.value.as_str(),
            Statement::ExportAllDeclaration(declaration) => declaration.source.value.as_str(),
            _ => None,
        })
        .collect();
    let constants: BTreeMap<String, String> = parsed
        .program
        .body
        .iter()
        .filter_map(|statement| match statement {
            Statement::VariableDeclaration(declaration)
                if declaration.kind == VariableDeclarationKind::Const =>
            {
                Some(&declaration.declarations)
            }
            _ => None,
        })
        .flatten()
        .filter_map(|declarator| match (&declarator.id, &declarator.init) {
            (BindingPattern::BindingIdentifier(name), Some(init)) => {
                literal_text(init).map(|text| (name.name.to_string(), text.to_string()))
            }
            _ => None,
        })
        .collect();
    let mut dynamic = DynamicImports {
        constants: &constants,
        paths: Vec::new(),
        computed: false,
    };
    dynamic.visit_program(&parsed.program);
    let pick = |specifiers: &[&str], keep: fn(&str) -> bool| -> Vec<String> {
        specifiers
            .iter()
            .filter(|specifier| keep(specifier))
            .map(|specifier| (*specifier).to_string())
            .collect()
    };
    let asked: Vec<&str> = dynamic.paths.iter().map(String::as_str).collect();
    Ok(Imports {
        statically: pick(&loaded, is_relative),
        dynamically: pick(&asked, is_relative),
        bare: pick(&loaded, is_bare),
        bare_dynamically: pick(&asked, is_bare),
        rooted: pick(&loaded, is_rooted),
        rooted_dynamically: pick(&asked, is_rooted),
        computed: dynamic.computed,
    })
}
