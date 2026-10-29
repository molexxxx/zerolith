//! Content types for the files a frontend project serves.

/// The content type for a file extension, or `application/octet-stream`.
pub fn content_type(extension: &str) -> &'static str {
    match extension.to_ascii_lowercase().as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" | "map" => "application/json; charset=utf-8",
        "md" => "text/markdown; charset=utf-8",
        "txt" => "text/plain; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "wasm" => "application/wasm",
        "webmanifest" => "application/manifest+json",
        "xml" => "application/xml",
        "pdf" => "application/pdf",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::content_type;

    #[test]
    fn maps_common_extensions_case_insensitively() {
        assert_eq!(content_type("js"), "text/javascript; charset=utf-8");
        assert_eq!(content_type("HTML"), "text/html; charset=utf-8");
        assert_eq!(content_type("woff2"), "font/woff2");
        assert_eq!(content_type("unknown"), "application/octet-stream");
    }
}
