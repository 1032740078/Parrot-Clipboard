#![allow(unexpected_cfgs)]

mod autostart;
mod clipboard;
mod config;
mod diagnostics;
mod error;
mod image;
mod ipc;
mod logging;
mod ocr;
mod paste;
mod persistence;
mod platform;
pub mod settings;
mod shortcut;
mod state;
mod tray;
mod updater;
mod window;

use std::{error::Error, sync::Arc, time::Duration};

use autostart::{create_autostart_service, AutostartControl};
use clipboard::{
    monitor::{ClipboardMonitorControl, ClipboardMonitorService, DomainEventEmitter},
    runtime_repository::{ClipboardRuntimeRepository, SqliteClipboardRuntimeRepository},
};
use image::{ImageCleanupService, ImageStorageService};
use ipc::events::TauriEventEmitter;
use ocr::{ImageTextRecognizer, OcrService};
use paste::PasteService;
use platform::{
    create_platform_active_app_detector, create_platform_clipboard, create_platform_key_simulator,
    PlatformClipboard, PlatformKeySimulator,
};
use shortcut::register_toggle_shortcut;
use state::AppState;
use tauri::Manager;
use tauri_plugin_global_shortcut::Builder as GlobalShortcutBuilder;
use tray::{runtime_snapshot as tray_runtime_snapshot, TrayController};
use window::{
    panel_auto_hide::PanelAutoHideCoordinator, position::PANEL_HEIGHT_PX,
    register_panel_focus_auto_hide, TauriWindowManager, WindowManager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(GlobalShortcutBuilder::new().build())
        .setup(|app| -> Result<(), Box<dyn Error>> {
            let app_handle = app.handle().clone();

            #[cfg(target_os = "macos")]
            {
                app_handle
                    .set_activation_policy(tauri::ActivationPolicy::Accessory)
                    .map_err(std::io::Error::other)?;
                app_handle
                    .set_dock_visibility(false)
                    .map_err(std::io::Error::other)?;
                tracing::info!("macos dock icon hidden via accessory activation policy");
            }

            let logging_state =
                logging::init_logging(&app_handle).map_err(std::io::Error::other)?;
            tracing::info!("application setup started");
            let config_store =
                config::ConfigStore::initialize(&app_handle).map_err(std::io::Error::other)?;
            let config = config_store.current();
            let persistence_state =
                persistence::initialize(&app_handle).map_err(std::io::Error::other)?;
            let database = Arc::new(persistence_state.manager);
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
            let image_cleanup = Arc::new(ImageCleanupService::new(
                database.clone(),
                image_storage.clone(),
            ));
            let window_manager: Arc<dyn WindowManager> =
                TauriWindowManager::new(app_handle.clone(), "main", PANEL_HEIGHT_PX);
            let event_emitter: Arc<dyn DomainEventEmitter> =
                Arc::new(TauriEventEmitter::new(app_handle.clone()));
            let panel_auto_hide = PanelAutoHideCoordinator::new();

            let platform_clipboard: Arc<dyn PlatformClipboard> = create_platform_clipboard()?;
            let platform_key_sim: Arc<dyn PlatformKeySimulator> = create_platform_key_simulator()?;
            let active_app_detector = create_platform_active_app_detector();
            let ocr_service: Arc<dyn ImageTextRecognizer> =
                Arc::new(OcrService::initialize(&app_handle).map_err(std::io::Error::other)?);

            let monitor_service = Arc::new(ClipboardMonitorService::new_with_privacy(
                repository.clone(),
                platform_clipboard.clone(),
                event_emitter.clone(),
                config_store.clone(),
                active_app_detector,
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
                ocr_service,
                panel_auto_hide.clone(),
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

            let orphan_cleanup_app_handle = app_handle.clone();
            let orphan_cleanup_config_store = config_store.clone();
            let orphan_cleanup_log_directory = logging_state.log_directory.clone();
            let orphan_cleanup_migration_status = persistence_state.migration_status.clone();
            let orphan_cleanup_service = image_cleanup.clone();

            app.manage(AppState {
                config_store,
                autostart,
                database,
                image_storage,
                image_cleanup,
                repository,
                monitor,
                paste_service,
                window_manager,
                event_emitter,
                panel_auto_hide,
                logging_state,
                migration_status: persistence_state.migration_status,
            });

            register_panel_focus_auto_hide(&app_handle).map_err(std::io::Error::other)?;

            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(Duration::from_secs(6 * 60 * 60));
                loop {
                    interval.tick().await;
                    match orphan_cleanup_service.run_orphan_cleanup() {
                        Ok(summary) => {
                            let capabilities =
                                platform::PlatformCapabilityResolver::current().resolve();
                            let config = orphan_cleanup_config_store.current();
                            let snapshot = diagnostics::build_diagnostics_snapshot(
                                &config,
                                &orphan_cleanup_log_directory,
                                &orphan_cleanup_migration_status,
                                Some(summary.clone()),
                                &capabilities,
                            );
                            if let Err(error) =
                                ipc::events::emit_diagnostics_updated(&orphan_cleanup_app_handle, snapshot)
                            {
                                tracing::warn!(error = %error, "emit diagnostics updated after scheduled orphan cleanup failed");
                            }
                        }
                        Err(error) => {
                            tracing::warn!(error = %error, "scheduled orphan cleanup failed");
                        }
                    }
                }
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
            ipc::commands::search_records,
            ipc::commands::get_record_detail,
            ipc::commands::update_text_record,
            ipc::commands::delete_record,
            ipc::commands::paste_record,
            ipc::commands::hide_panel,
            ipc::commands::get_monitoring_status,
            ipc::commands::set_monitoring,
            ipc::commands::get_runtime_status,
            ipc::commands::clear_history,
            ipc::commands::write_client_log,
            ipc::commands::get_log_directory,
            ipc::commands::get_release_info,
            ipc::commands::get_permission_status,
            ipc::commands::open_accessibility_settings,
            ipc::commands::check_app_update,
            ipc::commands::get_diagnostics_snapshot,
            ipc::commands::run_orphan_cleanup,
            ipc::commands::show_settings_window,
            ipc::commands::show_about_window,
            ipc::commands::show_preview_window,
            ipc::commands::close_preview_window_command,
            ipc::commands::show_permission_guide_window,
            ipc::commands::close_permission_guide_window_command,
            ipc::commands::get_platform_capabilities,
            ipc::commands::get_settings_snapshot,
            ipc::commands::update_general_settings,
            ipc::commands::update_history_settings,
            ipc::commands::validate_toggle_shortcut,
            ipc::commands::update_toggle_shortcut,
            ipc::commands::create_blacklist_rule,
            ipc::commands::update_blacklist_rule,
            ipc::commands::delete_blacklist_rule,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
