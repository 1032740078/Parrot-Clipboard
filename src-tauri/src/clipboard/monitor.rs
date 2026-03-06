#![allow(dead_code)]

use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, RwLock,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use crate::{error::AppError, platform::PlatformClipboard};

use super::{
    payload::{ClipboardFileItem, ClipboardSnapshot},
    query::ClipboardRecordSummary,
    runtime_repository::{
        CaptureAction, ClipboardRuntimeRepository, RecordDeleteReason, RecordUpdateReason,
    },
    types::RecordId,
};

pub trait DomainEventEmitter: Send + Sync {
    fn emit_new_record(
        &self,
        record: ClipboardRecordSummary,
        evicted_ids: Vec<u64>,
    ) -> Result<(), AppError>;

    fn emit_record_updated(
        &self,
        reason: RecordUpdateReason,
        record: ClipboardRecordSummary,
    ) -> Result<(), AppError>;

    fn emit_record_deleted(&self, id: RecordId, reason: RecordDeleteReason)
        -> Result<(), AppError>;
}

pub trait ClipboardMonitorControl: Send + Sync {
    fn pause(&self);
    fn resume(&self);
    fn sync_clipboard_state(&self) -> Result<(), AppError>;
    fn is_paused(&self) -> bool;
    fn is_monitoring(&self) -> bool;
}

pub struct ClipboardMonitorService {
    repository: Arc<dyn ClipboardRuntimeRepository>,
    clipboard: Arc<dyn PlatformClipboard>,
    emitter: Arc<dyn DomainEventEmitter>,
    poll_interval: Duration,
    is_running: AtomicBool,
    is_paused: AtomicBool,
    last_change_count: AtomicU64,
    last_signature: RwLock<Option<String>>,
}

impl ClipboardMonitorService {
    pub fn new(
        repository: Arc<dyn ClipboardRuntimeRepository>,
        clipboard: Arc<dyn PlatformClipboard>,
        emitter: Arc<dyn DomainEventEmitter>,
        poll_interval: Duration,
    ) -> Self {
        Self {
            repository,
            clipboard,
            emitter,
            poll_interval,
            is_running: AtomicBool::new(false),
            is_paused: AtomicBool::new(false),
            last_change_count: AtomicU64::new(0),
            last_signature: RwLock::new(None),
        }
    }

    pub fn start(self: Arc<Self>) {
        if self
            .is_running
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            tracing::debug!("clipboard monitor start ignored because it is already running");
            return;
        }

        tracing::info!(
            poll_interval_ms = self.poll_interval.as_millis(),
            "clipboard monitor started"
        );

        tauri::async_runtime::spawn(async move {
            loop {
                if !self.is_running.load(Ordering::SeqCst) {
                    tracing::info!("clipboard monitor loop stopped");
                    break;
                }

                if !self.is_paused.load(Ordering::SeqCst) {
                    if let Err(error) = self.poll_once() {
                        tracing::error!(error = %error, "clipboard monitor poll failed");
                    }
                }

                tokio::time::sleep(self.poll_interval).await;
            }
        });
    }

    pub fn stop(&self) {
        self.is_running.store(false, Ordering::SeqCst);
        tracing::info!("clipboard monitor stop requested");
    }

    pub fn poll_once(&self) -> Result<(), AppError> {
        let change_count = self.clipboard.change_count();
        let previous = self.last_change_count.load(Ordering::SeqCst);
        let snapshot = self.read_snapshot()?;
        let last_signature = self
            .last_signature
            .read()
            .expect("last_signature poisoned")
            .clone();
        let signature = snapshot.signature();

        if snapshot.is_empty() {
            self.capture_snapshot(change_count, None);
            return Ok(());
        }

        let change_count_changed = change_count != previous;
        let snapshot_changed = last_signature.as_deref() != Some(signature.as_str());
        if !change_count_changed && !snapshot_changed {
            return Ok(());
        }

        self.capture_snapshot(change_count, Some(signature));

        let now = now_ms();
        let capture = match snapshot {
            ClipboardSnapshot::Empty => return Ok(()),
            ClipboardSnapshot::Text { text, rich_content } => {
                self.repository.capture_text(text, rich_content, now)?
            }
            ClipboardSnapshot::Image(image) => self.repository.capture_image(image, now)?,
            ClipboardSnapshot::Files(items) => self.repository.capture_files(items, now)?,
        };

        match capture.action {
            CaptureAction::Added => {
                self.emitter
                    .emit_new_record(capture.record.clone(), capture.evicted_ids.clone())?;
            }
            CaptureAction::Promoted => {
                self.emitter
                    .emit_record_updated(RecordUpdateReason::Promoted, capture.record.clone())?;
            }
        }

        for id in capture.evicted_ids {
            self.emitter
                .emit_record_deleted(RecordId::new(id), RecordDeleteReason::Retention)?;
        }

        Ok(())
    }

    fn read_snapshot(&self) -> Result<ClipboardSnapshot, AppError> {
        if let Some(paths) = self.clipboard.read_file_list()? {
            let items = paths
                .into_iter()
                .map(ClipboardFileItem::from_path)
                .collect::<Vec<_>>();
            if !items.is_empty() {
                return Ok(ClipboardSnapshot::Files(items));
            }
        }

        if let Some(image) = self.clipboard.read_image()? {
            return Ok(ClipboardSnapshot::Image(image));
        }

        if let Some(text) = self.clipboard.read_text()? {
            let html = self.clipboard.read_html()?;
            return Ok(ClipboardSnapshot::Text {
                text,
                rich_content: html,
            });
        }

        Ok(ClipboardSnapshot::Empty)
    }

    fn capture_snapshot(&self, change_count: u64, signature: Option<String>) {
        self.last_change_count.store(change_count, Ordering::SeqCst);
        *self
            .last_signature
            .write()
            .expect("last_signature poisoned") = signature;
    }
}

impl ClipboardMonitorControl for ClipboardMonitorService {
    fn pause(&self) {
        self.is_paused.store(true, Ordering::SeqCst);
        tracing::debug!("clipboard monitor paused");
    }

    fn resume(&self) {
        self.is_paused.store(false, Ordering::SeqCst);
        tracing::debug!("clipboard monitor resumed");
    }

    fn sync_clipboard_state(&self) -> Result<(), AppError> {
        let change_count = self.clipboard.change_count();
        let snapshot = self.read_snapshot()?;
        let signature = if snapshot.is_empty() {
            None
        } else {
            Some(snapshot.signature())
        };
        self.capture_snapshot(change_count, signature);
        tracing::debug!(change_count, "clipboard monitor snapshot synced");
        Ok(())
    }

    fn is_paused(&self) -> bool {
        self.is_paused.load(Ordering::SeqCst)
    }

    fn is_monitoring(&self) -> bool {
        self.is_running.load(Ordering::SeqCst) && !self.is_paused.load(Ordering::SeqCst)
    }
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
        path::PathBuf,
        sync::{Arc, Mutex},
        time::Duration,
    };

    use crate::{
        clipboard::{
            payload::ClipboardImageData,
            query::{ClipboardRecordDetail, ClipboardRecordSummary, ImageMeta, ThumbnailState},
            runtime_repository::{
                CaptureAction, CaptureResult, ClipboardRuntimeRepository, RecordDeleteReason,
                RecordUpdateReason,
            },
            types::{ContentType, RecordId},
        },
        error::AppError,
        platform::PlatformClipboard,
    };

    use super::{ClipboardMonitorService, DomainEventEmitter};

    #[test]
    fn poll_once_reads_image_snapshot_and_emits_new_record() {
        let repository = Arc::new(MockRepository::new(CaptureResult {
            action: CaptureAction::Added,
            record: image_summary(7, 1_000),
            evicted_ids: Vec::new(),
        }));
        let clipboard = Arc::new(MockClipboard {
            text: Some("ignored text".to_string()),
            html: Some("<p>ignored text</p>".to_string()),
            image: Some(sample_image(88)),
            files: None,
            change_count: 1,
        });
        let emitter = Arc::new(MockEmitter::default());
        let service = ClipboardMonitorService::new(
            repository.clone(),
            clipboard,
            emitter.clone(),
            Duration::from_millis(10),
        );

        service.poll_once().expect("image poll should succeed");
        service
            .poll_once()
            .expect("duplicate image poll should be ignored");

        assert_eq!(repository.capture_image_calls(), 1);
        assert_eq!(repository.capture_text_calls(), 0);
        assert_eq!(repository.capture_files_calls(), 0);

        let new_records = emitter
            .new_records
            .lock()
            .expect("new_records lock poisoned")
            .clone();
        assert_eq!(new_records.len(), 1);
        assert_eq!(new_records[0].id, 7);

        assert!(emitter
            .updated_records
            .lock()
            .expect("updated_records lock poisoned")
            .is_empty());
        assert!(emitter
            .deleted_records
            .lock()
            .expect("deleted_records lock poisoned")
            .is_empty());
    }

    struct MockRepository {
        result: CaptureResult,
        capture_texts: Mutex<Vec<String>>,
        capture_images: Mutex<Vec<ClipboardImageData>>,
        capture_files: Mutex<Vec<usize>>,
    }

    impl MockRepository {
        fn new(result: CaptureResult) -> Self {
            Self {
                result,
                capture_texts: Mutex::new(Vec::new()),
                capture_images: Mutex::new(Vec::new()),
                capture_files: Mutex::new(Vec::new()),
            }
        }

        fn capture_text_calls(&self) -> usize {
            self.capture_texts
                .lock()
                .expect("capture_texts lock poisoned")
                .len()
        }

        fn capture_image_calls(&self) -> usize {
            self.capture_images
                .lock()
                .expect("capture_images lock poisoned")
                .len()
        }

        fn capture_files_calls(&self) -> usize {
            self.capture_files
                .lock()
                .expect("capture_files lock poisoned")
                .len()
        }
    }

    impl ClipboardRuntimeRepository for MockRepository {
        fn capture_text(
            &self,
            text: String,
            _rich_content: Option<String>,
            _captured_at: i64,
        ) -> Result<CaptureResult, AppError> {
            self.capture_texts
                .lock()
                .expect("capture_texts lock poisoned")
                .push(text);
            Ok(self.result.clone())
        }

        fn capture_image(
            &self,
            image: ClipboardImageData,
            _captured_at: i64,
        ) -> Result<CaptureResult, AppError> {
            self.capture_images
                .lock()
                .expect("capture_images lock poisoned")
                .push(image);
            Ok(self.result.clone())
        }

        fn capture_files(
            &self,
            items: Vec<crate::clipboard::payload::ClipboardFileItem>,
            _captured_at: i64,
        ) -> Result<CaptureResult, AppError> {
            self.capture_files
                .lock()
                .expect("capture_files lock poisoned")
                .push(items.len());
            Ok(self.result.clone())
        }

        fn list_summaries(&self, _limit: usize) -> Result<Vec<ClipboardRecordSummary>, AppError> {
            Ok(Vec::new())
        }

        fn get_detail(&self, _id: RecordId) -> Result<Option<ClipboardRecordDetail>, AppError> {
            Ok(None)
        }

        fn promote(
            &self,
            _id: RecordId,
            _promoted_at: i64,
        ) -> Result<ClipboardRecordSummary, AppError> {
            unreachable!()
        }

        fn delete(&self, _id: RecordId) -> Result<RecordId, AppError> {
            unreachable!()
        }

        fn mark_thumbnail_ready(
            &self,
            _id: RecordId,
            _thumbnail_path: String,
        ) -> Result<ClipboardRecordSummary, AppError> {
            unreachable!()
        }

        fn mark_thumbnail_failed(&self, _id: RecordId) -> Result<ClipboardRecordSummary, AppError> {
            unreachable!()
        }
    }

    struct MockClipboard {
        text: Option<String>,
        html: Option<String>,
        image: Option<ClipboardImageData>,
        files: Option<Vec<PathBuf>>,
        change_count: u64,
    }

    impl PlatformClipboard for MockClipboard {
        fn read_text(&self) -> Result<Option<String>, AppError> {
            Ok(self.text.clone())
        }

        fn read_html(&self) -> Result<Option<String>, AppError> {
            Ok(self.html.clone())
        }

        fn read_image(&self) -> Result<Option<ClipboardImageData>, AppError> {
            Ok(self.image.clone())
        }

        fn read_file_list(&self) -> Result<Option<Vec<PathBuf>>, AppError> {
            Ok(self.files.clone())
        }

        fn write_text(&self, _text: &str) -> Result<(), AppError> {
            unreachable!()
        }

        fn write_html(&self, _html: &str, _alt_text: &str) -> Result<(), AppError> {
            unreachable!()
        }

        fn write_image(&self, _image: &ClipboardImageData) -> Result<(), AppError> {
            unreachable!()
        }

        fn write_file_list(&self, _file_list: &[PathBuf]) -> Result<(), AppError> {
            unreachable!()
        }

        fn change_count(&self) -> u64 {
            self.change_count
        }
    }

    #[derive(Default)]
    struct MockEmitter {
        new_records: Mutex<Vec<ClipboardRecordSummary>>,
        updated_records: Mutex<Vec<(RecordUpdateReason, ClipboardRecordSummary)>>,
        deleted_records: Mutex<Vec<(u64, RecordDeleteReason)>>,
    }

    impl DomainEventEmitter for MockEmitter {
        fn emit_new_record(
            &self,
            record: ClipboardRecordSummary,
            _evicted_ids: Vec<u64>,
        ) -> Result<(), AppError> {
            self.new_records
                .lock()
                .expect("new_records lock poisoned")
                .push(record);
            Ok(())
        }

        fn emit_record_updated(
            &self,
            reason: RecordUpdateReason,
            record: ClipboardRecordSummary,
        ) -> Result<(), AppError> {
            self.updated_records
                .lock()
                .expect("updated_records lock poisoned")
                .push((reason, record));
            Ok(())
        }

        fn emit_record_deleted(
            &self,
            id: RecordId,
            reason: RecordDeleteReason,
        ) -> Result<(), AppError> {
            self.deleted_records
                .lock()
                .expect("deleted_records lock poisoned")
                .push((id.value(), reason));
            Ok(())
        }
    }

    fn image_summary(id: u64, last_used_at: i64) -> ClipboardRecordSummary {
        ClipboardRecordSummary {
            id,
            content_type: ContentType::Image,
            preview_text: "图片 2×2".to_string(),
            source_app: None,
            created_at: 1_000,
            last_used_at,
            text_meta: None,
            image_meta: Some(ImageMeta {
                mime_type: "image/png".to_string(),
                pixel_width: 2,
                pixel_height: 2,
                thumbnail_path: Some("/tmp/thumb.png".to_string()),
                thumbnail_state: ThumbnailState::Ready,
            }),
            files_meta: None,
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
}
