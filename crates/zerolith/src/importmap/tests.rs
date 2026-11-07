//! The import map's tests: reading imports, planning the vendored files,
//! and updating pages.

use super::graph::resolve_within;
use super::html::{covers, html_tags, page_tags, update_html};
use super::imports::relative_imports;
use super::plan::{integrity, resolve_export};
use super::{ImportMap, Vendored, vendor, vendor_from};
use std::fs;
use std::path::PathBuf;

#[test]
fn hashes_match_the_sri_format() {
    assert_eq!(
        integrity(b""),
        "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
    );
}

#[test]
fn follows_static_relative_imports() {
    let source = "import { a } from \"./a.js\";\nexport { b } from './b.js';\nimport c from \"zerolith\";\nexport * from \"../up.js\";";
    let imports = relative_imports(source).unwrap();
    assert_eq!(imports.statically, vec!["./a.js", "./b.js", "../up.js"]);
    assert_eq!(imports.bare, vec!["zerolith"]);
    assert!(imports.bare_dynamically.is_empty());
    let kinds = "import \"/root.js\";
import \"//cdn.example/x.js\";
import \"https://cdn.example/y.js\";
import \"node:fs\";
import \"@zerolith/router\";
import \"zerolith/jsx-runtime\";
import \"\";
const lazy = () => import(\"@zerolith/forms\");
const tools = () => import(\"/tools.js\");";
    let kinds = relative_imports(kinds).unwrap();
    assert_eq!(kinds.bare, vec!["@zerolith/router", "zerolith/jsx-runtime"]);
    assert_eq!(kinds.bare_dynamically, vec!["@zerolith/forms"]);
    assert_eq!(kinds.rooted, vec!["/root.js"]);
    assert_eq!(kinds.rooted_dynamically, vec!["/tools.js"]);
    assert!(kinds.statically.is_empty() && kinds.dynamically.is_empty());
    assert!(!kinds.computed);
    let constants = "const LAZY = \"./lazy.js\";
const TEMPLATE = `./template.js`;
let mutable = \"./mutable.js\";
const { destructured } = settings;
export const a = () => import(LAZY);
export const b = () => import(TEMPLATE);
export const c = () => import(mutable);
export const d = () => import(destructured);
export const e = (name) => import(name);
export const f = () => import(`./${LAZY}`);";
    let constants = relative_imports(constants).unwrap();
    assert_eq!(constants.dynamically, vec!["./lazy.js", "./template.js"]);
    assert!(constants.computed);
    let followed = relative_imports(
        "const LAZY = \"./lazy.js\";
export const a = () => import(LAZY);",
    )
    .unwrap();
    assert!(!followed.computed);
    let minified = "import{a as e}from\"./a.js\";import\"./effects.js\";export*from\"./all.js\";export{b}from'./b.js';const t='from \"./text.js\"',l=()=>import(`./lazy.js`),m=()=>import(\"./more.js\"),n=e=>import(e),p=()=>import(\"zerolith\");export{e,t,l,m,n,p};";
    assert_eq!(
        relative_imports(minified).unwrap(),
        super::imports::Imports {
            statically: vec![
                "./a.js".to_string(),
                "./effects.js".to_string(),
                "./all.js".to_string(),
                "./b.js".to_string()
            ],
            dynamically: vec!["./lazy.js".to_string(), "./more.js".to_string()],
            bare: Vec::new(),
            bare_dynamically: vec!["zerolith".to_string()],
            rooted: Vec::new(),
            rooted_dynamically: Vec::new(),
            computed: true,
        }
    );
    let error = relative_imports("export const a = 1;\nimport { b from \"./b.js\";").unwrap_err();
    assert!(error.ends_with(" at line 2, column 12"), "{error}");
    assert_eq!(
        resolve_within("dist/production/index.js", "./x.js").as_deref(),
        Some("dist/production/x.js")
    );
    assert_eq!(
        resolve_within("dist/production/index.js", "../up.js").as_deref(),
        Some("dist/up.js")
    );
    assert_eq!(
        resolve_within("dist/production/index.js", "../../root.js").as_deref(),
        Some("root.js")
    );
    assert_eq!(resolve_within("dist/index.js", "../../out.js"), None);
    for odd in [
        "./a//b.js",
        "./%2e%2e/b.js",
        "./a/",
        "./a/./b.js/",
        "./..\\..\\x.js",
    ] {
        assert_eq!(resolve_within("dist/index.js", odd), None, "{odd}");
    }
    assert_eq!(
        resolve_within("package.json", "./dist/./production/index.js").as_deref(),
        Some("dist/production/index.js")
    );
}

#[test]
fn resolves_export_conditions() {
    let entry = serde_json::json!({ "types": "./dist/index.d.ts", "development": "./dist/index.js", "default": "./dist/production/index.js" });
    assert_eq!(
        resolve_export(&entry, false),
        Some("./dist/production/index.js".to_string())
    );
    assert_eq!(
        resolve_export(&entry, true),
        Some("./dist/index.js".to_string())
    );
    assert_eq!(
        resolve_export(&serde_json::json!("./dist/x.js"), false),
        Some("./dist/x.js".to_string())
    );
}

#[test]
fn vendors_installed_packages_and_updates_html() {
    let root = std::env::temp_dir().join(format!("zerolith-importmap-test-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    let core = root.join("node_modules/zerolith");
    fs::create_dir_all(core.join("dist/production")).unwrap();
    fs::write(core.join("package.json"), r#"{"name":"zerolith","version":"0.0.0","exports":{".":{"development":"./dist/index.js","default":"./dist/production/index.js"},"./package.json":"./package.json"}}"#).unwrap();
    fs::write(core.join("LICENSE"), "Apache License\n").unwrap();
    fs::write(core.join("dist/index.js"), "export const dev = 1;").unwrap();
    fs::write(
        core.join("dist/production/index.js"),
        "export { prod } from \"./inner.js\";",
    )
    .unwrap();
    fs::write(
        core.join("dist/production/inner.js"),
        "export const prod = 1;",
    )
    .unwrap();
    fs::write(root.join("index.html"), "<html><head><script type=\"importmap\">{}</script>\n<link rel=\"modulepreload\" href=\"/old.js\" data-zerolith-preload>\n</head><body></body></html>").unwrap();
    fs::create_dir_all(root.join("vendor/zerolith@0.0.0")).unwrap();
    fs::write(root.join("vendor/zerolith@0.0.0/VERSION"), "0.0.0\n").unwrap();
    fs::write(
        root.join("vendor/zerolith@0.0.0/stale.js"),
        "left by an earlier run",
    )
    .unwrap();

    let vendored = vendor(&root, std::path::Path::new("vendor"), false, None).unwrap();
    assert_eq!(
        fs::read_to_string(root.join("vendor/zerolith@0.0.0/LICENSE")).unwrap(),
        "Apache License\n"
    );
    assert!(root.join("vendor/zerolith@0.0.0/stale.js").is_file());
    assert_eq!(
        vendored.stale,
        vec![root.join("vendor/zerolith@0.0.0/stale.js")]
    );
    vendored.prune().unwrap();
    assert!(!root.join("vendor/zerolith@0.0.0/stale.js").exists());
    assert!(
        fs::read_to_string(root.join("vendor/.gitattributes"))
            .unwrap()
            .contains("\n* -text\n")
    );
    assert!(
        fs::read_to_string(root.join("vendor/.gitignore"))
            .unwrap()
            .contains("\n!**/dist/\n")
    );
    assert_eq!(
        vendored.map.imports.get("zerolith"),
        Some(&"/vendor/zerolith@0.0.0/dist/production/index.js".to_string())
    );
    assert!(
        root.join("vendor/zerolith@0.0.0/dist/production/index.js")
            .is_file()
    );
    assert_eq!(
        vendored.modules,
        vec![
            "/vendor/zerolith@0.0.0/dist/production/index.js",
            "/vendor/zerolith@0.0.0/dist/production/inner.js"
        ]
    );
    assert!(
        vendored
            .map
            .integrity
            .contains_key("/vendor/zerolith@0.0.0/dist/production/inner.js")
    );
    assert!(
        !vendored
            .map
            .integrity
            .contains_key("/vendor/zerolith@0.0.0/dist/index.js")
    );
    assert_eq!(
        vendored.versions.get("zerolith"),
        Some(&"0.0.0".to_string())
    );
    assert!(root.join("vendor/importmap.json").is_file());

    let updated = update_html(
        &fs::read_to_string(root.join("index.html")).unwrap(),
        &html_tags(&vendored),
    );
    assert!(updated.contains("\"zerolith\":\"/vendor/zerolith@0.0.0/dist/production/index.js\""));
    assert!(!updated.contains("/old.js"));
    assert_eq!(updated.matches("<script type=\"importmap\">").count(), 1);
    let hash = &vendored.map.integrity["/vendor/zerolith@0.0.0/dist/production/index.js"];
    assert!(updated.contains(&format!("<link rel=\"modulepreload\" href=\"/vendor/zerolith@0.0.0/dist/production/index.js\" integrity=\"{hash}\" data-zerolith-preload>")));
    assert_eq!(
        updated.matches("rel=\"modulepreload\"").count(),
        updated.matches(" integrity=\"sha256-").count()
    );

    let inserted = update_html(
        "<html><head></head></html>",
        &html_tags(&Vendored::default()),
    );
    assert!(inserted.contains("<script type=\"importmap\">"));
    let before_script = update_html(
        "<html><head><title>x</title>\n<script type=\"module\" src=\"/app.js\"></script>\n</head><body></body></html>",
        &html_tags(&Vendored::default()),
    );
    assert!(
        before_script.find("<script type=\"importmap\">").unwrap()
            < before_script.find("<script type=\"module\"").unwrap(),
        "{before_script}"
    );
    let body_script = update_html(
        "<html><head><title>x</title></head><body><script type=\"module\">1</script></body></html>",
        &html_tags(&Vendored::default()),
    );
    assert!(
        body_script.find("<script type=\"importmap\">").unwrap()
            < body_script.find("</head>").unwrap(),
        "{body_script}"
    );
    let crlf = update_html(
        "<html>\r\n<head>\r\n<script type=\"importmap\">{}</script>\r\n<link rel=\"modulepreload\" href=\"/old.js\" data-zerolith-preload>\r\n</head>\r\n</html>\r\n",
        &html_tags(&vendored),
    );
    assert!(!crlf.replace("\r\n", "").contains('\n'), "{crlf:?}");
    assert!(crlf.contains("<script type=\"importmap\">") && !crlf.contains("/old.js"));
    let replaced = update_html(
        "<html>\n<head>\n    <meta charset=\"utf-8\">\n    <script type=\"importmap\">{}</script>\n<link rel=\"modulepreload\" href=\"/old.js\" data-zerolith-preload>\n</head>\n</html>\n",
        &html_tags(&vendored),
    );
    assert_eq!(
        replaced,
        format!(
            "<html>\n<head>\n    <meta charset=\"utf-8\">\n    <script type=\"importmap\">{}</script>\n    <link rel=\"modulepreload\" href=\"/vendor/zerolith@0.0.0/dist/production/index.js\" integrity=\"{hash}\" data-zerolith-preload>\n    <link rel=\"modulepreload\" href=\"/vendor/zerolith@0.0.0/dist/production/inner.js\" integrity=\"{}\" data-zerolith-preload>\n</head>\n</html>\n",
            serde_json::to_string(&vendored.map).unwrap(),
            vendored.map.integrity["/vendor/zerolith@0.0.0/dist/production/inner.js"]
        )
    );
    let indented = update_html(
        "<html>\n<head>\n    <title>x</title>\n    <script type=\"module\" src=\"/app.js\"></script>\n</head>\n</html>\n",
        &html_tags(&vendored),
    );
    assert!(
        indented.contains("</script>\n    <link rel=\"modulepreload\" href=\"/vendor/zerolith@0.0.0/dist/production/index.js\"")
            && indented.contains("data-zerolith-preload>\n    <script type=\"module\" src=\"/app.js\">"),
        "{indented}"
    );
    let inline = update_html(
        "<html><head><title>x</title><script type=\"module\" src=\"/app.js\"></script></head></html>",
        &html_tags(&vendored),
    );
    assert!(
        inline.contains("</script>\n<link rel=\"modulepreload\"")
            && inline.contains("data-zerolith-preload>\n<script type=\"module\""),
        "{inline}"
    );
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn vendors_what_the_entries_load_with_the_source_maps_that_still_fit_and_embed_their_sources() {
    let root = std::env::temp_dir().join(format!(
        "zerolith-importmap-maps-test-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&root);
    let core = root.join("node_modules/zerolith");
    fs::create_dir_all(core.join("dist/production")).unwrap();
    fs::write(core.join("package.json"), r#"{"name":"zerolith","version":"0.0.0","exports":{".":{"development":"./dist/index.js","default":"./dist/production/index.js"}}}"#).unwrap();
    let bare = |file: &str| {
        format!(
            r#"{{"version":3,"file":"{file}","sources":["../src/{file}"],"names":[],"mappings":"AAAA"}}"#
        )
    };
    let embedded = |file: &str| {
        format!(
            r#"{{"version":3,"file":"{file}","sources":["../../src/{file}"],"sourcesContent":["source text\n"],"names":[],"mappings":"AAAA"}}"#
        )
    };
    fs::write(
        core.join("dist/index.js"),
        "export const dev = 1;\n//# sourceMappingURL=index.js.map\n",
    )
    .unwrap();
    fs::write(core.join("dist/index.js.map"), bare("index.js")).unwrap();
    let production = core.join("dist/production");
    fs::write(
        production.join("index.js"),
        "import\"./view.js\";import\"./plain.js\";export const prod=1;\n//# sourceMappingURL=index.js.map\n",
    )
    .unwrap();
    fs::write(production.join("index.js.map"), embedded("index.js")).unwrap();
    fs::write(
        production.join("view.js"),
        "import{html as e}from\"zerolith\";export const view=()=>e`<p>${1}</p>`;\n//# sourceMappingURL=view.js.map\n",
    )
    .unwrap();
    fs::write(production.join("view.js.map"), embedded("view.js")).unwrap();
    fs::write(
        production.join("plain.js"),
        "export const plain=1;\n//# sourceMappingURL=plain.js.map\n",
    )
    .unwrap();
    fs::write(production.join("plain.js.map"), bare("plain.js")).unwrap();
    fs::write(production.join("unused.js"), "export const unused=1;\n").unwrap();
    fs::write(production.join("orphan.js.map"), embedded("orphan.js")).unwrap();
    fs::write(production.join("notes.txt"), "not a module").unwrap();

    let vendored = vendor(&root, std::path::Path::new("vendor"), false, None).unwrap();
    let copied = root.join("vendor/zerolith@0.0.0/dist");
    assert_eq!(
        vendored.modules,
        vec![
            "/vendor/zerolith@0.0.0/dist/production/index.js",
            "/vendor/zerolith@0.0.0/dist/production/plain.js",
            "/vendor/zerolith@0.0.0/dist/production/view.js"
        ]
    );
    assert_eq!(
        vendored.map.integrity.keys().cloned().collect::<Vec<_>>(),
        vendored.modules
    );
    assert_eq!(
        fs::read_to_string(copied.join("production/index.js")).unwrap(),
        fs::read_to_string(production.join("index.js")).unwrap()
    );
    assert_eq!(
        fs::read_to_string(copied.join("production/index.js.map")).unwrap(),
        embedded("index.js")
    );
    assert_eq!(
        fs::read_to_string(copied.join("production/view.js.map")).unwrap(),
        embedded("view.js")
    );
    assert_eq!(
        fs::read_to_string(copied.join("production/plain.js")).unwrap(),
        "export const plain=1;\n"
    );
    assert!(!copied.join("production/plain.js.map").exists());
    for absent in [
        "index.js",
        "index.js.map",
        "production/unused.js",
        "production/orphan.js.map",
        "production/notes.txt",
    ] {
        assert!(!copied.join(absent).exists(), "{absent} was copied");
    }

    vendor(&root, std::path::Path::new("readable"), true, None).unwrap();
    let readable = root.join("readable/zerolith@0.0.0/dist");
    assert_eq!(
        fs::read_to_string(readable.join("index.js")).unwrap(),
        "export const dev = 1;\n"
    );
    assert!(!readable.join("index.js.map").exists());
    assert!(!readable.join("production").exists());

    let built = root.join("out");
    vendor_from(
        &root.join("node_modules"),
        &built,
        std::path::Path::new("vendor"),
        false,
        true,
        None,
    )
    .unwrap();
    let prepared = built.join("vendor/zerolith@0.0.0/dist/production");
    assert_eq!(
        fs::read_to_string(prepared.join("index.js.map")).unwrap(),
        embedded("index.js")
    );
    assert!(
        fs::read_to_string(prepared.join("index.js"))
            .unwrap()
            .ends_with("//# sourceMappingURL=index.js.map\n")
    );
    let view = fs::read_to_string(prepared.join("view.js")).unwrap();
    assert_ne!(
        view,
        fs::read_to_string(production.join("view.js")).unwrap()
    );
    assert!(!view.contains("sourceMappingURL"));
    assert!(!prepared.join("view.js.map").exists());
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn refuses_a_vendored_module_that_does_not_parse() {
    let root = std::env::temp_dir().join(format!(
        "zerolith-importmap-parse-test-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&root);
    let core = root.join("node_modules/zerolith");
    fs::create_dir_all(core.join("dist")).unwrap();
    fs::write(
        core.join("package.json"),
        r#"{"name":"zerolith","version":"0.0.0","exports":{".":"./dist/index.js"}}"#,
    )
    .unwrap();
    fs::write(
        core.join("dist/index.js"),
        "export{a}from\"./a.js\";export{",
    )
    .unwrap();
    let error = vendor(&root, std::path::Path::new("vendor"), false, None)
        .expect_err("a module that does not parse");
    assert!(
        error
            .to_string()
            .starts_with("/vendor/zerolith@0.0.0/dist/index.js does not parse: "),
        "{error}"
    );
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn replaces_what_an_earlier_run_wrote_keeps_inline_maps_and_follows_the_named_map() {
    let root = std::env::temp_dir().join(format!(
        "zerolith-importmap-rerun-test-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&root);
    let core = root.join("node_modules/zerolith");
    fs::create_dir_all(core.join("dist/production")).unwrap();
    fs::write(core.join("package.json"), r#"{"name":"zerolith","version":"0.0.0","exports":{".":{"development":"./dist/index.js","default":"./dist/production/index.js"}}}"#).unwrap();
    fs::write(core.join("dist/index.js"), "export const dev = 1;\n").unwrap();
    let named = r#"{"version":3,"file":"index.js","sources":["../../src/index.ts"],"sourcesContent":["source text\n"],"names":[],"mappings":"AAAA"}"#;
    fs::write(
        core.join("dist/production/index.js"),
        "import\"./inline.js\";export const prod=1;\n//# sourceMappingURL=index.named.map\n",
    )
    .unwrap();
    fs::write(core.join("dist/production/index.named.map"), named).unwrap();
    fs::write(core.join("dist/production/index.js.map"), named).unwrap();
    let inline = "export const inline=1;\n//# sourceMappingURL=data:application/json;base64,e30=\n";
    fs::write(core.join("dist/production/inline.js"), inline).unwrap();
    let user = root.join("other/zerolith@0.0.0");
    fs::create_dir_all(&user).unwrap();
    fs::write(user.join("notes.txt"), "the user's own").unwrap();

    vendor(&root, std::path::Path::new("vendor"), true, None).unwrap();
    assert!(root.join("vendor/zerolith@0.0.0/dist/index.js").is_file());
    vendor(&root, std::path::Path::new("vendor"), false, None)
        .unwrap()
        .prune()
        .unwrap();
    let copied = root.join("vendor/zerolith@0.0.0/dist");
    assert!(!copied.join("index.js").exists());
    assert_eq!(
        fs::read_to_string(copied.join("production/index.named.map")).unwrap(),
        named
    );
    assert!(!copied.join("production/index.js.map").exists());
    assert_eq!(
        fs::read_to_string(copied.join("production/inline.js")).unwrap(),
        inline
    );

    let refused = vendor(&root, std::path::Path::new("other"), false, None)
        .expect_err("a folder no earlier run wrote");
    assert!(
        refused
            .to_string()
            .contains("holds files no earlier run wrote"),
        "{refused}"
    );
    assert_eq!(
        fs::read_to_string(user.join("notes.txt")).unwrap(),
        "the user's own"
    );
    assert_eq!(fs::read_dir(&user).unwrap().count(), 1);
    assert_eq!(fs::read_dir(root.join("other")).unwrap().count(), 1);
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn keeps_the_vendored_files_when_a_run_fails_and_loads_lazy_modules_without_preloading_them() {
    let root = std::env::temp_dir().join(format!(
        "zerolith-importmap-staging-test-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&root);
    let core = root.join("node_modules/zerolith");
    fs::create_dir_all(core.join("dist")).unwrap();
    fs::write(
        core.join("package.json"),
        r#"{"name":"zerolith","version":"0.0.0","exports":{".":"./dist/index.js"}}"#,
    )
    .unwrap();
    fs::write(
        core.join("dist/index.js"),
        "export const later=()=>import(`./lazy.js`);\n",
    )
    .unwrap();
    fs::write(core.join("dist/lazy.js"), "export const lazy=1;\n").unwrap();
    let vendored = vendor(&root, std::path::Path::new("vendor"), false, None).unwrap();
    assert_eq!(
        vendored.modules,
        vec!["/vendor/zerolith@0.0.0/dist/index.js"]
    );
    assert_eq!(
        vendored.map.integrity.keys().cloned().collect::<Vec<_>>(),
        vec![
            "/vendor/zerolith@0.0.0/dist/index.js",
            "/vendor/zerolith@0.0.0/dist/lazy.js"
        ]
    );
    let lazy = root.join("vendor/zerolith@0.0.0/dist/lazy.js");
    assert!(lazy.is_file());

    fs::write(
        core.join("dist/index.js"),
        "export{a}from\"./missing.js\";\n",
    )
    .unwrap();
    let error = vendor(&root, std::path::Path::new("vendor"), false, None)
        .expect_err("a module the package does not hold");
    assert!(
        error.to_string().contains("missing.js is missing"),
        "{error}"
    );
    assert!(lazy.is_file());
    assert_eq!(
        fs::read_to_string(root.join("vendor/zerolith@0.0.0/dist/index.js")).unwrap(),
        "export const later=()=>import(`./lazy.js`);\n"
    );
    let mut names: Vec<String> = fs::read_dir(root.join("vendor"))
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    assert_eq!(
        names,
        vec![
            ".gitattributes",
            ".gitignore",
            "importmap.json",
            "zerolith@0.0.0"
        ]
    );
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn copies_other_files_as_they_are_and_skips_an_optional_lazy_module() {
    let root = std::env::temp_dir().join(format!(
        "zerolith-importmap-files-test-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&root);
    let core = root.join("node_modules/zerolith");
    fs::create_dir_all(core.join("dist")).unwrap();
    fs::write(
        core.join("package.json"),
        r#"{"name":"zerolith","version":"0.0.0","exports":{".":"./dist/index.js"}}"#,
    )
    .unwrap();
    fs::write(
        core.join("dist/index.js"),
        "import data from\"./data.json\"with{type:\"json\"};export const optional=()=>import(\"./optional.js\").catch(()=>null),odd=()=>import(\"./a//b.js\"),outside=()=>import(\"../../outside.js\");export{data};\n",
    )
    .unwrap();
    fs::write(core.join("dist/data.json"), "{\"a\":1}").unwrap();
    let vendored = vendor(&root, std::path::Path::new("vendor"), false, None).unwrap();
    assert_eq!(
        fs::read_to_string(root.join("vendor/zerolith@0.0.0/dist/data.json")).unwrap(),
        "{\"a\":1}"
    );
    assert_eq!(
        vendored.map.integrity.keys().cloned().collect::<Vec<_>>(),
        vec![
            "/vendor/zerolith@0.0.0/dist/data.json",
            "/vendor/zerolith@0.0.0/dist/index.js"
        ]
    );
    assert_eq!(
        vendored.modules,
        vec!["/vendor/zerolith@0.0.0/dist/index.js"]
    );
    assert!(!root.join("vendor/zerolith@0.0.0/dist/optional.js").exists());
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn refuses_an_import_that_leaves_its_package_and_skips_export_patterns() {
    let root = std::env::temp_dir().join(format!(
        "zerolith-importmap-escape-test-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&root);
    let core = root.join("node_modules/zerolith");
    fs::create_dir_all(core.join("dist/locales")).unwrap();
    fs::write(
        core.join("package.json"),
        r#"{"name":"zerolith","version":"0.0.0","exports":{".":"./dist/index.js","./locales/*":"./dist/locales/*.js","./assets/":"./dist/assets/"}}"#,
    )
    .unwrap();
    fs::write(core.join("dist/index.js"), "export const a=1;\n").unwrap();
    fs::write(core.join("dist/locales/de.js"), "export const de=1;\n").unwrap();
    let vendored = vendor(&root, std::path::Path::new("vendor"), false, None).unwrap();
    assert_eq!(
        vendored.map.imports.keys().cloned().collect::<Vec<_>>(),
        vec!["zerolith"]
    );

    fs::write(
        core.join("dist/index.js"),
        "export{a}from\"../../shared/a.js\";\n",
    )
    .unwrap();
    let error = vendor(&root, std::path::Path::new("vendor"), false, None)
        .expect_err("an import that leaves the package");
    assert!(
        error
            .to_string()
            .contains("imports ../../shared/a.js, which leaves its package's folder"),
        "{error}"
    );
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn removes_only_what_an_earlier_run_left_in_its_own_folders() {
    let root = std::env::temp_dir().join(format!(
        "zerolith-importmap-stale-test-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&root);
    let core = root.join("node_modules/zerolith");
    fs::create_dir_all(core.join("dist")).unwrap();
    fs::write(
        core.join("package.json"),
        r#"{"name":"zerolith","version":"0.0.0","exports":{".":"./dist/index.js"}}"#,
    )
    .unwrap();
    fs::write(core.join("dist/index.js"), "export const v=1;\n").unwrap();
    let vendor_folder = root.join("vendor");
    vendor(&root, std::path::Path::new("vendor"), false, None).unwrap();
    fs::create_dir_all(vendor_folder.join("zerolith@0.0.0/dist/old")).unwrap();
    fs::write(
        vendor_folder.join("zerolith@0.0.0/dist/old/gone.js"),
        "stale",
    )
    .unwrap();
    fs::write(vendor_folder.join("zerolith@0.0.0/dist/gone.d.ts"), "stale").unwrap();
    fs::create_dir_all(vendor_folder.join("lenis")).unwrap();
    fs::write(vendor_folder.join("lenis/lenis.mjs"), "the site's own").unwrap();
    fs::write(core.join("dist/index.js"), "export const v=2;\n").unwrap();
    #[cfg(windows)]
    let linked = std::os::windows::fs::symlink_dir(
        vendor_folder.join("lenis"),
        vendor_folder.join("zerolith@0.0.0/dist/link"),
    )
    .is_ok();
    #[cfg(not(windows))]
    let linked = std::os::unix::fs::symlink(
        vendor_folder.join("lenis"),
        vendor_folder.join("zerolith@0.0.0/dist/link"),
    )
    .is_ok();
    let vendored = vendor(&root, std::path::Path::new("vendor"), false, None).unwrap();
    assert!(
        vendor_folder
            .join("zerolith@0.0.0/dist/old/gone.js")
            .is_file()
    );
    let mut expected = vec![
        vendor_folder.join("zerolith@0.0.0/dist/gone.d.ts"),
        vendor_folder.join("zerolith@0.0.0/dist/old/gone.js"),
    ];
    if linked {
        expected.push(vendor_folder.join("zerolith@0.0.0/dist/link"));
    }
    expected.sort();
    let mut stale = vendored.stale.clone();
    stale.sort();
    assert_eq!(stale, expected);
    vendored.prune().unwrap();
    assert_eq!(
        fs::read_to_string(vendor_folder.join("zerolith@0.0.0/dist/index.js")).unwrap(),
        "export const v=2;\n"
    );
    assert!(!vendor_folder.join("zerolith@0.0.0/dist/old").exists());
    assert!(!vendor_folder.join("zerolith@0.0.0/dist/link").exists());
    assert!(!vendor_folder.join("zerolith@0.0.0/dist/gone.d.ts").exists());
    assert_eq!(
        fs::read_to_string(vendor_folder.join("lenis/lenis.mjs")).unwrap(),
        "the site's own"
    );
    assert_eq!(
        fs::read_to_string(vendor_folder.join("zerolith@0.0.0/VERSION")).unwrap(),
        "0.0.0\n"
    );
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn writes_nothing_when_any_package_fails_its_checks() {
    let root = std::env::temp_dir().join(format!(
        "zerolith-importmap-plan-test-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&root);
    let core = root.join("node_modules/zerolith");
    fs::create_dir_all(core.join("dist")).unwrap();
    fs::write(
        core.join("package.json"),
        r#"{"name":"zerolith","version":"0.0.0","exports":{".":"./dist/index.js"}}"#,
    )
    .unwrap();
    fs::write(core.join("dist/index.js"), "export const v=1;\n").unwrap();
    let router = root.join("node_modules/@zerolith/router");
    fs::create_dir_all(router.join("dist")).unwrap();
    fs::write(
        router.join("package.json"),
        r#"{"name":"@zerolith/router","version":"0.0.0","exports":{".":"./dist/index.js"}}"#,
    )
    .unwrap();
    fs::write(router.join("dist/index.js"), "export const r=1;\n").unwrap();
    let vendor_folder = root.join("vendor");
    vendor(&root, std::path::Path::new("vendor"), false, None).unwrap();
    let map = fs::read_to_string(vendor_folder.join("importmap.json")).unwrap();

    fs::write(core.join("dist/index.js"), "export const v=2;\n").unwrap();
    fs::write(router.join("dist/index.js"), "export{").unwrap();
    vendor(&root, std::path::Path::new("vendor"), false, None)
        .expect_err("a router module that does not parse");
    assert_eq!(
        fs::read_to_string(vendor_folder.join("zerolith@0.0.0/dist/index.js")).unwrap(),
        "export const v=1;\n"
    );
    assert_eq!(
        fs::read_to_string(vendor_folder.join("importmap.json")).unwrap(),
        map
    );
    let _ = fs::remove_dir_all(&root);
}

/// One import a generated module holds, as `module_from` writes it.
#[derive(Debug, Clone)]
enum Piece {
    Static {
        specifier: String,
        form: u8,
        spaced: bool,
    },
    Dynamic {
        specifier: String,
        template: bool,
    },
    Bare(String),
    Lookalike(String),
}

fn specifier() -> impl proptest::strategy::Strategy<Value = String> {
    use proptest::prelude::*;
    (0usize..3, "[a-z][a-z0-9_-]{0,7}").prop_map(|(up, name)| {
        if up == 0 {
            format!("./{name}.js")
        } else {
            format!("{}{name}.js", "../".repeat(up))
        }
    })
}

fn piece() -> impl proptest::strategy::Strategy<Value = Piece> {
    use proptest::prelude::*;
    prop_oneof![
        (specifier(), 0u8..4, any::<bool>()).prop_map(|(specifier, form, spaced)| {
            Piece::Static {
                specifier,
                form,
                spaced,
            }
        }),
        (specifier(), any::<bool>()).prop_map(|(specifier, template)| Piece::Dynamic {
            specifier,
            template
        }),
        "[a-z]{1,8}".prop_map(Piece::Bare),
        specifier().prop_map(Piece::Lookalike),
    ]
}

/// The text of a module made of `pieces`, each binding under a name of its own.
fn module_from(pieces: &[Piece]) -> String {
    pieces
        .iter()
        .enumerate()
        .map(|(index, piece)| match piece {
            Piece::Static {
                specifier,
                form,
                spaced,
            } => {
                let gap = if *spaced { " " } else { "" };
                match form {
                    0 => {
                        format!("import{gap}{{ a as v{index} }}{gap}from{gap}\"{specifier}\";")
                    }
                    1 => format!("import{gap}'{specifier}';"),
                    2 => format!("export{gap}*{gap}from{gap}\"{specifier}\";"),
                    _ => format!("export{gap}{{ v{index} }}{gap}from{gap}'{specifier}';"),
                }
            }
            Piece::Dynamic {
                specifier,
                template,
            } => {
                if *template {
                    format!("const d{index}=()=>import(`{specifier}`);")
                } else {
                    format!("const d{index}=()=>import(\"{specifier}\");")
                }
            }
            Piece::Bare(name) => {
                format!("import\"{name}\";const n{index}=()=>import(\"{name}\");")
            }
            Piece::Lookalike(specifier) => {
                format!("const s{index}='import \"{specifier}\"; export * from \"{specifier}\"';")
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// The path a relative specifier names from a module's folder, found by deleting each `name/..` pair until none is left; None when a `..` would leave the package.
fn reference_resolution(from: &str, specifier: &str) -> Option<String> {
    let folder = from.rsplit_once('/').map_or("", |(folder, _)| folder);
    let joined = format!("{folder}/{specifier}");
    let mut parts: Vec<&str> = joined
        .split('/')
        .filter(|part| !part.is_empty() && *part != ".")
        .collect();
    while let Some(at) = parts.iter().position(|part| *part == "..") {
        if at == 0 {
            return None;
        }
        parts.drain(at - 1..=at);
    }
    Some(parts.join("/"))
}

proptest::proptest! {
    /// The static imports a module holds are found in order, minified or spaced, quoted either way, for its effects alone or for bindings; `import()` paths are found apart from them; bare specifiers and text that only looks like an import are not.
    #[test]
    fn finds_exactly_the_relative_imports_a_module_holds(pieces in proptest::collection::vec(piece(), 0..12)) {
        let found = relative_imports(&module_from(&pieces)).unwrap();
        let statically: Vec<String> = pieces
            .iter()
            .filter_map(|piece| match piece {
                Piece::Static { specifier, .. } => Some(specifier.clone()),
                _ => None,
            })
            .collect();
        let dynamically: Vec<String> = pieces
            .iter()
            .filter_map(|piece| match piece {
                Piece::Dynamic { specifier, .. } => Some(specifier.clone()),
                _ => None,
            })
            .collect();
        proptest::prop_assert_eq!(found.statically, statically);
        proptest::prop_assert_eq!(found.dynamically, dynamically);
    }

    /// A relative specifier resolves as deleting each `name/..` pair resolves it, and to nothing when it climbs above the package's folder.
    #[test]
    fn resolves_as_the_reference_does(
        from in "[a-z]{1,4}(/[a-z]{1,4}){0,3}\\.js",
        specifier in "(\\./|(\\.\\./){1,4})([a-z]{1,4}/|\\./|\\.\\./){0,3}[a-z]{1,4}\\.js",
    ) {
        proptest::prop_assert_eq!(resolve_within(&from, &specifier), reference_resolution(&from, &specifier));
    }

    /// A module's closing comment gives back the URL it names and where its line starts, whatever comes before it; a module that does not end with one gives nothing.
    #[test]
    fn reads_the_comment_that_ends_a_module(code in "[^\\r\\n]{0,40}(\\n[^\\r\\n]{0,40}){0,3}", url in "[^\\s]{1,30}", trailing in "\\n{0,2}") {
        let module = format!("{code}\n//# sourceMappingURL={url}{trailing}");
        let found = super::plan::source_map_comment(module.as_bytes());
        proptest::prop_assert_eq!(found, Some((code.len() + 1, url.clone())));
        let ends_otherwise = format!("//# sourceMappingURL={url}\n{code}x");
        proptest::prop_assert_eq!(super::plan::source_map_comment(ends_otherwise.as_bytes()).map(|(_, named)| named), None::<String>);
    }
}

#[test]
fn keeps_an_earlier_runs_files_until_pruned_and_refuses_an_entry_outside_the_package() {
    let root = std::env::temp_dir().join(format!(
        "zerolith-importmap-prune-test-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&root);
    let core = root.join("node_modules/zerolith");
    fs::create_dir_all(core.join("dist/production")).unwrap();
    fs::write(core.join("package.json"), r#"{"name":"zerolith","version":"0.0.0","exports":{".":{"development":"./dist/index.js","default":"./dist/production/index.js"}}}"#).unwrap();
    fs::write(core.join("dist/index.js"), "export const dev=1;\n").unwrap();
    fs::write(
        core.join("dist/production/index.js"),
        "export const prod=1;\n",
    )
    .unwrap();
    vendor(&root, std::path::Path::new("vendor"), true, None).unwrap();
    vendor(&root, std::path::Path::new("vendor"), false, None).unwrap();
    assert!(root.join("vendor/zerolith@0.0.0/dist/index.js").is_file());
    assert!(
        root.join("vendor/zerolith@0.0.0/dist/production/index.js")
            .is_file()
    );
    vendor(&root, std::path::Path::new("vendor"), false, None)
        .unwrap()
        .prune()
        .unwrap();
    assert!(!root.join("vendor/zerolith@0.0.0/dist/index.js").exists());

    fs::write(core.join("package.json"), r#"{"name":"zerolith","version":"0.0.0","exports":{".":"./dist/production/index.js","./outside":"./../../outside.js"}}"#).unwrap();
    fs::write(root.join("node_modules/outside.js"), "export const o=1;\n").unwrap();
    let error = vendor(&root, std::path::Path::new("vendor"), false, None)
        .expect_err("an entry outside the package");
    assert!(
        error
            .to_string()
            .starts_with("zerolith exports ./outside as ./../../outside.js, which leaves"),
        "{error}"
    );
    assert!(!root.join("outside.js").exists());
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn reads_and_writes_a_source_map_only_beside_its_module() {
    for url in ["index.js.map", "index.named.map"] {
        assert!(super::plan::names_file_beside(url), "{url}");
    }
    for url in [
        "",
        ".",
        "..",
        "../index.js.map",
        "maps/index.js.map",
        "maps\\index.js.map",
        "/index.js.map",
        "C:index.js.map",
        "C:\\index.js.map",
        "index.js.map?v=1",
        "index.js.map#x",
        "data:application/json;base64,e30=",
        "index.map.json",
        "x",
        "view.js",
        "VERSION",
        ".map",
    ] {
        assert!(!super::plan::names_file_beside(url), "{url}");
    }
}

#[test]
fn refuses_an_entry_the_package_does_not_hold() {
    let root = std::env::temp_dir().join(format!(
        "zerolith-importmap-missing-test-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&root);
    let router = root.join("node_modules/@zerolith/router");
    fs::create_dir_all(router.join("dist")).unwrap();
    fs::write(router.join("package.json"), r#"{"name":"@zerolith/router","version":"0.0.0","exports":{".":{"development":"./dist/index.js","default":"./dist/production/index.js"}}}"#).unwrap();
    fs::write(router.join("dist/index.js"), "export const dev = 1;\n").unwrap();
    let error = vendor(&root, std::path::Path::new("vendor"), false, None)
        .expect_err("an entry the package does not hold");
    assert!(
        error.to_string().starts_with(
            "/vendor/@zerolith/router@0.0.0/dist/production/index.js is missing from "
        ),
        "{error}"
    );
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn keeps_the_page_entries_the_vendored_map_does_not_replace() {
    let mut vendored = Vendored::default();
    vendored
        .map
        .imports
        .insert("zerolith".into(), "/vendor/zerolith@0.0.0/index.js".into());
    let page = "<head><script type=\"importmap\">{\"imports\":{\"zerolith\":\"/old.js\",\"lit\":\"https://cdn.example/lit.js\"},\"scopes\":{\"/legacy/\":{\"lit\":\"/legacy/lit.js\"}}}</script></head>";
    let updated = update_html(page, &page_tags(&vendored, "/index.html", page, None));
    assert!(updated.contains("\"zerolith\":\"/vendor/zerolith@0.0.0/index.js\""));
    assert!(updated.contains("\"lit\":\"https://cdn.example/lit.js\""));
    assert!(updated.contains("\"scopes\":{\"/legacy/\":{\"lit\":\"/legacy/lit.js\"}}"));
    assert!(!updated.contains("/old.js"));
    assert_eq!(
        page_tags(&vendored, "/index.html", "<head></head>", None),
        html_tags(&vendored)
    );

    vendored.folders = vec!["/vendor/zerolith@0.0.0/".into()];
    vendored.map.integrity.insert(
        "/vendor/zerolith@0.0.0/index.js".into(),
        "sha256-kept".into(),
    );
    let earlier = "<head><script type=\"importmap\">{\"imports\":{\"zerolith/internal\":\"/vendor/zerolith@0.0.0/dist/internal.js\",\"#core\":\"/vendor/zerolith@0.0.0/index.js\",\"core/\":\"/vendor/zerolith@0.0.0/\",\"lit\":\"/lib/lit.js\"},\"integrity\":{\"/vendor/zerolith@0.0.0/dist/index.js\":\"sha256-old\",\"/lib/lit.js\":\"sha384-lit\"}}</script></head>";
    let refreshed = update_html(earlier, &page_tags(&vendored, "/index.html", earlier, None));
    assert!(!refreshed.contains("/vendor/zerolith@0.0.0/dist/"));
    assert!(refreshed.contains("\"#core\":\"/vendor/zerolith@0.0.0/index.js\""));
    assert!(refreshed.contains("\"core/\":\"/vendor/zerolith@0.0.0/\""));
    assert!(refreshed.contains("\"lit\":\"/lib/lit.js\""));
    assert!(refreshed.contains("\"/lib/lit.js\":\"sha384-lit\""));

    let scoped = "<head><script type=\"importmap\">{\"imports\":{},\"scopes\":{\"/app/\":{\"zerolith/x\":\"/vendor/zerolith@0.0.0/dist/x.js\"},\"/legacy/\":{\"lit\":\"/legacy/lit.js\",\"zerolith\":\"/vendor/zerolith@0.0.0/dist/old.js\"}}}</script></head>";
    let cleaned = update_html(scoped, &page_tags(&vendored, "/index.html", scoped, None));
    assert!(!cleaned.contains("/vendor/zerolith@0.0.0/dist/"));
    assert!(!cleaned.contains("\"/app/\""));
    assert!(cleaned.contains("\"scopes\":{\"/legacy/\":{\"lit\":\"/legacy/lit.js\"}}"));

    let relative = "<head><script type=\"importmap\">{\"imports\":{\"zerolith/old\":\"../vendor/zerolith@0.0.0/dist/old.js\",\"zerolith/kept\":\"../vendor/zerolith@0.0.0/index.js\",\"core/\":\"../vendor/zerolith@0.0.0/dist/\",\"odd\":\"../vendor/zerolith@0.0.0/dist/a:b.js\",\"lit\":\"lit.js\",\"cdn\":\"https://cdn.example/lit.js\"},\"integrity\":{\"../vendor/zerolith@0.0.0/dist/old.js\":\"sha256-old\",\"../vendor/zerolith@0.0.0/index.js\":\"sha256-stale\",\"lit.js\":\"sha384-lit\"}}</script></head>";
    let resolved = update_html(
        relative,
        &page_tags(&vendored, "/app/index.html", relative, None),
    );
    assert!(!resolved.contains("old.js"), "{resolved}");
    assert!(!resolved.contains("\"core/\""), "{resolved}");
    assert!(!resolved.contains("a:b.js"), "{resolved}");
    assert!(!resolved.contains("sha256-stale"), "{resolved}");
    assert!(
        resolved.contains("\"zerolith/kept\":\"../vendor/zerolith@0.0.0/index.js\""),
        "{resolved}"
    );
    assert!(resolved.contains("\"lit\":\"lit.js\""), "{resolved}");
    assert!(
        resolved.contains("\"cdn\":\"https://cdn.example/lit.js\""),
        "{resolved}"
    );
    assert!(
        resolved.contains("\"integrity\":{\"/vendor/zerolith@0.0.0/index.js\":\"sha256-kept\",\"lit.js\":\"sha384-lit\"}"),
        "{resolved}"
    );
}

#[test]
fn prunes_only_after_the_pages_are_written() {
    let root = std::env::temp_dir().join(format!(
        "zerolith-importmap-late-prune-test-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&root);
    let core = root.join("node_modules/zerolith");
    fs::create_dir_all(core.join("dist")).unwrap();
    fs::write(
        core.join("package.json"),
        r#"{"name":"zerolith","version":"0.0.0","exports":{".":"./dist/index.js"}}"#,
    )
    .unwrap();
    fs::write(core.join("dist/index.js"), "export const v=1;\n").unwrap();
    fs::create_dir_all(root.join("vendor/zerolith@0.0.0/dist")).unwrap();
    fs::write(root.join("vendor/zerolith@0.0.0/VERSION"), "0.0.0\n").unwrap();
    let stale = root.join("vendor/zerolith@0.0.0/dist/gone.js");
    fs::write(&stale, "export const gone=1;\n").unwrap();
    let page = root.join("index.html");
    fs::write(&page, "<html><head><script type=\"importmap\">{\"imports\":{\"zerolith/gone\":\"/vendor/zerolith@0.0.0/dist/gone.js\"}}</script></head><body><script type=\"module\">import \"zerolith\";</script></body></html>").unwrap();
    let mut readonly = fs::metadata(&page).unwrap().permissions();
    readonly.set_readonly(true);
    fs::set_permissions(&page, readonly).unwrap();
    let outcome = super::run(
        &root,
        std::path::Path::new("vendor"),
        false,
        &[PathBuf::from("index.html")],
    );
    let mut writable = fs::metadata(&page).unwrap().permissions();
    #[allow(clippy::permissions_set_readonly_false)]
    writable.set_readonly(false);
    fs::set_permissions(&page, writable).unwrap();
    // A read-only page stops the write wherever the account honors the bit, as a developer's account and the hosted runners do; an account that writes anyway, such as root, takes the second run alone.
    if outcome.is_err() {
        assert!(
            stale.is_file(),
            "a failed page write keeps the files the page names"
        );
        assert!(fs::read_to_string(&page).unwrap().contains("gone.js"));
    }
    super::run(
        &root,
        std::path::Path::new("vendor"),
        false,
        &[PathBuf::from("index.html")],
    )
    .unwrap();
    assert!(!stale.exists());
    assert!(!fs::read_to_string(&page).unwrap().contains("gone.js"));
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn rewrites_a_map_with_other_attributes_and_keeps_them() {
    let mut vendored = Vendored::default();
    vendored
        .map
        .imports
        .insert("zerolith".into(), "/vendor/zerolith@0.0.0/index.js".into());
    let page = "<head>\n<!-- <script type=\"importmap\">{\"imports\":{}}</script> -->\n<script type=\"importmap\" nonce=\"n0\">{\"imports\":{\"lit\":\"/lit.js\"}}</script>\n<script type=\"importmap\">{}</script>\n</head>";
    let updated = update_html(page, &page_tags(&vendored, "/index.html", page, None));
    assert!(
        updated.contains("<script type=\"importmap\" nonce=\"n0\">{\"imports\":{\"lit\":\"/lit.js\",\"zerolith\":\"/vendor/zerolith@0.0.0/index.js\"}}</script>"),
        "{updated}"
    );
    assert!(
        updated.contains("<!-- <script type=\"importmap\">{\"imports\":{}}</script> -->"),
        "{updated}"
    );
    assert_eq!(
        updated.matches("<script type=\"importmap\"").count(),
        2,
        "{updated}"
    );
}

#[test]
fn walks_a_pages_modules_and_vendors_what_they_reach() {
    let root = std::env::temp_dir().join(format!(
        "zerolith-importmap-graph-test-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&root);
    let packages = root.join("node_modules");
    for (package, manifest, files) in [
        (
            "zerolith",
            r#"{"name":"zerolith","version":"0.0.0","exports":{".":"./dist/index.js","./ssr":"./dist/ssr.js","./internal":"./dist/internal.js"}}"#,
            vec![
                ("dist/index.js", "import\"./scan.js\";export const html=1;"),
                ("dist/scan.js", "export const scan=1;"),
                ("dist/ssr.js", "export const render=1;"),
                ("dist/internal.js", "export const version=1;"),
            ],
        ),
        (
            "@zerolith/router",
            r#"{"name":"@zerolith/router","version":"0.0.0","exports":{".":"./dist/index.js","./server":"./dist/server.js"}}"#,
            vec![
                (
                    "dist/index.js",
                    "import{html}from\"zerolith\";export const createRouter=html;\n//# sourceMappingURL=index.js.map\n",
                ),
                (
                    "dist/index.js.map",
                    r#"{"version":3,"file":"index.js","sources":["../src/index.ts"],"sourcesContent":["export const createRouter = 1;\n"],"names":[],"mappings":"AAAA"}"#,
                ),
                ("dist/server.js", "export const serverRouter=1;"),
            ],
        ),
        (
            "@zerolith/forms",
            r#"{"name":"@zerolith/forms","version":"0.0.0","exports":{".":"./dist/index.js"}}"#,
            vec![("dist/index.js", "export const form=1;")],
        ),
        (
            "@zerolith/a11y",
            r#"{"name":"@zerolith/a11y","version":"0.0.0","exports":{".":"./dist/index.js"}}"#,
            vec![("dist/index.js", "export const announce=1;")],
        ),
    ] {
        let folder = packages.join(package);
        fs::create_dir_all(folder.join("dist")).unwrap();
        fs::write(folder.join("package.json"), manifest).unwrap();
        fs::write(folder.join("LICENSE"), "Apache License\n").unwrap();
        for (file, text) in files {
            fs::write(folder.join(file), text).unwrap();
        }
    }
    fs::create_dir_all(root.join("src/views")).unwrap();
    fs::write(
        root.join("src/main.ts"),
        "import { html } from \"zerolith\";\nimport { app } from \"./app.js\";\nimport { lazy } from \"./lazy.js\";\nexport const main: number = html + app + lazy;\n",
    )
    .unwrap();
    fs::write(
        root.join("src/app.ts"),
        "import { createRouter } from \"@zerolith/router\";\nimport { view } from \"/src/views/view.js\";\nexport const app = createRouter + view;\n",
    )
    .unwrap();
    fs::write(
        root.join("src/views/view.ts"),
        "export const view = 1;\nexport const settings = () => import(\"./settings.js\");\n",
    )
    .unwrap();
    fs::write(
        root.join("src/views/settings.ts"),
        "import { form } from \"@zerolith/forms\";\nexport const settings = form;\n",
    )
    .unwrap();
    fs::write(
        root.join("src/lazy.ts"),
        "export const lazy = () => import(\"./tools.js\");\n",
    )
    .unwrap();
    fs::write(root.join("src/tools.ts"), "export const tools = 1;\n").unwrap();
    let page = "<!doctype html>\n<html><head>\n<script type=\"module\" src=\"/src/main.js\"></script>\n<script type=\"module\" src=\"./src/main.js?v=2\"></script>\n<script type=\"module\">import \"zerolith\";\nconst a11y = () => import(\"@zerolith/a11y\");</script>\n<script src=\"/legacy.js\"></script>\n</head><body></body></html>\n";
    fs::write(root.join("index.html"), page).unwrap();

    let graph = super::graph::page_graph(&root, "/index.html", page).unwrap();
    assert_eq!(graph.entries, vec!["/src/main.js"]);
    assert_eq!(
        graph.modules,
        vec![
            "/src/main.js",
            "/src/app.js",
            "/src/views/view.js",
            "/src/lazy.js"
        ]
    );
    assert_eq!(
        graph.bare.iter().collect::<Vec<_>>(),
        ["@zerolith/router", "zerolith"]
    );
    assert_eq!(
        graph.lazy.iter().collect::<Vec<_>>(),
        ["@zerolith/a11y", "@zerolith/forms"]
    );

    let vendored = vendor(&root, std::path::Path::new("vendor"), false, Some(&graph)).unwrap();
    assert_eq!(
        vendored.map.imports.keys().collect::<Vec<_>>(),
        [
            "@zerolith/a11y",
            "@zerolith/forms",
            "@zerolith/router",
            "zerolith"
        ]
    );
    assert_eq!(
        vendored.map.integrity.keys().collect::<Vec<_>>(),
        [
            "/vendor/@zerolith/a11y@0.0.0/dist/index.js",
            "/vendor/@zerolith/forms@0.0.0/dist/index.js",
            "/vendor/@zerolith/router@0.0.0/dist/index.js",
            "/vendor/zerolith@0.0.0/dist/index.js",
            "/vendor/zerolith@0.0.0/dist/scan.js"
        ]
    );
    for absent in [
        "zerolith/dist/ssr.js",
        "zerolith/dist/internal.js",
        "@zerolith/router/dist/server.js",
    ] {
        assert!(
            !root.join("vendor").join(absent).exists(),
            "{absent} was vendored"
        );
    }
    assert!(root.join("vendor/@zerolith/forms@0.0.0/LICENSE").is_file());
    assert!(
        root.join("vendor/@zerolith/router@0.0.0/dist/index.js.map")
            .is_file()
    );
    assert_eq!(
        vendored.preloads(&graph),
        vec![
            "/src/app.js",
            "/src/views/view.js",
            "/src/lazy.js",
            "/vendor/@zerolith/router@0.0.0/dist/index.js",
            "/vendor/zerolith@0.0.0/dist/index.js",
            "/vendor/zerolith@0.0.0/dist/scan.js"
        ]
    );
    let updated = update_html(
        page,
        &page_tags(&vendored, "/index.html", page, Some(&graph)),
    );
    assert!(
        updated.contains("<link rel=\"modulepreload\" href=\"/src/app.js\" data-zerolith-preload>"),
        "{updated}"
    );
    assert!(!updated.contains("href=\"/src/main.js\""), "{updated}");
    assert!(
        !updated.contains("href=\"/vendor/@zerolith/forms@0.0.0/"),
        "{updated}"
    );
    let hash = &vendored.map.integrity["/vendor/@zerolith/router@0.0.0/dist/index.js"];
    assert!(
        updated.contains(&format!("<link rel=\"modulepreload\" href=\"/vendor/@zerolith/router@0.0.0/dist/index.js\" integrity=\"{hash}\" data-zerolith-preload>")),
        "{updated}"
    );
    assert!(
        updated.contains(
            "<link rel=\"modulepreload\" href=\"/vendor/zerolith@0.0.0/dist/scan.js\" integrity="
        ),
        "{updated}"
    );
    assert_eq!(updated.matches("rel=\"modulepreload\"").count(), 6);
    assert!(
        updated.find("<script type=\"importmap\">").unwrap()
            < updated.find("src=\"/src/main.js\"").unwrap()
    );

    fs::write(
        root.join("index.html"),
        "<!doctype html><head><script type=\"module\">import \"zerolith\";</script></head>",
    )
    .unwrap();
    let narrowed = super::graph::page_graph(
        &root,
        "/index.html",
        &fs::read_to_string(root.join("index.html")).unwrap(),
    )
    .unwrap();
    assert!(narrowed.entries.is_empty() && narrowed.modules.is_empty());
    let vendored = vendor(
        &root,
        std::path::Path::new("vendor"),
        false,
        Some(&narrowed),
    )
    .unwrap();
    assert_eq!(
        vendored.map.imports.keys().collect::<Vec<_>>(),
        ["zerolith"]
    );
    assert_eq!(vendored.versions.keys().collect::<Vec<_>>(), ["zerolith"]);
    assert!(
        root.join("vendor/@zerolith/router@0.0.0/dist/index.js")
            .is_file()
    );
    assert!(
        root.join("vendor/@zerolith/forms@0.0.0/dist/index.js")
            .is_file()
    );
    assert!(root.join("vendor/zerolith@0.0.0/dist/index.js").is_file());
    assert_eq!(
        vendored.preloads(&narrowed),
        vec![
            "/vendor/zerolith@0.0.0/dist/index.js",
            "/vendor/zerolith@0.0.0/dist/scan.js"
        ]
    );
    let stale = "<head><script type=\"importmap\">{\"imports\":{\"@zerolith/router\":\"/vendor/@zerolith/router@0.0.0/dist/index.js\",\"lit\":\"/lib/lit.js\"}}</script></head>";
    let cleaned = update_html(
        stale,
        &page_tags(&vendored, "/index.html", stale, Some(&narrowed)),
    );
    assert!(!cleaned.contains("@zerolith/router"), "{cleaned}");
    assert!(cleaned.contains("\"lit\":\"/lib/lit.js\""), "{cleaned}");

    let nothing = super::graph::page_graph(&root, "/index.html", "<head></head>").unwrap();
    assert!(nothing.unbounded() && !nothing.open);
    let vendored = vendor(&root, std::path::Path::new("vendor"), false, Some(&nothing)).unwrap();
    assert_eq!(vendored.map.imports.len(), 7);
    assert!(
        root.join("vendor/@zerolith/router@0.0.0/dist/server.js")
            .is_file()
    );
    assert!(vendored.preloads(&nothing).is_empty());

    fs::write(
        root.join("src/main.ts"),
        "import { html } from \"zerolith\";\nexport const open = (name: string) => import(name);\nexport const main = html;\n",
    )
    .unwrap();
    let computed = super::graph::page_graph(
        &root,
        "/index.html",
        "<script type=\"module\" src=\"/src/main.js\"></script>",
    )
    .unwrap();
    assert!(computed.open && computed.unbounded());
    assert_eq!(computed.bare.iter().collect::<Vec<_>>(), ["zerolith"]);
    let vendored = vendor(
        &root,
        std::path::Path::new("vendor"),
        false,
        Some(&computed),
    )
    .unwrap();
    assert_eq!(vendored.map.imports.len(), 7);
    assert_eq!(
        vendored.preloads(&computed),
        vec![
            "/vendor/zerolith@0.0.0/dist/index.js",
            "/vendor/zerolith@0.0.0/dist/scan.js"
        ]
    );
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn writes_every_page_given_from_one_vendoring() {
    let root = std::env::temp_dir().join(format!(
        "zerolith-importmap-pages-test-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&root);
    for (path, text) in [
        (
            "node_modules/zerolith/package.json",
            r#"{"name":"zerolith","version":"0.0.0","exports":{".":"./dist/index.js","./ssr":"./dist/ssr.js"}}"#,
        ),
        (
            "node_modules/zerolith/dist/index.js",
            "export const html=1;",
        ),
        (
            "node_modules/zerolith/dist/ssr.js",
            "export const render=1;",
        ),
        (
            "node_modules/@zerolith/router/package.json",
            r#"{"name":"@zerolith/router","version":"0.0.0","exports":{".":"./dist/index.js"}}"#,
        ),
        (
            "node_modules/@zerolith/router/dist/index.js",
            "import{html}from\"zerolith\";export const createRouter=html;",
        ),
        (
            "index.html",
            "<!doctype html><head><script type=\"module\" src=\"/src/home.js\"></script></head>",
        ),
        (
            "src/home.js",
            "import { html } from \"zerolith\";\nexport const home = html;\n",
        ),
        (
            "about/index.html",
            "<!doctype html><head><script type=\"module\" src=\"../src/about.js\"></script></head>",
        ),
        (
            "src/about.js",
            "import { createRouter } from \"@zerolith/router\";\nimport { shared } from \"./shared.js\";\nexport const about = createRouter + shared;\n",
        ),
        ("src/shared.js", "export const shared = 1;\n"),
    ] {
        let file = root.join(path);
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(file, text).unwrap();
    }
    super::run(
        &root,
        std::path::Path::new("vendor"),
        false,
        &[
            PathBuf::from("index.html"),
            PathBuf::from("about/index.html"),
        ],
    )
    .unwrap();
    let home = fs::read_to_string(root.join("index.html")).unwrap();
    let about = fs::read_to_string(root.join("about/index.html")).unwrap();
    for page in [&home, &about] {
        assert!(
            page.contains("\"@zerolith/router\":\"/vendor/@zerolith/router@0.0.0/dist/index.js\"")
                && page.contains("\"zerolith\":\"/vendor/zerolith@0.0.0/dist/index.js\"")
                && !page.contains("zerolith/ssr"),
            "{page}"
        );
    }
    assert!(
        home.contains("href=\"/vendor/zerolith@0.0.0/dist/index.js\"")
            && !home.contains("href=\"/vendor/@zerolith/router@0.0.0/")
            && !home.contains("href=\"/src/"),
        "{home}"
    );
    assert!(
        about.contains("href=\"/src/shared.js\" data-zerolith-preload>")
            && about.contains("href=\"/vendor/@zerolith/router@0.0.0/dist/index.js\"")
            && about.contains("href=\"/vendor/zerolith@0.0.0/dist/index.js\"")
            && !about.contains("href=\"/src/about.js\""),
        "{about}"
    );
    assert!(!root.join("vendor/zerolith@0.0.0/dist/ssr.js").exists());
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn covers_named_and_prefixed_specifiers() {
    let mut map = ImportMap::default();
    map.imports.insert("lit".into(), "/lit.js".into());
    map.imports.insert("lodash/".into(), "/lodash/".into());
    assert!(covers(&map, "lit"));
    assert!(covers(&map, "lodash/get.js"));
    assert!(!covers(&map, "lit/decorators.js"));
    assert!(!covers(&map, "lodash"));
}

#[test]
fn moves_a_package_to_a_folder_of_its_new_version() {
    let root = std::env::temp_dir().join(format!(
        "zerolith-importmap-versions-test-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&root);
    let install = |package: &str, version: &str, code: &str| {
        let folder = root.join("node_modules").join(package);
        fs::create_dir_all(folder.join("dist")).unwrap();
        fs::write(
            folder.join("package.json"),
            format!(r#"{{"name":"{package}","version":"{version}","exports":{{".":"./dist/index.js"}}}}"#),
        )
        .unwrap();
        fs::write(folder.join("dist/index.js"), code).unwrap();
    };
    install("zerolith", "1.0.0", "export const v=1;\n");
    install("@zerolith/router", "1.0.0", "export const r=1;\n");
    let out = std::path::Path::new("vendor");
    let first = vendor(&root, out, false, None).unwrap();
    let vendor_folder = root.join("vendor");
    assert_eq!(
        first.map.imports["zerolith"],
        "/vendor/zerolith@1.0.0/dist/index.js"
    );
    assert_eq!(
        first.map.imports["@zerolith/router"],
        "/vendor/@zerolith/router@1.0.0/dist/index.js"
    );
    assert!(vendor_folder.join("zerolith@1.0.0/VERSION").is_file());
    assert!(
        vendor_folder
            .join("@zerolith/router@1.0.0/dist/index.js")
            .is_file()
    );
    assert!(first.stale.is_empty(), "{:?}", first.stale);

    for (path, text) in [
        ("zerolith/VERSION", "0.9.0\n"),
        (
            "zerolith/dist/old.js",
            "the layout before folders named a version",
        ),
        ("@zerolith/router/VERSION", "0.9.0\n"),
        (
            "@zerolith/router/dist/old.js",
            "the layout before folders named a version",
        ),
        ("zerolith-extra@1.0.0/VERSION", "1.0.0\n"),
        ("zerolith-extra@1.0.0/x.js", "another package's"),
        (
            "zerolith@9.0.0/x.js",
            "no VERSION file, so no earlier run wrote it",
        ),
        ("lenis/lenis.js", "the site's own"),
    ] {
        let file = vendor_folder.join(path);
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(file, text).unwrap();
    }
    install("zerolith", "1.1.0", "export const v=2;\n");
    install("@zerolith/router", "1.1.0", "export const r=2;\n");
    let second = vendor(&root, out, false, None).unwrap();
    assert_eq!(
        second.map.imports["zerolith"],
        "/vendor/zerolith@1.1.0/dist/index.js"
    );
    assert_eq!(
        second.map.imports["@zerolith/router"],
        "/vendor/@zerolith/router@1.1.0/dist/index.js"
    );
    assert!(
        second
            .map
            .integrity
            .keys()
            .all(|url| url.contains("@1.1.0/")),
        "{:?}",
        second.map.integrity
    );
    assert_eq!(
        fs::read_to_string(vendor_folder.join("zerolith@1.1.0/dist/index.js")).unwrap(),
        "export const v=2;\n"
    );
    assert_eq!(
        fs::read_to_string(vendor_folder.join("zerolith@1.0.0/dist/index.js")).unwrap(),
        "export const v=1;\n",
        "a page the run has not rewritten yet still finds its files"
    );

    let page = r#"<html><head><script type="importmap">{"imports":{"zerolith":"/vendor/zerolith@1.0.0/dist/index.js","zerolith/ssr":"/vendor/zerolith/dist/ssr.js","@zerolith/router/server":"/vendor/@zerolith/router@1.0.0/dist/server.js","lenis":"/vendor/lenis/lenis.js","extra":"/vendor/zerolith-extra@1.0.0/x.js"},"integrity":{"/vendor/zerolith@1.0.0/dist/index.js":"sha256-old","/vendor/lenis/lenis.js":"sha256-lenis"}}</script></head></html>"#;
    let tags = page_tags(&second, "/index.html", page, None);
    assert!(
        !tags.contains("@1.0.0/dist") && !tags.contains("/vendor/zerolith/dist"),
        "{tags}"
    );
    assert!(!tags.contains("sha256-old"), "{tags}");
    assert!(
        tags.contains(r#""lenis":"/vendor/lenis/lenis.js""#) && tags.contains("sha256-lenis"),
        "{tags}"
    );
    assert!(
        tags.contains(r#""extra":"/vendor/zerolith-extra@1.0.0/x.js""#),
        "{tags}"
    );
    assert!(
        tags.contains(r#""zerolith":"/vendor/zerolith@1.1.0/dist/index.js""#),
        "{tags}"
    );

    second.prune().unwrap();
    for gone in [
        "zerolith@1.0.0",
        "@zerolith/router@1.0.0",
        "zerolith",
        "@zerolith/router",
    ] {
        assert!(!vendor_folder.join(gone).exists(), "{gone} stayed");
    }
    for kept in [
        "zerolith@1.1.0/VERSION",
        "zerolith@1.1.0/dist/index.js",
        "@zerolith/router@1.1.0/dist/index.js",
        "zerolith-extra@1.0.0/x.js",
        "zerolith@9.0.0/x.js",
        "lenis/lenis.js",
    ] {
        assert!(vendor_folder.join(kept).is_file(), "{kept} was removed");
    }
    let third = vendor(&root, out, false, None).unwrap();
    assert!(third.stale.is_empty(), "{:?}", third.stale);
    let _ = fs::remove_dir_all(&root);
}
