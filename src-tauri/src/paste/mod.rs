use std::{sync::Arc, time::Duration};

use crate::{
    clipboard::{
        monitor::ClipboardMonitorControl,
        repository::ClipboardRecordRepository,
        types::{PasteMode, RecordId},
    },
    error::AppError,
    platform::{PlatformClipboard, PlatformKeySimulator},
    window::WindowManager,
};

pub mod text_strip;

pub struct PasteService {
    repository: Arc<dyn ClipboardRecordRepository>,
    monitor: Arc<dyn ClipboardMonitorControl>,
    platform_clipboard: Arc<dyn PlatformClipboard>,
    platform_key_sim: Arc<dyn PlatformKeySimulator>,
    window_manager: Arc<dyn WindowManager>,
}

impl PasteService {
    pub fn new(
        repository: Arc<dyn ClipboardRecordRepository>,
        monitor: Arc<dyn ClipboardMonitorControl>,
        platform_clipboard: Arc<dyn PlatformClipboard>,
        platform_key_sim: Arc<dyn PlatformKeySimulator>,
        window_manager: Arc<dyn WindowManager>,
    ) -> Self {
        Self {
            repository,
            monitor,
            platform_clipboard,
            platform_key_sim,
            window_manager,
        }
    }

    pub async fn paste_record(&self, id: RecordId, mode: PasteMode) -> Result<(), AppError> {
        tracing::debug!(record_id = id.value(), ?mode, "paste flow started");

        if mode != PasteMode::Original {
            tracing::warn!(record_id = id.value(), ?mode, "paste mode is unsupported");
            return Err(AppError::InvalidParam(format!(
                "Unsupported paste mode: {:?}",
                mode
            )));
        }

        self.monitor.pause();

        let result = async {
            let record = self
                .repository
                .get_by_id(id)
                .ok_or_else(|| AppError::RecordNotFound(id.value()))?;
            let text_length = record.text_content.chars().count();
            tracing::debug!(
                record_id = record.id,
                text_length,
                "paste flow loaded record metadata"
            );

            self.platform_clipboard.write_text(&record.text_content)?;
            self.window_manager.hide()?;
            tokio::time::sleep(Duration::from_millis(80)).await;
            self.platform_key_sim.simulate_paste()?;

            Ok(())
        }
        .await;

        self.monitor.resume();
        match &result {
            Ok(()) => tracing::info!(record_id = id.value(), "paste flow completed"),
            Err(error) => tracing::error!(
                record_id = id.value(),
                error = %error,
                "paste flow failed"
            ),
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use crate::{
        clipboard::{
            events::ClipboardDomainEvent,
            monitor::ClipboardMonitorControl,
            record::ClipboardRecord,
            repository::ClipboardRecordRepository,
            types::{ContentType, PasteMode, RecordId},
        },
        error::AppError,
        platform::{PlatformClipboard, PlatformKeySimulator},
        window::WindowManager,
    };

    use super::PasteService;

    struct MockRepository {
        record: Option<ClipboardRecord>,
    }

    impl ClipboardRecordRepository for MockRepository {
        fn add_text_record(
            &self,
            _text: String,
            _captured_at: i64,
        ) -> Result<Vec<ClipboardDomainEvent>, AppError> {
            Ok(Vec::new())
        }

        fn get_recent(&self, _limit: usize) -> Vec<ClipboardRecord> {
            Vec::new()
        }

        fn get_by_id(&self, id: RecordId) -> Option<ClipboardRecord> {
            self.record.clone().filter(|record| record.id == id.value())
        }

        fn delete(&self, _id: RecordId) -> Result<RecordId, AppError> {
            Err(AppError::RecordNotFound(1))
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

        fn is_paused(&self) -> bool {
            false
        }

        fn is_monitoring(&self) -> bool {
            true
        }
    }

    struct MockClipboard {
        trace: Arc<Mutex<Vec<&'static str>>>,
    }

    impl PlatformClipboard for MockClipboard {
        fn read_text(&self) -> Result<Option<String>, AppError> {
            Ok(None)
        }

        fn write_text(&self, _text: &str) -> Result<(), AppError> {
            self.trace
                .lock()
                .expect("trace lock poisoned")
                .push("write_text");
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

    #[tokio::test]
    async fn ut_paste_001_steps_execute_in_order() {
        let shared_trace = Arc::new(Mutex::new(Vec::<&'static str>::new()));

        let repository = Arc::new(MockRepository {
            record: Some(ClipboardRecord {
                id: 1,
                content_type: ContentType::Text,
                text_content: "Hello".to_string(),
                created_at: 1000,
            }),
        });

        let monitor = Arc::new(MockMonitor::default());
        let clipboard = Arc::new(MockClipboard {
            trace: shared_trace.clone(),
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
            clipboard,
            key_sim,
            window_manager,
        );

        let result = service
            .paste_record(RecordId::new(1), PasteMode::Original)
            .await;

        assert!(result.is_ok());

        let monitor_trace = monitor.trace.lock().expect("trace lock poisoned").clone();
        assert_eq!(monitor_trace, vec!["pause", "resume"]);

        let trace = shared_trace.lock().expect("trace lock poisoned").clone();
        assert_eq!(trace, vec!["write_text", "hide", "simulate_paste"]);
    }

    #[tokio::test]
    async fn ut_paste_002_not_found_returns_error() {
        let repository = Arc::new(MockRepository { record: None });
        let monitor = Arc::new(MockMonitor::default());
        let trace = Arc::new(Mutex::new(Vec::<&'static str>::new()));

        let service = PasteService::new(
            repository,
            monitor,
            Arc::new(MockClipboard {
                trace: trace.clone(),
            }),
            Arc::new(MockKeySimulator {
                trace: trace.clone(),
            }),
            Arc::new(MockWindowManager { trace }),
        );

        let result = service
            .paste_record(RecordId::new(999), PasteMode::Original)
            .await;

        assert!(matches!(result, Err(AppError::RecordNotFound(999))));
    }
}
