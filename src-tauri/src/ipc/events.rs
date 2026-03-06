use tauri::{AppHandle, Emitter};

use crate::{
    clipboard::{monitor::DomainEventEmitter, record::ClipboardRecord, types::RecordId},
    error::AppError,
};

pub const EVENT_NEW_RECORD: &str = "clipboard:new-record";
pub const EVENT_RECORD_DELETED: &str = "clipboard:record-deleted";

#[derive(Debug, Clone, serde::Serialize)]
pub struct NewRecordPayload {
    pub record: ClipboardRecord,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub evicted_id: Option<u64>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct RecordDeletedPayload {
    pub id: u64,
}

pub struct TauriEventEmitter {
    app_handle: AppHandle,
}

impl TauriEventEmitter {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }
}

impl DomainEventEmitter for TauriEventEmitter {
    fn emit_new_record(
        &self,
        record: ClipboardRecord,
        evicted_id: Option<RecordId>,
    ) -> Result<(), AppError> {
        let record_id = record.id;
        let payload = NewRecordPayload {
            record,
            evicted_id: evicted_id.map(|id| id.value()),
        };

        self.app_handle
            .emit(EVENT_NEW_RECORD, payload)
            .map_err(|error| AppError::Window(format!("emit new record event failed: {error}")))?;
        tracing::debug!(record_id, "ipc new record event emitted");
        Ok(())
    }

    fn emit_record_deleted(&self, id: RecordId) -> Result<(), AppError> {
        let payload = RecordDeletedPayload { id: id.value() };

        self.app_handle
            .emit(EVENT_RECORD_DELETED, payload)
            .map_err(|error| AppError::Window(format!("emit record deleted failed: {error}")))?;
        tracing::debug!(record_id = id.value(), "ipc record deleted event emitted");
        Ok(())
    }
}
