use std::{fs, path::Path};

use rusqlite::Row;
use serde::{Deserialize, Serialize};

use crate::{
    clipboard::{
        query::{
            AudioPreviewDetail, ClipboardRecordDetail, ClipboardRecordSummary, DocumentKind,
            DocumentPreviewDetail, FileEntryType, FileItemDetail, FilesDetail, FilesMeta,
            ImageDetail, ImageMeta, LinkPreviewDetail, PreviewRenderer, PreviewStatus, TextMeta,
            ThumbnailState, VideoPreviewDetail,
        },
        types::{ContentType, PayloadType},
    },
    error::AppError,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreviewAssetRow {
    pub asset_role: String,
    pub storage_path: Option<String>,
    pub text_content: Option<String>,
    pub mime_type: Option<String>,
    pub byte_size: i64,
    pub status: PreviewStatus,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct DocumentOutlinePayload {
    document_kind: String,
    page_count: Option<i64>,
    sheet_names: Option<Vec<String>>,
    slide_count: Option<i64>,
    html_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct LinkPreviewPayload {
    url: String,
    title: Option<String>,
    site_name: Option<String>,
    description: Option<String>,
    cover_image: Option<String>,
    content_text: Option<String>,
    fetched_at: Option<i64>,
}

pub fn map_summary_row(row: &Row<'_>) -> Result<ClipboardRecordSummary, AppError> {
    let id = row_id(row, 0)?;
    let payload_type = payload_type_from_row(row, 1)?;
    let content_type = content_type_from_row(row, 2)?;
    let preview_text: String = row_value(row, 3, "preview_text")?;
    let source_app: Option<String> = row_optional_value(row, 4, "source_app")?;
    let created_at: i64 = row_value(row, 5, "created_at")?;
    let last_used_at: i64 = row_value(row, 6, "last_used_at")?;
    let text_char_count: Option<i64> = row_optional_value(row, 7, "text_char_count")?;
    let text_line_count: Option<i64> = row_optional_value(row, 8, "text_line_count")?;
    let thumbnail_path: Option<String> = row_optional_value(row, 9, "thumbnail_path")?;
    let mime_type: Option<String> = row_optional_value(row, 10, "mime_type")?;
    let pixel_width: Option<i64> = row_optional_value(row, 11, "pixel_width")?;
    let pixel_height: Option<i64> = row_optional_value(row, 12, "pixel_height")?;
    let thumbnail_state: Option<String> = row_optional_value(row, 13, "thumbnail_state")?;
    let file_count: i64 = row_value(row, 14, "file_count")?;
    let primary_name: Option<String> = row_optional_value(row, 15, "primary_name")?;
    let contains_directory: i64 = row_value(row, 16, "contains_directory")?;

    Ok(ClipboardRecordSummary {
        id,
        payload_type,
        content_type,
        preview_text,
        source_app,
        created_at,
        last_used_at,
        text_meta: build_text_meta_from_counts(text_char_count, text_line_count)?,
        image_meta: build_image_meta(
            mime_type,
            pixel_width,
            pixel_height,
            thumbnail_path,
            thumbnail_state.as_deref(),
        )?,
        files_meta: build_files_meta(file_count, primary_name, contains_directory)?,
    })
}

pub fn content_type_from_row(row: &Row<'_>, index: usize) -> Result<ContentType, AppError> {
    let raw: String = row_value(row, index, "content_type")?;
    ContentType::from_db(&raw)
        .ok_or_else(|| AppError::Db(format!("unsupported content_type `{raw}` in sqlite row")))
}

pub fn payload_type_from_row(row: &Row<'_>, index: usize) -> Result<PayloadType, AppError> {
    let raw: String = row_value(row, index, "payload_type")?;
    PayloadType::from_db(&raw)
        .ok_or_else(|| AppError::Db(format!("unsupported payload_type `{raw}` in sqlite row")))
}

pub fn map_detail_row(
    row: &Row<'_>,
    files_detail: Option<FilesDetail>,
    preview_assets: Vec<PreviewAssetRow>,
) -> Result<ClipboardRecordDetail, AppError> {
    let id = row_id(row, 0)?;
    let payload_type = payload_type_from_row(row, 1)?;
    let content_type = content_type_from_row(row, 2)?;
    let preview_text: String = row_value(row, 3, "preview_text")?;
    let source_app: Option<String> = row_optional_value(row, 4, "source_app")?;
    let created_at: i64 = row_value(row, 5, "created_at")?;
    let last_used_at: i64 = row_value(row, 6, "last_used_at")?;
    let text_content: Option<String> = row_optional_value(row, 7, "text_content")?;
    let rich_content: Option<String> = row_optional_value(row, 8, "rich_content")?;
    let original_path: Option<String> = row_optional_value(row, 9, "original_path")?;
    let thumbnail_path: Option<String> = row_optional_value(row, 10, "thumbnail_path")?;
    let mime_type: Option<String> = row_optional_value(row, 11, "mime_type")?;
    let pixel_width: Option<i64> = row_optional_value(row, 12, "pixel_width")?;
    let pixel_height: Option<i64> = row_optional_value(row, 13, "pixel_height")?;
    let byte_size: Option<i64> = row_optional_value(row, 14, "byte_size")?;
    let thumbnail_state: Option<String> = row_optional_value(row, 15, "thumbnail_state")?;
    let file_count: i64 = row_value(row, 16, "file_count")?;
    let primary_name: Option<String> = row_optional_value(row, 17, "primary_name")?;
    let contains_directory: i64 = row_value(row, 18, "contains_directory")?;
    let primary_uri: Option<String> = row_optional_value(row, 19, "primary_uri")?;
    let preview_renderer_raw: Option<String> = row_optional_value(row, 20, "preview_renderer")?;
    let preview_status_raw: Option<String> = row_optional_value(row, 21, "preview_status")?;
    let preview_error_code: Option<String> = row_optional_value(row, 22, "preview_error_code")?;
    let preview_error_message: Option<String> =
        row_optional_value(row, 23, "preview_error_message")?;

    let image_meta = build_image_meta(
        mime_type.clone(),
        pixel_width,
        pixel_height,
        thumbnail_path,
        thumbnail_state.as_deref(),
    )?;
    let image_detail = build_image_detail(
        original_path,
        mime_type,
        pixel_width,
        pixel_height,
        byte_size,
    )?;
    let files_meta = build_files_meta(file_count, primary_name, contains_directory)?;
    let preview_renderer =
        build_preview_renderer(preview_renderer_raw.as_deref(), &content_type, files_detail.as_ref())?;
    let preview_status = build_preview_status(
        preview_status_raw.as_deref(),
        &content_type,
        preview_renderer.as_ref(),
        primary_uri.as_deref(),
    );
    let audio_detail = build_audio_detail(
        preview_renderer.as_ref(),
        primary_uri.as_deref(),
        files_detail.as_ref(),
    );
    let video_detail = build_video_detail(
        preview_renderer.as_ref(),
        primary_uri.as_deref(),
        files_detail.as_ref(),
    );
    let document_detail = build_document_detail(
        preview_renderer.as_ref(),
        preview_status.as_ref(),
        primary_uri.as_deref(),
        &preview_assets,
    )?;
    let link_detail = build_link_detail(
        preview_renderer.as_ref(),
        primary_uri.as_deref(),
        &preview_assets,
    )?;

    Ok(ClipboardRecordDetail {
        id,
        payload_type,
        content_type,
        preview_text,
        source_app,
        created_at,
        last_used_at,
        text_meta: build_text_meta(text_content.as_deref()),
        image_meta,
        files_meta,
        text_content,
        rich_content,
        image_detail,
        files_detail,
        primary_uri,
        preview_renderer,
        preview_status,
        preview_error_code,
        preview_error_message,
        audio_detail,
        video_detail,
        document_detail,
        link_detail,
    })
}

pub fn map_file_item_row(row: &Row<'_>) -> Result<FileItemDetail, AppError> {
    let path: String = row_value(row, 0, "path")?;
    let display_name: String = row_value(row, 1, "display_name")?;
    let entry_type_raw: String = row_value(row, 2, "entry_type")?;
    let extension: Option<String> = row_optional_value(row, 3, "extension")?;
    let entry_type = FileEntryType::from_db(&entry_type_raw).ok_or_else(|| {
        AppError::Db(format!(
            "unsupported file entry_type `{entry_type_raw}` in sqlite row"
        ))
    })?;

    Ok(FileItemDetail {
        path,
        display_name,
        entry_type,
        extension,
    })
}

fn build_text_meta(text_content: Option<&str>) -> Option<TextMeta> {
    text_content.map(|text| TextMeta {
        char_count: text.chars().count(),
        line_count: line_count(text),
    })
}

fn build_text_meta_from_counts(
    text_char_count: Option<i64>,
    text_line_count: Option<i64>,
) -> Result<Option<TextMeta>, AppError> {
    let Some(text_char_count) = text_char_count else {
        return Ok(None);
    };
    let Some(text_line_count) = text_line_count else {
        return Err(AppError::Db(
            "missing text_line_count for sqlite summary row".to_string(),
        ));
    };

    Ok(Some(TextMeta {
        char_count: non_negative_count(text_char_count, "text_char_count")?,
        line_count: non_negative_count(text_line_count, "text_line_count")?,
    }))
}

fn build_image_meta(
    mime_type: Option<String>,
    pixel_width: Option<i64>,
    pixel_height: Option<i64>,
    thumbnail_path: Option<String>,
    thumbnail_state: Option<&str>,
) -> Result<Option<ImageMeta>, AppError> {
    let Some(mime_type) = mime_type else {
        return Ok(None);
    };
    let Some(pixel_width) = pixel_width else {
        return Err(AppError::Db(
            "missing pixel_width for image record".to_string(),
        ));
    };
    let Some(pixel_height) = pixel_height else {
        return Err(AppError::Db(
            "missing pixel_height for image record".to_string(),
        ));
    };
    let Some(thumbnail_state) = thumbnail_state else {
        return Err(AppError::Db(
            "missing thumbnail_state for image record".to_string(),
        ));
    };
    let thumbnail_state = ThumbnailState::from_db(thumbnail_state).ok_or_else(|| {
        AppError::Db(format!(
            "unsupported thumbnail_state `{thumbnail_state}` in sqlite row"
        ))
    })?;

    Ok(Some(ImageMeta {
        mime_type,
        pixel_width,
        pixel_height,
        thumbnail_path,
        thumbnail_state,
    }))
}

fn build_image_detail(
    original_path: Option<String>,
    mime_type: Option<String>,
    pixel_width: Option<i64>,
    pixel_height: Option<i64>,
    byte_size: Option<i64>,
) -> Result<Option<ImageDetail>, AppError> {
    let Some(original_path) = original_path else {
        return Ok(None);
    };
    let Some(mime_type) = mime_type else {
        return Err(AppError::Db(
            "missing mime_type for image detail".to_string(),
        ));
    };
    let Some(pixel_width) = pixel_width else {
        return Err(AppError::Db(
            "missing pixel_width for image detail".to_string(),
        ));
    };
    let Some(pixel_height) = pixel_height else {
        return Err(AppError::Db(
            "missing pixel_height for image detail".to_string(),
        ));
    };
    let Some(byte_size) = byte_size else {
        return Err(AppError::Db(
            "missing byte_size for image detail".to_string(),
        ));
    };

    Ok(Some(ImageDetail {
        original_path,
        mime_type,
        pixel_width,
        pixel_height,
        byte_size,
    }))
}

fn build_files_meta(
    file_count: i64,
    primary_name: Option<String>,
    contains_directory: i64,
) -> Result<Option<FilesMeta>, AppError> {
    if file_count == 0 {
        return Ok(None);
    }

    let count = usize::try_from(file_count)
        .map_err(|_| AppError::Db(format!("invalid file_count `{file_count}` in sqlite row")))?;

    // Defensive: use fallback if primary_name is missing (data inconsistency)
    let primary_name = primary_name.unwrap_or_else(|| "(未知文件)".to_string());

    Ok(Some(FilesMeta {
        count,
        primary_name,
        contains_directory: contains_directory > 0,
    }))
}

fn build_preview_renderer(
    preview_renderer: Option<&str>,
    content_type: &ContentType,
    files_detail: Option<&FilesDetail>,
) -> Result<Option<PreviewRenderer>, AppError> {
    if let Some(preview_renderer) = preview_renderer {
        return PreviewRenderer::from_db(preview_renderer)
            .map(Some)
            .ok_or_else(|| {
                AppError::Db(format!(
                    "unsupported preview_renderer `{preview_renderer}` in sqlite row"
                ))
            });
    }

    Ok(Some(default_preview_renderer(content_type, files_detail)))
}

fn default_preview_renderer(
    content_type: &ContentType,
    files_detail: Option<&FilesDetail>,
) -> PreviewRenderer {
    match content_type {
        ContentType::Text => PreviewRenderer::Text,
        ContentType::Image => PreviewRenderer::Image,
        ContentType::Audio => PreviewRenderer::Audio,
        ContentType::Video => PreviewRenderer::Video,
        ContentType::Link => PreviewRenderer::Link,
        ContentType::Files => PreviewRenderer::FileList,
        ContentType::Document => {
            let is_pdf = files_detail
                .and_then(|detail| detail.items.first())
                .and_then(|item| item.extension.as_deref())
                .map(|value| value.eq_ignore_ascii_case("pdf"))
                .unwrap_or(false);

            if is_pdf {
                PreviewRenderer::Pdf
            } else {
                PreviewRenderer::Document
            }
        }
    }
}

fn build_preview_status(
    preview_status: Option<&str>,
    content_type: &ContentType,
    preview_renderer: Option<&PreviewRenderer>,
    primary_uri: Option<&str>,
) -> Option<PreviewStatus> {
    if preview_status == Some("pending")
        && preview_renderer == Some(&PreviewRenderer::Pdf)
        && primary_uri.is_some()
    {
        return Some(PreviewStatus::Ready);
    }

    preview_status
        .and_then(PreviewStatus::from_db)
        .or_else(|| Some(default_preview_status(content_type)))
}

fn default_preview_status(content_type: &ContentType) -> PreviewStatus {
    match content_type {
        ContentType::Text | ContentType::Image | ContentType::Files => PreviewStatus::Ready,
        ContentType::Audio | ContentType::Video | ContentType::Document | ContentType::Link => {
            PreviewStatus::Pending
        }
    }
}

fn build_audio_detail(
    renderer: Option<&PreviewRenderer>,
    primary_uri: Option<&str>,
    files_detail: Option<&FilesDetail>,
) -> Option<AudioPreviewDetail> {
    if renderer != Some(&PreviewRenderer::Audio) {
        return None;
    }

    let src = primary_uri
        .map(str::to_string)
        .or_else(|| first_file_path(files_detail).map(str::to_string))?;
    let mime_type = preview_mime_from_path(&src);
    let byte_size = file_byte_size(&src);

    Some(AudioPreviewDetail {
        src,
        mime_type,
        duration_ms: None,
        byte_size,
    })
}

fn build_video_detail(
    renderer: Option<&PreviewRenderer>,
    primary_uri: Option<&str>,
    files_detail: Option<&FilesDetail>,
) -> Option<VideoPreviewDetail> {
    if renderer != Some(&PreviewRenderer::Video) {
        return None;
    }

    let src = primary_uri
        .map(str::to_string)
        .or_else(|| first_file_path(files_detail).map(str::to_string))?;
    let mime_type = preview_mime_from_path(&src);

    Some(VideoPreviewDetail {
        src,
        mime_type,
        duration_ms: None,
        pixel_width: None,
        pixel_height: None,
        poster_path: None,
    })
}

fn build_document_detail(
    renderer: Option<&PreviewRenderer>,
    preview_status: Option<&PreviewStatus>,
    primary_uri: Option<&str>,
    preview_assets: &[PreviewAssetRow],
) -> Result<Option<DocumentPreviewDetail>, AppError> {
    if renderer != Some(&PreviewRenderer::Document) && renderer != Some(&PreviewRenderer::Pdf) {
        return Ok(None);
    }

    let effective_status = preview_status.cloned().unwrap_or(PreviewStatus::Pending);
    let outline = preview_assets
        .iter()
        .find(|asset| asset.asset_role == "document_outline")
        .and_then(|asset| asset.text_content.as_deref())
        .map(|payload| {
            serde_json::from_str::<DocumentOutlinePayload>(payload).map_err(|error| {
                AppError::Db(format!("parse document outline preview asset failed: {error}"))
            })
        })
        .transpose()?;
    let text_content = preview_assets
        .iter()
        .find(|asset| asset.asset_role == "document_text")
        .and_then(|asset| asset.text_content.clone());
    let document_kind = outline
        .as_ref()
        .and_then(|payload| DocumentKind::from_db(&payload.document_kind))
        .or_else(|| document_kind_from_uri(primary_uri))
        .unwrap_or_else(|| {
            if renderer == Some(&PreviewRenderer::Pdf) {
                DocumentKind::Pdf
            } else {
                DocumentKind::Docx
            }
        });

    Ok(Some(DocumentPreviewDetail {
        document_kind,
        preview_status: effective_status,
        page_count: outline.as_ref().and_then(|payload| payload.page_count),
        sheet_names: outline.as_ref().and_then(|payload| payload.sheet_names.clone()),
        slide_count: outline.as_ref().and_then(|payload| payload.slide_count),
        html_path: outline.as_ref().and_then(|payload| payload.html_path.clone()),
        text_content,
    }))
}

fn build_link_detail(
    renderer: Option<&PreviewRenderer>,
    primary_uri: Option<&str>,
    preview_assets: &[PreviewAssetRow],
) -> Result<Option<LinkPreviewDetail>, AppError> {
    if renderer != Some(&PreviewRenderer::Link) {
        return Ok(None);
    }

    let asset = preview_assets
        .iter()
        .find(|item| item.asset_role == "link_summary")
        .and_then(|item| item.text_content.as_deref());
    let payload = asset
        .map(|value| {
            serde_json::from_str::<LinkPreviewPayload>(value).map_err(|error| {
                AppError::Db(format!("parse link summary preview asset failed: {error}"))
            })
        })
        .transpose()?;

    let Some(url) = payload
        .as_ref()
        .map(|value| value.url.clone())
        .or_else(|| primary_uri.map(str::to_string))
    else {
        return Ok(None);
    };

    Ok(Some(LinkPreviewDetail {
        url,
        title: payload.as_ref().and_then(|value| value.title.clone()),
        site_name: payload.as_ref().and_then(|value| value.site_name.clone()),
        description: payload.as_ref().and_then(|value| value.description.clone()),
        cover_image: payload.as_ref().and_then(|value| value.cover_image.clone()),
        content_text: payload.as_ref().and_then(|value| value.content_text.clone()),
        fetched_at: payload.as_ref().and_then(|value| value.fetched_at),
    }))
}

fn first_file_path(files_detail: Option<&FilesDetail>) -> Option<&str> {
    files_detail?.items.first().map(|item| item.path.as_str())
}

fn document_kind_from_uri(primary_uri: Option<&str>) -> Option<DocumentKind> {
    let extension = Path::new(primary_uri?)
        .extension()?
        .to_string_lossy()
        .to_ascii_lowercase();
    DocumentKind::from_extension(&extension)
}

fn file_byte_size(path: &str) -> Option<i64> {
    fs::metadata(path)
        .ok()
        .and_then(|metadata| i64::try_from(metadata.len()).ok())
}

fn preview_mime_from_path(path: &str) -> Option<String> {
    let extension = Path::new(path)
        .extension()
        .map(|value| value.to_string_lossy().to_ascii_lowercase())?;

    let mime = match extension.as_str() {
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "aac" => "audio/aac",
        "flac" => "audio/flac",
        "m4a" => "audio/mp4",
        "ogg" => "audio/ogg",
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "m4v" => "video/x-m4v",
        "avi" => "video/x-msvideo",
        "mkv" => "video/x-matroska",
        "webm" => "video/webm",
        _ => return None,
    };

    Some(mime.to_string())
}

fn line_count(text: &str) -> usize {
    if text.is_empty() {
        0
    } else {
        text.chars().filter(|ch| *ch == '\n').count() + 1
    }
}

fn non_negative_count(value: i64, field: &str) -> Result<usize, AppError> {
    usize::try_from(value)
        .map_err(|_| AppError::Db(format!("invalid sqlite field `{field}` value `{value}`")))
}

fn row_id(row: &Row<'_>, index: usize) -> Result<u64, AppError> {
    let value: i64 = row_value(row, index, "id")?;
    u64::try_from(value).map_err(|_| AppError::Db(format!("invalid sqlite record id `{value}`")))
}

fn row_value<T>(row: &Row<'_>, index: usize, field: &str) -> Result<T, AppError>
where
    T: rusqlite::types::FromSql,
{
    row.get(index)
        .map_err(|error| AppError::Db(format!("read sqlite field `{field}` failed: {error}")))
}

fn row_optional_value<T>(row: &Row<'_>, index: usize, field: &str) -> Result<Option<T>, AppError>
where
    T: rusqlite::types::FromSql,
{
    row.get(index)
        .map_err(|error| AppError::Db(format!("read sqlite field `{field}` failed: {error}")))
}
