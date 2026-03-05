#![allow(dead_code)]

use std::sync::RwLock;

use crate::error::AppError;

use super::{
    events::ClipboardDomainEvent, history::ClipboardHistory, record::ClipboardRecord,
    types::RecordId,
};

pub trait ClipboardRecordRepository: Send + Sync {
    fn add_text_record(
        &self,
        text: String,
        captured_at: i64,
    ) -> Result<Vec<ClipboardDomainEvent>, AppError>;

    fn get_recent(&self, limit: usize) -> Vec<ClipboardRecord>;
    fn get_by_id(&self, id: RecordId) -> Option<ClipboardRecord>;
    fn delete(&self, id: RecordId) -> Result<RecordId, AppError>;
}

pub struct InMemoryClipboardRepository {
    history: RwLock<ClipboardHistory>,
}

impl InMemoryClipboardRepository {
    pub fn new(max_records: usize) -> Self {
        Self {
            history: RwLock::new(ClipboardHistory::new(max_records)),
        }
    }

    pub fn count(&self) -> usize {
        self.history.read().expect("history poisoned").count()
    }
}

impl ClipboardRecordRepository for InMemoryClipboardRepository {
    fn add_text_record(
        &self,
        text: String,
        captured_at: i64,
    ) -> Result<Vec<ClipboardDomainEvent>, AppError> {
        let mut history = self.history.write().expect("history poisoned");
        Ok(history.add_record(text, captured_at))
    }

    fn get_recent(&self, limit: usize) -> Vec<ClipboardRecord> {
        self.history.read().expect("history poisoned").recent(limit)
    }

    fn get_by_id(&self, id: RecordId) -> Option<ClipboardRecord> {
        self.history.read().expect("history poisoned").get_by_id(id)
    }

    fn delete(&self, id: RecordId) -> Result<RecordId, AppError> {
        let mut history = self.history.write().expect("history poisoned");
        history
            .remove_record(id)
            .ok_or_else(|| AppError::RecordNotFound(id.value()))
    }
}
