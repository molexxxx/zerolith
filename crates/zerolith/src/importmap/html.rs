//! The import map and preload tags a page carries, read from its HTML and
//! written back in place.

use super::graph::{PageGraph, resolve_url};
use super::plan::integrity;
use super::{ImportMap, Vendored};

/// True for a URL with a scheme, such as `https://cdn.example/lit.js` or `data:`, which the browser does not read against the page.
fn has_scheme(url: &str) -> bool {
    let mut chars = url.chars();
    chars
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic())
        && chars
            .take_while(|c| *c != ':')
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-'))
        && url.contains(':')
}

/// A URL of a page's import map as the browser reads it: root-relative or with a scheme as written, a relative one read against the page, root-relative, with its trailing slash kept for a folder prefix; one the browser would read otherwise stays as written.
pub fn page_url(page: &str, url: &str) -> String {
    if url.starts_with('/') || has_scheme(url) {
        return url.to_string();
    }
    let (path, slash) = match url.strip_suffix('/') {
        Some(path) => (path, "/"),
        None => (url, ""),
    };
    resolve_url(page, path).map_or_else(|| url.to_string(), |resolved| resolved + slash)
}

/// Where the first module script starts, inline or with a `src`, so an import map can go before it, since a browser ignores a map that comes after a module script.
fn first_module_script(html: &str) -> Option<usize> {
    let lower = html.to_ascii_lowercase();
    let mut from = 0;
    while let Some(at) = lower[from..].find("<script") {
        let start = from + at;
        let end = lower[start..]
            .find('>')
            .map_or(lower.len(), |close| start + close);
        let tag = &lower[start..end];
        if tag.contains("type=\"module\"")
            || tag.contains("type='module'")
            || tag.contains("type=module")
        {
            return Some(start);
        }
        from = end;
    }
    None
}

/// The text of the first import map in an HTML document, exactly as the page holds it, found as the build finds it: past comments, and whatever the element's other attributes, such as a `nonce`.
fn import_map_text(html: &str) -> Option<&str> {
    let (start, end) = *crate::html::scan(html).import_maps.first()?;
    let element = &html[start..end];
    let open = element.find('>')? + 1;
    let close = element.to_ascii_lowercase().rfind("</script")?;
    Some(&element[open..close])
}

/// The text of the first import map in an HTML document, without the space around it.
pub fn import_map_of(html: &str) -> Option<&str> {
    import_map_text(html).map(str::trim)
}

/// What a Content-Security-Policy names in `script-src` to allow a page's import map, an inline script: the hash of its exact text.
pub fn import_map_hash(html: &str) -> Option<String> {
    import_map_text(html).map(|text| integrity(text.as_bytes()))
}

/// The page's own import map, parsed, or None when it has none or it is not valid JSON.
pub fn page_map(html: &str) -> Option<ImportMap> {
    serde_json::from_str(import_map_of(html)?).ok()
}

/// True when the import map resolves `specifier`: an entry names it, or an entry ending in `/` is its prefix.
pub fn covers(map: &ImportMap, specifier: &str) -> bool {
    map.imports.contains_key(specifier)
        || map
            .imports
            .keys()
            .any(|key| key.ends_with('/') && specifier.starts_with(key.as_str()))
}

/// The script and preload tags for an HTML head. Each preload carries the integrity hash the map gives its module: a browser reuses a preload only when its integrity matches the module request's, which takes the hash from the map.
pub fn html_tags(vendored: &Vendored) -> String {
    tags(&vendored.map, &vendored.modules)
}

/// The tags for one page, at `page` root-relative: the vendored map with the entries of the page's own import map kept where the vendored map names a different specifier, so a package mapped by hand survives an update, and the preloads for the page's graph when one is given. An entry of the page's map that points into a package folder this run wrote, at a file or a folder prefix the run no longer vendors anything under, is dropped, since the run prunes what it no longer vendors there, and so is an integrity hash of the page's own for a file this run vendors, whose hash the vendored map carries; a relative URL is read against the page, as the browser reads it, so a hash under a relative key cannot come before the vendored one under the root-relative key, which the browser would take first.
pub fn page_tags(vendored: &Vendored, page: &str, html: &str, graph: Option<&PageGraph>) -> String {
    let modules: Vec<String> = graph
        .map_or_else(
            || vendored.modules.clone(),
            |graph| vendored.preloads(graph),
        )
        .into_iter()
        .map(|module| vendored.addresses.get(&module).cloned().unwrap_or(module))
        .collect();
    let mut map = page_map(html).unwrap_or_default();
    let gone = |url: &str| {
        let resolved = page_url(page, url);
        let url = resolved.as_str();
        vendored
            .folders
            .iter()
            .any(|folder| url.starts_with(folder.as_str()))
            && if url.ends_with('/') {
                !vendored
                    .map
                    .integrity
                    .keys()
                    .any(|kept| kept.starts_with(url))
            } else {
                !vendored.map.integrity.contains_key(url)
            }
    };
    map.imports.retain(|_, url| !gone(url));
    map.integrity.retain(|url, _| {
        !gone(url)
            && !vendored
                .map
                .integrity
                .contains_key(page_url(page, url).as_str())
    });
    for scope in map.scopes.values_mut() {
        scope.retain(|_, url| !gone(url));
    }
    map.scopes.retain(|_, scope| !scope.is_empty());
    map.imports.extend(vendored.map.imports.clone());
    map.integrity.extend(vendored.map.integrity.clone());
    for (url, address) in &vendored.addresses {
        map.imports
            .entry(url.clone())
            .or_insert_with(|| address.clone());
    }
    tags(&map, &modules)
}

fn tags(map: &ImportMap, modules: &[String]) -> String {
    let json = serde_json::to_string(map).unwrap_or_default();
    let mut out = format!("<script type=\"importmap\">{json}</script>\n");
    for module in modules {
        let integrity = map
            .integrity
            .get(module)
            .map(|hash| format!(" integrity=\"{hash}\""))
            .unwrap_or_default();
        out.push_str(&format!(
            "<link rel=\"modulepreload\" href=\"{module}\"{integrity} data-zerolith-preload>\n"
        ));
    }
    out
}

/// Replaces the import map and the previously generated preload links in an HTML document, or inserts them before the first module script, which a map has to precede, or else before `</head>`. A page with CRLF line endings keeps them, so a checkout that converts line endings does not see every run as a change.
pub fn update_html(html: &str, tags: &str) -> String {
    let crlf = html.contains("\r\n");
    let result = update_lf(&html.replace("\r\n", "\n"), tags);
    if crlf {
        result.replace('\n', "\r\n")
    } else {
        result
    }
}

/// `update_html` over a document with LF line endings.
fn update_lf(html: &str, tags: &str) -> String {
    let stripped: String = html
        .lines()
        .filter(|line| {
            !(line.contains("rel=\"modulepreload\"") && line.contains("data-zerolith-preload"))
        })
        .map(|line| format!("{line}\n"))
        .collect();
    let maps = crate::html::scan(&stripped).import_maps;
    let mut result = String::new();
    let mut from = 0;
    for (index, &(start, end)) in maps.iter().enumerate() {
        result.push_str(&stripped[from..start]);
        if index == 0 {
            let element = &stripped[start..end];
            let opening = &element[..element.find('>').map_or(element.len(), |at| at + 1)];
            let replaced = tags
                .trim_end()
                .replacen("<script type=\"importmap\">", opening, 1);
            result.push_str(&indented(&replaced, &indentation(&stripped, start)));
        }
        from = end;
        if stripped[from..].starts_with('\n') && result.ends_with('\n') {
            from += 1;
        }
    }
    result.push_str(&stripped[from..]);
    let replaced = !maps.is_empty();
    if !replaced {
        let head_end = result.find("</head>");
        let script = first_module_script(&result).filter(|&at| head_end.is_none_or(|end| at < end));
        let index = script.or(head_end).unwrap_or(0);
        let indent = indentation(&result, index);
        let inserted = format!("{}{indent}", indented(tags, &indent));
        result.insert_str(index, &inserted);
    }
    result
}

/// The whitespace that starts the line `at` is on, when nothing but whitespace precedes `at` on it; otherwise nothing, since the tags then follow other markup on the line.
fn indentation(text: &str, at: usize) -> String {
    let line_start = text[..at].rfind('\n').map_or(0, |index| index + 1);
    let before = &text[line_start..at];
    if before.trim().is_empty() {
        before.to_string()
    } else {
        String::new()
    }
}

/// The tags with every line after the first indented like the first, which sits where the page already indents it, so the preload links line up under the map.
pub(super) fn indented(tags: &str, indentation: &str) -> String {
    if indentation.is_empty() {
        return tags.to_string();
    }
    let mut lines = tags.split_inclusive('\n');
    let mut out = lines.next().unwrap_or_default().to_string();
    for line in lines {
        out.push_str(indentation);
        out.push_str(line);
    }
    out
}
