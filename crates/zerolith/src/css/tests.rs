//! The stylesheet tests: combining, references, scoped stylesheets, and
//! the problems lightningcss reports.

use super::paths::relative;
use super::{
    Assets, Options, bundle, bundle_scoped, canonical, encoded, mirrored_scoped, public_url,
    served_scoped, shown,
};
use std::fs;
use std::path::{Path, PathBuf};

/// A project folder with `files`, canonical as the build's own root is, so a temporary folder under an 8.3 short name, as on GitHub's Windows runners, compares equal to the canonical paths of its stylesheets.
fn project(name: &str, files: &[(&str, &str)]) -> PathBuf {
    let root = std::env::temp_dir().join(format!("zerolith-css-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    for (path, text) in files {
        let file = root.join(path);
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(file, text).unwrap();
    }
    super::canonical(&root).unwrap()
}

fn run(root: &Path, files: &[&str], base: &str, minify: bool) -> (String, Vec<String>) {
    let mut assets = Assets::new(root.join("dist/assets"));
    let options = Options { root, base, minify };
    let paths: Vec<PathBuf> = files.iter().map(|file| root.join(file)).collect();
    let bundled = bundle(&paths, &options, &mut assets).unwrap();
    (bundled.code, bundled.warnings)
}

#[test]
fn inlines_a_stylesheet_again_under_other_conditions_and_refuses_what_hoisting_would_change() {
    let root = project(
        "conditions",
        &[
            (
                "src/app.css",
                "@import \"./reset.css\" print;\n@import \"./reset.css\";\n@import \"./reset.css\";\n.app { color: red; }\n",
            ),
            ("src/reset.css", "* { margin: 0; }\n"),
            (
                "src/print.css",
                "@import \"https://fonts.example/a.css\";\n.p { color: red; }\n",
            ),
            ("src/nested.css", "@import \"./print.css\" print;\n"),
            (
                "src/layered.css",
                "@import \"./reset.css\" layer(reset);\n@import \"https://fonts.example/b.css\" layer(fonts);\n",
            ),
        ],
    );
    let (code, _) = run(&root, &["src/app.css"], "/", true);
    assert_eq!(code.matches("margin:0").count(), 2, "{code}");
    assert!(code.contains("@media print{*{margin:0}}"), "{code}");
    assert!(
        code.replace("@media print{*{margin:0}}", "")
            .contains("*{margin:0}"),
        "{code}"
    );
    let refused = |file: &str| {
        let mut assets = Assets::new(root.join("dist/assets"));
        let options = Options {
            root: &root,
            base: "/",
            minify: false,
        };
        bundle(&[root.join(file)], &options, &mut assets)
            .unwrap_err()
            .to_string()
    };
    let nested = refused("src/nested.css");
    assert!(
        nested.contains("src/print.css:1: @import \"https://fonts.example/a.css\" is a remote stylesheet in a stylesheet imported under conditions"),
        "{nested}"
    );
    let layered = refused("src/layered.css");
    assert!(
        layered.contains("src/layered.css:2: @import \"https://fonts.example/b.css\" puts a remote stylesheet in a layer after other layers are declared"),
        "{layered}"
    );
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn refuses_a_reference_from_a_dependency_outside_node_modules() {
    let root = project(
        "reach",
        &[
            ("src/app.css", "@import \"theme\";\n"),
            (
                "node_modules/theme/package.json",
                "{\"style\":\"theme.css\"}",
            ),
            (
                "node_modules/theme/theme.css",
                "@import \"./base.css\";\n.a { background: url(./dot.svg); }\n.b { background: url(../../.env); }\n",
            ),
            ("node_modules/theme/base.css", ".base { color: red; }\n"),
            (
                "node_modules/theme/dot.svg",
                "<svg xmlns=\"http://www.w3.org/2000/svg\"/>",
            ),
            (".env", "SECRET=1\n"),
        ],
    );
    let mut assets = Assets::new(root.join("dist/assets"));
    let options = Options {
        root: &root,
        base: "/",
        minify: false,
    };
    let error = bundle(&[root.join("src/app.css")], &options, &mut assets)
        .unwrap_err()
        .to_string();
    assert!(
        error.contains("node_modules/theme/theme.css: refers to .env, outside the node_modules folder it is installed in"),
        "{error}"
    );
    fs::write(
        root.join("node_modules/theme/theme.css"),
        "@import \"./base.css\";\n.a { background: url(./dot.svg); }\n",
    )
    .unwrap();
    let (code, _) = run(&root, &["src/app.css"], "/", false);
    assert!(code.contains(".base") && code.contains("dot-"), "{code}");
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn inlines_imports_in_order_under_their_conditions() {
    let root = project(
        "imports",
        &[
            (
                "src/app.css",
                "@layer reset, base;\n@import \"https://fonts.example/a.css\";\n@import \"./reset.css\" layer(reset);\n@import \"./print.css\" print;\n@import \"./grid.css\" supports(display: grid);\n@import \"modern-normalize\";\n.app { color: red; }\n",
            ),
            ("src/reset.css", "* { margin: 0; }\n"),
            ("src/print.css", ".noprint { display: none; }\n"),
            (
                "src/grid.css",
                ".grid { display: grid; }\n@import \"./late.css\";\n",
            ),
            (
                "src/other.css",
                "@import \"./reset.css\";\n.other { color: blue; }\n",
            ),
            (
                "node_modules/modern-normalize/package.json",
                "{\"style\":\"modern-normalize.css\"}",
            ),
            (
                "node_modules/modern-normalize/modern-normalize.css",
                "html { line-height: 1.15; }\n",
            ),
        ],
    );
    let (code, warnings) = run(&root, &["src/app.css", "src/other.css"], "/", false);
    let at = |needle: &str| {
        code.find(needle)
            .unwrap_or_else(|| panic!("{needle} missing from {code}"))
    };
    assert!(
        code.starts_with("@import \"https://fonts.example/a.css\";"),
        "{code}"
    );
    assert!(
        at("@layer reset {") < at("@layer base;"),
        "the layer order stays reset, then base: {code}"
    );
    assert!(at("@layer reset {") < at("@media print {"));
    assert!(at("@media print {") < at("@supports (display: grid) {"));
    assert!(at("@supports (display: grid) {") < at("line-height: 1.15"));
    assert!(at("line-height: 1.15") < at(".app {") && at(".app {") < at(".other {"));
    assert_eq!(
        code.matches("margin: 0").count(),
        2,
        "reset.css again, outside the layer that app.css imports it into: {code}"
    );
    assert!(
        warnings
            .iter()
            .any(|warning| warning.contains("src/grid.css")),
        "{warnings:?}"
    );
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn rewrites_references_to_public_files_and_hashed_copies() {
    let root = project(
        "urls",
        &[
            (
                "src/app.css",
                "@font-face { font-family: Brand; src: url(\"./fonts/brand.woff2?v=2#x\") format(\"woff2\"); }\n.b { background: url(/logo.svg); }\n.c { background: url(/src/grain.png); }\n.d { background: url(data:image/png;base64,AAAA); }\n.e { background: url(missing.png); }\n.f { color: oklch(70% 0.1 200); }\n.g { & .h { color: light-dark(white, black); } }\n",
            ),
            ("src/fonts/brand.woff2", "WOFF"),
            ("src/grain.png", "PNG"),
            ("public/logo.svg", "<svg/>"),
        ],
    );
    let (code, warnings) = run(&root, &["src/app.css"], "/app/", true);
    assert!(
        code.contains("url(brand-") && code.contains(".woff2?v=2#x)"),
        "{code}"
    );
    assert!(code.contains("url(/app/logo.svg)"), "{code}");
    assert!(code.contains("url(grain-"), "{code}");
    assert!(code.contains("data:image/png;base64,AAAA"), "{code}");
    assert!(code.contains("url(missing.png)"), "{code}");
    assert!(code.contains(".f{color:oklch(70% .1 200)}"), "{code}");
    assert!(
        code.contains(".g .h{") && !code.contains("&") && !code.contains("light-dark("),
        "{code}"
    );
    assert!(!code.contains('\n'), "{code}");
    assert_eq!(warnings.len(), 1, "{warnings:?}");
    assert!(warnings[0].contains("missing.png"));
    let copied: Vec<String> = fs::read_dir(root.join("dist/assets"))
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    assert_eq!(copied.len(), 2, "{copied:?}");
    assert_eq!(public_url("./", "logo.svg", 1), "../logo.svg");
    assert_eq!(public_url("./", "logo.svg", 0), "./logo.svg");
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn lowers_nesting_for_the_supported_browsers() {
    let root = project(
        "nesting",
        &[(
            "a.css",
            ".card { color: red; & .title { font-weight: 600; } }\n",
        )],
    );
    let (code, _) = run(&root, &["a.css"], "/", true);
    assert!(code.contains(".card .title{font-weight:600}"), "{code}");
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn escapes_every_control_character_in_a_string() {
    assert_eq!(super::combine::escape("a\rb\u{c}c\nd"), "a\\d b\\c c\\a d");
    assert_eq!(super::combine::escape("q\"s\\"), "q\\\"s\\\\");
    assert_eq!(super::combine::escape("n\0"), "n\u{fffd}");
}

#[test]
fn encodes_file_names_that_a_url_would_misread() {
    assert_eq!(encoded("icons/c#.svg"), "icons/c%23.svg");
    assert_eq!(encoded("a b/100%.png"), "a%20b/100%25.png");
    assert_eq!(encoded("\u{e9}t\u{e9}.png"), "%C3%A9t%C3%A9.png");
    assert_eq!(encoded("ok-_.~:@/x.png"), "ok-_.~:@/x.png");
    let root = project(
        "encoded",
        &[
            ("public/c#.svg", "<svg/>"),
            ("src/a#b c.png", "png"),
            (
                "src/app.css",
                ".a { background: url(/c%23.svg); }\n.b { background: url(\"./a%23b%20c.png\"); }\n",
            ),
        ],
    );
    let (code, warnings) = run(&root, &["src/app.css"], "/", false);
    assert!(warnings.is_empty(), "{warnings:?}");
    assert!(code.contains("url(\"/c%23.svg\")"), "{code}");
    assert!(code.contains("url(\"a_b_c-"), "{code}");
    let copied: Vec<String> = fs::read_dir(root.join("dist/assets"))
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    assert!(
        copied
            .iter()
            .any(|name| name.starts_with("a_b_c-") && name.ends_with(".png")),
        "{copied:?}"
    );
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn fails_on_an_import_that_names_no_file() {
    let root = project("missing", &[("a.css", "\n@import \"./nope.css\";\n")]);
    let mut assets = Assets::new(root.join("dist/assets"));
    let options = Options {
        root: &root,
        base: "/",
        minify: true,
    };
    let error = bundle(&[root.join("a.css")], &options, &mut assets)
        .unwrap_err()
        .to_string();
    assert!(
        error.starts_with("a.css:2: @import \"./nope.css\""),
        "{error}"
    );
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn bundles_a_scoped_stylesheet_for_its_module() {
    let root = project(
        "scoped",
        &[
            (
                "src/card.css",
                "@import \"./tokens.css\";\n:scope { padding: 4px; background: url(./dot.svg); }\n.title { color: var(--ink); & em { font-style: normal; } }\n.mark { background: url(/mark.svg); }\n",
            ),
            ("src/tokens.css", ":scope { --ink: red; }\n"),
            ("src/dot.svg", "<svg/>"),
            ("public/mark.svg", "<svg/>"),
        ],
    );
    let mut assets = Assets::new(root.join("dist/assets"));
    let card = root.join("src/card.css");
    let absolute = Options {
        root: &root,
        base: "/app/",
        minify: true,
    };
    let scoped = bundle_scoped(&card, &absolute, &mut assets).unwrap();
    let code = &scoped.code;
    assert!(code.contains("--ink:red"), "{code}");
    assert!(code.contains("url(/app/assets/dot-"), "{code}");
    assert!(code.contains("url(/app/mark.svg)"), "{code}");
    assert!(code.contains(".title em{font-style:normal}"), "{code}");
    assert!(!code.contains("@import"), "{code}");
    assert!(scoped.spliced.is_empty());
    assert_eq!(
        scoped.expression(),
        serde_json::Value::from(code.as_str()).to_string()
    );
    assert_eq!(scoped.files.len(), 2);

    let relative_base = Options {
        root: &root,
        base: "./",
        minify: true,
    };
    let scoped = bundle_scoped(&card, &relative_base, &mut assets).unwrap();
    assert_eq!(scoped.spliced.len(), 2, "{:?}", scoped.spliced);
    let expression = scoped.expression();
    assert!(
        expression.contains("new URL(\"../mark.svg\", import.meta.url).href"),
        "{expression}"
    );
    assert!(
        expression.contains("url(\\\"\" + new URL(\"../assets/dot-"),
        "{expression}"
    );
    assert!(!expression.contains("__zerolith_url_"), "{expression}");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn refuses_a_remote_import_in_a_scoped_stylesheet() {
    let root = project(
        "scoped-remote",
        &[(
            "card.css",
            "@import \"https://fonts.example/a.css\";\n.a { color: red; }\n",
        )],
    );
    let mut assets = Assets::new(root.join("dist/assets"));
    let options = Options {
        root: &root,
        base: "/",
        minify: true,
    };
    let error = bundle_scoped(&root.join("card.css"), &options, &mut assets)
        .unwrap_err()
        .to_string();
    assert!(
        error.starts_with("card.css: @import") && error.contains("a scoped stylesheet cannot load"),
        "{error}"
    );
    let url_of = |path: &Path| format!("/{}", shown(&root, path));
    assert!(served_scoped(&root.join("card.css"), &root, &url_of).is_err());
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn serves_a_scoped_stylesheet_with_imports_inlined_and_references_absolute() {
    let root = project(
        "scoped-dev",
        &[
            (
                "src/card.css",
                "@import \"./tokens.css\";\n.a { background: url(./dot.svg); }\n.b { background: url(/mark.svg); }\n",
            ),
            ("src/tokens.css", ":scope { --ink: red; }\n"),
            ("src/dot.svg", "<svg/>"),
        ],
    );
    let root = canonical(&root).unwrap();
    let url_of = |path: &Path| format!("/{}", shown(&root, path));
    let scoped = served_scoped(&root.join("src/card.css"), &root, &url_of).unwrap();
    let code = &scoped.code;
    assert!(code.contains("--ink: red"), "{code}");
    assert!(code.contains("/src/dot.svg"), "{code}");
    assert!(code.contains("/mark.svg"), "{code}");
    assert!(!code.contains("@import"), "{code}");
    assert_eq!(
        scoped.files,
        [root.join("src/card.css"), root.join("src/tokens.css")]
    );
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn points_references_at_the_copied_files_for_the_unbundled_output() {
    let root = project(
        "scoped-mirror",
        &[
            (
                "src/ui/card.css",
                "@import \"../tokens.css\";\n.a { background: url(./dot.svg); }\n",
            ),
            ("src/tokens.css", ".t { background: url(./grain.png); }\n"),
            ("src/ui/dot.svg", "<svg/>"),
            ("src/grain.png", "PNG"),
        ],
    );
    let root = canonical(&root).unwrap();
    let scoped = mirrored_scoped(&root.join("src/ui/card.css"), &root).unwrap();
    let mut spliced = scoped.spliced.clone();
    spliced.sort();
    assert_eq!(spliced, ["../grain.png", "dot.svg"]);
    let expression = scoped.expression();
    assert!(
        expression.contains("new URL(\"dot.svg\", import.meta.url).href")
            && expression.contains("new URL(\"../grain.png\", import.meta.url).href"),
        "{expression}"
    );
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn writes_paths_relative_to_a_folder() {
    assert_eq!(
        relative(Path::new("/p/app"), Path::new("/p/app/src/card.css")),
        "src/card.css"
    );
    assert_eq!(
        relative(Path::new("/p/app"), Path::new("/p/ui/card.css")),
        "../ui/card.css"
    );
    assert_eq!(
        relative(
            Path::new("/p/app/src/ui"),
            Path::new("/p/app/src/grain.png")
        ),
        "../grain.png"
    );
}
