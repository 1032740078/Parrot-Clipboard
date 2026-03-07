use tauri::State;

use crate::{
    clipboard::{
        query::{ClipboardRecordDetail, ClipboardRecordSummary, PasteResult},
        runtime_repository::{RecordDeleteReason, RecordUpdateReason},
        types::{PasteMode, RecordId},
    },
    config::{
        schema::{
            platform_default_toggle_shortcut, GeneralConfig, HistoryConfig, PrivacyConfig,
            ThemeMode,
        },
        AppConfig,
    },
    error::AppError,
    logging::{self, ClientLogLevel},
    platform::PlatformCapabilities,
    settings::{SettingsError, SettingsProfile},
    state::AppState,
    tray,
    window::settings_window::show_or_focus_settings_window,
};

#[derive(Debug, Clone, serde::Serialize)]
pub struct MonitoringStatus {
    pub monitoring: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct RuntimeStatus {
    pub monitoring: bool,
    pub launch_at_login: bool,
    pub panel_visible: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ClearHistoryResult {
    pub deleted_records: usize,
    pub deleted_image_assets: usize,
    pub executed_at: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ShortcutSettingsSnapshot {
    pub toggle_panel: String,
    pub platform_default: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SettingsSnapshot {
    pub config_version: u8,
    pub general: GeneralConfig,
    pub history: HistoryConfig,
    pub shortcut: ShortcutSettingsSnapshot,
    pub privacy: PrivacyConfig,
}

pub const CLEAR_HISTORY_CONFIRM_TOKEN: &str = "confirm-clear-history-v0.3";

#[tauri::command]
pub fn get_records(
    limit: usize,
    state: State<'_, AppState>,
) -> Result<Vec<ClipboardRecordSummary>, AppError> {
    tracing::debug!(limit, "ipc get_records requested");

    if limit == 0 {
        tracing::warn!(limit, "ipc get_records rejected due to invalid limit");
        return Err(AppError::InvalidParam("limit must be > 0".to_string()));
    }
    if limit > 500 {
        tracing::warn!(limit, "ipc get_records rejected due to oversized limit");
        return Err(AppError::InvalidParam("limit must be <= 500".to_string()));
    }

    let records = state.repository.list_summaries(limit)?;
    tracing::debug!(
        limit,
        returned_count = records.len(),
        "ipc get_records completed"
    );
    Ok(records)
}

#[tauri::command]
pub fn get_record_detail(
    id: u64,
    state: State<'_, AppState>,
) -> Result<ClipboardRecordDetail, AppError> {
    tracing::debug!(record_id = id, "ipc get_record_detail requested");
    state
        .repository
        .get_detail(RecordId::new(id))?
        .ok_or(AppError::RecordNotFound(id))
}

#[tauri::command]
pub fn delete_record(id: u64, state: State<'_, AppState>) -> Result<(), AppError> {
    tracing::info!(record_id = id, "ipc delete_record requested");
    let record_id = RecordId::new(id);
    let deleted_id = state.repository.delete(record_id)?;
    state
        .event_emitter
        .emit_record_deleted(deleted_id, RecordDeleteReason::Manual)?;
    tracing::info!(record_id = id, "ipc delete_record completed");
    Ok(())
}

#[tauri::command]
pub async fn paste_record(
    id: u64,
    mode: PasteMode,
    state: State<'_, AppState>,
) -> Result<PasteResult, AppError> {
    tracing::info!(record_id = id, ?mode, "ipc paste_record requested");
    let result = state
        .paste_service
        .paste_record(RecordId::new(id), mode)
        .await;

    match &result {
        Ok(paste_result) => {
            state
                .event_emitter
                .emit_record_updated(RecordUpdateReason::Promoted, paste_result.record.clone())?;
            tracing::info!(
                record_id = paste_result.record.id,
                "ipc paste_record completed"
            );
        }
        Err(error) => tracing::error!(record_id = id, error = %error, "ipc paste_record failed"),
    }

    result
}

#[tauri::command]
pub fn hide_panel(state: State<'_, AppState>) -> Result<(), AppError> {
    tracing::debug!("ipc hide_panel requested");
    let result = state.window_manager.hide();
    if let Err(error) = &result {
        tracing::error!(error = %error, "ipc hide_panel failed");
    }
    result
}

#[tauri::command]
pub fn get_monitoring_status(state: State<'_, AppState>) -> MonitoringStatus {
    let monitoring = state.monitor.is_monitoring();
    tracing::debug!(monitoring, "ipc get_monitoring_status requested");
    MonitoringStatus { monitoring }
}

#[tauri::command]
pub fn set_monitoring(
    enabled: bool,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<MonitoringStatus, AppError> {
    tracing::info!(enabled, "ipc set_monitoring requested");

    if enabled {
        state
            .monitor
            .sync_clipboard_state()
            .map_err(|error| AppError::MonitorControl(error.to_string()))?;
        state.monitor.resume();
    } else {
        state.monitor.pause();
    }

    let monitoring = state.monitor.is_monitoring();
    let changed_at = now_ms();
    state
        .event_emitter
        .emit_monitoring_changed(monitoring, changed_at)?;
    tray::refresh(&app_handle)?;

    tracing::info!(monitoring, changed_at, "ipc set_monitoring completed");
    Ok(MonitoringStatus { monitoring })
}

#[tauri::command]
pub fn get_runtime_status(app_handle: tauri::AppHandle) -> Result<RuntimeStatus, AppError> {
    tracing::debug!("ipc get_runtime_status requested");
    let snapshot = tray::runtime_snapshot(&app_handle)?;

    Ok(RuntimeStatus {
        monitoring: snapshot.monitoring,
        launch_at_login: snapshot.launch_at_login,
        panel_visible: snapshot.panel_visible,
    })
}

#[tauri::command]
pub fn clear_history(
    confirm_token: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<ClearHistoryResult, AppError> {
    tracing::info!("ipc clear_history requested");

    if confirm_token != CLEAR_HISTORY_CONFIRM_TOKEN {
        tracing::warn!("ipc clear_history rejected due to invalid confirm_token");
        return Err(AppError::InvalidParam(
            "confirm_token is invalid".to_string(),
        ));
    }

    let stats = state.repository.clear_history()?;
    let executed_at = now_ms();
    state.event_emitter.emit_history_cleared(
        stats.deleted_records,
        stats.deleted_image_assets,
        executed_at,
    )?;
    tray::refresh(&app_handle)?;

    tracing::info!(
        deleted_records = stats.deleted_records,
        deleted_image_assets = stats.deleted_image_assets,
        executed_at,
        "ipc clear_history completed"
    );

    Ok(ClearHistoryResult {
        deleted_records: stats.deleted_records,
        deleted_image_assets: stats.deleted_image_assets,
        executed_at,
    })
}

#[tauri::command]
pub fn write_client_log(
    level: ClientLogLevel,
    message: String,
    context: Option<serde_json::Value>,
) -> Result<(), AppError> {
    logging::write_client_log(level, message, context);
    Ok(())
}

#[tauri::command]
pub fn get_log_directory(state: State<'_, AppState>) -> String {
    state.logging_state.log_directory.clone()
}

#[tauri::command]
pub fn get_settings_snapshot(state: State<'_, AppState>) -> SettingsSnapshot {
    let snapshot = build_settings_snapshot(&state.config_store.current());
    tracing::debug!(
        config_version = snapshot.config_version,
        "ipc get_settings_snapshot requested"
    );
    snapshot
}

#[tauri::command]
pub fn update_general_settings(
    theme: ThemeMode,
    language: String,
    launch_at_login: bool,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<SettingsSnapshot, AppError> {
    tracing::info!(
        ?theme,
        launch_at_login,
        "ipc update_general_settings requested"
    );
    let current = state.config_store.current();
    let mut profile = SettingsProfile::new(current.clone()).map_err(map_settings_error)?;
    profile
        .update_general(GeneralConfig {
            theme,
            language,
            launch_at_login,
        })
        .map_err(map_settings_error)?;

    if current.launch_at_login() != launch_at_login {
        state.autostart.reconcile(launch_at_login)?;
    }

    let persisted = state
        .config_store
        .replace(profile.snapshot())
        .map_err(AppError::FileAccess)?;
    tray::refresh(&app_handle)?;

    let snapshot = build_settings_snapshot(&persisted);
    tracing::info!(
        launch_at_login = snapshot.general.launch_at_login,
        "ipc update_general_settings completed"
    );
    Ok(snapshot)
}

#[tauri::command]
pub fn update_history_settings(
    max_text_records: usize,
    max_image_records: usize,
    max_file_records: usize,
    max_image_storage_mb: usize,
    capture_images: bool,
    capture_files: bool,
    state: State<'_, AppState>,
) -> Result<SettingsSnapshot, AppError> {
    tracing::info!(
        max_text_records,
        max_image_records,
        max_file_records,
        max_image_storage_mb,
        capture_images,
        capture_files,
        "ipc update_history_settings requested"
    );
    let current = state.config_store.current();
    let mut profile = SettingsProfile::new(current).map_err(map_settings_error)?;
    profile
        .update_history(HistoryConfig {
            max_text_records,
            max_image_records,
            max_file_records,
            max_image_storage_mb,
            capture_images,
            capture_files,
        })
        .map_err(map_settings_error)?;

    let persisted = state
        .config_store
        .replace(profile.snapshot())
        .map_err(AppError::FileAccess)?;
    let snapshot = build_settings_snapshot(&persisted);
    tracing::info!(
        max_text_records = snapshot.history.max_text_records,
        max_image_records = snapshot.history.max_image_records,
        "ipc update_history_settings completed"
    );
    Ok(snapshot)
}

#[tauri::command]
pub fn show_settings_window(app_handle: tauri::AppHandle) -> Result<(), AppError> {
    let action = show_or_focus_settings_window(&app_handle)?;
    tracing::info!(?action, "ipc show_settings_window completed");
    Ok(())
}

#[tauri::command]
pub fn get_platform_capabilities() -> PlatformCapabilities {
    let capabilities = crate::platform::PlatformCapabilityResolver::current().resolve();
    tracing::debug!(platform = ?capabilities.platform, session_type = ?capabilities.session_type, "ipc get_platform_capabilities requested");
    capabilities
}

fn build_settings_snapshot(config: &AppConfig) -> SettingsSnapshot {
    SettingsSnapshot {
        config_version: config.config_version,
        general: config.general.clone(),
        history: config.history.clone(),
        shortcut: ShortcutSettingsSnapshot {
            toggle_panel: config.shortcut.toggle_panel.clone(),
            platform_default: platform_default_toggle_shortcut(),
        },
        privacy: config.privacy.clone(),
    }
}

fn map_settings_error(error: SettingsError) -> AppError {
    match error {
        SettingsError::Validation(message) => AppError::InvalidParam(message),
        SettingsError::BlacklistRuleDuplicate { .. } => AppError::InvalidParam(error.to_string()),
        SettingsError::BlacklistRuleNotFound(_) => AppError::InvalidParam(error.to_string()),
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
    use super::build_settings_snapshot;

    #[test]
    fn settings_snapshot_uses_platform_default_shortcut() {
        let snapshot = build_settings_snapshot(&crate::config::AppConfig::default());

        assert_eq!(snapshot.config_version, 2);
        assert_eq!(
            snapshot.shortcut.platform_default,
            crate::config::schema::platform_default_toggle_shortcut()
        );
    }
}
