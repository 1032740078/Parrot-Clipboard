use tauri::State;

use crate::{
    clipboard::types::{PasteMode, RecordId},
    error::AppError,
    state::AppState,
};

#[tauri::command]
pub fn get_records(
    limit: usize,
    state: State<'_, AppState>,
) -> Result<Vec<crate::clipboard::record::ClipboardRecord>, AppError> {
    if limit == 0 {
        return Err(AppError::InvalidParam("limit must be > 0".to_string()));
    }
    if limit > 1000 {
        return Err(AppError::InvalidParam("limit must be <= 1000".to_string()));
    }

    Ok(state.repository.get_recent(limit))
}

#[tauri::command]
pub fn delete_record(id: u64, state: State<'_, AppState>) -> Result<(), AppError> {
    let record_id = RecordId::new(id);
    let deleted_id = state.repository.delete(record_id)?;
    state.event_emitter.emit_record_deleted(deleted_id)?;
    Ok(())
}

#[tauri::command]
pub async fn paste_record(
    id: u64,
    mode: PasteMode,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state
        .paste_service
        .paste_record(RecordId::new(id), mode)
        .await
}

#[tauri::command]
pub fn hide_panel(state: State<'_, AppState>) -> Result<(), AppError> {
    state.window_manager.hide()
}

#[tauri::command]
pub fn get_monitoring_status(state: State<'_, AppState>) -> bool {
    state.monitor.is_monitoring()
}
