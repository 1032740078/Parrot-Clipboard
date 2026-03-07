#![allow(dead_code)]

use std::sync::Arc;

use crate::{
    autostart::AutostartControl,
    clipboard::{
        monitor::{ClipboardMonitorControl, DomainEventEmitter},
        runtime_repository::ClipboardRuntimeRepository,
    },
    config::ConfigStore,
    image::{ImageCleanupService, ImageStorageService},
    logging::LoggingState,
    paste::PasteService,
    persistence::{MigrationStatus, SqliteConnectionManager},
    window::WindowManager,
};

pub struct AppState {
    pub config_store: Arc<ConfigStore>,
    pub autostart: Arc<dyn AutostartControl>,
    pub database: Arc<SqliteConnectionManager>,
    pub image_storage: Arc<ImageStorageService>,
    pub image_cleanup: Arc<ImageCleanupService>,
    pub repository: Arc<dyn ClipboardRuntimeRepository>,
    pub monitor: Arc<dyn ClipboardMonitorControl>,
    pub paste_service: Arc<PasteService>,
    pub window_manager: Arc<dyn WindowManager>,
    pub event_emitter: Arc<dyn DomainEventEmitter>,
    pub logging_state: LoggingState,
    pub migration_status: MigrationStatus,
}
