//! The summary `zerolith build` prints: each file it wrote with its size,
//! raw and compressed.

use std::fs;
use std::path::Path;

use super::Options;

/// The extensions whose gzip size the summary shows: text a server compresses.
pub(super) const COMPRESSED: [&str; 8] = ["js", "mjs", "css", "html", "json", "svg", "xml", "txt"];

/// The size of a file once gzipped at the default level, as a server would send it.
pub(super) fn gzip_size(path: &Path) -> Option<u64> {
    use std::io::Write;
    let bytes = fs::read(path).ok()?;
    let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    encoder.write_all(&bytes).ok()?;
    Some(encoder.finish().ok()?.len() as u64)
}

pub(super) fn kilobytes(bytes: u64) -> String {
    format!("{:.2} kB", bytes as f64 / 1000.0)
}

/// The heading's detail: the mode and the options that change the output.
pub(super) fn describe(options: &Options) -> String {
    let mut parts = vec![
        options.mode.clone(),
        if options.minify {
            "minified".to_string()
        } else {
            "not minified".to_string()
        },
    ];
    if options.base != "/" {
        parts.push(format!("base {}", options.base));
    }
    if let Some(script) = &options.script {
        parts.push(format!("one script, {}.js", script.name));
    }
    if options.sourcemap {
        parts.push("source maps".to_string());
    }
    parts.join(", ")
}
