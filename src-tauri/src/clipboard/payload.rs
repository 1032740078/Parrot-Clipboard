use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::query::FileEntryType;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClipboardImageData {
    pub width: usize,
    pub height: usize,
    pub bytes: Vec<u8>,
}

impl ClipboardImageData {
    pub fn sha256_hex(&self) -> String {
        let mut hasher = Sha256::new();
        hasher.update((self.width as u64).to_le_bytes());
        hasher.update((self.height as u64).to_le_bytes());
        hasher.update(&self.bytes);
        hex::encode(hasher.finalize())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClipboardFileItem {
    pub path: PathBuf,
    pub display_name: String,
    pub entry_type: FileEntryType,
    pub extension: Option<String>,
}

impl ClipboardFileItem {
    pub fn from_path(path: PathBuf) -> Self {
        let display_name = file_display_name(&path);
        let extension = file_extension(&path);
        let entry_type = if path.is_dir() {
            FileEntryType::Directory
        } else {
            FileEntryType::File
        };

        Self {
            path,
            display_name,
            entry_type,
            extension,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ClipboardSnapshot {
    Empty,
    Text {
        text: String,
        rich_content: Option<String>,
    },
    Image(ClipboardImageData),
    Files(Vec<ClipboardFileItem>),
}

impl ClipboardSnapshot {
    pub fn signature(&self) -> String {
        match self {
            Self::Empty => "empty".to_string(),
            Self::Text { text, .. } => format!("text:{}", sha256_hex(text.as_bytes())),
            Self::Image(image) => format!("image:{}", image.sha256_hex()),
            Self::Files(items) => {
                let joined = items
                    .iter()
                    .map(|item| item.path.to_string_lossy().to_string())
                    .collect::<Vec<_>>()
                    .join("\n");
                format!("files:{}", sha256_hex(joined.as_bytes()))
            }
        }
    }

    pub fn is_empty(&self) -> bool {
        matches!(self, Self::Empty)
    }
}

pub fn text_sha256_hex(text: &str) -> String {
    sha256_hex(text.as_bytes())
}

pub fn files_sha256_hex(items: &[ClipboardFileItem]) -> String {
    let joined = items
        .iter()
        .map(|item| item.path.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join("\n");
    sha256_hex(joined.as_bytes())
}

pub fn build_files_preview(items: &[ClipboardFileItem]) -> String {
    match items {
        [] => "空文件列表".to_string(),
        [single] => single.display_name.clone(),
        [first, rest @ ..] => format!("{} 等 {} 项", first.display_name, rest.len() + 1),
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn file_display_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

fn file_extension(path: &Path) -> Option<String> {
    path.extension()
        .map(|ext| ext.to_string_lossy().to_string())
}
