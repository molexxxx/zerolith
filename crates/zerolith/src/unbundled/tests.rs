//! The unbundled build's tests: rewriting sources and pages, and whole
//! builds of small projects.

use super::build;
use super::rewrite::rewrite_html;
use std::fs;
use std::path::Path;

#[test]
fn rewrites_module_script_sources_only() {
    let html = "<script type=\"module\" src=\"/src/main.tsx\"></script><a href=\"notes.ts\">x</a><script src='./b.ts'></script>";
    assert_eq!(
        rewrite_html(html),
        "<script type=\"module\" src=\"/src/main.js\"></script><a href=\"notes.ts\">x</a><script src='./b.js'></script>"
    );
}

#[test]
fn transforms_renames_rewrites_and_copies() {
    let root = std::env::temp_dir().join(format!("zerolith-build-test-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("src")).unwrap();
    fs::create_dir_all(root.join("node_modules/zerolith/dist")).unwrap();
    fs::write(root.join("node_modules/zerolith/package.json"), format!("{{\"name\":\"zerolith\",\"version\":\"{}\",\"exports\":{{\".\":{{\"development\":\"./dist/index.js\",\"default\":\"./dist/index.js\"}}}}}}", env!("CARGO_PKG_VERSION"))).unwrap();
    fs::write(
        root.join("node_modules/zerolith/dist/index.js"),
        "import \"./scan.js\";\nexport const html = 1;",
    )
    .unwrap();
    fs::write(
        root.join("node_modules/zerolith/dist/scan.js"),
        "export const scanner = 1;",
    )
    .unwrap();
    fs::write(
        root.join("node_modules/zerolith/dist/scan.unprepared.js"),
        "export const stub = 1;",
    )
    .unwrap();
    fs::write(
        root.join("index.html"),
        "<!doctype html><script type=\"module\" src=\"/src/main.ts\"></script>",
    )
    .unwrap();
    fs::write(
        root.join("src/main.ts"),
        "import { html } from \"zerolith\";\nimport { App } from \"./app.tsx\";\nexport const n: number = 1;\nexport const v = html`<p>${n}</p>`;\nexport const app = App;\n",
    )
    .unwrap();
    fs::write(
        root.join("src/app.tsx"),
        "export function App(): unknown { return <p>{1}</p>; }\n",
    )
    .unwrap();
    fs::write(root.join("src/plain.js"), "import \"./app.tsx\";\n").unwrap();
    fs::write(root.join("styles.css"), "body {}").unwrap();
    let (out, built, warnings) = build(&root, std::path::Path::new("dist"), true, false).unwrap();
    assert!(warnings.is_empty(), "{warnings:?}");
    assert_eq!(
        (built.modules, built.transformed, built.copied, built.html),
        (3, 2, 1, 1)
    );
    assert!(
        fs::read_to_string(out.join("src/main.js"))
            .unwrap()
            .contains("from \"./app.js\"")
    );
    assert!(
        !fs::read_to_string(out.join("src/main.js"))
            .unwrap()
            .contains(": number")
    );
    assert!(
        fs::read_to_string(out.join("src/app.js"))
            .unwrap()
            .contains("__zl_html(__zl_t0, 1)")
    );
    assert!(
        fs::read_to_string(out.join("src/main.js"))
            .unwrap()
            .contains("html(__zl_t0, n)")
    );
    assert_eq!(
        fs::read_to_string(out.join("vendor/zerolith/dist/scan.js")).unwrap(),
        "export const stub = 1;"
    );
    assert!(
        fs::read_to_string(out.join("src/plain.js"))
            .unwrap()
            .contains("\"./app.js\"")
    );
    assert!(
        fs::read_to_string(out.join("index.html"))
            .unwrap()
            .contains("src=\"/src/main.js\"")
    );
    assert!(out.join("styles.css").is_file());
    assert!(out.join("vendor/importmap.json").is_file());
    assert!(
        fs::read_to_string(out.join("index.html"))
            .unwrap()
            .contains("\"zerolith\":\"/vendor/zerolith/dist/index.js\"")
    );
    assert!(!out.join("node_modules").exists());
    assert!(!out.join("src/main.ts").exists());
    assert!(build(&root, std::path::Path::new("."), true, false).is_err());
    let parent = build(&root, std::path::Path::new(".."), true, false)
        .unwrap_err()
        .to_string();
    assert!(parent.contains("holds the project"), "{parent}");
    let name = root.file_name().unwrap().to_string_lossy().into_owned();
    assert!(build(&root, &std::path::Path::new("..").join(&name), true, false).is_err());
    fs::create_dir_all(root.join("public")).unwrap();
    fs::write(root.join("public/favicon.svg"), "<svg/>").unwrap();
    let public = build(&root, std::path::Path::new("public"), true, false)
        .unwrap_err()
        .to_string();
    assert!(public.contains("public folder"), "{public}");
    assert!(root.join("public/favicon.svg").is_file());
    let sources = build(&root, std::path::Path::new("src"), true, false)
        .unwrap_err()
        .to_string();
    assert!(sources.contains("a source the page loads"), "{sources}");
    assert!(root.join("src/main.ts").is_file());
    let outside = root.with_file_name(format!(
        "zerolith-build-test-outside-{}",
        std::process::id()
    ));
    fs::create_dir_all(&outside).unwrap();
    fs::write(outside.join("keep.txt"), "kept").unwrap();
    let (_, _, warnings) = build(&root, &outside, true, false).unwrap();
    assert!(outside.join("keep.txt").is_file());
    assert!(
        warnings
            .iter()
            .any(|warning| warning.contains("--empty-out-dir")),
        "{warnings:?}"
    );
    build(&root, &outside, true, true).unwrap();
    assert!(!outside.join("keep.txt").exists());
    let _ = fs::remove_dir_all(&outside);
    fs::remove_dir_all(root.join("public")).unwrap();
    let (plain, _, _) = build(&root, std::path::Path::new("plain"), false, false).unwrap();
    assert!(
        fs::read_to_string(plain.join("src/main.js"))
            .unwrap()
            .contains("html`<p>${n}</p>`")
    );
    assert_eq!(
        fs::read_to_string(plain.join("vendor/zerolith/dist/scan.js")).unwrap(),
        "export const scanner = 1;"
    );
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn maps_every_page_and_refuses_what_the_output_cannot_serve() {
    let root =
        std::env::temp_dir().join(format!("zerolith-unbundled-pages-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("src")).unwrap();
    fs::create_dir_all(root.join("about")).unwrap();
    fs::create_dir_all(root.join("public")).unwrap();
    fs::create_dir_all(root.join("node_modules/zerolith/dist")).unwrap();
    fs::write(
        root.join("node_modules/zerolith/package.json"),
        "{\"name\":\"zerolith\",\"version\":\"0.0.0\",\"exports\":{\".\":\"./dist/index.js\"}}",
    )
    .unwrap();
    fs::write(
        root.join("node_modules/zerolith/dist/index.js"),
        "export const html = 1;",
    )
    .unwrap();
    fs::write(
        root.join("src/main.ts"),
        "import { html } from \"zerolith\";\nimport settings from \"./settings.json\";\nexport const parts = [html, settings];\n",
    )
    .unwrap();
    fs::write(
        root.join("src/settings.json"),
        "{\"__proto__\": {\"admin\": true}}",
    )
    .unwrap();
    fs::write(root.join("src/env.d.ts"), "declare const x: number;\n").unwrap();
    fs::write(root.join("zerolith.json"), "{}").unwrap();
    fs::write(root.join("public/logo.svg"), "<svg/>").unwrap();
    let page = "<!doctype html><head></head><script type=\"module\" src=\"/src/main.ts\"></script>";
    fs::write(root.join("index.html"), page).unwrap();
    fs::write(root.join("about/index.html"), page).unwrap();
    let (out, built, _) = build(&root, Path::new("dist"), false, false).unwrap();
    assert_eq!(built.pages.len(), 2);
    for page in ["index.html", "about/index.html"] {
        let written = fs::read_to_string(out.join(page)).unwrap();
        assert!(
            written.contains("\"zerolith\":\"/vendor/zerolith/dist/index.js\""),
            "{page}: {written}"
        );
    }
    let json = fs::read_to_string(out.join("src/settings.json.js")).unwrap();
    assert!(json.starts_with("export default JSON.parse("), "{json}");
    assert!(!out.join("zerolith.json").exists());
    assert!(!out.join("src/env.d.js").exists());

    fs::write(root.join("src/main.js"), "export const stale = 1;\n").unwrap();
    let collision = build(&root, Path::new("dist"), false, false)
        .unwrap_err()
        .to_string();
    assert!(
        collision.contains("src/main.js and src/main.ts both become src/main.js")
            || collision.contains("src/main.ts and src/main.js both become src/main.js"),
        "{collision}"
    );
    fs::remove_file(root.join("src/main.js")).unwrap();

    fs::write(
        root.join("src/logo.ts"),
        "import relative from \"../public/logo.svg\";\nimport served from \"/logo.svg\";\nexport const urls = [relative, served];\n",
    )
    .unwrap();
    let public = build(&root, Path::new("dist"), false, false)
        .unwrap_err()
        .to_string();
    assert!(
        public.contains("src/logo.ts: the import of ../public/logo.svg names a file in public/"),
        "{public}"
    );
    assert!(
        public.contains("src/logo.ts: the import of /logo.svg names a file in public/"),
        "{public}"
    );
    assert!(public.contains("by its URL, /logo.svg,"), "{public}");
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn copies_the_projects_vendored_folders_as_they_are_and_writes_the_packages_anew() {
    let root = std::env::temp_dir().join(format!(
        "zerolith-unbundled-vendored-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&root);
    let lenis =
        "export const lenis = () => import(\"./inner.js\");\nconsole.log(import.meta.env.MODE);\n";
    let page = "<!doctype html><head><script type=\"importmap\">{\"imports\":{\"lenis\":\"/vendor/lenis/lenis.js\"},\"integrity\":{\"/vendor/lenis/lenis.js\":\"sha256-lenis\"}}</script></head><script type=\"module\" src=\"/src/main.ts\"></script>";
    for (path, text) in [
        ("index.html", page),
        (
            "src/main.ts",
            "import { html } from \"zerolith\";\nimport { lenis } from \"lenis\";\nexport const main = [html, lenis];\n",
        ),
        (
            "node_modules/zerolith/package.json",
            "{\"name\":\"zerolith\",\"version\":\"0.0.0\",\"exports\":{\".\":\"./dist/index.js\"}}",
        ),
        (
            "node_modules/zerolith/dist/index.js",
            "export const html = 1;",
        ),
        ("vendor/importmap.json", "{\"imports\":{}}"),
        ("vendor/.gitattributes", "* -text\n"),
        ("vendor/lenis/lenis.js", lenis),
        ("vendor/lenis/lenis.css", ".lenis { height: auto; }\n"),
        ("vendor/lenis/package.json", "{\"name\":\"lenis\"}"),
        ("vendor/zerolith/VERSION", "0.0.0\n"),
        ("vendor/zerolith/dist/stale.js", "export const stale = 1;"),
        ("vendor/@zerolith/router/VERSION", "0.0.0\n"),
        (
            "vendor/@zerolith/router/dist/old.js",
            "export const old = 1;",
        ),
        ("lib/importmap.json", "{\"imports\":{\"x\":\"/lib/x.js\"}}"),
        ("lib/x.js", lenis),
        ("lib/zerolith/kept.js", "export const kept = 1;"),
    ] {
        let file = root.join(path);
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(file, text).unwrap();
    }
    let (out, built, warnings) = build(&root, Path::new("dist"), false, false).unwrap();
    assert!(warnings.is_empty(), "{warnings:?}");
    assert_eq!(
        fs::read_to_string(out.join("vendor/lenis/lenis.js")).unwrap(),
        lenis
    );
    assert!(out.join("vendor/lenis/lenis.css").is_file());
    assert!(out.join("vendor/lenis/package.json").is_file());
    assert_eq!(fs::read_to_string(out.join("lib/x.js")).unwrap(), lenis);
    assert!(out.join("lib/importmap.json").is_file());
    assert!(out.join("lib/zerolith/kept.js").is_file());
    for absent in [
        "vendor/zerolith/dist/stale.js",
        "vendor/@zerolith/router/dist/old.js",
        "vendor/@zerolith",
    ] {
        assert!(!out.join(absent).exists(), "{absent} was copied");
    }
    assert!(out.join("vendor/zerolith/dist/index.js").is_file());
    assert!(
        fs::read_to_string(out.join("vendor/importmap.json"))
            .unwrap()
            .contains("\"zerolith\": \"/vendor/zerolith/dist/index.js\"")
    );
    assert!(
        fs::read_to_string(out.join("vendor/.gitattributes"))
            .unwrap()
            .contains("-text")
    );
    let written = fs::read_to_string(out.join("index.html")).unwrap();
    assert!(
        written.contains("\"lenis\":\"/vendor/lenis/lenis.js\"")
            && written.contains("\"/vendor/lenis/lenis.js\":\"sha256-lenis\""),
        "{written}"
    );
    assert_eq!((built.modules, built.transformed, built.copied), (1, 1, 6));
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn preloads_each_pages_own_modules_and_vendors_what_the_pages_reach() {
    let root =
        std::env::temp_dir().join(format!("zerolith-unbundled-graph-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("src")).unwrap();
    fs::create_dir_all(root.join("about")).unwrap();
    fs::create_dir_all(root.join("node_modules/zerolith/dist")).unwrap();
    fs::write(
        root.join("node_modules/zerolith/package.json"),
        "{\"name\":\"zerolith\",\"version\":\"0.0.0\",\"exports\":{\".\":\"./dist/index.js\",\"./ssr\":\"./dist/ssr.js\"}}",
    )
    .unwrap();
    fs::write(
        root.join("node_modules/zerolith/dist/index.js"),
        "export const html = 1;",
    )
    .unwrap();
    fs::write(
        root.join("node_modules/zerolith/dist/ssr.js"),
        "export const render = 1;",
    )
    .unwrap();
    fs::write(
        root.join("src/main.ts"),
        "import { html } from \"zerolith\";\nimport { app } from \"./app.ts\";\nexport const main = html + app;\n",
    )
    .unwrap();
    fs::write(root.join("src/app.ts"), "export const app: number = 1;\n").unwrap();
    fs::write(root.join("about/about.ts"), "export const about = 1;\n").unwrap();
    fs::write(
        root.join("index.html"),
        "<!doctype html><head></head><script type=\"module\" src=\"/src/main.ts\"></script>",
    )
    .unwrap();
    fs::write(
        root.join("about/index.html"),
        "<!doctype html><head></head><script type=\"module\" src=\"about.ts\"></script>",
    )
    .unwrap();
    let (out, _, warnings) = build(&root, Path::new("dist"), false, false).unwrap();
    assert!(warnings.is_empty(), "{warnings:?}");
    assert!(!out.join("vendor/zerolith/dist/ssr.js").exists());
    let home = fs::read_to_string(out.join("index.html")).unwrap();
    assert!(
        home.contains("<link rel=\"modulepreload\" href=\"/src/app.js\" data-zerolith-preload>"),
        "{home}"
    );
    assert!(
        home.contains("<link rel=\"modulepreload\" href=\"/vendor/zerolith/dist/index.js\" integrity=\"sha256-"),
        "{home}"
    );
    assert!(!home.contains("href=\"/src/main.js\""), "{home}");
    let about = fs::read_to_string(out.join("about/index.html")).unwrap();
    assert!(
        about.contains("\"zerolith\":\"/vendor/zerolith/dist/index.js\""),
        "{about}"
    );
    assert!(!about.contains("modulepreload"), "{about}");
    assert!(about.contains("src=\"about.js\""), "{about}");

    fs::write(root.join("src/main.ts"), "export const main = 1;\n").unwrap();
    let (out, _, _) = build(&root, Path::new("dist"), false, false).unwrap();
    assert!(out.join("vendor/zerolith/dist/ssr.js").is_file());
    let home = fs::read_to_string(out.join("index.html")).unwrap();
    assert!(
        home.contains("\"zerolith/ssr\":\"/vendor/zerolith/dist/ssr.js\""),
        "{home}"
    );
    assert!(!home.contains("modulepreload"), "{home}");
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn warns_of_a_bare_import_no_import_map_covers_and_keeps_the_page_entries() {
    let root = std::env::temp_dir().join(format!("zerolith-unbundled-bare-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("src")).unwrap();
    fs::create_dir_all(root.join("node_modules/zerolith/dist")).unwrap();
    fs::write(
        root.join("node_modules/zerolith/package.json"),
        "{\"name\":\"zerolith\",\"version\":\"0.0.0\",\"exports\":{\".\":\"./dist/index.js\"}}",
    )
    .unwrap();
    fs::write(
        root.join("node_modules/zerolith/dist/index.js"),
        "export const html = 1;",
    )
    .unwrap();
    fs::write(
        root.join("src/main.ts"),
        "import { html } from \"zerolith\";\nimport { LitElement } from \"lit\";\nimport { get } from \"lodash-es/get.js\";\nimport { readFile } from \"node:fs\";\nexport const parts = [html, LitElement, get, readFile];\n",
    )
    .unwrap();
    fs::write(
        root.join("index.html"),
        "<!doctype html><head></head><script type=\"module\" src=\"/src/main.ts\"></script>",
    )
    .unwrap();
    let (_, _, warnings) = build(&root, Path::new("dist"), false, false).unwrap();
    assert_eq!(warnings.len(), 2, "{warnings:?}");
    assert!(
        warnings[0].starts_with("src/main.ts imports lit,"),
        "{warnings:?}"
    );
    assert!(
        warnings[1].starts_with("src/main.ts imports lodash-es/get.js,"),
        "{warnings:?}"
    );

    fs::write(
        root.join("index.html"),
        "<!doctype html><head><script type=\"importmap\">{\"imports\":{\"lit\":\"https://cdn.example/lit.js\",\"lodash-es/\":\"/lib/lodash-es/\"}}</script></head><script type=\"module\" src=\"/src/main.ts\"></script>",
    )
    .unwrap();
    let (out, _, warnings) = build(&root, Path::new("dist"), false, false).unwrap();
    assert!(warnings.is_empty(), "{warnings:?}");
    let page = fs::read_to_string(out.join("index.html")).unwrap();
    assert!(
        page.contains("\"lit\":\"https://cdn.example/lit.js\""),
        "{page}"
    );
    assert!(
        page.contains("\"zerolith\":\"/vendor/zerolith/dist/index.js\""),
        "{page}"
    );
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn serves_imports_of_other_files_through_modules_next_to_them() {
    let root =
        std::env::temp_dir().join(format!("zerolith-unbundled-imports-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    for (path, text) in [
        (
            "index.html",
            "<!doctype html><script type=\"module\" src=\"/src/main.ts\"></script>",
        ),
        (
            "src/main.ts",
            "import \"./plain.css\";\nimport card from \"./ui/card.css?scoped\";\nimport data from \"./data.json\";\nimport logo from \"./logo.svg\";\nimport notes from \"./notes.md?raw\";\nimport license from \"/LICENSE.txt?url\";\nconsole.log(card, data, logo, notes, license);\n",
        ),
        ("src/plain.css", "body { margin: 0; }\n"),
        (
            "src/ui/card.css",
            "@import \"../tokens.css\";\n:scope { background: url(./dot.svg); }\n",
        ),
        ("src/tokens.css", ":scope { --ink: red; }\n"),
        ("src/ui/dot.svg", "<svg/>"),
        ("src/data.json", "{ \"ok\": true }"),
        ("src/logo.svg", "<svg/>"),
        ("src/notes.md", "# Notes"),
        ("LICENSE.txt", "MIT"),
    ] {
        let file = root.join(path);
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(file, text).unwrap();
    }
    let (out, _, _) = build(&root, Path::new("dist"), false, false).unwrap();
    let main = fs::read_to_string(out.join("src/main.js")).unwrap();
    for specifier in [
        "import \"./plain.css.js\"",
        "from \"./ui/card.css.scoped.js\"",
        "from \"./data.json.js\"",
        "from \"./logo.svg.url.js\"",
        "from \"./notes.md.raw.js\"",
        "from \"/LICENSE.txt.url.js\"",
    ] {
        assert!(main.contains(specifier), "{specifier} in {main}");
    }
    let plain = fs::read_to_string(out.join("src/plain.css.js")).unwrap();
    assert!(
        plain.contains("new URL(\"./plain.css\", import.meta.url)") && plain.contains("await"),
        "{plain}"
    );
    let card = fs::read_to_string(out.join("src/ui/card.css.scoped.js")).unwrap();
    assert!(
        card.contains("styleFile(\"src/ui/card.css\", ")
            && card.contains("--ink")
            && card.contains("new URL(\"dot.svg\", import.meta.url).href")
            && !card.contains("@import"),
        "{card}"
    );
    assert_eq!(
        fs::read_to_string(out.join("src/data.json.js")).unwrap(),
        "export default JSON.parse(\"{ \\\"ok\\\": true }\");\n"
    );
    assert_eq!(
        fs::read_to_string(out.join("src/logo.svg.url.js")).unwrap(),
        "export default new URL(\"./logo.svg\", import.meta.url).href;\n"
    );
    assert_eq!(
        fs::read_to_string(out.join("src/notes.md.raw.js")).unwrap(),
        "export default \"# Notes\";\n"
    );
    assert!(out.join("LICENSE.txt.url.js").is_file());
    assert!(out.join("src/ui/card.css").is_file() && out.join("src/ui/dot.svg").is_file());
    fs::write(
        root.join("src/main.ts"),
        "import missing from \"./missing.css?scoped\";\nconsole.log(missing);\n",
    )
    .unwrap();
    let error = build(&root, Path::new("dist"), false, false)
        .unwrap_err()
        .to_string();
    assert!(
        error.contains("src/main.ts: the import of ./missing.css?scoped names no file"),
        "{error}"
    );
    let outside = root.with_file_name(format!(
        "zerolith-unbundled-outside-{}.txt",
        std::process::id()
    ));
    fs::write(&outside, "secret").unwrap();
    let name = outside.file_name().unwrap().to_string_lossy().into_owned();
    fs::write(
        root.join("src/main.ts"),
        format!("import text from \"../../{name}?raw\";\nconsole.log(text);\n"),
    )
    .unwrap();
    let error = build(&root, Path::new("dist"), false, false)
        .unwrap_err()
        .to_string();
    assert!(
        error.contains("names a file outside the project"),
        "{error}"
    );
    assert!(!root.join(format!("{name}.raw.js")).exists());
    let _ = fs::remove_file(&outside);
    let _ = fs::remove_dir_all(&root);
}
