use rusqlite::Row;

use crate::{
    clipboard::{
        query::{
            ClipboardRecordDetail, ClipboardRecordSummary, FileEntryType, FileItemDetail,
            FilesDetail, FilesMeta, ImageDetail, ImageMeta, TextMeta, ThumbnailState,
        },
        types::{ContentType, PayloadType},
    },
    error::AppError,
};

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
