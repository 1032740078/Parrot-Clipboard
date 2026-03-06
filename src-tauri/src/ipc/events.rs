use tauri::{AppHandle, Emitter};

use crate::{
    clipboard::{
        monitor::DomainEventEmitter,
        query::ClipboardRecordSummary,
        runtime_repository::{RecordDeleteReason, RecordUpdateReason},
        types::RecordId,
    },
    error::AppError,
};

pub const EVENT_NEW_RECORD: &str = "clipboard:new-record";
pub const EVENT_RECORD_UPDATED: &str = "clipboard:record-updated";
pub const EVENT_RECORD_DELETED: &str = "clipboard:record-deleted";

#[derive(Debug, Clone, serde::Serialize)]
pub struct NewRecordPayload {
    pub record: ClipboardRecordSummary,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub evicted_ids: Vec<u64>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct RecordUpdatedPayload {
    pub reason: RecordUpdateReason,
    pub record: ClipboardRecordSummary,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct RecordDeletedPayload {
    pub id: u64,
    pub reason: RecordDeleteReason,
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
        record: ClipboardRecordSummary,
        evicted_ids: Vec<u64>,
    ) -> Result<(), AppError> {
        let record_id = record.id;
        let payload = NewRecordPayload {
            record,
            evicted_ids,
        };

        self.app_handle
            .emit(EVENT_NEW_RECORD, payload)
            .map_err(|error| AppError::Window(format!("emit new record event failed: {error}")))?;
        tracing::debug!(record_id, "ipc new record event emitted");
        Ok(())
    }

    fn emit_record_updated(
        &self,
        reason: RecordUpdateReason,
        record: ClipboardRecordSummary,
    ) -> Result<(), AppError> {
        let record_id = record.id;
        let payload = RecordUpdatedPayload { reason, record };
        self.app_handle
            .emit(EVENT_RECORD_UPDATED, payload)
            .map_err(|error| AppError::Window(format!("emit record updated failed: {error}")))?;
        tracing::debug!(record_id, ?reason, "ipc record updated event emitted");
        Ok(())
    }

    fn emit_record_deleted(
        &self,
        id: RecordId,
        reason: RecordDeleteReason,
    ) -> Result<(), AppError> {
        let payload = RecordDeletedPayload {
            id: id.value(),
            reason,
        };

        self.app_handle
            .emit(EVENT_RECORD_DELETED, payload)
            .map_err(|error| AppError::Window(format!("emit record deleted failed: {error}")))?;
        tracing::debug!(
            record_id = id.value(),
            ?reason,
            "ipc record deleted event emitted"
        );
        Ok(())
    }
}
