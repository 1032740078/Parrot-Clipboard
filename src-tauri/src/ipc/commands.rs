use tauri::State;

use crate::{
    clipboard::{
        query::{ClipboardRecordDetail, ClipboardRecordSummary, PasteResult},
        runtime_repository::{RecordDeleteReason, RecordUpdateReason},
        types::{PasteMode, RecordId},
    },
    error::AppError,
    logging::{self, ClientLogLevel},
    state::AppState,
    tray,
};

#[derive(Debug, Clone, serde::Serialize)]
pub struct MonitoringStatus {
    pub monitoring: bool,
}

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

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}
