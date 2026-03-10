use serde::{Deserialize, Serialize};

use super::types::{ContentType, PayloadType};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ThumbnailState {
    Pending,
    Ready,
    Failed,
}

impl ThumbnailState {
    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "pending" => Some(Self::Pending),
            "ready" => Some(Self::Ready),
            "failed" => Some(Self::Failed),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FileEntryType {
    File,
    Directory,
}

impl FileEntryType {
    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "file" => Some(Self::File),
            "directory" => Some(Self::Directory),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TextMeta {
    pub char_count: usize,
    pub line_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ImageMeta {
    pub mime_type: String,
    pub pixel_width: i64,
    pub pixel_height: i64,
    pub thumbnail_path: Option<String>,
    pub thumbnail_state: ThumbnailState,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FilesMeta {
    pub count: usize,
    pub primary_name: String,
    pub contains_directory: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ImageDetail {
    pub original_path: String,
    pub mime_type: String,
    pub pixel_width: i64,
    pub pixel_height: i64,
    pub byte_size: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FileItemDetail {
    pub path: String,
    pub display_name: String,
    pub entry_type: FileEntryType,
    pub extension: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FilesDetail {
    pub items: Vec<FileItemDetail>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ClipboardRecordSummary {
    pub id: u64,
    pub payload_type: PayloadType,
    pub content_type: ContentType,
    pub preview_text: String,
    pub source_app: Option<String>,
    pub created_at: i64,
    pub last_used_at: i64,
    pub text_meta: Option<TextMeta>,
    pub image_meta: Option<ImageMeta>,
    pub files_meta: Option<FilesMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ClipboardRecordDetail {
    pub id: u64,
    pub payload_type: PayloadType,
    pub content_type: ContentType,
    pub preview_text: String,
    pub source_app: Option<String>,
    pub created_at: i64,
    pub last_used_at: i64,
    pub text_meta: Option<TextMeta>,
    pub image_meta: Option<ImageMeta>,
    pub files_meta: Option<FilesMeta>,
    pub text_content: Option<String>,
    pub rich_content: Option<String>,
    pub image_detail: Option<ImageDetail>,
    pub files_detail: Option<FilesDetail>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PasteResult {
    pub record: ClipboardRecordSummary,
    pub paste_mode: super::types::PasteMode,
    pub executed_at: i64,
}

impl From<ClipboardRecordDetail> for ClipboardRecordSummary {
    fn from(value: ClipboardRecordDetail) -> Self {
        Self {
            id: value.id,
            payload_type: value.payload_type,
            content_type: value.content_type,
            preview_text: value.preview_text,
            source_app: value.source_app,
            created_at: value.created_at,
            last_used_at: value.last_used_at,
            text_meta: value.text_meta,
            image_meta: value.image_meta,
            files_meta: value.files_meta,
        }
    }
}
