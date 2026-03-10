use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

use rusqlite::{params, OptionalExtension};

use crate::{
    clipboard::{
        payload::{
            build_files_preview, files_sha256_hex, text_sha256_hex, ClipboardFileItem,
            ClipboardImageData,
        },
        query::{ClipboardRecordDetail, ClipboardRecordSummary, ThumbnailState},
        types::{ContentType, PayloadType, RecordId},
    },
    config::AppConfig,
    error::AppError,
    image::ImageStorageService,
    persistence::{sqlite::ImageAssetCleanupPaths, sqlite::SqliteConnectionManager},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CaptureAction {
    Added,
    Promoted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecordUpdateReason {
    Promoted,
    ThumbnailReady,
    ThumbnailFailed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecordDeleteReason {
    Manual,
    Retention,
}

#[derive(Debug, Clone)]
pub struct CaptureResult {
    pub action: CaptureAction,
    pub record: ClipboardRecordSummary,
    pub evicted_ids: Vec<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ClearHistoryStats {
    pub deleted_records: usize,
    pub deleted_image_assets: usize,
}

pub trait ClipboardRuntimeRepository: Send + Sync {
    fn capture_text(
        &self,
        text: String,
        rich_content: Option<String>,
        source_app: Option<String>,
        captured_at: i64,
    ) -> Result<CaptureResult, AppError>;

    fn capture_image(
        &self,
        image: ClipboardImageData,
        source_app: Option<String>,
        captured_at: i64,
    ) -> Result<CaptureResult, AppError>;

    fn capture_files(
        &self,
        items: Vec<ClipboardFileItem>,
        source_app: Option<String>,
        captured_at: i64,
    ) -> Result<CaptureResult, AppError>;

    fn list_summaries(&self, limit: usize) -> Result<Vec<ClipboardRecordSummary>, AppError>;
    fn search_summaries(
        &self,
        query: &str,
        content_type: Option<ContentType>,
        limit: usize,
    ) -> Result<Vec<ClipboardRecordSummary>, AppError>;
    fn get_detail(&self, id: RecordId) -> Result<Option<ClipboardRecordDetail>, AppError>;
    fn update_text(
        &self,
        id: RecordId,
        text: String,
        updated_at: i64,
    ) -> Result<ClipboardRecordDetail, AppError>;
    fn promote(&self, id: RecordId, promoted_at: i64) -> Result<ClipboardRecordSummary, AppError>;
    fn delete(&self, id: RecordId) -> Result<RecordId, AppError>;
    fn clear_history(&self) -> Result<ClearHistoryStats, AppError>;
    fn finalize_pending_image(
        &self,
        id: RecordId,
    ) -> Result<(RecordUpdateReason, ClipboardRecordSummary), AppError>;
    fn mark_thumbnail_ready(
        &self,
        id: RecordId,
        thumbnail_path: String,
    ) -> Result<ClipboardRecordSummary, AppError>;
    fn mark_thumbnail_failed(&self, id: RecordId) -> Result<ClipboardRecordSummary, AppError>;
}

pub struct SqliteClipboardRuntimeRepository {
    database: Arc<SqliteConnectionManager>,
    image_storage: Arc<ImageStorageService>,
    config: AppConfig,
}

impl SqliteClipboardRuntimeRepository {
    pub fn new(
        database: Arc<SqliteConnectionManager>,
        image_storage: Arc<ImageStorageService>,
        config: AppConfig,
    ) -> Self {
        Self {
            database,
            image_storage,
            config,
        }
    }
}

impl ClipboardRuntimeRepository for SqliteClipboardRuntimeRepository {
    fn capture_text(
        &self,
        text: String,
        rich_content: Option<String>,
        source_app: Option<String>,
        captured_at: i64,
    ) -> Result<CaptureResult, AppError> {
        let content_hash = text_sha256_hex(&text);
        let preview_text = text.clone();
        let content_type = detect_text_content_type(&text);
        let record = upsert_text_record(
            &self.database,
            content_type,
            &content_hash,
            &text,
            rich_content.as_deref(),
            &preview_text,
            source_app.as_deref(),
            captured_at,
        )?;
        let prune_result = self
            .database
            .prune_excess_records_by_payload(PayloadType::Text, self.config.max_text_records())?;

        Ok(CaptureResult {
            action: record.0,
            record: record.1,
            evicted_ids: prune_result.deleted_record_ids,
        })
    }

    fn capture_image(
        &self,
        image: ClipboardImageData,
        source_app: Option<String>,
        captured_at: i64,
    ) -> Result<CaptureResult, AppError> {
        let content_hash = image.sha256_hex();
        if let Some(existing_id) =
            find_existing_id(&self.database, PayloadType::Image, &content_hash)?
        {
            let record = promote_record(
                &self.database,
                existing_id,
                source_app.as_deref(),
                captured_at,
            )?;
            return Ok(CaptureResult {
                action: CaptureAction::Promoted,
                record,
                evicted_ids: Vec::new(),
            });
        }

        let saved = self.image_storage.save_original(&content_hash, &image)?;
        let record_id = insert_image_record(
            &self.database,
            &content_hash,
            &saved,
            source_app.as_deref(),
            captured_at,
        )?;
        let prune_result = self
            .database
            .prune_excess_records(ContentType::Image, self.config.max_image_records())?;
        self.image_storage
            .remove_assets(&prune_result.deleted_image_assets);
        let record = self
            .database
            .find_record_detail(record_id)?
            .ok_or_else(|| AppError::RecordNotFound(record_id.value()))?
            .into();

        Ok(CaptureResult {
            action: CaptureAction::Added,
            record,
            evicted_ids: prune_result.deleted_record_ids,
        })
    }

    fn capture_files(
        &self,
        items: Vec<ClipboardFileItem>,
        source_app: Option<String>,
        captured_at: i64,
    ) -> Result<CaptureResult, AppError> {
        let content_hash = files_sha256_hex(&items);
        let content_type = detect_files_content_type(&items);
        if let Some(existing_id) =
            find_existing_id(&self.database, PayloadType::Files, &content_hash)?
        {
            let record = promote_record(
                &self.database,
                existing_id,
                source_app.as_deref(),
                captured_at,
            )?;
            return Ok(CaptureResult {
                action: CaptureAction::Promoted,
                record,
                evicted_ids: Vec::new(),
            });
        }

        let record = insert_files_record(
            &self.database,
            content_type,
            &content_hash,
            &items,
            source_app.as_deref(),
            captured_at,
        )?;
        let prune_result = self
            .database
            .prune_excess_records_by_payload(PayloadType::Files, self.config.max_file_records())?;

        Ok(CaptureResult {
            action: CaptureAction::Added,
            record,
            evicted_ids: prune_result.deleted_record_ids,
        })
    }

    fn list_summaries(&self, limit: usize) -> Result<Vec<ClipboardRecordSummary>, AppError> {
        self.database.list_record_summaries(limit)
    }

    fn search_summaries(
        &self,
        query: &str,
        content_type: Option<ContentType>,
        limit: usize,
    ) -> Result<Vec<ClipboardRecordSummary>, AppError> {
        self.database
            .search_record_summaries(query, content_type, limit)
    }

    fn get_detail(&self, id: RecordId) -> Result<Option<ClipboardRecordDetail>, AppError> {
        self.database.find_record_detail(id)
    }

    fn update_text(
        &self,
        id: RecordId,
        text: String,
        updated_at: i64,
    ) -> Result<ClipboardRecordDetail, AppError> {
        update_text_record(&self.database, id, &text, updated_at)
    }

    fn promote(&self, id: RecordId, promoted_at: i64) -> Result<ClipboardRecordSummary, AppError> {
        promote_record(&self.database, id, None, promoted_at)
    }

    fn delete(&self, id: RecordId) -> Result<RecordId, AppError> {
        let deleted_assets = delete_record_with_assets(&self.database, id)?;
        self.image_storage.remove_assets(&deleted_assets);
        Ok(id)
    }

    fn clear_history(&self) -> Result<ClearHistoryStats, AppError> {
        let result = self.database.clear_history()?;
        let deleted_image_assets = result.deleted_image_assets.len();
        self.image_storage
            .remove_assets(&result.deleted_image_assets);

        Ok(ClearHistoryStats {
            deleted_records: result.deleted_records,
            deleted_image_assets,
        })
    }

    fn finalize_pending_image(
        &self,
        id: RecordId,
    ) -> Result<(RecordUpdateReason, ClipboardRecordSummary), AppError> {
        let detail = self
            .database
            .find_record_detail(id)?
            .ok_or_else(|| AppError::RecordNotFound(id.value()))?;
        let image_detail = detail
            .image_detail
            .as_ref()
            .ok_or_else(|| AppError::InvalidParam("record is not image type".to_string()))?;
        let hash = Path::new(&image_detail.original_path)
            .file_stem()
            .and_then(|stem| stem.to_str())
            .filter(|stem| !stem.is_empty())
            .ok_or_else(|| {
                AppError::Db(format!(
                    "derive image hash from original path `{}` failed",
                    image_detail.original_path
                ))
            })?;

        match self
            .image_storage
            .generate_thumbnail(hash, &image_detail.original_path)
        {
            Ok(thumbnail_path) => Ok((
                RecordUpdateReason::ThumbnailReady,
                self.mark_thumbnail_ready(id, thumbnail_path)?,
            )),
            Err(error) => {
                tracing::warn!(record_id = id.value(), error = %error, "generate thumbnail failed");
                Ok((
                    RecordUpdateReason::ThumbnailFailed,
                    self.mark_thumbnail_failed(id)?,
                ))
            }
        }
    }

    fn mark_thumbnail_ready(
        &self,
        id: RecordId,
        thumbnail_path: String,
    ) -> Result<ClipboardRecordSummary, AppError> {
        update_thumbnail_state(
            &self.database,
            id,
            ThumbnailState::Ready,
            Some(thumbnail_path),
        )
    }

    fn mark_thumbnail_failed(&self, id: RecordId) -> Result<ClipboardRecordSummary, AppError> {
        update_thumbnail_state(&self.database, id, ThumbnailState::Failed, None)
    }
}

fn upsert_text_record(
    database: &SqliteConnectionManager,
    content_type: ContentType,
    content_hash: &str,
    text: &str,
    rich_content: Option<&str>,
    preview_text: &str,
    source_app: Option<&str>,
    captured_at: i64,
) -> Result<(CaptureAction, ClipboardRecordSummary), AppError> {
    if let Some(existing_id) = find_existing_id(database, PayloadType::Text, content_hash)? {
        database.with_connection(|connection| {
            connection
                .execute(
                    "UPDATE clipboard_items SET content_type = ?1, text_content = ?2, rich_content = ?3, preview_text = ?4, search_text = ?5, payload_bytes = ?6, last_used_at = ?7, source_app = COALESCE(?8, source_app) WHERE id = ?9",
                    params![
                        content_type.as_str(),
                        text,
                        rich_content,
                        preview_text,
                        text,
                        text.len() as i64,
                        captured_at,
                        source_app,
                        existing_id.value() as i64
                    ],
                )
                .map_err(|error| AppError::Db(format!("update text record failed: {error}")))?;
            Ok(())
        })?;
        return Ok((
            CaptureAction::Promoted,
            database
                .find_record_detail(existing_id)?
                .ok_or_else(|| AppError::RecordNotFound(existing_id.value()))?
                .into(),
        ));
    }

    let record_id = database.with_connection(|connection| {
        connection
            .execute(
                "INSERT INTO clipboard_items (payload_type, content_type, content_hash, text_content, rich_content, preview_text, search_text, source_app, file_count, payload_bytes, created_at, last_used_at) VALUES ('text', ?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?9, ?9)",
                params![
                    content_type.as_str(),
                    content_hash,
                    text,
                    rich_content,
                    preview_text,
                    text,
                    source_app,
                    text.len() as i64,
                    captured_at
                ],
            )
            .map_err(|error| AppError::Db(format!("insert text record failed: {error}")))?;
        let inserted_id = connection.last_insert_rowid();
        u64::try_from(inserted_id)
            .map(RecordId::new)
            .map_err(|_| AppError::Db(format!("invalid inserted text id `{inserted_id}`")))
    })?;

    let record = database
        .find_record_detail(record_id)?
        .ok_or_else(|| AppError::RecordNotFound(record_id.value()))?
        .into();
    Ok((CaptureAction::Added, record))
}

fn update_text_record(
    database: &SqliteConnectionManager,
    id: RecordId,
    text: &str,
    _updated_at: i64,
) -> Result<ClipboardRecordDetail, AppError> {
    let detail = database
        .find_record_detail(id)?
        .ok_or_else(|| AppError::RecordNotFound(id.value()))?;

    if detail.payload_type != PayloadType::Text {
        return Err(AppError::InvalidParam("仅文本记录支持编辑".to_string()));
    }

    let content_hash = text_sha256_hex(text);
    let content_type = detect_text_content_type(text);

    database.with_connection(|connection| {
        connection
            .execute(
                "UPDATE clipboard_items SET content_type = ?1, content_hash = ?2, text_content = ?3, rich_content = NULL, preview_text = ?4, search_text = ?5, payload_bytes = ?6 WHERE id = ?7 AND payload_type = 'text'",
                params![
                    content_type.as_str(),
                    content_hash,
                    text,
                    text,
                    text,
                    text.len() as i64,
                    id.value() as i64
                ],
            )
            .map_err(|error| match error {
                rusqlite::Error::SqliteFailure(failure, _)
                    if failure.code == rusqlite::ErrorCode::ConstraintViolation =>
                {
                    AppError::InvalidParam("已存在相同文本记录，无法保存重复内容".to_string())
                }
                other => AppError::Db(format!("update text record content failed: {other}")),
            })?;
        Ok(())
    })?;

    database
        .find_record_detail(id)?
        .ok_or_else(|| AppError::RecordNotFound(id.value()))
}

fn insert_image_record(
    database: &SqliteConnectionManager,
    content_hash: &str,
    saved: &crate::image::SavedImageAsset,
    source_app: Option<&str>,
    captured_at: i64,
) -> Result<RecordId, AppError> {
    database.with_connection(|connection| {
        connection.execute(
            "INSERT INTO clipboard_items (payload_type, content_type, content_hash, text_content, rich_content, preview_text, search_text, source_app, file_count, payload_bytes, created_at, last_used_at) VALUES ('image', 'image', ?1, NULL, NULL, ?2, ?2, ?3, 0, ?4, ?5, ?5)",
            params![
                content_hash,
                format!("图片 {}×{}", saved.pixel_width, saved.pixel_height),
                source_app,
                saved.byte_size,
                captured_at
            ],
        ).map_err(|error| AppError::Db(format!("insert image item failed: {error}")))?;
        let item_id = connection.last_insert_rowid();
        connection.execute(
            "INSERT INTO image_assets (item_id, original_path, thumbnail_path, mime_type, pixel_width, pixel_height, byte_size, thumbnail_state, created_at) VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6, 'pending', ?7)",
            params![item_id, saved.original_path, saved.mime_type, saved.pixel_width, saved.pixel_height, saved.byte_size, captured_at],
        ).map_err(|error| AppError::Db(format!("insert image asset failed: {error}")))?;
        u64::try_from(item_id)
            .map(RecordId::new)
            .map_err(|_| AppError::Db(format!("invalid inserted image id `{item_id}`")))
    })
}

fn insert_files_record(
    database: &SqliteConnectionManager,
    content_type: ContentType,
    content_hash: &str,
    items: &[ClipboardFileItem],
    source_app: Option<&str>,
    captured_at: i64,
) -> Result<ClipboardRecordSummary, AppError> {
    let record_id = database.with_connection(|connection| {
        connection.execute(
            "INSERT INTO clipboard_items (payload_type, content_type, content_hash, text_content, rich_content, preview_text, search_text, source_app, file_count, payload_bytes, created_at, last_used_at) VALUES ('files', ?1, ?2, NULL, NULL, ?3, ?3, ?4, ?5, 0, ?6, ?6)",
            params![
                content_type.as_str(),
                content_hash,
                build_files_preview(items),
                source_app,
                items.len() as i64,
                captured_at
            ],
        ).map_err(|error| AppError::Db(format!("insert files item failed: {error}")))?;
        let item_id = connection.last_insert_rowid();
        for (index, item) in items.iter().enumerate() {
            connection.execute(
                "INSERT INTO file_items (item_id, sort_order, path, display_name, entry_type, extension, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![item_id, index as i64, item.path.to_string_lossy().to_string(), item.display_name, match item.entry_type { crate::clipboard::query::FileEntryType::File => "file", crate::clipboard::query::FileEntryType::Directory => "directory" }, item.extension, captured_at],
            ).map_err(|error| AppError::Db(format!("insert file item failed: {error}")))?;
        }
        u64::try_from(item_id)
            .map(RecordId::new)
            .map_err(|_| AppError::Db(format!("invalid inserted files id `{item_id}`")))
    })?;

    database
        .find_record_detail(record_id)?
        .ok_or_else(|| AppError::RecordNotFound(record_id.value()))
        .map(Into::into)
}

fn find_existing_id(
    database: &SqliteConnectionManager,
    payload_type: PayloadType,
    content_hash: &str,
) -> Result<Option<RecordId>, AppError> {
    database.with_connection(|connection| {
        connection
            .query_row(
                "SELECT id FROM clipboard_items WHERE payload_type = ?1 AND content_hash = ?2 LIMIT 1",
                params![payload_type.as_str(), content_hash],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map_err(|error| AppError::Db(format!("query existing record failed: {error}")))?
            .map(|id| {
                u64::try_from(id)
                    .map(RecordId::new)
                    .map_err(|_| AppError::Db(format!("invalid existing record id `{id}`")))
            })
            .transpose()
    })
}

fn detect_text_content_type(text: &str) -> ContentType {
    let normalized = text.trim();
    let lower = normalized.to_ascii_lowercase();

    if (lower.starts_with("http://") || lower.starts_with("https://"))
        && !normalized.contains(char::is_whitespace)
    {
        return ContentType::Link;
    }

    ContentType::Text
}

fn detect_files_content_type(items: &[ClipboardFileItem]) -> ContentType {
    let [single] = items else {
        return ContentType::Files;
    };

    if single.entry_type != crate::clipboard::query::FileEntryType::File {
        return ContentType::Files;
    }

    let extension = single
        .extension
        .as_deref()
        .map(|value| value.to_ascii_lowercase());

    match extension.as_deref() {
        Some("png" | "jpg" | "jpeg" | "gif" | "bmp" | "webp" | "tif" | "tiff" | "heic") => {
            ContentType::Image
        }
        Some("mp4" | "mov" | "m4v" | "avi" | "mkv" | "webm") => ContentType::Video,
        Some("mp3" | "wav" | "aac" | "flac" | "m4a" | "ogg") => ContentType::Audio,
        Some(
            "pdf" | "md" | "txt" | "rtf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx"
            | "pages" | "numbers" | "key",
        ) => ContentType::Document,
        _ => ContentType::Files,
    }
}

fn promote_record(
    database: &SqliteConnectionManager,
    id: RecordId,
    source_app: Option<&str>,
    promoted_at: i64,
) -> Result<ClipboardRecordSummary, AppError> {
    database.with_connection(|connection| {
        connection
            .execute(
                "UPDATE clipboard_items SET last_used_at = ?1, source_app = COALESCE(?2, source_app) WHERE id = ?3",
                params![promoted_at, source_app, id.value() as i64],
            )
            .map_err(|error| AppError::Db(format!("promote record failed: {error}")))?;
        Ok(())
    })?;

    database
        .find_record_detail(id)?
        .ok_or_else(|| AppError::RecordNotFound(id.value()))
        .map(Into::into)
}

fn delete_record_with_assets(
    database: &SqliteConnectionManager,
    id: RecordId,
) -> Result<Vec<ImageAssetCleanupPaths>, AppError> {
    database.with_connection(|connection| {
        let image_assets: Option<(String, Option<String>)> = connection
            .query_row(
                "SELECT ia.original_path, ia.thumbnail_path FROM clipboard_items ci LEFT JOIN image_assets ia ON ia.item_id = ci.id WHERE ci.id = ?1 LIMIT 1",
                params![id.value() as i64],
                |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, Option<String>>(1)?)),
            )
            .optional()
            .map_err(|error| AppError::Db(format!("query delete image assets failed: {error}")))?
            .and_then(|(original_path, thumbnail_path)| original_path.map(|path| (path, thumbnail_path)));

        let deleted = connection.execute(
            "DELETE FROM clipboard_items WHERE id = ?1",
            params![id.value() as i64],
        ).map_err(|error| AppError::Db(format!("delete record failed: {error}")))?;
        if deleted == 0 {
            return Err(AppError::RecordNotFound(id.value()));
        }

        Ok(image_assets
            .into_iter()
            .map(|(original_path, thumbnail_path)| ImageAssetCleanupPaths { original_path, thumbnail_path })
            .collect())
    })
}

fn update_thumbnail_state(
    database: &SqliteConnectionManager,
    id: RecordId,
    state: ThumbnailState,
    thumbnail_path: Option<String>,
) -> Result<ClipboardRecordSummary, AppError> {
    let state_value = match state {
        ThumbnailState::Pending => "pending",
        ThumbnailState::Ready => "ready",
        ThumbnailState::Failed => "failed",
    };

    database.with_connection(|connection| {
        connection.execute(
            "UPDATE image_assets SET thumbnail_state = ?1, thumbnail_path = COALESCE(?2, thumbnail_path) WHERE item_id = ?3",
            params![state_value, thumbnail_path, id.value() as i64],
        ).map_err(|error| AppError::Db(format!("update thumbnail state failed: {error}")))?;
        Ok(())
    })?;

    database
        .find_record_detail(id)?
        .ok_or_else(|| AppError::RecordNotFound(id.value()))
        .map(Into::into)
}

#[allow(dead_code)]
fn _normalize_paths(paths: &[PathBuf]) -> Vec<PathBuf> {
    paths.to_vec()
}

#[cfg(test)]
mod tests {
    use std::{
        env, fs,
        path::{Path, PathBuf},
        sync::Arc,
        time::{SystemTime, UNIX_EPOCH},
    };

    use crate::{
        clipboard::{
            payload::{ClipboardFileItem, ClipboardImageData},
            query::ThumbnailState,
            types::{ContentType, RecordId},
        },
        config::AppConfig,
        image::ImageStorageService,
        persistence::sqlite::SqliteConnectionManager,
    };

    use super::{CaptureAction, ClipboardRuntimeRepository, SqliteClipboardRuntimeRepository};

    #[test]
    fn capture_image_creates_pending_record_and_original_asset() {
        let context = TestContext::new("capture-image-create");
        let repository = context.repository();

        let result = repository
            .capture_image(sample_image(64), None, 1_000)
            .expect("image should be captured");

        assert_eq!(result.action, CaptureAction::Added);
        assert!(result.evicted_ids.is_empty());
        assert_eq!(result.record.content_type, ContentType::Image);
        assert_eq!(result.record.preview_text, "图片 2×2");

        let image_meta = result.record.image_meta.expect("image meta should exist");
        assert_eq!(image_meta.mime_type, "image/png");
        assert_eq!(image_meta.pixel_width, 2);
        assert_eq!(image_meta.pixel_height, 2);
        assert_eq!(image_meta.thumbnail_state, ThumbnailState::Pending);
        assert_eq!(image_meta.thumbnail_path, None);

        let detail = repository
            .get_detail(RecordId::new(result.record.id))
            .expect("detail query should succeed")
            .expect("detail should exist");
        let image_detail = detail.image_detail.expect("image detail should exist");
        assert!(Path::new(&image_detail.original_path).exists());
        assert_eq!(image_detail.mime_type, "image/png");
        assert_eq!(image_detail.pixel_width, 2);
        assert_eq!(image_detail.pixel_height, 2);
        assert!(image_detail.byte_size > 0);

        let summaries = repository
            .list_summaries(10)
            .expect("summary query should succeed");
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].id, result.record.id);
    }

    #[test]
    fn finalize_pending_image_marks_record_ready() {
        let context = TestContext::new("capture-image-finalize-ready");
        let repository = context.repository();
        let captured = repository
            .capture_image(sample_image(72), None, 1_000)
            .expect("image should be captured");

        let (reason, record) = repository
            .finalize_pending_image(RecordId::new(captured.record.id))
            .expect("thumbnail finalize should succeed");

        assert_eq!(reason, super::RecordUpdateReason::ThumbnailReady);
        let image_meta = record.image_meta.expect("image meta should exist");
        assert_eq!(image_meta.thumbnail_state, ThumbnailState::Ready);
        let thumbnail_path = image_meta
            .thumbnail_path
            .expect("thumbnail path should exist");
        assert!(Path::new(&thumbnail_path).exists());
    }

    #[test]
    fn finalize_pending_image_marks_record_failed_when_original_is_corrupted() {
        let context = TestContext::new("capture-image-finalize-failed");
        let repository = context.repository();
        let captured = repository
            .capture_image(sample_image(84), None, 1_000)
            .expect("image should be captured");
        let detail = repository
            .get_detail(RecordId::new(captured.record.id))
            .expect("detail query should succeed")
            .expect("detail should exist");
        let original_path = detail
            .image_detail
            .expect("image detail should exist")
            .original_path;
        fs::write(&original_path, b"not-a-valid-png").expect("original image should be corrupted");

        let (reason, record) = repository
            .finalize_pending_image(RecordId::new(captured.record.id))
            .expect("thumbnail finalize should return failed state");

        assert_eq!(reason, super::RecordUpdateReason::ThumbnailFailed);
        let image_meta = record.image_meta.expect("image meta should exist");
        assert_eq!(image_meta.thumbnail_state, ThumbnailState::Failed);
        assert_eq!(image_meta.thumbnail_path, None);
    }

    #[test]
    fn capture_image_duplicate_promotes_existing_record() {
        let context = TestContext::new("capture-image-promote");
        let repository = context.repository();

        let first = repository
            .capture_image(sample_image(96), None, 1_000)
            .expect("first image capture should succeed");
        let second = repository
            .capture_image(sample_image(96), None, 2_000)
            .expect("duplicate image capture should succeed");

        assert_eq!(first.action, CaptureAction::Added);
        assert_eq!(second.action, CaptureAction::Promoted);
        assert_eq!(first.record.id, second.record.id);
        assert_eq!(second.record.last_used_at, 2_000);
        assert!(second.evicted_ids.is_empty());

        let summaries = repository
            .list_summaries(10)
            .expect("summary query should succeed");
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].id, first.record.id);
        assert_eq!(summaries[0].last_used_at, 2_000);
    }

    #[test]
    fn capture_files_preserves_order_and_directory_metadata() {
        let context = TestContext::new("capture-files-create");
        let repository = context.repository();
        let items = sample_file_items(&context.root_dir, "ordered");

        let result = repository
            .capture_files(items.clone(), None, 1_000)
            .expect("files should be captured");

        assert_eq!(result.action, CaptureAction::Added);
        assert!(result.evicted_ids.is_empty());
        assert_eq!(result.record.content_type, ContentType::Files);
        assert_eq!(result.record.preview_text, "note.txt 等 3 项");

        let files_meta = result.record.files_meta.expect("files meta should exist");
        assert_eq!(files_meta.count, 3);
        assert_eq!(files_meta.primary_name, "note.txt");
        assert!(files_meta.contains_directory);

        let detail = repository
            .get_detail(RecordId::new(result.record.id))
            .expect("detail query should succeed")
            .expect("detail should exist");
        let file_items = detail
            .files_detail
            .expect("files detail should exist")
            .items;
        assert_eq!(file_items.len(), 3);
        assert_eq!(
            file_items
                .iter()
                .map(|item| item.path.clone())
                .collect::<Vec<_>>(),
            items
                .iter()
                .map(|item| item.path.to_string_lossy().to_string())
                .collect::<Vec<_>>()
        );
        assert_eq!(file_items[0].display_name, "note.txt");
        assert_eq!(file_items[0].extension.as_deref(), Some("txt"));
        assert_eq!(
            file_items[1].entry_type,
            crate::clipboard::query::FileEntryType::Directory
        );
        assert_eq!(file_items[1].extension, None);
        assert_eq!(file_items[2].display_name, "archive.zip");
        assert_eq!(file_items[2].extension.as_deref(), Some("zip"));
    }

    #[test]
    fn capture_text_persists_source_app() {
        let context = TestContext::new("capture-text-source-app");
        let repository = context.repository();

        let result = repository
            .capture_text(
                "来自备忘录的文本".to_string(),
                None,
                Some("Notes".to_string()),
                1_000,
            )
            .expect("text capture should succeed");

        assert_eq!(result.record.source_app.as_deref(), Some("Notes"));

        let detail = repository
            .get_detail(RecordId::new(result.record.id))
            .expect("detail query should succeed")
            .expect("detail should exist");
        assert_eq!(detail.source_app.as_deref(), Some("Notes"));
    }

    #[test]
    fn capture_image_duplicate_updates_source_app_on_promote() {
        let context = TestContext::new("capture-image-source-app-promote");
        let repository = context.repository();

        let first = repository
            .capture_image(sample_image(97), Some("Preview".to_string()), 1_000)
            .expect("first image capture should succeed");
        let second = repository
            .capture_image(sample_image(97), Some("Finder".to_string()), 2_000)
            .expect("duplicate image capture should succeed");

        assert_eq!(first.record.source_app.as_deref(), Some("Preview"));
        assert_eq!(second.action, CaptureAction::Promoted);
        assert_eq!(second.record.source_app.as_deref(), Some("Finder"));

        let detail = repository
            .get_detail(RecordId::new(first.record.id))
            .expect("detail query should succeed")
            .expect("detail should exist");
        assert_eq!(detail.source_app.as_deref(), Some("Finder"));
    }

    #[test]
    fn capture_files_persists_source_app() {
        let context = TestContext::new("capture-files-source-app");
        let repository = context.repository();
        let items = sample_file_items(&context.root_dir, "source-app");

        let result = repository
            .capture_files(items, Some("Finder".to_string()), 1_000)
            .expect("files capture should succeed");

        assert_eq!(result.record.source_app.as_deref(), Some("Finder"));

        let detail = repository
            .get_detail(RecordId::new(result.record.id))
            .expect("detail query should succeed")
            .expect("detail should exist");
        assert_eq!(detail.source_app.as_deref(), Some("Finder"));
    }

    #[test]
    fn mixed_duplicate_records_reuse_existing_ids_and_move_to_front() {
        let context = TestContext::new("mixed-duplicate-promote");
        let repository = context.repository();
        let file_items = sample_file_items(&context.root_dir, "mixed");

        let text_first = repository
            .capture_text("alpha".to_string(), None, None, 1_000)
            .expect("text should be captured");
        let image_first = repository
            .capture_image(sample_image(90), None, 2_000)
            .expect("image should be captured");
        let files_first = repository
            .capture_files(file_items.clone(), None, 3_000)
            .expect("files should be captured");

        let text_second = repository
            .capture_text("alpha".to_string(), None, None, 4_000)
            .expect("duplicate text should be promoted");
        assert_eq!(text_second.action, CaptureAction::Promoted);
        assert_eq!(text_second.record.id, text_first.record.id);

        let summaries = repository
            .list_summaries(10)
            .expect("summary query should succeed");
        assert_eq!(
            summaries.iter().map(|record| record.id).collect::<Vec<_>>(),
            vec![
                text_first.record.id,
                files_first.record.id,
                image_first.record.id
            ]
        );

        let image_second = repository
            .capture_image(sample_image(90), None, 5_000)
            .expect("duplicate image should be promoted");
        assert_eq!(image_second.action, CaptureAction::Promoted);
        assert_eq!(image_second.record.id, image_first.record.id);

        let summaries = repository
            .list_summaries(10)
            .expect("summary query should succeed");
        assert_eq!(
            summaries.iter().map(|record| record.id).collect::<Vec<_>>(),
            vec![
                image_first.record.id,
                text_first.record.id,
                files_first.record.id
            ]
        );

        let files_second = repository
            .capture_files(file_items, None, 6_000)
            .expect("duplicate files should be promoted");
        assert_eq!(files_second.action, CaptureAction::Promoted);
        assert_eq!(files_second.record.id, files_first.record.id);

        let summaries = repository
            .list_summaries(10)
            .expect("summary query should succeed");
        assert_eq!(
            summaries.iter().map(|record| record.id).collect::<Vec<_>>(),
            vec![
                files_first.record.id,
                image_first.record.id,
                text_first.record.id
            ]
        );
    }

    #[test]
    fn clear_history_removes_records_and_image_assets() {
        let context = TestContext::new("clear-history");
        let repository = context.repository();

        repository
            .capture_text("第一条文本".to_string(), None, None, 1_000)
            .expect("text capture should succeed");
        let image = repository
            .capture_image(sample_image(48), None, 2_000)
            .expect("image capture should succeed");
        let (_, finalized_record) = repository
            .finalize_pending_image(RecordId::new(image.record.id))
            .expect("thumbnail finalize should succeed");
        repository
            .capture_files(
                sample_file_items(&context.root_dir, "clear-history"),
                None,
                3_000,
            )
            .expect("files capture should succeed");

        let detail = repository
            .get_detail(RecordId::new(image.record.id))
            .expect("detail query should succeed")
            .expect("image detail should exist");
        let image_detail = detail.image_detail.expect("image detail should exist");
        let thumbnail_path = finalized_record
            .image_meta
            .as_ref()
            .and_then(|image_meta| image_meta.thumbnail_path.clone())
            .expect("thumbnail path should exist after finalize");

        assert!(Path::new(&image_detail.original_path).exists());
        assert!(Path::new(&thumbnail_path).exists());

        let stats = repository
            .clear_history()
            .expect("clear history should succeed");

        assert_eq!(stats.deleted_records, 3);
        assert_eq!(stats.deleted_image_assets, 1);
        assert!(repository
            .list_summaries(10)
            .expect("summary query should succeed")
            .is_empty());
        assert!(!Path::new(&image_detail.original_path).exists());
        assert!(!Path::new(&thumbnail_path).exists());
    }

    #[test]
    fn clear_history_allows_new_capture_after_cleanup() {
        let context = TestContext::new("clear-history-recapture");
        let repository = context.repository();

        repository
            .capture_text("旧文本".to_string(), None, None, 1_000)
            .expect("initial text capture should succeed");

        repository
            .clear_history()
            .expect("clear history should succeed");

        let recaptured = repository
            .capture_text("清空后的新文本".to_string(), None, None, 2_000)
            .expect("recapture after clear history should succeed");

        let summaries = repository
            .list_summaries(10)
            .expect("summary query should succeed");

        assert_eq!(recaptured.action, CaptureAction::Added);
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].id, recaptured.record.id);
        assert_eq!(summaries[0].preview_text, "清空后的新文本");
    }

    #[test]
    fn update_text_preserves_last_used_ordering() {
        let context = TestContext::new("update-text-preserve-order");
        let repository = context.repository();

        let newer = repository
            .capture_text("较新的文本".to_string(), None, None, 2_000)
            .expect("newer text capture should succeed");
        let older = repository
            .capture_text("较旧的文本".to_string(), None, None, 1_000)
            .expect("older text capture should succeed");

        let updated = repository
            .update_text(
                RecordId::new(older.record.id),
                "较旧的文本-已编辑".to_string(),
                3_000,
            )
            .expect("text update should succeed");

        assert_eq!(updated.last_used_at, 1_000);

        let summaries = repository
            .list_summaries(10)
            .expect("summary query should succeed");
        assert_eq!(
            summaries.iter().map(|record| record.id).collect::<Vec<_>>(),
            vec![newer.record.id, older.record.id]
        );
        assert_eq!(summaries[1].preview_text, "较旧的文本-已编辑");
        assert_eq!(summaries[1].last_used_at, 1_000);
    }

    #[test]
    fn capture_files_duplicate_promotes_existing_record() {
        let context = TestContext::new("capture-files-promote");
        let repository = context.repository();
        let items = sample_file_items(&context.root_dir, "duplicate");

        let first = repository
            .capture_files(items.clone(), None, 1_000)
            .expect("first files capture should succeed");
        let second = repository
            .capture_files(items, None, 2_000)
            .expect("duplicate files capture should succeed");

        assert_eq!(first.action, CaptureAction::Added);
        assert_eq!(second.action, CaptureAction::Promoted);
        assert_eq!(first.record.id, second.record.id);
        assert_eq!(second.record.last_used_at, 2_000);
        assert!(second.evicted_ids.is_empty());

        let summaries = repository
            .list_summaries(10)
            .expect("summary query should succeed");
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].id, first.record.id);
        assert_eq!(summaries[0].last_used_at, 2_000);
    }

    struct TestContext {
        root_dir: PathBuf,
        database: Arc<SqliteConnectionManager>,
        image_storage: Arc<ImageStorageService>,
        config: AppConfig,
    }

    impl TestContext {
        fn new(suffix: &str) -> Self {
            let root_dir = unique_test_dir(suffix);
            let database = Arc::new(
                SqliteConnectionManager::initialize_at(&root_dir.join("clipboard.db"))
                    .expect("sqlite database should initialize"),
            );
            let image_storage = Arc::new(
                ImageStorageService::initialize_at(
                    root_dir.join("images/original"),
                    root_dir.join("images/thumbs"),
                )
                .expect("image storage should initialize"),
            );

            Self {
                root_dir,
                database,
                image_storage,
                config: AppConfig::default(),
            }
        }

        fn repository(&self) -> SqliteClipboardRuntimeRepository {
            SqliteClipboardRuntimeRepository::new(
                self.database.clone(),
                self.image_storage.clone(),
                self.config.clone(),
            )
        }
    }

    impl Drop for TestContext {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root_dir);
        }
    }

    fn sample_image(seed: u8) -> ClipboardImageData {
        ClipboardImageData {
            width: 2,
            height: 2,
            bytes: vec![
                seed, 0, 0, 255, 0, seed, 0, 255, 0, 0, seed, 255, 255, 255, 255, 255,
            ],
        }
    }

    fn sample_file_items(
        root_dir: &Path,
        suffix: &str,
    ) -> Vec<crate::clipboard::payload::ClipboardFileItem> {
        let fixtures_dir = root_dir.join("fixtures").join(suffix);
        fs::create_dir_all(&fixtures_dir).expect("fixtures dir should be created");

        let text_file = fixtures_dir.join("note.txt");
        fs::write(&text_file, "hello").expect("text file should be written");

        let directory = fixtures_dir.join("folder");
        fs::create_dir_all(&directory).expect("directory should be created");

        let archive_file = fixtures_dir.join("archive.zip");
        fs::write(&archive_file, "zip").expect("archive file should be written");

        vec![
            crate::clipboard::payload::ClipboardFileItem::from_path(text_file),
            crate::clipboard::payload::ClipboardFileItem::from_path(directory),
            crate::clipboard::payload::ClipboardFileItem::from_path(archive_file),
        ]
    }

    // ── detect_text_content_type tests ──

    #[test]
    fn detect_text_content_type_identifies_http_url_as_link() {
        assert_eq!(
            super::detect_text_content_type("http://example.com"),
            ContentType::Link
        );
    }

    #[test]
    fn detect_text_content_type_identifies_https_url_as_link() {
        assert_eq!(
            super::detect_text_content_type("https://example.com/path?q=1"),
            ContentType::Link
        );
    }

    #[test]
    fn detect_text_content_type_trims_whitespace_before_detection() {
        assert_eq!(
            super::detect_text_content_type("  https://example.com  "),
            ContentType::Link
        );
    }

    #[test]
    fn detect_text_content_type_case_insensitive_scheme() {
        assert_eq!(
            super::detect_text_content_type("HTTPS://EXAMPLE.COM"),
            ContentType::Link
        );
    }

    #[test]
    fn detect_text_content_type_url_with_spaces_is_text() {
        assert_eq!(
            super::detect_text_content_type("https://example.com some extra text"),
            ContentType::Text
        );
    }

    #[test]
    fn detect_text_content_type_plain_text_is_text() {
        assert_eq!(
            super::detect_text_content_type("hello world"),
            ContentType::Text
        );
    }

    #[test]
    fn detect_text_content_type_empty_string_is_text() {
        assert_eq!(super::detect_text_content_type(""), ContentType::Text);
    }

    // ── detect_files_content_type tests ──

    fn make_single_file_item(name: &str) -> Vec<ClipboardFileItem> {
        let extension = std::path::Path::new(name)
            .extension()
            .map(|ext| ext.to_string_lossy().to_string());
        vec![ClipboardFileItem {
            path: PathBuf::from(name),
            display_name: name.to_string(),
            entry_type: crate::clipboard::query::FileEntryType::File,
            extension,
        }]
    }

    fn make_single_directory_item() -> Vec<ClipboardFileItem> {
        vec![ClipboardFileItem {
            path: PathBuf::from("/tmp/folder"),
            display_name: "folder".to_string(),
            entry_type: crate::clipboard::query::FileEntryType::Directory,
            extension: None,
        }]
    }

    #[test]
    fn detect_files_content_type_single_png_is_image() {
        assert_eq!(
            super::detect_files_content_type(&make_single_file_item("photo.png")),
            ContentType::Image
        );
    }

    #[test]
    fn detect_files_content_type_single_heic_is_image() {
        assert_eq!(
            super::detect_files_content_type(&make_single_file_item("photo.heic")),
            ContentType::Image
        );
    }

    #[test]
    fn detect_files_content_type_single_mp4_is_video() {
        assert_eq!(
            super::detect_files_content_type(&make_single_file_item("clip.mp4")),
            ContentType::Video
        );
    }

    #[test]
    fn detect_files_content_type_single_mp3_is_audio() {
        assert_eq!(
            super::detect_files_content_type(&make_single_file_item("song.mp3")),
            ContentType::Audio
        );
    }

    #[test]
    fn detect_files_content_type_single_pdf_is_document() {
        assert_eq!(
            super::detect_files_content_type(&make_single_file_item("report.pdf")),
            ContentType::Document
        );
    }

    #[test]
    fn detect_files_content_type_single_docx_is_document() {
        assert_eq!(
            super::detect_files_content_type(&make_single_file_item("essay.docx")),
            ContentType::Document
        );
    }

    #[test]
    fn detect_files_content_type_single_unknown_ext_is_files() {
        assert_eq!(
            super::detect_files_content_type(&make_single_file_item("data.bin")),
            ContentType::Files
        );
    }

    #[test]
    fn detect_files_content_type_single_directory_is_files() {
        assert_eq!(
            super::detect_files_content_type(&make_single_directory_item()),
            ContentType::Files
        );
    }

    #[test]
    fn detect_files_content_type_multiple_files_is_files() {
        let mut items = make_single_file_item("a.png");
        items.extend(make_single_file_item("b.mp4"));
        assert_eq!(super::detect_files_content_type(&items), ContentType::Files);
    }

    #[test]
    fn detect_files_content_type_extension_case_insensitive() {
        assert_eq!(
            super::detect_files_content_type(&make_single_file_item("photo.JPG")),
            ContentType::Image
        );
    }

    // ── search_summaries tests ──

    #[test]
    fn search_summaries_returns_matching_text_records() {
        let context = TestContext::new("search-text-match");
        let repository = context.repository();

        repository
            .capture_text("会议纪要 2026-03-10".to_string(), None, None, 1_000)
            .expect("text capture should succeed");
        repository
            .capture_text("购物清单".to_string(), None, None, 2_000)
            .expect("text capture should succeed");

        let results = repository
            .search_summaries("会议", None, 10)
            .expect("search should succeed");

        assert_eq!(results.len(), 1);
        assert!(results[0].preview_text.contains("会议"));
    }

    #[test]
    fn search_summaries_with_type_filter_narrows_results() {
        let context = TestContext::new("search-type-filter");
        let repository = context.repository();

        repository
            .capture_text("https://example.com".to_string(), None, None, 1_000)
            .expect("link capture should succeed");
        repository
            .capture_text("普通文本 example".to_string(), None, None, 2_000)
            .expect("text capture should succeed");

        let all_results = repository
            .search_summaries("example", None, 10)
            .expect("search should succeed");
        assert_eq!(all_results.len(), 2);

        let link_results = repository
            .search_summaries("example", Some(ContentType::Link), 10)
            .expect("search with filter should succeed");
        assert_eq!(link_results.len(), 1);
        assert_eq!(link_results[0].content_type, ContentType::Link);
    }

    #[test]
    fn search_summaries_empty_query_returns_all() {
        let context = TestContext::new("search-empty-query");
        let repository = context.repository();

        repository
            .capture_text("some text".to_string(), None, None, 1_000)
            .expect("text capture should succeed");

        let results = repository
            .search_summaries("", None, 10)
            .expect("empty search should succeed");
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn search_summaries_no_match_returns_empty() {
        let context = TestContext::new("search-no-match");
        let repository = context.repository();

        repository
            .capture_text("hello world".to_string(), None, None, 1_000)
            .expect("text capture should succeed");

        let results = repository
            .search_summaries("不存在的关键字", None, 10)
            .expect("search should succeed");
        assert!(results.is_empty());
    }

    fn unique_test_dir(suffix: &str) -> PathBuf {
        static NEXT_TEST_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        let unique_id = NEXT_TEST_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        env::temp_dir().join(format!(
            "clipboard-manager-runtime-repository-test-{suffix}-{nanos}-{unique_id}"
        ))
    }
}
