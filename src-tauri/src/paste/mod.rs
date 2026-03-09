use std::{path::PathBuf, sync::Arc, time::Duration};

use crate::{
    clipboard::{
        query::{ClipboardRecordDetail, PasteResult},
        runtime_repository::ClipboardRuntimeRepository,
        types::{ContentType, PasteMode, RecordId},
    },
    error::AppError,
    image::ImageStorageService,
    ocr::ImageTextRecognizer,
    platform::{PlatformClipboard, PlatformKeySimulator},
    window::{panel_auto_hide::PanelAutoHideCoordinator, WindowManager},
};

pub mod text_strip;

const PRE_PASTE_SETTLE_DELAY_MS: u64 = 140;

pub struct PasteService {
    repository: Arc<dyn ClipboardRuntimeRepository>,
    monitor: Arc<dyn crate::clipboard::monitor::ClipboardMonitorControl>,
    platform_clipboard: Arc<dyn PlatformClipboard>,
    platform_key_sim: Arc<dyn PlatformKeySimulator>,
    window_manager: Arc<dyn WindowManager>,
    image_storage: Arc<ImageStorageService>,
    image_text_recognizer: Arc<dyn ImageTextRecognizer>,
    panel_auto_hide: Arc<PanelAutoHideCoordinator>,
}

impl PasteService {
    pub fn new(
        repository: Arc<dyn ClipboardRuntimeRepository>,
        monitor: Arc<dyn crate::clipboard::monitor::ClipboardMonitorControl>,
        platform_clipboard: Arc<dyn PlatformClipboard>,
        platform_key_sim: Arc<dyn PlatformKeySimulator>,
        window_manager: Arc<dyn WindowManager>,
        image_storage: Arc<ImageStorageService>,
        image_text_recognizer: Arc<dyn ImageTextRecognizer>,
        panel_auto_hide: Arc<PanelAutoHideCoordinator>,
    ) -> Self {
        Self {
            repository,
            monitor,
            platform_clipboard,
            platform_key_sim,
            window_manager,
            image_storage,
            image_text_recognizer,
            panel_auto_hide,
        }
    }

    pub async fn paste_record(
        &self,
        id: RecordId,
        mode: PasteMode,
    ) -> Result<PasteResult, AppError> {
        tracing::debug!(record_id = id.value(), ?mode, "paste flow started");
        let _auto_hide_guard = if mode == PasteMode::PlainText {
            Some(self.panel_auto_hide.suspend())
        } else {
            None
        };

        let result = async {
            let detail = self
                .repository
                .get_detail(id)?
                .ok_or_else(|| AppError::RecordNotFound(id.value()))?;

            match detail.content_type {
                ContentType::Image if mode == PasteMode::PlainText => {
                    let recognized_text = self.recognize_image_text(&detail).await?;
                    self.commit_paste(&detail, mode, Some(recognized_text.as_str()))
                        .await
                }
                _ => self.commit_paste(&detail, mode, None).await,
            }
        }
        .await;

        match &result {
            Ok(result) => tracing::info!(record_id = result.record.id, "paste flow completed"),
            Err(error) => {
                tracing::error!(record_id = id.value(), error = %error, "paste flow failed")
            }
        }
        result
    }

    async fn recognize_image_text(
        &self,
        detail: &ClipboardRecordDetail,
    ) -> Result<String, AppError> {
        let image_detail = detail
            .image_detail
            .as_ref()
            .ok_or_else(|| AppError::ClipboardRead("image detail missing".to_string()))?;
        let image = self
            .image_storage
            .load_original(&image_detail.original_path)?;
        let recognizer = self.image_text_recognizer.clone();

        tokio::task::spawn_blocking(move || recognizer.recognize_image_text(&image))
            .await
            .map_err(|error| {
                AppError::Internal(format!("join OCR recognition task failed: {error}"))
            })?
    }

    async fn commit_paste(
        &self,
        detail: &ClipboardRecordDetail,
        mode: PasteMode,
        recognized_image_text: Option<&str>,
    ) -> Result<PasteResult, AppError> {
        self.monitor.pause();
        let result = async {
            write_detail_to_clipboard(
                &*self.platform_clipboard,
                &self.image_storage,
                detail,
                mode,
                recognized_image_text,
            )?;
            self.monitor.sync_clipboard_state()?;
            self.window_manager.hide()?;
            tokio::time::sleep(Duration::from_millis(PRE_PASTE_SETTLE_DELAY_MS)).await;
            self.platform_key_sim.simulate_paste()?;
            let executed_at = now_ms();
            let record = self
                .repository
                .promote(RecordId::new(detail.id), executed_at)?;

            Ok(PasteResult {
                record,
                paste_mode: mode,
                executed_at,
            })
        }
        .await;
        self.monitor.resume();

        result
    }
}

fn write_detail_to_clipboard(
    clipboard: &dyn PlatformClipboard,
    image_storage: &ImageStorageService,
    detail: &ClipboardRecordDetail,
    mode: PasteMode,
    recognized_image_text: Option<&str>,
) -> Result<(), AppError> {
    match detail.content_type {
        ContentType::Text => write_text_detail(clipboard, detail, mode),
        ContentType::Image => {
            if mode == PasteMode::PlainText {
                return clipboard.write_text(recognized_image_text.ok_or_else(|| {
                    AppError::ClipboardRead("recognized image text missing".to_string())
                })?);
            }
            let image_detail = detail
                .image_detail
                .as_ref()
                .ok_or_else(|| AppError::ClipboardRead("image detail missing".to_string()))?;
            let image = image_storage.load_original(&image_detail.original_path)?;
            clipboard.write_image(&image)
        }
        ContentType::Files => {
            let files_detail = detail
                .files_detail
                .as_ref()
                .ok_or_else(|| AppError::ClipboardRead("files detail missing".to_string()))?;
            match mode {
                PasteMode::Original => {
                    let paths = files_detail
                        .items
                        .iter()
                        .map(|item| PathBuf::from(&item.path))
                        .collect::<Vec<_>>();
                    clipboard.write_file_list(&paths)
                }
                PasteMode::PlainText => {
                    let joined_paths = files_detail
                        .items
                        .iter()
                        .map(|item| item.path.as_str())
                        .collect::<Vec<_>>()
                        .join("\n");
                    clipboard.write_text(&joined_paths)
                }
            }
        }
    }
}

fn write_text_detail(
    clipboard: &dyn PlatformClipboard,
    detail: &ClipboardRecordDetail,
    mode: PasteMode,
) -> Result<(), AppError> {
    let text = detail
        .text_content
        .as_deref()
        .ok_or_else(|| AppError::ClipboardRead("text detail missing".to_string()))?;

    match mode {
        PasteMode::Original => {
            if let Some(rich_content) = detail.rich_content.as_deref() {
                clipboard.write_html(rich_content, text)
            } else {
                clipboard.write_text(text)
            }
        }
        PasteMode::PlainText => clipboard.write_text(&text_strip::strip_to_plain_text(text)),
    }
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};

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
    };

    use crate::{
        clipboard::{
            monitor::ClipboardMonitorControl,
            query::{
                ClipboardRecordDetail, ClipboardRecordSummary, FilesDetail, FilesMeta, ImageDetail,
                ImageMeta, PasteResult, TextMeta, ThumbnailState,
            },
            runtime_repository::ClipboardRuntimeRepository,
            types::{ContentType, PasteMode, RecordId},
        },
        error::AppError,
        image::ImageStorageService,
        ocr::ImageTextRecognizer,
        platform::{PlatformClipboard, PlatformKeySimulator},
        window::{panel_auto_hide::PanelAutoHideCoordinator, WindowManager},
    };

    use super::PasteService;

    struct MockRepository {
        detail: Option<ClipboardRecordDetail>,
        promoted_ids: Arc<Mutex<Vec<u64>>>,
    }

    impl ClipboardRuntimeRepository for MockRepository {
        fn capture_text(
            &self,
            _text: String,
            _rich_content: Option<String>,
            _captured_at: i64,
        ) -> Result<crate::clipboard::runtime_repository::CaptureResult, AppError> {
            unreachable!()
        }
        fn capture_image(
            &self,
            _image: crate::clipboard::payload::ClipboardImageData,
            _captured_at: i64,
        ) -> Result<crate::clipboard::runtime_repository::CaptureResult, AppError> {
            unreachable!()
        }
        fn capture_files(
            &self,
            _items: Vec<crate::clipboard::payload::ClipboardFileItem>,
            _captured_at: i64,
        ) -> Result<crate::clipboard::runtime_repository::CaptureResult, AppError> {
            unreachable!()
        }
        fn list_summaries(&self, _limit: usize) -> Result<Vec<ClipboardRecordSummary>, AppError> {
            Ok(Vec::new())
        }
        fn get_detail(&self, id: RecordId) -> Result<Option<ClipboardRecordDetail>, AppError> {
            Ok(self.detail.clone().filter(|detail| detail.id == id.value()))
        }
        fn update_text(
            &self,
            _id: RecordId,
            _text: String,
            _updated_at: i64,
        ) -> Result<ClipboardRecordDetail, AppError> {
            unreachable!()
        }
        fn promote(
            &self,
            id: RecordId,
            promoted_at: i64,
        ) -> Result<ClipboardRecordSummary, AppError> {
            self.promoted_ids
                .lock()
                .expect("promoted_ids lock poisoned")
                .push(id.value());
            let mut detail = self
                .detail
                .clone()
                .ok_or_else(|| AppError::RecordNotFound(id.value()))?;
            detail.last_used_at = promoted_at;
            Ok(detail.into())
        }
        fn delete(&self, _id: RecordId) -> Result<RecordId, AppError> {
            Err(AppError::RecordNotFound(1))
        }
        fn clear_history(
            &self,
        ) -> Result<crate::clipboard::runtime_repository::ClearHistoryStats, AppError> {
            Ok(crate::clipboard::runtime_repository::ClearHistoryStats::default())
        }
        fn finalize_pending_image(
            &self,
            _id: RecordId,
        ) -> Result<
            (
                crate::clipboard::runtime_repository::RecordUpdateReason,
                ClipboardRecordSummary,
            ),
            AppError,
        > {
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

    #[derive(Default)]
    struct MockMonitor {
        trace: Mutex<Vec<&'static str>>,
    }

    impl ClipboardMonitorControl for MockMonitor {
        fn pause(&self) {
            self.trace
                .lock()
                .expect("trace lock poisoned")
                .push("pause");
        }
        fn resume(&self) {
            self.trace
                .lock()
                .expect("trace lock poisoned")
                .push("resume");
        }
        fn sync_clipboard_state(&self) -> Result<(), AppError> {
            self.trace.lock().expect("trace lock poisoned").push("sync");
            Ok(())
        }
        fn is_paused(&self) -> bool {
            false
        }
        fn is_monitoring(&self) -> bool {
            true
        }
    }

    #[derive(Default)]
    struct MockClipboard {
        trace: Arc<Mutex<Vec<&'static str>>>,
        written_texts: Arc<Mutex<Vec<String>>>,
        written_images: Arc<Mutex<Vec<crate::clipboard::payload::ClipboardImageData>>>,
        written_file_lists: Arc<Mutex<Vec<Vec<PathBuf>>>>,
    }

    impl PlatformClipboard for MockClipboard {
        fn read_text(&self) -> Result<Option<String>, AppError> {
            Ok(None)
        }
        fn read_html(&self) -> Result<Option<String>, AppError> {
            Ok(None)
        }
        fn read_image(
            &self,
        ) -> Result<Option<crate::clipboard::payload::ClipboardImageData>, AppError> {
            Ok(None)
        }
        fn read_file_list(&self) -> Result<Option<Vec<PathBuf>>, AppError> {
            Ok(None)
        }
        fn write_text(&self, _text: &str) -> Result<(), AppError> {
            self.trace
                .lock()
                .expect("trace lock poisoned")
                .push("write_text");
            self.written_texts
                .lock()
                .expect("written_texts lock poisoned")
                .push(_text.to_string());
            Ok(())
        }
        fn write_html(&self, _html: &str, _alt_text: &str) -> Result<(), AppError> {
            self.trace
                .lock()
                .expect("trace lock poisoned")
                .push("write_html");
            Ok(())
        }
        fn write_image(
            &self,
            _image: &crate::clipboard::payload::ClipboardImageData,
        ) -> Result<(), AppError> {
            self.trace
                .lock()
                .expect("trace lock poisoned")
                .push("write_image");
            self.written_images
                .lock()
                .expect("written_images lock poisoned")
                .push(_image.clone());
            Ok(())
        }
        fn write_file_list(&self, _file_list: &[PathBuf]) -> Result<(), AppError> {
            self.trace
                .lock()
                .expect("trace lock poisoned")
                .push("write_file_list");
            self.written_file_lists
                .lock()
                .expect("written_file_lists lock poisoned")
                .push(_file_list.to_vec());
            Ok(())
        }
        fn change_count(&self) -> u64 {
            0
        }
    }

    struct MockKeySimulator {
        trace: Arc<Mutex<Vec<&'static str>>>,
    }
    impl PlatformKeySimulator for MockKeySimulator {
        fn simulate_paste(&self) -> Result<(), AppError> {
            self.trace
                .lock()
                .expect("trace lock poisoned")
                .push("simulate_paste");
            Ok(())
        }
    }

    struct MockWindowManager {
        trace: Arc<Mutex<Vec<&'static str>>>,
    }
    impl WindowManager for MockWindowManager {
        fn show(&self) -> Result<(), AppError> {
            Ok(())
        }
        fn hide(&self) -> Result<(), AppError> {
            self.trace.lock().expect("trace lock poisoned").push("hide");
            Ok(())
        }
        fn toggle(&self) -> Result<bool, AppError> {
            Ok(false)
        }
        fn is_visible(&self) -> Result<bool, AppError> {
            Ok(false)
        }
    }

    struct MockImageTextRecognizer {
        recognized_text: Option<String>,
        error_message: Option<String>,
        trace: Arc<Mutex<Vec<&'static str>>>,
    }

    impl ImageTextRecognizer for MockImageTextRecognizer {
        fn recognize_image_text(
            &self,
            _image: &crate::clipboard::payload::ClipboardImageData,
        ) -> Result<String, AppError> {
            self.trace.lock().expect("trace lock poisoned").push("ocr");
            if let Some(text) = self.recognized_text.as_ref() {
                return Ok(text.clone());
            }

            Err(AppError::Internal(
                self.error_message
                    .clone()
                    .unwrap_or_else(|| "OCR failed".to_string()),
            ))
        }
    }

    #[tokio::test]
    async fn ut_paste_001_text_original_steps_execute_in_order() {
        let shared_trace = Arc::new(Mutex::new(Vec::<&'static str>::new()));
        let promoted_ids = Arc::new(Mutex::new(Vec::<u64>::new()));
        let detail = text_detail(1, Some("<p>Hello</p>".to_string()));

        let repository = Arc::new(MockRepository {
            detail: Some(detail),
            promoted_ids: promoted_ids.clone(),
        });
        let monitor = Arc::new(MockMonitor::default());
        let clipboard = Arc::new(MockClipboard {
            trace: shared_trace.clone(),
            written_texts: Arc::new(Mutex::new(Vec::new())),
            written_images: Arc::new(Mutex::new(Vec::new())),
            written_file_lists: Arc::new(Mutex::new(Vec::new())),
        });
        let key_sim = Arc::new(MockKeySimulator {
            trace: shared_trace.clone(),
        });
        let window_manager = Arc::new(MockWindowManager {
            trace: shared_trace.clone(),
        });
        let image_storage = Arc::new(
            ImageStorageService::initialize_at(
                temp_dir("paste-001/original"),
                temp_dir("paste-001/thumbs"),
            )
            .expect("image storage should init"),
        );

        let service = PasteService::new(
            repository,
            monitor.clone(),
            clipboard,
            key_sim,
            window_manager,
            image_storage,
            Arc::new(MockImageTextRecognizer {
                recognized_text: Some("Hello".to_string()),
                error_message: None,
                trace: shared_trace.clone(),
            }),
            PanelAutoHideCoordinator::new(),
        );
        let result = service
            .paste_record(RecordId::new(1), PasteMode::Original)
            .await;

        assert!(matches!(result, Ok(PasteResult { .. })));
        let monitor_trace = monitor.trace.lock().expect("trace lock poisoned").clone();
        assert_eq!(monitor_trace, vec!["pause", "sync", "resume"]);
        let trace = shared_trace.lock().expect("trace lock poisoned").clone();
        assert_eq!(trace, vec!["write_html", "hide", "simulate_paste"]);
        assert_eq!(
            promoted_ids
                .lock()
                .expect("promoted lock poisoned")
                .as_slice(),
            &[1]
        );
    }

    #[tokio::test]
    async fn ut_paste_002_text_plain_mode_writes_plain_text_only() {
        let shared_trace = Arc::new(Mutex::new(Vec::<&'static str>::new()));
        let promoted_ids = Arc::new(Mutex::new(Vec::<u64>::new()));
        let detail = text_detail(2, Some("<p>Hello</p><p>World</p>".to_string()));

        let repository = Arc::new(MockRepository {
            detail: Some(detail),
            promoted_ids: promoted_ids.clone(),
        });
        let monitor = Arc::new(MockMonitor::default());
        let clipboard = Arc::new(MockClipboard {
            trace: shared_trace.clone(),
            written_texts: Arc::new(Mutex::new(Vec::new())),
            written_images: Arc::new(Mutex::new(Vec::new())),
            written_file_lists: Arc::new(Mutex::new(Vec::new())),
        });
        let key_sim = Arc::new(MockKeySimulator {
            trace: shared_trace.clone(),
        });
        let window_manager = Arc::new(MockWindowManager {
            trace: shared_trace.clone(),
        });
        let image_storage = Arc::new(
            ImageStorageService::initialize_at(
                temp_dir("paste-002/original"),
                temp_dir("paste-002/thumbs"),
            )
            .expect("image storage should init"),
        );

        let service = PasteService::new(
            repository,
            monitor.clone(),
            clipboard.clone(),
            key_sim,
            window_manager,
            image_storage,
            Arc::new(MockImageTextRecognizer {
                recognized_text: Some("Hello".to_string()),
                error_message: None,
                trace: shared_trace.clone(),
            }),
            PanelAutoHideCoordinator::new(),
        );
        let result = service
            .paste_record(RecordId::new(2), PasteMode::PlainText)
            .await;

        assert!(matches!(result, Ok(PasteResult { .. })));
        assert_eq!(
            monitor.trace.lock().expect("trace lock poisoned").clone(),
            vec!["pause", "sync", "resume"]
        );
        assert_eq!(
            shared_trace.lock().expect("trace lock poisoned").clone(),
            vec!["write_text", "hide", "simulate_paste"]
        );
        assert_eq!(
            clipboard
                .written_texts
                .lock()
                .expect("written_texts lock poisoned")
                .as_slice(),
            &["Hello".to_string()]
        );
        assert_eq!(
            promoted_ids
                .lock()
                .expect("promoted lock poisoned")
                .as_slice(),
            &[2]
        );
    }

    #[tokio::test]
    async fn ut_paste_003_image_original_restores_image_bytes() {
        let shared_trace = Arc::new(Mutex::new(Vec::<&'static str>::new()));
        let promoted_ids = Arc::new(Mutex::new(Vec::<u64>::new()));
        let image_storage = Arc::new(
            ImageStorageService::initialize_at(
                temp_dir("paste-003/original"),
                temp_dir("paste-003/thumbs"),
            )
            .expect("image storage should init"),
        );
        let original_image = sample_image(4, 4, 123);
        let saved = image_storage
            .save_original("paste-image", &original_image)
            .expect("original image should be saved");
        let detail = image_detail_with_path(3, saved.original_path.clone(), 4, 4, saved.byte_size);

        let repository = Arc::new(MockRepository {
            detail: Some(detail),
            promoted_ids: promoted_ids.clone(),
        });
        let monitor = Arc::new(MockMonitor::default());
        let clipboard = Arc::new(MockClipboard {
            trace: shared_trace.clone(),
            written_texts: Arc::new(Mutex::new(Vec::new())),
            written_images: Arc::new(Mutex::new(Vec::new())),
            written_file_lists: Arc::new(Mutex::new(Vec::new())),
        });
        let key_sim = Arc::new(MockKeySimulator {
            trace: shared_trace.clone(),
        });
        let window_manager = Arc::new(MockWindowManager {
            trace: shared_trace.clone(),
        });

        let service = PasteService::new(
            repository,
            monitor.clone(),
            clipboard.clone(),
            key_sim,
            window_manager,
            image_storage,
            Arc::new(MockImageTextRecognizer {
                recognized_text: Some("图片里的文字".to_string()),
                error_message: None,
                trace: shared_trace.clone(),
            }),
            PanelAutoHideCoordinator::new(),
        );
        let result = service
            .paste_record(RecordId::new(3), PasteMode::Original)
            .await;

        assert!(matches!(result, Ok(PasteResult { .. })));
        assert_eq!(
            monitor.trace.lock().expect("trace lock poisoned").clone(),
            vec!["pause", "sync", "resume"]
        );
        assert_eq!(
            shared_trace.lock().expect("trace lock poisoned").clone(),
            vec!["write_image", "hide", "simulate_paste"]
        );
        let written_images = clipboard
            .written_images
            .lock()
            .expect("written_images lock poisoned")
            .clone();
        assert_eq!(written_images.as_slice(), &[original_image]);
        assert_eq!(
            promoted_ids
                .lock()
                .expect("promoted lock poisoned")
                .as_slice(),
            &[3]
        );
    }

    #[tokio::test]
    async fn ut_paste_004_files_original_restores_file_list() {
        let shared_trace = Arc::new(Mutex::new(Vec::<&'static str>::new()));
        let promoted_ids = Arc::new(Mutex::new(Vec::<u64>::new()));
        let file_paths = sample_file_paths("paste-004/files");
        let detail = files_detail_with_items(4, &file_paths);

        let repository = Arc::new(MockRepository {
            detail: Some(detail),
            promoted_ids: promoted_ids.clone(),
        });
        let monitor = Arc::new(MockMonitor::default());
        let clipboard = Arc::new(MockClipboard {
            trace: shared_trace.clone(),
            written_texts: Arc::new(Mutex::new(Vec::new())),
            written_images: Arc::new(Mutex::new(Vec::new())),
            written_file_lists: Arc::new(Mutex::new(Vec::new())),
        });
        let key_sim = Arc::new(MockKeySimulator {
            trace: shared_trace.clone(),
        });
        let window_manager = Arc::new(MockWindowManager {
            trace: shared_trace.clone(),
        });
        let image_storage = Arc::new(
            ImageStorageService::initialize_at(
                temp_dir("paste-004/original"),
                temp_dir("paste-004/thumbs"),
            )
            .expect("image storage should init"),
        );

        let service = PasteService::new(
            repository,
            monitor.clone(),
            clipboard.clone(),
            key_sim,
            window_manager,
            image_storage,
            Arc::new(MockImageTextRecognizer {
                recognized_text: Some("文件".to_string()),
                error_message: None,
                trace: shared_trace.clone(),
            }),
            PanelAutoHideCoordinator::new(),
        );
        let result = service
            .paste_record(RecordId::new(4), PasteMode::Original)
            .await;

        assert!(matches!(result, Ok(PasteResult { .. })));
        assert_eq!(
            monitor.trace.lock().expect("trace lock poisoned").clone(),
            vec!["pause", "sync", "resume"]
        );
        assert_eq!(
            shared_trace.lock().expect("trace lock poisoned").clone(),
            vec!["write_file_list", "hide", "simulate_paste"]
        );
        let written_file_lists = clipboard
            .written_file_lists
            .lock()
            .expect("written_file_lists lock poisoned")
            .clone();
        assert_eq!(
            written_file_lists.as_slice(),
            std::slice::from_ref(&file_paths)
        );
        assert_eq!(
            promoted_ids
                .lock()
                .expect("promoted lock poisoned")
                .as_slice(),
            &[4]
        );
    }

    #[tokio::test]
    async fn ut_paste_005_image_plain_mode_runs_ocr_before_hiding_panel() {
        let image_storage = Arc::new(
            ImageStorageService::initialize_at(
                temp_dir("paste-005/original"),
                temp_dir("paste-005/thumbs"),
            )
            .expect("image storage should init"),
        );
        let original_image = sample_image(6, 6, 77);
        let saved = image_storage
            .save_original("paste-plain-image", &original_image)
            .expect("original image should be saved");
        let repository = Arc::new(MockRepository {
            detail: Some(image_detail_with_path(
                2,
                saved.original_path.clone(),
                6,
                6,
                saved.byte_size,
            )),
            promoted_ids: Arc::new(Mutex::new(vec![])),
        });
        let trace = Arc::new(Mutex::new(Vec::<&'static str>::new()));
        let monitor = Arc::new(MockMonitor::default());
        let clipboard = Arc::new(MockClipboard {
            trace: trace.clone(),
            written_texts: Arc::new(Mutex::new(Vec::new())),
            written_images: Arc::new(Mutex::new(Vec::new())),
            written_file_lists: Arc::new(Mutex::new(Vec::new())),
        });
        let service = PasteService::new(
            repository,
            monitor.clone(),
            clipboard.clone(),
            Arc::new(MockKeySimulator {
                trace: trace.clone(),
            }),
            Arc::new(MockWindowManager {
                trace: trace.clone(),
            }),
            image_storage,
            Arc::new(MockImageTextRecognizer {
                recognized_text: Some("图片里的文字".to_string()),
                error_message: None,
                trace: trace.clone(),
            }),
            PanelAutoHideCoordinator::new(),
        );

        let result = service
            .paste_record(RecordId::new(2), PasteMode::PlainText)
            .await;
        assert!(matches!(result, Ok(PasteResult { .. })));
        assert_eq!(
            clipboard
                .written_texts
                .lock()
                .expect("written_texts lock poisoned")
                .as_slice(),
            &["图片里的文字".to_string()]
        );
        assert_eq!(
            trace.lock().expect("trace lock poisoned").clone(),
            vec!["ocr", "write_text", "hide", "simulate_paste"]
        );
        assert_eq!(
            monitor.trace.lock().expect("trace lock poisoned").clone(),
            vec!["pause", "sync", "resume"]
        );
    }

    #[tokio::test]
    async fn ut_paste_006_files_plain_mode_writes_newline_joined_paths() {
        let file_paths = sample_file_paths("paste-006/files-plain");
        let repository = Arc::new(MockRepository {
            detail: Some(files_detail_with_items(6, &file_paths)),
            promoted_ids: Arc::new(Mutex::new(Vec::new())),
        });
        let trace = Arc::new(Mutex::new(Vec::<&'static str>::new()));
        let clipboard = Arc::new(MockClipboard {
            trace: trace.clone(),
            written_texts: Arc::new(Mutex::new(Vec::new())),
            written_images: Arc::new(Mutex::new(Vec::new())),
            written_file_lists: Arc::new(Mutex::new(Vec::new())),
        });
        let promoted_ids = repository.promoted_ids.clone();
        let service = PasteService::new(
            repository,
            Arc::new(MockMonitor::default()),
            clipboard.clone(),
            Arc::new(MockKeySimulator {
                trace: trace.clone(),
            }),
            Arc::new(MockWindowManager {
                trace: trace.clone(),
            }),
            Arc::new(
                ImageStorageService::initialize_at(
                    temp_dir("paste-006/original"),
                    temp_dir("paste-006/thumbs"),
                )
                .expect("image storage should init"),
            ),
            Arc::new(MockImageTextRecognizer {
                recognized_text: Some("文件路径".to_string()),
                error_message: None,
                trace: trace.clone(),
            }),
            PanelAutoHideCoordinator::new(),
        );

        service
            .paste_record(RecordId::new(6), PasteMode::PlainText)
            .await
            .expect("files plain-text paste should succeed");

        assert_eq!(
            trace.lock().expect("trace lock poisoned").clone(),
            vec!["write_text", "hide", "simulate_paste"]
        );
        assert_eq!(
            clipboard
                .written_texts
                .lock()
                .expect("written_texts lock poisoned")
                .as_slice(),
            &[file_paths
                .iter()
                .map(|path| path.to_string_lossy().to_string())
                .collect::<Vec<_>>()
                .join("\n")]
        );
        assert_eq!(
            promoted_ids
                .lock()
                .expect("promoted lock poisoned")
                .as_slice(),
            &[6]
        );
    }

    fn text_detail(id: u64, rich_content: Option<String>) -> ClipboardRecordDetail {
        ClipboardRecordDetail {
            id,
            content_type: ContentType::Text,
            preview_text: "Hello".to_string(),
            source_app: Some("Notes".to_string()),
            created_at: 1000,
            last_used_at: 1000,
            text_meta: Some(TextMeta {
                char_count: 5,
                line_count: 1,
            }),
            image_meta: None,
            files_meta: None,
            text_content: Some("Hello".to_string()),
            rich_content,
            image_detail: None,
            files_detail: None,
        }
    }

    fn image_detail_with_path(
        id: u64,
        original_path: String,
        pixel_width: i64,
        pixel_height: i64,
        byte_size: i64,
    ) -> ClipboardRecordDetail {
        ClipboardRecordDetail {
            id,
            content_type: ContentType::Image,
            preview_text: "图片".to_string(),
            source_app: None,
            created_at: 1000,
            last_used_at: 1000,
            text_meta: None,
            image_meta: Some(ImageMeta {
                mime_type: "image/png".to_string(),
                pixel_width,
                pixel_height,
                thumbnail_path: Some("/tmp/thumb.png".to_string()),
                thumbnail_state: ThumbnailState::Ready,
            }),
            files_meta: None,
            text_content: None,
            rich_content: None,
            image_detail: Some(ImageDetail {
                original_path,
                mime_type: "image/png".to_string(),
                pixel_width,
                pixel_height,
                byte_size,
            }),
            files_detail: None,
        }
    }

    fn files_detail_with_items(id: u64, paths: &[PathBuf]) -> ClipboardRecordDetail {
        ClipboardRecordDetail {
            id,
            content_type: ContentType::Files,
            preview_text: format!(
                "{} 等 {} 项",
                paths[0]
                    .file_name()
                    .expect("file name should exist")
                    .to_string_lossy(),
                paths.len()
            ),
            source_app: None,
            created_at: 1000,
            last_used_at: 1000,
            text_meta: None,
            image_meta: None,
            files_meta: Some(FilesMeta {
                count: paths.len(),
                primary_name: paths[0]
                    .file_name()
                    .expect("file name should exist")
                    .to_string_lossy()
                    .to_string(),
                contains_directory: paths.iter().any(|path| path.is_dir()),
            }),
            text_content: None,
            rich_content: None,
            image_detail: None,
            files_detail: Some(FilesDetail {
                items: paths
                    .iter()
                    .map(|path| crate::clipboard::query::FileItemDetail {
                        path: path.to_string_lossy().to_string(),
                        display_name: path
                            .file_name()
                            .expect("file name should exist")
                            .to_string_lossy()
                            .to_string(),
                        entry_type: if path.is_dir() {
                            crate::clipboard::query::FileEntryType::Directory
                        } else {
                            crate::clipboard::query::FileEntryType::File
                        },
                        extension: path
                            .extension()
                            .map(|ext| ext.to_string_lossy().to_string()),
                    })
                    .collect(),
            }),
        }
    }

    #[allow(dead_code)]
    fn files_detail(id: u64) -> ClipboardRecordDetail {
        ClipboardRecordDetail {
            id,
            content_type: ContentType::Files,
            preview_text: "A 等 2 项".to_string(),
            source_app: None,
            created_at: 1000,
            last_used_at: 1000,
            text_meta: None,
            image_meta: None,
            files_meta: Some(FilesMeta {
                count: 2,
                primary_name: "A".to_string(),
                contains_directory: false,
            }),
            text_content: None,
            rich_content: None,
            image_detail: None,
            files_detail: Some(FilesDetail { items: Vec::new() }),
        }
    }

    fn temp_dir(suffix: &str) -> PathBuf {
        std::env::temp_dir().join(format!("clipboard-manager-{suffix}"))
    }

    fn sample_image(
        width: usize,
        height: usize,
        seed: u8,
    ) -> crate::clipboard::payload::ClipboardImageData {
        let mut bytes = Vec::with_capacity(width * height * 4);
        for _ in 0..(width * height) {
            bytes.extend_from_slice(&[seed, seed, seed, 255]);
        }
        crate::clipboard::payload::ClipboardImageData {
            width,
            height,
            bytes,
        }
    }

    fn sample_file_paths(suffix: &str) -> Vec<PathBuf> {
        let root = temp_dir(suffix);
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).expect("sample files root should be created");

        let first = root.join("A.txt");
        std::fs::write(&first, "A").expect("first sample file should be written");

        let directory = root.join("Folder");
        std::fs::create_dir_all(&directory).expect("sample directory should be created");

        vec![first, directory]
    }
}
