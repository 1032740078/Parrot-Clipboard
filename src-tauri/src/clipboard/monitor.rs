#![allow(dead_code)]

use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, RwLock,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use crate::{
    config::ConfigStore,
    error::AppError,
    platform::{PlatformActiveAppDetector, PlatformClipboard},
};

use super::{
    filter::match_blacklist_rule,
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

    fn emit_monitoring_changed(&self, monitoring: bool, changed_at: i64) -> Result<(), AppError>;

    fn emit_history_cleared(
        &self,
        deleted_records: usize,
        deleted_image_assets: usize,
        executed_at: i64,
    ) -> Result<(), AppError>;
}

pub trait ClipboardMonitorControl: Send + Sync {
    fn pause(&self);
    fn resume(&self);
    fn sync_clipboard_state(&self) -> Result<(), AppError>;
    fn is_paused(&self) -> bool;
    fn is_monitoring(&self) -> bool;
}

struct PrivacyFilterContext {
    config_store: Arc<ConfigStore>,
    active_app_detector: Arc<dyn PlatformActiveAppDetector>,
}

pub struct ClipboardMonitorService {
    repository: Arc<dyn ClipboardRuntimeRepository>,
    clipboard: Arc<dyn PlatformClipboard>,
    emitter: Arc<dyn DomainEventEmitter>,
    privacy_filter: Option<PrivacyFilterContext>,
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
            privacy_filter: None,
            poll_interval,
            is_running: AtomicBool::new(false),
            is_paused: AtomicBool::new(false),
            last_change_count: AtomicU64::new(0),
            last_signature: RwLock::new(None),
        }
    }

    pub fn new_with_privacy(
        repository: Arc<dyn ClipboardRuntimeRepository>,
        clipboard: Arc<dyn PlatformClipboard>,
        emitter: Arc<dyn DomainEventEmitter>,
        config_store: Arc<ConfigStore>,
        active_app_detector: Arc<dyn PlatformActiveAppDetector>,
        poll_interval: Duration,
    ) -> Self {
        Self {
            repository,
            clipboard,
            emitter,
            privacy_filter: Some(PrivacyFilterContext {
                config_store,
                active_app_detector,
            }),
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

        if self.should_skip_capture_by_blacklist() {
            return Ok(());
        }

        let now = now_ms();
        let capture = match snapshot {
            ClipboardSnapshot::Empty => return Ok(()),
            ClipboardSnapshot::Text { text, rich_content } => {
                self.repository.capture_text(text, rich_content, now)?
            }
            ClipboardSnapshot::Image(image) => self.repository.capture_image(image, now)?,
            ClipboardSnapshot::Files(items) => self.repository.capture_files(items, now)?,
        };
        let should_finalize_image = capture.action == CaptureAction::Added
            && capture.record.content_type == crate::clipboard::types::ContentType::Image;

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

        if should_finalize_image {
            self.spawn_image_thumbnail_processing(RecordId::new(capture.record.id));
        }

        Ok(())
    }

    fn should_skip_capture_by_blacklist(&self) -> bool {
        let Some(privacy_filter) = &self.privacy_filter else {
            return false;
        };

        let rules = privacy_filter
            .config_store
            .current()
            .privacy
            .blacklist_rules;
        if rules.iter().all(|rule| !rule.enabled) {
            return false;
        }

        let active_application = match privacy_filter
            .active_app_detector
            .detect_active_application()
        {
            Ok(Some(active_application)) => active_application,
            Ok(None) => return false,
            Err(error) => {
                tracing::warn!(error = %error, "read active application failed, blacklist filter skipped");
                return false;
            }
        };

        let Some(rule) = match_blacklist_rule(&rules, &active_application) else {
            return false;
        };

        tracing::info!(
            app_name = active_application.display_name().unwrap_or("unknown"),
            platform = ?rule.platform,
            match_type = ?rule.match_type,
            app_identifier = %rule.app_identifier,
            "clipboard capture skipped by blacklist"
        );
        true
    }

    fn spawn_image_thumbnail_processing(&self, id: RecordId) {
        let repository = self.repository.clone();
        let emitter = self.emitter.clone();

        tauri::async_runtime::spawn(async move {
            match repository.finalize_pending_image(id) {
                Ok((reason, record)) => {
                    if let Err(error) = emitter.emit_record_updated(reason, record) {
                        tracing::error!(record_id = id.value(), error = %error, "emit thumbnail update failed");
                    }
                }
                Err(error) => {
                    tracing::error!(record_id = id.value(), error = %error, "finalize image thumbnail failed");
                }
            }
        });
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
        fs,
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
        config::{
            schema::{BlacklistMatchType, BlacklistRule, PlatformKind},
            AppConfig, ConfigStore,
        },
        error::AppError,
        platform::{ActiveApplication, PlatformActiveAppDetector, PlatformClipboard},
    };

    use super::{ClipboardMonitorService, DomainEventEmitter};

    #[test]
    fn poll_once_reads_image_snapshot_and_emits_new_record() {
        let repository = Arc::new(MockRepository::new(CaptureResult {
            action: CaptureAction::Added,
            record: image_summary_pending(7, 1_000),
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

    #[test]
    fn poll_once_finalizes_image_thumbnail_and_emits_update() {
        let repository = Arc::new(MockRepository::new_with_finalize(
            CaptureResult {
                action: CaptureAction::Added,
                record: image_summary_pending(11, 1_000),
                evicted_ids: Vec::new(),
            },
            Some((
                RecordUpdateReason::ThumbnailReady,
                image_summary_ready(11, 1_000),
            )),
        ));
        let clipboard = Arc::new(MockClipboard {
            text: None,
            html: None,
            image: Some(sample_image(99)),
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

        for _ in 0..20 {
            if !emitter
                .updated_records
                .lock()
                .expect("updated_records lock poisoned")
                .is_empty()
            {
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }

        assert_eq!(repository.capture_image_calls(), 1);
        assert_eq!(repository.processed_image_ids(), vec![11]);
        let new_records = emitter
            .new_records
            .lock()
            .expect("new_records lock poisoned")
            .clone();
        assert_eq!(new_records.len(), 1);
        assert_eq!(new_records[0].id, 11);
        assert_eq!(
            new_records[0]
                .image_meta
                .as_ref()
                .expect("image meta should exist")
                .thumbnail_state,
            ThumbnailState::Pending
        );

        let updated_records = emitter
            .updated_records
            .lock()
            .expect("updated_records lock poisoned")
            .clone();
        assert_eq!(updated_records.len(), 1);
        assert_eq!(updated_records[0].0, RecordUpdateReason::ThumbnailReady);
        assert_eq!(
            updated_records[0]
                .1
                .image_meta
                .as_ref()
                .expect("image meta should exist")
                .thumbnail_state,
            ThumbnailState::Ready
        );
    }

    #[test]
    fn poll_once_emits_promoted_update_for_reused_record() {
        let context = TestPathContext::new("monitor-promoted-files");
        let paths = context.sample_paths();
        let repository = Arc::new(MockRepository::new(CaptureResult {
            action: CaptureAction::Promoted,
            record: files_summary(21, 2_000),
            evicted_ids: Vec::new(),
        }));
        let clipboard = Arc::new(MockClipboard {
            text: None,
            html: None,
            image: None,
            files: Some(paths),
            change_count: 1,
        });
        let emitter = Arc::new(MockEmitter::default());
        let service = ClipboardMonitorService::new(
            repository,
            clipboard,
            emitter.clone(),
            Duration::from_millis(10),
        );

        service.poll_once().expect("files poll should succeed");

        let updated_records = emitter
            .updated_records
            .lock()
            .expect("updated_records lock poisoned")
            .clone();
        assert_eq!(updated_records.len(), 1);
        assert_eq!(updated_records[0].0, RecordUpdateReason::Promoted);
        assert_eq!(updated_records[0].1.id, 21);
        assert!(emitter
            .new_records
            .lock()
            .expect("new_records lock poisoned")
            .is_empty());
    }

    #[test]
    fn poll_once_skips_capture_when_active_application_hits_blacklist() {
        let repository = Arc::new(MockRepository::new(CaptureResult {
            action: CaptureAction::Added,
            record: image_summary_pending(31, 1_000),
            evicted_ids: Vec::new(),
        }));
        let clipboard = Arc::new(MockClipboard {
            text: Some("敏感文本".to_string()),
            html: None,
            image: None,
            files: None,
            change_count: 1,
        });
        let emitter = Arc::new(MockEmitter::default());
        let config_store = config_store_with_rules(vec![BlacklistRule {
            id: "blr_windows_app_id_wechat".to_string(),
            app_name: "微信".to_string(),
            platform: PlatformKind::Windows,
            match_type: BlacklistMatchType::AppId,
            app_identifier: "wechat.exe".to_string(),
            enabled: true,
            created_at: 1,
            updated_at: 1,
        }]);
        let active_app_detector = Arc::new(MockActiveAppDetector {
            active_application: Some(ActiveApplication {
                platform: PlatformKind::Windows,
                app_name: Some("WeChat".to_string()),
                bundle_id: None,
                process_name: Some("wechat.exe".to_string()),
                app_id: Some("wechat.exe".to_string()),
                wm_class: None,
            }),
            error_message: None,
        });
        let service = ClipboardMonitorService::new_with_privacy(
            repository.clone(),
            clipboard,
            emitter.clone(),
            config_store,
            active_app_detector,
            Duration::from_millis(10),
        );

        service
            .poll_once()
            .expect("blacklist filter should succeed");

        assert_eq!(repository.capture_text_calls(), 0);
        assert_eq!(repository.capture_image_calls(), 0);
        assert_eq!(repository.capture_files_calls(), 0);
        assert!(emitter
            .new_records
            .lock()
            .expect("new_records lock poisoned")
            .is_empty());
        assert!(emitter
            .updated_records
            .lock()
            .expect("updated_records lock poisoned")
            .is_empty());
    }

    #[test]
    fn poll_once_continues_capture_when_detector_returns_error() {
        let repository = Arc::new(MockRepository::new(CaptureResult {
            action: CaptureAction::Added,
            record: image_summary_pending(35, 1_000),
            evicted_ids: Vec::new(),
        }));
        let clipboard = Arc::new(MockClipboard {
            text: Some("放行文本".to_string()),
            html: None,
            image: None,
            files: None,
            change_count: 1,
        });
        let emitter = Arc::new(MockEmitter::default());
        let config_store = config_store_with_rules(vec![BlacklistRule {
            id: "blr_windows_app_id_wechat".to_string(),
            app_name: "微信".to_string(),
            platform: PlatformKind::Windows,
            match_type: BlacklistMatchType::AppId,
            app_identifier: "wechat.exe".to_string(),
            enabled: true,
            created_at: 1,
            updated_at: 1,
        }]);
        let active_app_detector = Arc::new(MockActiveAppDetector {
            active_application: None,
            error_message: Some("foreground lookup failed".to_string()),
        });
        let service = ClipboardMonitorService::new_with_privacy(
            repository.clone(),
            clipboard,
            emitter.clone(),
            config_store,
            active_app_detector,
            Duration::from_millis(10),
        );

        service
            .poll_once()
            .expect("detector error should not block capture");

        assert_eq!(repository.capture_text_calls(), 1);
        assert_eq!(
            emitter
                .new_records
                .lock()
                .expect("new_records lock poisoned")
                .len(),
            1
        );
    }

    #[test]
    fn poll_once_continues_capture_when_blacklist_rule_is_disabled() {
        let repository = Arc::new(MockRepository::new(CaptureResult {
            action: CaptureAction::Added,
            record: image_summary_pending(41, 1_000),
            evicted_ids: Vec::new(),
        }));
        let clipboard = Arc::new(MockClipboard {
            text: Some("普通文本".to_string()),
            html: None,
            image: None,
            files: None,
            change_count: 1,
        });
        let emitter = Arc::new(MockEmitter::default());
        let config_store = config_store_with_rules(vec![BlacklistRule {
            id: "blr_windows_app_id_disabled".to_string(),
            app_name: "微信".to_string(),
            platform: PlatformKind::Windows,
            match_type: BlacklistMatchType::AppId,
            app_identifier: "wechat.exe".to_string(),
            enabled: false,
            created_at: 1,
            updated_at: 1,
        }]);
        let active_app_detector = Arc::new(MockActiveAppDetector {
            active_application: Some(ActiveApplication {
                platform: PlatformKind::Windows,
                app_name: Some("WeChat".to_string()),
                bundle_id: None,
                process_name: Some("wechat.exe".to_string()),
                app_id: Some("wechat.exe".to_string()),
                wm_class: None,
            }),
            error_message: None,
        });
        let service = ClipboardMonitorService::new_with_privacy(
            repository.clone(),
            clipboard,
            emitter.clone(),
            config_store,
            active_app_detector,
            Duration::from_millis(10),
        );

        service
            .poll_once()
            .expect("disabled blacklist rule should not block capture");

        assert_eq!(repository.capture_text_calls(), 1);
        assert_eq!(
            emitter
                .new_records
                .lock()
                .expect("new_records lock poisoned")
                .len(),
            1
        );
    }

    #[test]
    fn poll_once_reads_file_list_before_image_and_text() {
        let context = TestPathContext::new("monitor-files-priority");
        let paths = context.sample_paths();
        let repository = Arc::new(MockRepository::new(CaptureResult {
            action: CaptureAction::Added,
            record: files_summary(9, 1_000),
            evicted_ids: Vec::new(),
        }));
        let clipboard = Arc::new(MockClipboard {
            text: Some("ignored text".to_string()),
            html: Some("<p>ignored text</p>".to_string()),
            image: Some(sample_image(55)),
            files: Some(paths.clone()),
            change_count: 1,
        });
        let emitter = Arc::new(MockEmitter::default());
        let service = ClipboardMonitorService::new(
            repository.clone(),
            clipboard,
            emitter.clone(),
            Duration::from_millis(10),
        );

        service.poll_once().expect("files poll should succeed");

        assert_eq!(repository.capture_files_calls(), 1);
        assert_eq!(repository.capture_image_calls(), 0);
        assert_eq!(repository.capture_text_calls(), 0);

        let captured = repository
            .captured_file_items(0)
            .expect("captured file items should exist");
        assert_eq!(captured.len(), 3);
        assert_eq!(
            captured
                .iter()
                .map(|item| item.path.clone())
                .collect::<Vec<_>>(),
            paths
        );
        assert_eq!(captured[0].display_name, "note.txt");
        assert_eq!(
            captured[1].entry_type,
            crate::clipboard::query::FileEntryType::Directory
        );
        assert_eq!(captured[2].extension.as_deref(), Some("zip"));

        let new_records = emitter
            .new_records
            .lock()
            .expect("new_records lock poisoned")
            .clone();
        assert_eq!(new_records.len(), 1);
        assert_eq!(new_records[0].id, 9);
    }

    struct MockRepository {
        result: CaptureResult,
        finalize_result: Mutex<Option<(RecordUpdateReason, ClipboardRecordSummary)>>,
        processed_image_ids: Mutex<Vec<u64>>,
        capture_texts: Mutex<Vec<String>>,
        capture_images: Mutex<Vec<ClipboardImageData>>,
        capture_files: Mutex<Vec<Vec<crate::clipboard::payload::ClipboardFileItem>>>,
    }

    impl MockRepository {
        fn new(result: CaptureResult) -> Self {
            Self::new_with_finalize(result, None)
        }

        fn new_with_finalize(
            result: CaptureResult,
            finalize_result: Option<(RecordUpdateReason, ClipboardRecordSummary)>,
        ) -> Self {
            Self {
                result,
                finalize_result: Mutex::new(finalize_result),
                processed_image_ids: Mutex::new(Vec::new()),
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

        fn captured_file_items(
            &self,
            index: usize,
        ) -> Option<Vec<crate::clipboard::payload::ClipboardFileItem>> {
            self.capture_files
                .lock()
                .expect("capture_files lock poisoned")
                .get(index)
                .cloned()
        }

        fn processed_image_ids(&self) -> Vec<u64> {
            self.processed_image_ids
                .lock()
                .expect("processed_image_ids lock poisoned")
                .clone()
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
                .push(items);
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

        fn clear_history(
            &self,
        ) -> Result<crate::clipboard::runtime_repository::ClearHistoryStats, AppError> {
            unreachable!()
        }

        fn finalize_pending_image(
            &self,
            id: RecordId,
        ) -> Result<(RecordUpdateReason, ClipboardRecordSummary), AppError> {
            self.processed_image_ids
                .lock()
                .expect("processed_image_ids lock poisoned")
                .push(id.value());
            self.finalize_result
                .lock()
                .expect("finalize_result lock poisoned")
                .clone()
                .ok_or_else(|| AppError::InvalidParam("no finalize result configured".to_string()))
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

    struct MockActiveAppDetector {
        active_application: Option<ActiveApplication>,
        error_message: Option<String>,
    }

    impl PlatformActiveAppDetector for MockActiveAppDetector {
        fn detect_active_application(&self) -> Result<Option<ActiveApplication>, AppError> {
            if let Some(message) = &self.error_message {
                return Err(AppError::MonitorControl(message.clone()));
            }

            Ok(self.active_application.clone())
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

        fn emit_monitoring_changed(
            &self,
            _monitoring: bool,
            _changed_at: i64,
        ) -> Result<(), AppError> {
            Ok(())
        }

        fn emit_history_cleared(
            &self,
            _deleted_records: usize,
            _deleted_image_assets: usize,
            _executed_at: i64,
        ) -> Result<(), AppError> {
            Ok(())
        }
    }

    fn image_summary_pending(id: u64, last_used_at: i64) -> ClipboardRecordSummary {
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
                thumbnail_path: None,
                thumbnail_state: ThumbnailState::Pending,
            }),
            files_meta: None,
        }
    }

    fn image_summary_ready(id: u64, last_used_at: i64) -> ClipboardRecordSummary {
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

    fn files_summary(id: u64, last_used_at: i64) -> ClipboardRecordSummary {
        ClipboardRecordSummary {
            id,
            content_type: ContentType::Files,
            preview_text: "note.txt 等 3 项".to_string(),
            source_app: None,
            created_at: 1_000,
            last_used_at,
            text_meta: None,
            image_meta: None,
            files_meta: Some(crate::clipboard::query::FilesMeta {
                count: 3,
                primary_name: "note.txt".to_string(),
                contains_directory: true,
            }),
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

    fn config_store_with_rules(rules: Vec<BlacklistRule>) -> Arc<ConfigStore> {
        let suffix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        let config_path = std::env::temp_dir()
            .join(format!("clipboard-manager-monitor-config-{suffix}"))
            .join("config.json");
        let store =
            ConfigStore::initialize_at_path(config_path).expect("config store should initialize");
        let mut config = AppConfig::default();
        config.privacy.blacklist_rules = rules;
        store.replace(config).expect("config should persist");
        store
    }

    struct TestPathContext {
        root_dir: PathBuf,
    }

    impl TestPathContext {
        fn new(suffix: &str) -> Self {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time should be after unix epoch")
                .as_nanos();
            let root_dir = std::env::temp_dir()
                .join(format!("clipboard-manager-monitor-test-{suffix}-{nanos}"));
            fs::create_dir_all(&root_dir).expect("monitor test root dir should be created");
            Self { root_dir }
        }

        fn sample_paths(&self) -> Vec<PathBuf> {
            let fixtures_dir = self.root_dir.join("fixtures");
            fs::create_dir_all(&fixtures_dir).expect("fixtures dir should be created");

            let text_file = fixtures_dir.join("note.txt");
            fs::write(&text_file, "hello").expect("text file should be written");

            let directory = fixtures_dir.join("folder");
            fs::create_dir_all(&directory).expect("directory should be created");

            let archive_file = fixtures_dir.join("archive.zip");
            fs::write(&archive_file, "zip").expect("archive file should be written");

            vec![text_file, directory, archive_file]
        }
    }

    impl Drop for TestPathContext {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root_dir);
        }
    }
}
