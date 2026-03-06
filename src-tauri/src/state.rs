#![allow(dead_code)]

use std::sync::Arc;

use crate::{
    clipboard::{
        monitor::{ClipboardMonitorControl, DomainEventEmitter},
        repository::ClipboardRecordRepository,
    },
    config::AppConfig,
    logging::LoggingState,
    paste::PasteService,
    window::WindowManager,
};

pub struct AppState {
    pub config: AppConfig,
    pub repository: Arc<dyn ClipboardRecordRepository>,
    pub monitor: Arc<dyn ClipboardMonitorControl>,
    pub paste_service: Arc<PasteService>,
    pub window_manager: Arc<dyn WindowManager>,
    pub event_emitter: Arc<dyn DomainEventEmitter>,
    pub logging_state: LoggingState,
}
