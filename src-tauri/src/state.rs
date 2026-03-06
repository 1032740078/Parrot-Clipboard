#![allow(dead_code)]

use std::sync::Arc;

use crate::{
    clipboard::{
        monitor::{ClipboardMonitorControl, DomainEventEmitter},
        runtime_repository::ClipboardRuntimeRepository,
    },
    config::AppConfig,
    image::ImageStorageService,
    logging::LoggingState,
    paste::PasteService,
    persistence::SqliteConnectionManager,
    window::WindowManager,
};

pub struct AppState {
    pub config: AppConfig,
    pub database: Arc<SqliteConnectionManager>,
    pub image_storage: Arc<ImageStorageService>,
    pub repository: Arc<dyn ClipboardRuntimeRepository>,
    pub monitor: Arc<dyn ClipboardMonitorControl>,
    pub paste_service: Arc<PasteService>,
    pub window_manager: Arc<dyn WindowManager>,
    pub event_emitter: Arc<dyn DomainEventEmitter>,
    pub logging_state: LoggingState,
}
