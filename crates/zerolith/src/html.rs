//! The entry page of `zerolith build`: the module scripts, stylesheets, and
//! other files `index.html` names, read with a small tag scanner, and the
//! same page rewritten to load the output.

/// A tag of interest: where it sits in the page and the URL it names.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Reference {
    /// The byte range of the whole tag, from `<` through `>`.
    pub tag: (usize, usize),
    /// The byte range of the URL inside its `src` or `href` attribute.
    pub value: (usize, usize),
    /// The URL as written.
    pub url: String,
}

/// What `zerolith build` reads from a page, each in document order.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Page {
    /// Module scripts with a local `src`: the entries.
    pub scripts: Vec<Reference>,
    /// Stylesheet links with a local `href`.
    pub styles: Vec<Reference>,
    /// Other local files the page loads: icons, manifests, and preloads in `<link>`, media sources, and classic scripts.
    pub assets: Vec<Reference>,
    /// Whole elements the bundled output drops: import maps, and module preload links to local files, which name source modules the bundle replaces with its own preloads.
    pub dropped: Vec<(usize, usize)>,
}

/// The link relations whose `href` names a file the page loads; others, such as `canonical` and `alternate`, name pages.
const RESOURCE_LINKS: [&str; 6] = [
    "icon",
    "apple-touch-icon",
    "apple-touch-icon-precomposed",
    "mask-icon",
    "manifest",
    "preload",
];

/// True for a URL that names a file of the project: not absolute, protocol-relative, a data URL, or a fragment.
pub fn is_local(url: &str) -> bool {
    !(url.is_empty()
        || url.contains("://")
        || url.starts_with("//")
        || url.starts_with("data:")
        || url.starts_with('#'))
}

/// The elements whose `src` names a file the page loads.
const MEDIA: [&str; 5] = ["img", "source", "video", "audio", "track"];

struct Attribute {
    name: String,
    value: Option<(usize, usize)>,
}

/// The attributes of a start tag whose name ends at `name_end`, and the index just past its `>`.
fn start_tag(html: &str, name_end: usize) -> (Vec<Attribute>, usize) {
    let bytes = html.as_bytes();
    let mut index = name_end;
    let mut attributes = Vec::new();
    loop {
        while index < bytes.len() && (bytes[index].is_ascii_whitespace() || bytes[index] == b'/') {
            index += 1;
        }
        if index >= bytes.len() {
            return (attributes, bytes.len());
        }
        if bytes[index] == b'>' {
            return (attributes, index + 1);
        }
        let name_start = index;
        while index < bytes.len()
            && !bytes[index].is_ascii_whitespace()
            && !matches!(bytes[index], b'=' | b'>' | b'/')
        {
            index += 1;
        }
        let name = html[name_start..index].to_ascii_lowercase();
        while index < bytes.len() && bytes[index].is_ascii_whitespace() {
            index += 1;
        }
        let mut value = None;
        if index < bytes.len() && bytes[index] == b'=' {
            index += 1;
            while index < bytes.len() && bytes[index].is_ascii_whitespace() {
                index += 1;
            }
            if index < bytes.len() && matches!(bytes[index], b'"' | b'\'') {
                let quote = bytes[index];
                let value_start = index + 1;
                let value_end = html[value_start..]
                    .bytes()
                    .position(|byte| byte == quote)
                    .map_or(bytes.len(), |offset| value_start + offset);
                value = Some((value_start, value_end));
                index = (value_end + 1).min(bytes.len());
            } else {
                let value_start = index;
                while index < bytes.len()
                    && !bytes[index].is_ascii_whitespace()
                    && bytes[index] != b'>'
                {
                    index += 1;
                }
                value = Some((value_start, index));
            }
        }
        attributes.push(Attribute { name, value });
    }
}

fn attribute<'a>(
    html: &'a str,
    attributes: &[Attribute],
    name: &str,
) -> Option<(&'a str, (usize, usize))> {
    attributes
        .iter()
        .find(|attribute| attribute.name == name)
        .map(|attribute| {
            let range = attribute.value.unwrap_or((0, 0));
            (&html[range.0..range.1], range)
        })
}

/// The reference an attribute makes when it names a local file.
fn local(
    html: &str,
    attributes: &[Attribute],
    name: &str,
    tag: (usize, usize),
) -> Option<Reference> {
    attribute(html, attributes, name)
        .filter(|(url, _)| is_local(url))
        .map(|(url, value)| Reference {
            tag,
            value,
            url: url.to_string(),
        })
}

/// The index just past the element's closing tag, or the end of the page.
fn element_end(html: &str, from: usize, name: &str) -> usize {
    let closing = format!("</{name}");
    html[from..]
        .to_ascii_lowercase()
        .find(&closing)
        .and_then(|offset| {
            html[from + offset..]
                .find('>')
                .map(|end| from + offset + end + 1)
        })
        .unwrap_or(html.len())
}

/// Reads the scripts, stylesheets, other local files, and import maps of a page, skipping comments.
pub fn scan(html: &str) -> Page {
    let lower = html.to_ascii_lowercase();
    let bytes = lower.as_bytes();
    let mut page = Page::default();
    let mut index = 0;
    while let Some(offset) = lower[index..].find('<') {
        let start = index + offset;
        if lower[start..].starts_with("<!--") {
            index = lower[start..]
                .find("-->")
                .map_or(html.len(), |end| start + end + 3);
            continue;
        }
        let mut name_end = start + 1;
        while name_end < bytes.len()
            && (bytes[name_end].is_ascii_alphanumeric() || bytes[name_end] == b'-')
        {
            name_end += 1;
        }
        let name = &lower[start + 1..name_end];
        if name != "script" && name != "link" && !MEDIA.contains(&name) {
            index = start + 1;
            continue;
        }
        let (attributes, end) = start_tag(html, name_end);
        let tag = (start, end);
        if name == "script" {
            let kind =
                attribute(html, &attributes, "type").map(|(value, _)| value.to_ascii_lowercase());
            let close = element_end(html, end, "script");
            match kind.as_deref() {
                Some("importmap") => page.dropped.push((start, close)),
                Some("module") => page.scripts.extend(local(html, &attributes, "src", tag)),
                Some("text/javascript" | "application/javascript") | None => {
                    page.assets.extend(local(html, &attributes, "src", tag));
                }
                _ => {}
            }
            index = close;
            continue;
        }
        if name == "link" {
            let rel = attribute(html, &attributes, "rel")
                .map(|(value, _)| value.to_ascii_lowercase())
                .unwrap_or_default();
            let tokens: Vec<&str> = rel.split_ascii_whitespace().collect();
            if tokens.contains(&"modulepreload") {
                if local(html, &attributes, "href", tag).is_some() {
                    page.dropped.push(tag);
                }
            } else if tokens.contains(&"stylesheet") {
                page.styles.extend(local(html, &attributes, "href", tag));
            } else if tokens.iter().any(|token| RESOURCE_LINKS.contains(token)) {
                page.assets.extend(local(html, &attributes, "href", tag));
            }
        } else {
            page.assets.extend(local(html, &attributes, "src", tag));
        }
        index = end;
    }
    page
}

/// Widens a removal to its whole line when the tag stands alone on it, so no blank line is left behind.
fn whole_line(html: &str, start: usize, end: usize) -> (usize, usize) {
    let line_start = html[..start].rfind('\n').map_or(0, |index| index + 1);
    let line_end = html[end..]
        .find('\n')
        .map_or(html.len(), |index| end + index + 1);
    if html[line_start..start].trim().is_empty() && html[end..line_end].trim().is_empty() {
        (line_start, line_end)
    } else {
        (start, end)
    }
}

/// What `zerolith build` puts in the page.
#[derive(Debug, Default)]
pub struct Output<'a> {
    /// The URL of each module script's entry chunk, in the order of `Page::scripts`.
    pub scripts: &'a [String],
    /// The URL of the bundled stylesheet, when the build has one.
    pub stylesheet: Option<&'a str>,
    /// The chunks the entries import statically, preloaded ahead of the first script.
    pub preloads: &'a [String],
    /// The new URL of each file in `Page::assets`, in its order; `None` keeps one as written.
    pub assets: &'a [Option<String>],
}

/// Rewrites a page for the bundled output: each module script loads its entry chunk, the first stylesheet loads the bundled CSS and the other local ones go, the entries' static imports are preloaded ahead of the first script, other files point at their output URLs, and import maps go. When the page links no stylesheet but the build has one, it is linked before `</head>`.
pub fn rewrite(html: &str, page: &Page, output: &Output) -> String {
    let mut edits: Vec<(usize, usize, String)> = Vec::new();
    for (reference, url) in page.scripts.iter().zip(output.scripts) {
        edits.push((reference.value.0, reference.value.1, url.clone()));
    }
    if let Some(first) = page.scripts.first()
        && !output.preloads.is_empty()
    {
        let links: String = output
            .preloads
            .iter()
            .map(|url| format!("<link rel=\"modulepreload\" crossorigin href=\"{url}\">\n    "))
            .collect();
        edits.push((first.tag.0, first.tag.0, links));
    }
    for (index, reference) in page.styles.iter().enumerate() {
        match (index, output.stylesheet) {
            (0, Some(url)) => edits.push((reference.value.0, reference.value.1, url.to_string())),
            _ => {
                let (start, end) = whole_line(html, reference.tag.0, reference.tag.1);
                edits.push((start, end, String::new()));
            }
        }
    }
    if page.styles.is_empty()
        && let Some(url) = output.stylesheet
    {
        let at = html.to_ascii_lowercase().find("</head>").unwrap_or(0);
        edits.push((
            at,
            at,
            format!("    <link rel=\"stylesheet\" crossorigin href=\"{url}\">\n"),
        ));
    }
    for (reference, url) in page.assets.iter().zip(output.assets) {
        if let Some(url) = url {
            edits.push((reference.value.0, reference.value.1, url.clone()));
        }
    }
    for (start, end) in &page.dropped {
        let (start, end) = whole_line(html, *start, *end);
        edits.push((start, end, String::new()));
    }
    edits.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));
    let mut out = String::with_capacity(html.len());
    let mut cursor = 0;
    for (start, end, text) in edits {
        if start < cursor {
            continue;
        }
        out.push_str(&html[cursor..start]);
        out.push_str(&text);
        cursor = end;
    }
    out.push_str(&html[cursor..]);
    out
}

#[cfg(test)]
mod tests {
    use super::{Output, is_local, rewrite, scan};

    const PAGE: &str = "<!doctype html>\n<html lang=\"en\">\n<head>\n    <link rel=\"stylesheet\" href=\"/src/styles.css\">\n    <link rel=\"icon\" href=\"/favicon.svg\">\n    <link rel=\"canonical\" href=\"/about\">\n    <link rel=\"modulepreload\" href=\"/src/app.ts\">\n    <link rel=\"modulepreload\" href=\"https://cdn.example/lib.js\">\n    <!-- <script type=\"module\" src=\"/commented.ts\"></script> -->\n    <script type=\"importmap\">{\"imports\":{\"zerolith\":\"/vendor/zerolith/dist/index.js\"}}</script>\n    <link rel=\"modulepreload\" href=\"/vendor/zerolith/dist/index.js\" data-zerolith-preload>\n    <link rel=stylesheet href='theme.css'>\n    <link rel=\"stylesheet\" href=\"https://fonts.example/a.css\">\n</head>\n<body>\n    <div id=\"app\"><img src=\"src/logo.png\" alt=\"\"><img src=\"https://cdn.example/x.png\" alt=\"\"></div>\n    <script type=\"module\" src=\"/src/main.ts\"></script>\n    <script src=\"/legacy.js\"></script>\n</body>\n</html>\n";

    #[test]
    fn reads_entries_stylesheets_assets_and_what_the_bundle_drops() {
        let page = scan(PAGE);
        let urls = |references: &[super::Reference]| -> Vec<String> {
            references
                .iter()
                .map(|reference| reference.url.clone())
                .collect()
        };
        assert_eq!(urls(&page.scripts), ["/src/main.ts"]);
        assert_eq!(urls(&page.styles), ["/src/styles.css", "theme.css"]);
        assert_eq!(
            urls(&page.assets),
            ["/favicon.svg", "src/logo.png", "/legacy.js"]
        );
        assert_eq!(page.dropped.len(), 3);
        assert!(
            is_local("/src/a.ts")
                && is_local("a.css")
                && !is_local("https://x/a.js")
                && !is_local("//x/a.js")
                && !is_local("data:text/css,a")
        );
    }

    #[test]
    fn rewrites_the_page_to_load_the_output() {
        let page = scan(PAGE);
        let out = rewrite(
            PAGE,
            &page,
            &Output {
                scripts: &["/assets/index-a1.js".to_string()],
                stylesheet: Some("/assets/index-c3.css"),
                preloads: &["/assets/shared-b2.js".to_string()],
                assets: &[
                    Some("/app/favicon.svg".to_string()),
                    Some("/app/assets/logo-d4.png".to_string()),
                    None,
                ],
            },
        );
        assert!(
            out.contains("<link rel=\"stylesheet\" href=\"/assets/index-c3.css\">"),
            "{out}"
        );
        assert!(!out.contains("theme.css"));
        assert!(out.contains("https://fonts.example/a.css"));
        assert!(out.contains("<link rel=\"icon\" href=\"/app/favicon.svg\">"));
        assert!(out.contains(
            "<img src=\"/app/assets/logo-d4.png\" alt=\"\"><img src=\"https://cdn.example/x.png\""
        ));
        assert!(!out.contains("importmap") && !out.contains("/vendor/"));
        assert!(out.contains("<link rel=\"modulepreload\" crossorigin href=\"/assets/shared-b2.js\">\n    <script type=\"module\" src=\"/assets/index-a1.js\"></script>"), "{out}");
        assert!(out.contains("<script src=\"/legacy.js\"></script>"));
        assert!(!out.contains("\n\n\n"));
        let bare = "<html><head>\n</head><body><script type=\"module\" src=\"main.js\"></script></body></html>";
        let linked = rewrite(
            bare,
            &scan(bare),
            &Output {
                scripts: &["/assets/main-x.js".to_string()],
                stylesheet: Some("/assets/style-y.css"),
                ..Output::default()
            },
        );
        assert!(
            linked.contains(
                "<link rel=\"stylesheet\" crossorigin href=\"/assets/style-y.css\">\n</head>"
            ),
            "{linked}"
        );
    }
}
