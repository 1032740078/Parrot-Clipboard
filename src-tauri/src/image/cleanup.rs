use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::{diagnostics::CleanupSummary, error::AppError, persistence::SqliteConnectionManager};

use super::ImageStorageService;

#[derive(Debug, Clone)]
pub struct ImageCleanupService {
    database: Arc<SqliteConnectionManager>,
    image_storage: Arc<ImageStorageService>,
    last_cleanup: Arc<Mutex<Option<CleanupSummary>>>,
}

#[derive(Debug, Default)]
struct FileRemovalOutcome {
    deleted_files: usize,
    failed_paths: Vec<String>,
}

impl ImageCleanupService {
    pub fn new(
        database: Arc<SqliteConnectionManager>,
        image_storage: Arc<ImageStorageService>,
    ) -> Self {
        Self {
            database,
            image_storage,
            last_cleanup: Arc::new(Mutex::new(None)),
        }
    }

    pub fn last_cleanup_summary(&self) -> Option<CleanupSummary> {
        self.last_cleanup
            .lock()
            .expect("orphan cleanup state lock poisoned")
            .clone()
    }

    pub fn run_orphan_cleanup(&self) -> Result<CleanupSummary, AppError> {
        let orphaned = self.database.scan_orphaned_image_files(
            self.image_storage.original_dir(),
            self.image_storage.thumbnail_dir(),
        )?;
        let original_outcome = remove_files(&orphaned.original_files);
        let thumbnail_outcome = remove_files(&orphaned.thumbnail_files);
        let summary = CleanupSummary {
            deleted_original_files: original_outcome.deleted_files,
            deleted_thumbnail_files: thumbnail_outcome.deleted_files,
            executed_at: now_ms(),
        };

        *self
            .last_cleanup
            .lock()
            .expect("orphan cleanup state lock poisoned") = Some(summary.clone());

        for failed_path in &original_outcome.failed_paths {
            tracing::warn!(path = %failed_path, "remove orphan original image failed");
        }
        for failed_path in &thumbnail_outcome.failed_paths {
            tracing::warn!(path = %failed_path, "remove orphan thumbnail image failed");
        }

        tracing::info!(
            scanned_original_files = orphaned.original_files.len(),
            scanned_thumbnail_files = orphaned.thumbnail_files.len(),
            deleted_original_files = summary.deleted_original_files,
            deleted_thumbnail_files = summary.deleted_thumbnail_files,
            failed_original_files = original_outcome.failed_paths.len(),
            failed_thumbnail_files = thumbnail_outcome.failed_paths.len(),
            executed_at = summary.executed_at,
            "orphan image cleanup completed"
        );

        Ok(summary)
    }
}

fn remove_files(paths: &[PathBuf]) -> FileRemovalOutcome {
    let mut outcome = FileRemovalOutcome::default();
    for path in paths {
        match remove_file(path) {
            Ok(true) => outcome.deleted_files += 1,
            Ok(false) => {}
            Err(error) => {
                tracing::warn!(path = %path.display(), error = %error, "remove orphan image file failed");
                outcome.failed_paths.push(path.display().to_string());
            }
        }
    }
    outcome
}

fn remove_file(path: &Path) -> Result<bool, AppError> {
    if !path.exists() {
        return Ok(false);
    }

    fs::remove_file(path).map_err(|error| {
        AppError::FileAccess(format!(
            "remove orphan image file `{}` failed: {error}",
            path.display()
        ))
    })?;
    Ok(true)
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use std::{
        env, fs,
        path::{Path, PathBuf},
        sync::Arc,
        time::{SystemTime, UNIX_EPOCH},
    };

    use crate::{error::AppError, persistence::SqliteConnectionManager};

    use super::ImageCleanupService;
    use crate::image::ImageStorageService;

    #[test]
    fn run_orphan_cleanup_removes_unreferenced_files_and_updates_summary() {
        let context = TestContext::new();

        let referenced_original = context.original_dir.join("referenced.png");
        let referenced_thumbnail = context.thumbnail_dir.join("referenced-thumb.png");
        let orphan_original = context.original_dir.join("orphan.png");
        let orphan_thumbnail = context.thumbnail_dir.join("orphan-thumb.png");

        fs::write(&referenced_original, b"referenced").expect("referenced original should exist");
        fs::write(&referenced_thumbnail, b"referenced-thumb")
            .expect("referenced thumbnail should exist");
        fs::write(&orphan_original, b"orphan").expect("orphan original should exist");
        fs::write(&orphan_thumbnail, b"orphan-thumb").expect("orphan thumbnail should exist");

        seed_referenced_record(
            &context.database,
            &referenced_original,
            &referenced_thumbnail,
        );

        let summary = context
            .service
            .run_orphan_cleanup()
            .expect("orphan cleanup should succeed");

        assert_eq!(summary.deleted_original_files, 1);
        assert_eq!(summary.deleted_thumbnail_files, 1);
        assert!(!orphan_original.exists());
        assert!(!orphan_thumbnail.exists());
        assert!(referenced_original.exists());
        assert!(referenced_thumbnail.exists());
        assert_eq!(context.service.last_cleanup_summary(), Some(summary));
    }

    struct TestContext {
        root_dir: PathBuf,
        original_dir: PathBuf,
        thumbnail_dir: PathBuf,
        database: Arc<SqliteConnectionManager>,
        service: ImageCleanupService,
    }

    impl TestContext {
        fn new() -> Self {
            static NEXT_TEST_ID: std::sync::atomic::AtomicU64 =
                std::sync::atomic::AtomicU64::new(1);
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time should be after unix epoch")
                .as_nanos();
            let unique_id = NEXT_TEST_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let root_dir =
                env::temp_dir().join(format!("clipboard-manager-image-cleanup-test-{nanos}-{unique_id}"));
            let original_dir = root_dir.join("images/original");
            let thumbnail_dir = root_dir.join("images/thumbs");
            fs::create_dir_all(&original_dir).expect("original dir should be created");
            fs::create_dir_all(&thumbnail_dir).expect("thumbnail dir should be created");

            let database = Arc::new(
                SqliteConnectionManager::initialize_at(&root_dir.join("clipboard.db"))
                    .expect("sqlite database should initialize"),
            );
            let image_storage = Arc::new(
                ImageStorageService::initialize_at(original_dir.clone(), thumbnail_dir.clone())
                    .expect("image storage should initialize"),
            );
            let service = ImageCleanupService::new(database.clone(), image_storage);

            Self {
                root_dir,
                original_dir,
                thumbnail_dir,
                database,
                service,
            }
        }
    }

    impl Drop for TestContext {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root_dir);
        }
    }

    fn seed_referenced_record(
        manager: &SqliteConnectionManager,
        original_path: &Path,
        thumbnail_path: &Path,
    ) {
        manager
            .with_connection(|connection| {
                connection
                    .execute_batch(&format!(
                        r#"
                        INSERT INTO clipboard_items (
                          id,
                          payload_type,
                          content_type,
                          content_hash,
                          text_content,
                          rich_content,
                          preview_text,
                          search_text,
                          source_app,
                          file_count,
                          payload_bytes,
                          created_at,
                          last_used_at
                        ) VALUES (
                          1,
                          'image',
                          'image',
                          'cleanup-image-hash',
                          NULL,
                          NULL,
                          'referenced image',
                          'referenced image',
                          'Preview',
                          0,
                          2048,
                          4100,
                          4100
                        );

                        INSERT INTO image_assets (
                          item_id,
                          original_path,
                          thumbnail_path,
                          mime_type,
                          pixel_width,
                          pixel_height,
                          byte_size,
                          thumbnail_state,
                          created_at
                        ) VALUES (
                          1,
                          '{original_path}',
                          '{thumbnail_path}',
                          'image/png',
                          1280,
                          720,
                          2048,
                          'ready',
                          4100
                        );
                        "#,
                        original_path = original_path.display(),
                        thumbnail_path = thumbnail_path.display(),
                    ))
                    .map_err(|error| {
                        AppError::Db(format!(
                            "seed referenced orphan cleanup record failed: {error}"
                        ))
                    })?;
                Ok(())
            })
            .expect("referenced cleanup seed data should be inserted");
    }
}
