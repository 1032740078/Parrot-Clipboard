#![allow(unexpected_cfgs)]

mod clipboard;
mod config;
mod error;
mod ipc;
mod logging;
mod paste;
mod platform;
mod shortcut;
mod state;
mod window;

use std::{error::Error, sync::Arc, time::Duration};

use clipboard::{
    monitor::{ClipboardMonitorControl, ClipboardMonitorService, DomainEventEmitter},
    repository::{ClipboardRecordRepository, InMemoryClipboardRepository},
};
use ipc::events::TauriEventEmitter;
use paste::PasteService;
use platform::{
    MacosKeySimulator, MacosPlatformClipboard, PlatformClipboard, PlatformKeySimulator,
};
use shortcut::register_toggle_shortcut;
use state::AppState;
use tauri::Manager;
use tauri_plugin_global_shortcut::Builder as GlobalShortcutBuilder;
use window::{TauriWindowManager, WindowManager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(GlobalShortcutBuilder::new().build())
        .setup(|app| -> Result<(), Box<dyn Error>> {
            let app_handle = app.handle().clone();
            let logging_state =
                logging::init_logging(&app_handle).map_err(std::io::Error::other)?;
            tracing::info!("application setup started");
            let config = config::load_or_create(&app_handle).map_err(std::io::Error::other)?;

            let repository: Arc<dyn ClipboardRecordRepository> =
                Arc::new(InMemoryClipboardRepository::new(config.max_text_records));
            let window_manager: Arc<dyn WindowManager> =
                TauriWindowManager::new(app_handle.clone(), "main", 220.0);
            let event_emitter: Arc<dyn DomainEventEmitter> =
                Arc::new(TauriEventEmitter::new(app_handle.clone()));

            let platform_clipboard: Arc<dyn PlatformClipboard> =
                Arc::new(MacosPlatformClipboard::new()?);
            let platform_key_sim: Arc<dyn PlatformKeySimulator> = Arc::new(MacosKeySimulator);

            let monitor_service = Arc::new(ClipboardMonitorService::new(
                repository.clone(),
                platform_clipboard.clone(),
                event_emitter.clone(),
                Duration::from_millis(200),
            ));
            monitor_service.clone().start();
            let monitor: Arc<dyn ClipboardMonitorControl> = monitor_service;

            let paste_service = Arc::new(PasteService::new(
                repository.clone(),
                monitor.clone(),
                platform_clipboard,
                platform_key_sim,
                window_manager.clone(),
            ));

            register_toggle_shortcut(&app_handle, &config.toggle_shortcut, window_manager.clone())?;

            app.manage(AppState {
                config,
                repository,
                monitor,
                paste_service,
                window_manager,
                event_emitter,
                logging_state,
            });

            tracing::info!("application setup completed");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ipc::commands::get_records,
            ipc::commands::delete_record,
            ipc::commands::paste_record,
            ipc::commands::hide_panel,
            ipc::commands::get_monitoring_status,
            ipc::commands::write_client_log,
            ipc::commands::get_log_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
