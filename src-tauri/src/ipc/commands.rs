use tauri::State;

use crate::{
    audio::{self, SoundEffectCue},
    clipboard::{
        query::{
            ClipboardRecordDetail, ClipboardRecordSummary, PasteResult, PreviewPreparationResult,
        },
        runtime_repository::{RecordDeleteReason, RecordUpdateReason},
        types::{ContentType, PasteMode, RecordId},
    },
    config::{
        schema::{
            platform_default_toggle_shortcut, BlacklistMatchType, GeneralConfig, HistoryConfig,
            PlatformKind, PrivacyConfig, ThemeMode,
        },
        AppConfig,
    },
    diagnostics::{self, CleanupSummary, DiagnosticsSnapshot, PermissionStatus, ReleaseInfo},
    error::AppError,
    ipc::events::{emit_panel_visibility_changed, PanelVisibilityReasonPayload},
    logging::{self, ClientLogLevel},
    platform::{self, PlatformCapabilities},
    settings::{BlacklistRuleDraft, SettingsError, SettingsProfile},
    shortcut::{self, ShortcutValidationResult},
    state::AppState,
    tray,
    updater::UpdateCheckResult,
    window::{
        about_window::show_or_focus_about_window,
        permission_guide_window::{
            close_permission_guide_window, show_or_focus_permission_guide_window,
        },
        preview_window::{
            close_preview_window, show_or_focus_preview_window,
            sync_preview_window_record as sync_preview_window_record_runtime,
        },
        settings_window::show_or_focus_settings_window,
    },
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
pub fn search_records(
    query: String,
    type_filter: Option<String>,
    limit: usize,
    state: State<'_, AppState>,
) -> Result<Vec<ClipboardRecordSummary>, AppError> {
    tracing::debug!(
        query = query.as_str(),
        ?type_filter,
        limit,
        "ipc search_records requested"
    );

    if limit == 0 {
        return Err(AppError::InvalidParam("limit must be > 0".to_string()));
    }
    if limit > 500 {
        return Err(AppError::InvalidParam("limit must be <= 500".to_string()));
    }
    if query.chars().count() > 200 {
        return Err(AppError::InvalidParam(
            "query must be <= 200 chars".to_string(),
        ));
    }

    let semantic_filter = type_filter
        .as_deref()
        .map(|value| {
            ContentType::from_db(value)
                .ok_or_else(|| AppError::InvalidParam(format!("unsupported type_filter `{value}`")))
        })
        .transpose()?;

    let records = state
        .repository
        .search_summaries(&query, semantic_filter, limit)?;
    tracing::debug!(
        query = query.as_str(),
        ?semantic_filter,
        returned_count = records.len(),
        "ipc search_records completed"
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
pub fn prepare_record_preview(
    id: u64,
    state: State<'_, AppState>,
) -> Result<PreviewPreparationResult, AppError> {
    tracing::info!(record_id = id, "ipc prepare_record_preview requested");
    let result = state
        .repository
        .prepare_preview(RecordId::new(id), now_ms())?;
    tracing::info!(
        record_id = id,
        renderer = result.renderer.as_str(),
        preview_status = result.preview_status.as_str(),
        "ipc prepare_record_preview completed"
    );
    Ok(result)
}

#[tauri::command]
pub fn get_source_app_icon(source_app: String, size: Option<u32>) -> Option<Vec<u8>> {
    let icon_size = size.unwrap_or(20).clamp(16, 64);

    match platform::resolve_source_app_icon_png(&source_app, icon_size) {
        Ok(icon_bytes) => {
            tracing::debug!(
                source_app = source_app.as_str(),
                icon_size,
                has_icon = icon_bytes.is_some(),
                "ipc get_source_app_icon completed"
            );
            icon_bytes
        }
        Err(error) => {
            tracing::warn!(
                source_app = source_app.as_str(),
                icon_size,
                error = %error,
                "ipc get_source_app_icon failed, fallback icon will be used"
            );
            None
        }
    }
}

#[tauri::command]
pub fn update_text_record(
    id: u64,
    text: String,
    state: State<'_, AppState>,
) -> Result<ClipboardRecordDetail, AppError> {
    tracing::info!(record_id = id, "ipc update_text_record requested");
    let detail = state
        .repository
        .update_text(RecordId::new(id), text, now_ms())?;
    state
        .event_emitter
        .emit_record_updated(RecordUpdateReason::Promoted, detail.clone().into())?;
    tracing::info!(record_id = id, "ipc update_text_record completed");
    Ok(detail)
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
            if let Err(error) = audio::play_sound_effect(SoundEffectCue::PasteCompleted) {
                tracing::warn!(error = %error, "play native paste sound effect failed");
            }
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
pub fn hide_panel(
    app_handle: tauri::AppHandle,
    reason: Option<PanelVisibilityReasonPayload>,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    tracing::debug!("ipc hide_panel requested");
    match state.window_manager.hide() {
        Ok(()) => {
            let reason = reason.unwrap_or(PanelVisibilityReasonPayload::Escape);
            emit_panel_visibility_changed(&app_handle, false, reason, None)?;
            tray::refresh(&app_handle)?;
            Ok(())
        }
        Err(error) => {
            tracing::error!(error = %error, "ipc hide_panel failed");
            Err(error)
        }
    }
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
pub fn play_sound_effect(cue: String) -> Result<(), AppError> {
    let sound_cue = match cue.as_str() {
        "copy_captured" => SoundEffectCue::CopyCaptured,
        "paste_completed" => SoundEffectCue::PasteCompleted,
        _ => {
            return Err(AppError::InvalidParam(format!(
                "unsupported sound cue `{cue}`"
            )));
        }
    };
    tracing::debug!(
        sound_cue = sound_cue.as_str(),
        "ipc play_sound_effect requested"
    );
    audio::play_sound_effect(sound_cue)
}

#[tauri::command]
pub fn get_log_directory(state: State<'_, AppState>) -> String {
    state.logging_state.log_directory.clone()
}

#[tauri::command]
pub fn get_release_info(state: State<'_, AppState>) -> ReleaseInfo {
    let capabilities = crate::platform::PlatformCapabilityResolver::current().resolve();
    let config = state.config_store.current();
    let release_info =
        diagnostics::build_release_info(&config, &state.migration_status, &capabilities);

    tracing::debug!(
        platform = ?release_info.platform,
        schema_version = release_info.schema_version,
        config_version = release_info.config_version,
        "ipc get_release_info requested"
    );

    release_info
}

#[tauri::command]
pub fn get_permission_status() -> PermissionStatus {
    let capabilities = crate::platform::PlatformCapabilityResolver::current().resolve();
    let permission_status = diagnostics::build_permission_status(&capabilities);

    tracing::debug!(
        platform = ?permission_status.platform,
        accessibility = ?permission_status.accessibility,
        "ipc get_permission_status requested"
    );

    permission_status
}

#[tauri::command]
pub fn open_accessibility_settings() -> Result<(), AppError> {
    crate::platform::open_accessibility_settings()?;
    tracing::info!("ipc open_accessibility_settings completed");
    Ok(())
}

#[tauri::command]
pub async fn check_app_update(app_handle: tauri::AppHandle) -> Result<UpdateCheckResult, AppError> {
    tracing::info!("ipc check_app_update requested");
    let result = crate::updater::check_for_updates(env!("CARGO_PKG_VERSION").to_string()).await;
    crate::ipc::events::emit_update_check_finished(&app_handle, result.clone())?;
    tracing::info!(
        status = ?result.status,
        latest_version = result.latest_version.as_deref().unwrap_or_default(),
        "ipc check_app_update completed"
    );
    Ok(result)
}

#[tauri::command]
pub fn get_diagnostics_snapshot(state: State<'_, AppState>) -> DiagnosticsSnapshot {
    let snapshot = build_diagnostics_snapshot_from_state(&state);

    tracing::debug!(
        platform = ?snapshot.release.platform,
        schema_version = snapshot.release.schema_version,
        recovered_from_corruption = snapshot.migration.recovered_from_corruption,
        deleted_original_files = snapshot
            .last_orphan_cleanup
            .as_ref()
            .map(|summary| summary.deleted_original_files)
            .unwrap_or_default(),
        deleted_thumbnail_files = snapshot
            .last_orphan_cleanup
            .as_ref()
            .map(|summary| summary.deleted_thumbnail_files)
            .unwrap_or_default(),
        "ipc get_diagnostics_snapshot requested"
    );

    snapshot
}

#[tauri::command]
pub fn run_orphan_cleanup(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<CleanupSummary, AppError> {
    tracing::info!("ipc run_orphan_cleanup requested");
    let summary = state.image_cleanup.run_orphan_cleanup()?;
    let snapshot = build_diagnostics_snapshot_from_state(&state);
    crate::ipc::events::emit_diagnostics_updated(&app_handle, snapshot)?;
    tracing::info!(
        deleted_original_files = summary.deleted_original_files,
        deleted_thumbnail_files = summary.deleted_thumbnail_files,
        executed_at = summary.executed_at,
        "ipc run_orphan_cleanup completed"
    );
    Ok(summary)
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
    if current.launch_at_login() != launch_at_login {
        crate::ipc::events::emit_launch_at_login_changed(
            &app_handle,
            snapshot.general.launch_at_login,
            now_ms(),
        )?;
    }
    crate::ipc::events::emit_settings_updated(&app_handle, snapshot.clone())?;
    tracing::info!(
        launch_at_login = snapshot.general.launch_at_login,
        "ipc update_general_settings completed"
    );
    Ok(snapshot)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn update_history_settings(
    max_text_records: usize,
    max_image_records: usize,
    max_file_records: usize,
    max_image_storage_mb: usize,
    capture_images: bool,
    capture_files: bool,
    app_handle: tauri::AppHandle,
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
    crate::ipc::events::emit_settings_updated(&app_handle, snapshot.clone())?;
    tracing::info!(
        max_text_records = snapshot.history.max_text_records,
        max_image_records = snapshot.history.max_image_records,
        "ipc update_history_settings completed"
    );
    Ok(snapshot)
}

#[tauri::command]
pub fn validate_toggle_shortcut(shortcut: String) -> ShortcutValidationResult {
    let capabilities = crate::platform::PlatformCapabilityResolver::current().resolve();
    let result = shortcut::validate_toggle_shortcut(&shortcut, &capabilities);
    tracing::debug!(shortcut = %shortcut, valid = result.valid, conflict = result.conflict, "ipc validate_toggle_shortcut completed");
    result
}

#[tauri::command]
pub fn update_toggle_shortcut(
    shortcut: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<SettingsSnapshot, AppError> {
    tracing::info!(shortcut = %shortcut, "ipc update_toggle_shortcut requested");
    let capabilities = crate::platform::PlatformCapabilityResolver::current().resolve();
    let validation = shortcut::validate_toggle_shortcut(&shortcut, &capabilities);

    if !validation.valid || validation.conflict {
        return Err(AppError::InvalidParam(
            validation
                .reason
                .clone()
                .unwrap_or_else(|| "快捷键不可用".to_string()),
        ));
    }

    let current = state.config_store.current();
    let current_shortcut = current.shortcut.toggle_panel.clone();
    let normalized = validation.normalized_shortcut.clone();

    let mut profile = SettingsProfile::new(current).map_err(map_settings_error)?;
    profile
        .update_shortcut(crate::config::schema::ShortcutConfig {
            toggle_panel: normalized.clone(),
        })
        .map_err(map_settings_error)?;

    shortcut::reregister_toggle_shortcut(
        &app_handle,
        &current_shortcut,
        &normalized,
        state.window_manager.clone(),
    )?;

    let persisted = state
        .config_store
        .replace(profile.snapshot())
        .map_err(AppError::FileAccess)?;
    let snapshot = build_settings_snapshot(&persisted);
    crate::ipc::events::emit_settings_updated(&app_handle, snapshot.clone())?;
    tracing::info!(shortcut = %snapshot.shortcut.toggle_panel, "ipc update_toggle_shortcut completed");
    Ok(snapshot)
}

#[tauri::command]
pub fn create_blacklist_rule(
    app_name: String,
    platform: PlatformKind,
    match_type: BlacklistMatchType,
    app_identifier: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<SettingsSnapshot, AppError> {
    tracing::info!(platform = ?platform, ?match_type, app_identifier = %app_identifier, "ipc create_blacklist_rule requested");
    let current = state.config_store.current();
    let mut profile = SettingsProfile::new(current).map_err(map_settings_error)?;
    profile
        .create_blacklist_rule(
            BlacklistRuleDraft {
                app_name,
                platform,
                match_type,
                app_identifier,
                enabled: true,
            },
            now_ms(),
        )
        .map_err(map_settings_error)?;

    let persisted = state
        .config_store
        .replace(profile.snapshot())
        .map_err(AppError::FileAccess)?;
    let snapshot = build_settings_snapshot(&persisted);
    crate::ipc::events::emit_settings_updated(&app_handle, snapshot.clone())?;
    tracing::info!(
        rules = snapshot.privacy.blacklist_rules.len(),
        "ipc create_blacklist_rule completed"
    );
    Ok(snapshot)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn update_blacklist_rule(
    id: String,
    app_name: String,
    platform: PlatformKind,
    match_type: BlacklistMatchType,
    app_identifier: String,
    enabled: bool,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<SettingsSnapshot, AppError> {
    tracing::info!(rule_id = %id, platform = ?platform, ?match_type, enabled, "ipc update_blacklist_rule requested");
    let current = state.config_store.current();
    let mut profile = SettingsProfile::new(current).map_err(map_settings_error)?;
    profile
        .update_blacklist_rule(
            &id,
            BlacklistRuleDraft {
                app_name,
                platform,
                match_type,
                app_identifier,
                enabled,
            },
            now_ms(),
        )
        .map_err(map_settings_error)?;

    let persisted = state
        .config_store
        .replace(profile.snapshot())
        .map_err(AppError::FileAccess)?;
    let snapshot = build_settings_snapshot(&persisted);
    crate::ipc::events::emit_settings_updated(&app_handle, snapshot.clone())?;
    tracing::info!(rule_id = %id, rules = snapshot.privacy.blacklist_rules.len(), "ipc update_blacklist_rule completed");
    Ok(snapshot)
}

#[tauri::command]
pub fn delete_blacklist_rule(
    id: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<SettingsSnapshot, AppError> {
    tracing::info!(rule_id = %id, "ipc delete_blacklist_rule requested");
    let current = state.config_store.current();
    let mut profile = SettingsProfile::new(current).map_err(map_settings_error)?;
    profile
        .delete_blacklist_rule(&id)
        .map_err(map_settings_error)?;

    let persisted = state
        .config_store
        .replace(profile.snapshot())
        .map_err(AppError::FileAccess)?;
    let snapshot = build_settings_snapshot(&persisted);
    crate::ipc::events::emit_settings_updated(&app_handle, snapshot.clone())?;
    tracing::info!(rule_id = %id, rules = snapshot.privacy.blacklist_rules.len(), "ipc delete_blacklist_rule completed");
    Ok(snapshot)
}

#[tauri::command]
pub fn show_settings_window(app_handle: tauri::AppHandle) -> Result<(), AppError> {
    let action = show_or_focus_settings_window(&app_handle)?;
    tracing::info!(?action, "ipc show_settings_window completed");
    Ok(())
}

#[tauri::command]
pub fn show_about_window(app_handle: tauri::AppHandle) -> Result<(), AppError> {
    let action = show_or_focus_about_window(&app_handle)?;
    tracing::info!(?action, "ipc show_about_window completed");
    Ok(())
}

#[tauri::command]
pub fn show_preview_window(record_id: u64, app_handle: tauri::AppHandle) -> Result<(), AppError> {
    let action = show_or_focus_preview_window(&app_handle, record_id)?;
    tracing::info!(?action, record_id, "ipc show_preview_window completed");
    Ok(())
}

#[tauri::command]
pub fn close_preview_window_command(app_handle: tauri::AppHandle) -> Result<(), AppError> {
    close_preview_window(&app_handle)?;
    tracing::info!("ipc close_preview_window completed");
    Ok(())
}

#[tauri::command]
pub fn sync_preview_window_record(
    record_id: u64,
    app_handle: tauri::AppHandle,
) -> Result<bool, AppError> {
    let synced = sync_preview_window_record_runtime(&app_handle, record_id)?;
    tracing::debug!(
        record_id,
        synced,
        "ipc sync_preview_window_record completed"
    );
    Ok(synced)
}

#[tauri::command]
pub fn show_permission_guide_window(app_handle: tauri::AppHandle) -> Result<(), AppError> {
    let action = show_or_focus_permission_guide_window(&app_handle)?;
    tracing::info!(?action, "ipc show_permission_guide_window completed");
    Ok(())
}

#[tauri::command]
pub fn close_permission_guide_window_command(app_handle: tauri::AppHandle) -> Result<(), AppError> {
    close_permission_guide_window(&app_handle)?;
    tracing::info!("ipc close_permission_guide_window completed");
    Ok(())
}

#[tauri::command]
pub fn get_platform_capabilities() -> PlatformCapabilities {
    let capabilities = crate::platform::PlatformCapabilityResolver::current().resolve();
    tracing::debug!(platform = ?capabilities.platform, session_type = ?capabilities.session_type, "ipc get_platform_capabilities requested");
    capabilities
}

fn build_diagnostics_snapshot_from_state(state: &AppState) -> DiagnosticsSnapshot {
    let capabilities = crate::platform::PlatformCapabilityResolver::current().resolve();
    let config = state.config_store.current();
    diagnostics::build_diagnostics_snapshot(
        &config,
        &state.logging_state.log_directory,
        &state.migration_status,
        state.image_cleanup.last_cleanup_summary(),
        &capabilities,
    )
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
