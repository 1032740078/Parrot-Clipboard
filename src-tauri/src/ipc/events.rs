use tauri::{AppHandle, Emitter};

use crate::{
    clipboard::{
        monitor::DomainEventEmitter,
        query::ClipboardRecordSummary,
        runtime_repository::{RecordDeleteReason, RecordUpdateReason},
        types::RecordId,
    },
    diagnostics::DiagnosticsSnapshot,
    error::AppError,
    updater::UpdateCheckResult,
};

pub const EVENT_NEW_RECORD: &str = "clipboard:new-record";
pub const EVENT_RECORD_UPDATED: &str = "clipboard:record-updated";
pub const EVENT_RECORD_DELETED: &str = "clipboard:record-deleted";
pub const EVENT_HISTORY_CLEARED: &str = "clipboard:history-cleared";
pub const EVENT_MONITORING_CHANGED: &str = "system:monitoring-changed";
pub const EVENT_LAUNCH_AT_LOGIN_CHANGED: &str = "system:launch-at-login-changed";
pub const EVENT_SETTINGS_UPDATED: &str = "system:settings-updated";
pub const EVENT_UPDATE_CHECK_FINISHED: &str = "system:update-check-finished";
pub const EVENT_DIAGNOSTICS_UPDATED: &str = "system:diagnostics-updated";

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

#[derive(Debug, Clone, Copy, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MonitoringStatePayload {
    Running,
    Paused,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct MonitoringChangedPayload {
    pub monitoring: bool,
    pub state: MonitoringStatePayload,
    pub changed_at: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct HistoryClearedPayload {
    pub deleted_records: usize,
    pub deleted_image_assets: usize,
    pub executed_at: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct LaunchAtLoginChangedPayload {
    pub launch_at_login: bool,
    pub changed_at: i64,
}

pub fn emit_launch_at_login_changed(
    app_handle: &AppHandle,
    launch_at_login: bool,
    changed_at: i64,
) -> Result<(), AppError> {
    let payload = LaunchAtLoginChangedPayload {
        launch_at_login,
        changed_at,
    };

    app_handle
        .emit(EVENT_LAUNCH_AT_LOGIN_CHANGED, payload)
        .map_err(|error| {
            AppError::Window(format!("emit launch_at_login changed failed: {error}"))
        })?;
    tracing::debug!(
        launch_at_login,
        changed_at,
        "ipc launch_at_login changed event emitted"
    );
    Ok(())
}

pub fn emit_settings_updated<T>(app_handle: &AppHandle, snapshot: T) -> Result<(), AppError>
where
    T: serde::Serialize + Clone,
{
    app_handle
        .emit(EVENT_SETTINGS_UPDATED, snapshot)
        .map_err(|error| AppError::Window(format!("emit settings updated failed: {error}")))?;
    tracing::debug!("ipc settings updated event emitted");
    Ok(())
}

pub fn emit_update_check_finished(
    app_handle: &AppHandle,
    result: UpdateCheckResult,
) -> Result<(), AppError> {
    let status = result.status;
    app_handle
        .emit(EVENT_UPDATE_CHECK_FINISHED, result)
        .map_err(|error| AppError::Window(format!("emit update check finished failed: {error}")))?;
    tracing::debug!(?status, "ipc update check finished event emitted");
    Ok(())
}

pub fn emit_diagnostics_updated(
    app_handle: &AppHandle,
    snapshot: DiagnosticsSnapshot,
) -> Result<(), AppError> {
    let schema_version = snapshot.release.schema_version;
    let deleted_original_files = snapshot
        .last_orphan_cleanup
        .as_ref()
        .map(|summary| summary.deleted_original_files)
        .unwrap_or_default();
    let deleted_thumbnail_files = snapshot
        .last_orphan_cleanup
        .as_ref()
        .map(|summary| summary.deleted_thumbnail_files)
        .unwrap_or_default();

    app_handle
        .emit(EVENT_DIAGNOSTICS_UPDATED, snapshot)
        .map_err(|error| AppError::Window(format!("emit diagnostics updated failed: {error}")))?;
    tracing::debug!(
        schema_version,
        deleted_original_files,
        deleted_thumbnail_files,
        "ipc diagnostics updated event emitted"
    );
    Ok(())
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

    fn emit_monitoring_changed(&self, monitoring: bool, changed_at: i64) -> Result<(), AppError> {
        let payload = MonitoringChangedPayload {
            monitoring,
            state: if monitoring {
                MonitoringStatePayload::Running
            } else {
                MonitoringStatePayload::Paused
            },
            changed_at,
        };

        self.app_handle
            .emit(EVENT_MONITORING_CHANGED, payload)
            .map_err(|error| {
                AppError::Window(format!("emit monitoring changed failed: {error}"))
            })?;
        tracing::debug!(
            monitoring,
            changed_at,
            "ipc monitoring changed event emitted"
        );
        Ok(())
    }

    fn emit_history_cleared(
        &self,
        deleted_records: usize,
        deleted_image_assets: usize,
        executed_at: i64,
    ) -> Result<(), AppError> {
        let payload = HistoryClearedPayload {
            deleted_records,
            deleted_image_assets,
            executed_at,
        };

        self.app_handle
            .emit(EVENT_HISTORY_CLEARED, payload)
            .map_err(|error| AppError::Window(format!("emit history cleared failed: {error}")))?;
        tracing::debug!(
            deleted_records,
            deleted_image_assets,
            executed_at,
            "ipc history cleared event emitted"
        );
        Ok(())
    }
}
