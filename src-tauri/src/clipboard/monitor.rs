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
    events::ClipboardDomainEvent, record::ClipboardRecord, repository::ClipboardRecordRepository,
    types::RecordId,
};

pub trait DomainEventEmitter: Send + Sync {
    fn emit_new_record(
        &self,
        record: ClipboardRecord,
        evicted_id: Option<RecordId>,
    ) -> Result<(), AppError>;

    fn emit_record_deleted(&self, id: RecordId) -> Result<(), AppError>;
}

pub trait ClipboardMonitorControl: Send + Sync {
    fn pause(&self);
    fn resume(&self);
    fn sync_clipboard_state(&self) -> Result<(), AppError>;
    fn is_paused(&self) -> bool;
    fn is_monitoring(&self) -> bool;
}

pub struct ClipboardMonitorService {
    repository: Arc<dyn ClipboardRecordRepository>,
    clipboard: Arc<dyn PlatformClipboard>,
    emitter: Arc<dyn DomainEventEmitter>,
    poll_interval: Duration,
    is_running: AtomicBool,
    is_paused: AtomicBool,
    last_change_count: AtomicU64,
    last_text: RwLock<Option<String>>,
}

impl ClipboardMonitorService {
    pub fn new(
        repository: Arc<dyn ClipboardRecordRepository>,
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
            last_text: RwLock::new(None),
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

        let Some(text) = self.clipboard.read_text()? else {
            return Ok(());
        };

        let last_text = self
            .last_text
            .read()
            .expect("last_text poisoned")
            .clone()
            .unwrap_or_default();

        let text_changed = last_text != text;
        let change_count_changed = change_count != previous;

        if !text_changed && !change_count_changed {
            return Ok(());
        }

        self.capture_snapshot(change_count, &text);

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis() as i64)
            .unwrap_or_default();
        let events = self.repository.add_text_record(text, now)?;

        let mut added: Option<ClipboardRecord> = None;
        let mut evicted: Option<RecordId> = None;

        for event in events {
            match event {
                ClipboardDomainEvent::RecordAdded { record } => added = Some(record),
                ClipboardDomainEvent::RecordEvicted { id } => evicted = Some(id),
                ClipboardDomainEvent::RecordRemoved { .. } => {}
            }
        }

        if let Some(record) = added {
            let text_len = record.text_content.chars().count();
            tracing::info!(
                record_id = record.id,
                text_len,
                evicted_id = evicted.as_ref().map(|id| id.value()),
                "clipboard record captured"
            );
            self.emitter.emit_new_record(record, evicted)?;
        }

        Ok(())
    }

    fn capture_snapshot(&self, change_count: u64, text: &str) {
        self.last_change_count.store(change_count, Ordering::SeqCst);
        *self.last_text.write().expect("last_text poisoned") = Some(text.to_string());
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
        let Some(text) = self.clipboard.read_text()? else {
            self.last_change_count.store(change_count, Ordering::SeqCst);
            *self.last_text.write().expect("last_text poisoned") = None;
            return Ok(());
        };

        self.capture_snapshot(change_count, &text);
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
