#![allow(unexpected_cfgs)]

mod autostart;
mod clipboard;
mod config;
mod error;
mod image;
mod ipc;
mod logging;
mod paste;
mod persistence;
mod platform;
pub mod settings;
mod shortcut;
mod state;
mod tray;
mod window;

use std::{error::Error, sync::Arc, time::Duration};

use autostart::{create_autostart_service, AutostartControl};
use clipboard::{
    monitor::{ClipboardMonitorControl, ClipboardMonitorService, DomainEventEmitter},
    runtime_repository::{ClipboardRuntimeRepository, SqliteClipboardRuntimeRepository},
};
use image::ImageStorageService;
use ipc::events::TauriEventEmitter;
use paste::PasteService;
use platform::{
    create_platform_clipboard, create_platform_key_simulator, PlatformClipboard,
    PlatformKeySimulator,
};
use shortcut::register_toggle_shortcut;
use state::AppState;
use tauri::Manager;
use tauri_plugin_global_shortcut::Builder as GlobalShortcutBuilder;
use tray::{runtime_snapshot as tray_runtime_snapshot, TrayController};
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
            let config_store =
                config::ConfigStore::initialize(&app_handle).map_err(std::io::Error::other)?;
            let config = config_store.current();
            let database =
                Arc::new(persistence::initialize(&app_handle).map_err(std::io::Error::other)?);
            let image_storage = Arc::new(
                ImageStorageService::initialize(&app_handle).map_err(std::io::Error::other)?,
            );
            let autostart: Arc<dyn AutostartControl> = create_autostart_service(&app_handle)?;

            if let Err(error) = autostart.reconcile(config.launch_at_login()) {
                tracing::warn!(error = %error, "launch agent reconcile failed during setup");
            }

            let repository: Arc<dyn ClipboardRuntimeRepository> =
                Arc::new(SqliteClipboardRuntimeRepository::new(
                    database.clone(),
                    image_storage.clone(),
                    config.clone(),
                ));
            let window_manager: Arc<dyn WindowManager> =
                TauriWindowManager::new(app_handle.clone(), "main", 220.0);
            let event_emitter: Arc<dyn DomainEventEmitter> =
                Arc::new(TauriEventEmitter::new(app_handle.clone()));

            let platform_clipboard: Arc<dyn PlatformClipboard> = create_platform_clipboard()?;
            let platform_key_sim: Arc<dyn PlatformKeySimulator> = create_platform_key_simulator()?;

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
                image_storage.clone(),
            ));

            match register_toggle_shortcut(
                &app_handle,
                config.toggle_shortcut(),
                window_manager.clone(),
            )? {
                shortcut::ShortcutRegistrationOutcome::Registered => {}
                shortcut::ShortcutRegistrationOutcome::SkippedUnsupported { reasons } => {
                    tracing::warn!(?reasons, "toggle shortcut registration skipped");
                }
            }

            app.manage(AppState {
                config_store,
                autostart,
                database,
                image_storage,
                repository,
                monitor,
                paste_service,
                window_manager,
                event_emitter,
                logging_state,
            });

            match TrayController::initialize(&app_handle, tray_runtime_snapshot(&app_handle)?) {
                Ok(tray_controller) => {
                    app.manage(tray_controller);
                    tracing::info!("system tray initialized");
                }
                Err(error) => {
                    tracing::error!(error = %error, "system tray initialization failed");
                }
            }

            tracing::info!("application setup completed");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ipc::commands::get_records,
            ipc::commands::get_record_detail,
            ipc::commands::delete_record,
            ipc::commands::paste_record,
            ipc::commands::hide_panel,
            ipc::commands::get_monitoring_status,
            ipc::commands::set_monitoring,
            ipc::commands::get_runtime_status,
            ipc::commands::clear_history,
            ipc::commands::write_client_log,
            ipc::commands::get_log_directory,
            ipc::commands::show_settings_window,
            ipc::commands::get_platform_capabilities,
            ipc::commands::get_settings_snapshot,
            ipc::commands::update_general_settings,
            ipc::commands::update_history_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
