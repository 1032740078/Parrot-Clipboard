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
pub enum PreviewStatus {
    Pending,
    Ready,
    Failed,
    Unsupported,
}

impl PreviewStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Ready => "ready",
            Self::Failed => "failed",
            Self::Unsupported => "unsupported",
        }
    }

    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "pending" => Some(Self::Pending),
            "ready" => Some(Self::Ready),
            "failed" => Some(Self::Failed),
            "unsupported" => Some(Self::Unsupported),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PreviewRenderer {
    Text,
    Image,
    Audio,
    Video,
    Pdf,
    Document,
    Link,
    FileList,
    Summary,
}

impl PreviewRenderer {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::Image => "image",
            Self::Audio => "audio",
            Self::Video => "video",
            Self::Pdf => "pdf",
            Self::Document => "document",
            Self::Link => "link",
            Self::FileList => "file_list",
            Self::Summary => "summary",
        }
    }

    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "text" => Some(Self::Text),
            "image" => Some(Self::Image),
            "audio" => Some(Self::Audio),
            "video" => Some(Self::Video),
            "pdf" => Some(Self::Pdf),
            "document" => Some(Self::Document),
            "link" => Some(Self::Link),
            "file_list" => Some(Self::FileList),
            "summary" => Some(Self::Summary),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DocumentKind {
    Pdf,
    Doc,
    Docx,
    Xls,
    Xlsx,
    Ppt,
    Pptx,
}

impl DocumentKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pdf => "pdf",
            Self::Doc => "doc",
            Self::Docx => "docx",
            Self::Xls => "xls",
            Self::Xlsx => "xlsx",
            Self::Ppt => "ppt",
            Self::Pptx => "pptx",
        }
    }

    pub fn from_extension(value: &str) -> Option<Self> {
        match value {
            "pdf" => Some(Self::Pdf),
            "doc" => Some(Self::Doc),
            "docx" => Some(Self::Docx),
            "xls" => Some(Self::Xls),
            "xlsx" => Some(Self::Xlsx),
            "ppt" => Some(Self::Ppt),
            "pptx" => Some(Self::Pptx),
            _ => None,
        }
    }

    pub fn from_db(value: &str) -> Option<Self> {
        Self::from_extension(value)
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
pub struct AudioPreviewDetail {
    pub src: String,
    pub mime_type: Option<String>,
    pub duration_ms: Option<i64>,
    pub byte_size: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VideoPreviewDetail {
    pub src: String,
    pub mime_type: Option<String>,
    pub duration_ms: Option<i64>,
    pub pixel_width: Option<i64>,
    pub pixel_height: Option<i64>,
    pub poster_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DocumentPreviewDetail {
    pub document_kind: DocumentKind,
    pub preview_status: PreviewStatus,
    pub page_count: Option<i64>,
    pub sheet_names: Option<Vec<String>>,
    pub slide_count: Option<i64>,
    pub html_path: Option<String>,
    pub text_content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LinkPreviewDetail {
    pub url: String,
    pub title: Option<String>,
    pub site_name: Option<String>,
    pub description: Option<String>,
    pub cover_image: Option<String>,
    pub content_text: Option<String>,
    pub fetched_at: Option<i64>,
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
    pub primary_uri: Option<String>,
    pub preview_renderer: Option<PreviewRenderer>,
    pub preview_status: Option<PreviewStatus>,
    pub preview_error_code: Option<String>,
    pub preview_error_message: Option<String>,
    pub audio_detail: Option<AudioPreviewDetail>,
    pub video_detail: Option<VideoPreviewDetail>,
    pub document_detail: Option<DocumentPreviewDetail>,
    pub link_detail: Option<LinkPreviewDetail>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PasteResult {
    pub record: ClipboardRecordSummary,
    pub paste_mode: super::types::PasteMode,
    pub executed_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PreviewPreparationResult {
    pub id: u64,
    pub preview_status: PreviewStatus,
    pub renderer: PreviewRenderer,
    pub updated_at: i64,
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
