//! The files a stylesheet references, copied next to the output under
//! names that carry their content hash.

use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use super::paths::{short_hash, url_safe};

/// The files of a build's `assets` folder that were copied from the project, each once, under a name with its content hash.
#[derive(Debug)]
pub struct Assets {
    folder: PathBuf,
    copied: HashMap<PathBuf, String>,
}

impl Assets {
    pub fn new(folder: PathBuf) -> Self {
        Self {
            folder,
            copied: HashMap::new(),
        }
    }

    /// Copies a file into the folder unless it is there already, and returns its new name.
    pub fn copy(&mut self, file: &Path) -> io::Result<String> {
        if let Some(name) = self.copied.get(file) {
            return Ok(name.clone());
        }
        let bytes = fs::read(file).map_err(|error| {
            io::Error::new(error.kind(), format!("{}: {error}", file.display()))
        })?;
        let stem = url_safe(
            &file
                .file_stem()
                .map_or_else(|| "asset".into(), |stem| stem.to_string_lossy()),
        );
        let name = match file.extension() {
            Some(extension) => format!(
                "{stem}-{}.{}",
                short_hash(&bytes),
                url_safe(&extension.to_string_lossy())
            ),
            None => format!("{stem}-{}", short_hash(&bytes)),
        };
        fs::create_dir_all(&self.folder)?;
        fs::write(self.folder.join(&name), &bytes)?;
        self.copied.insert(file.to_path_buf(), name.clone());
        Ok(name)
    }
}
