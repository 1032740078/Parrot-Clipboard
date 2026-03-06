use tauri::State;

use crate::{
    clipboard::types::{PasteMode, RecordId},
    error::AppError,
    logging::{self, ClientLogLevel},
    state::AppState,
};

#[tauri::command]
pub fn get_records(
    limit: usize,
    state: State<'_, AppState>,
) -> Result<Vec<crate::clipboard::record::ClipboardRecord>, AppError> {
    tracing::debug!(limit, "ipc get_records requested");

    if limit == 0 {
        tracing::warn!(limit, "ipc get_records rejected due to invalid limit");
        return Err(AppError::InvalidParam("limit must be > 0".to_string()));
    }
    if limit > 1000 {
        tracing::warn!(limit, "ipc get_records rejected due to oversized limit");
        return Err(AppError::InvalidParam("limit must be <= 1000".to_string()));
    }

    let records = state.repository.get_recent(limit);
    tracing::debug!(
        limit,
        returned_count = records.len(),
        "ipc get_records completed"
    );
    Ok(records)
}

#[tauri::command]
pub fn delete_record(id: u64, state: State<'_, AppState>) -> Result<(), AppError> {
    tracing::info!(record_id = id, "ipc delete_record requested");
    let record_id = RecordId::new(id);
    let deleted_id = state.repository.delete(record_id)?;
    state.event_emitter.emit_record_deleted(deleted_id)?;
    tracing::info!(record_id = id, "ipc delete_record completed");
    Ok(())
}

#[tauri::command]
pub async fn paste_record(
    id: u64,
    mode: PasteMode,
    state: State<'_, AppState>,
) -> Result<crate::clipboard::record::ClipboardRecord, AppError> {
    tracing::info!(record_id = id, ?mode, "ipc paste_record requested");
    let result = state
        .paste_service
        .paste_record(RecordId::new(id), mode)
        .await;

    match &result {
        Ok(record) => tracing::info!(record_id = record.id, "ipc paste_record completed"),
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
pub fn get_monitoring_status(state: State<'_, AppState>) -> bool {
    let monitoring = state.monitor.is_monitoring();
    tracing::debug!(monitoring, "ipc get_monitoring_status requested");
    monitoring
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
