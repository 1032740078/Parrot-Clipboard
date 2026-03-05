#![allow(dead_code)]

use crate::error::AppError;

use super::{filter::is_duplicate_of_latest, record::ClipboardRecord, types::RecordId};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InsertResult {
    pub inserted_id: u64,
    pub evicted_id: Option<u64>,
    pub inserted: bool,
}

pub struct InMemoryStore {
    max_records: usize,
    records: Vec<ClipboardRecord>,
    next_id: u64,
}

impl InMemoryStore {
    pub fn new(max_records: usize) -> Self {
        Self {
            max_records,
            records: Vec::new(),
            next_id: 1,
        }
    }

    pub fn insert(&mut self, text: String, created_at: i64) -> InsertResult {
        if is_duplicate_of_latest(self.records.first(), &text) {
            let latest_id = self.records.first().map(|record| record.id).unwrap_or(0);
            return InsertResult {
                inserted_id: latest_id,
                evicted_id: None,
                inserted: false,
            };
        }

        let id = self.next_id;
        self.next_id += 1;
        let record = ClipboardRecord::new_text(RecordId::new(id), text, created_at);
        self.records.insert(0, record);

        let mut evicted_id = None;
        if self.records.len() > self.max_records {
            if let Some(evicted) = self.records.pop() {
                evicted_id = Some(evicted.id);
            }
        }

        InsertResult {
            inserted_id: id,
            evicted_id,
            inserted: true,
        }
    }

    pub fn get_recent(&self, limit: usize) -> Vec<ClipboardRecord> {
        self.records.iter().take(limit).cloned().collect()
    }

    pub fn get_by_id(&self, id: u64) -> Option<ClipboardRecord> {
        self.records.iter().find(|record| record.id == id).cloned()
    }

    pub fn delete(&mut self, id: u64) -> Result<(), AppError> {
        let Some(index) = self.records.iter().position(|record| record.id == id) else {
            return Err(AppError::RecordNotFound(id));
        };

        self.records.remove(index);
        Ok(())
    }

    pub fn latest_text(&self) -> Option<&str> {
        self.records
            .first()
            .map(|record| record.text_content.as_str())
    }

    pub fn count(&self) -> usize {
        self.records.len()
    }
}

#[cfg(test)]
mod tests {
    use super::InMemoryStore;

    #[test]
    fn ut_store_001_insert_then_query() {
        let mut store = InMemoryStore::new(20);
        let result = store.insert("Hello".to_string(), 1000);

        assert!(result.inserted);
        assert_eq!(store.count(), 1);
        assert_eq!(
            store.get_by_id(result.inserted_id).unwrap().text_content,
            "Hello"
        );
    }

    #[test]
    fn ut_store_002_duplicate_content_not_inserted() {
        let mut store = InMemoryStore::new(20);
        store.insert("same".to_string(), 1000);
        let result = store.insert("same".to_string(), 2000);

        assert!(!result.inserted);
        assert_eq!(store.count(), 1);
    }

    #[test]
    fn ut_store_003_over_limit_evict_oldest() {
        let mut store = InMemoryStore::new(2);
        store.insert("A".to_string(), 1000);
        store.insert("B".to_string(), 2000);
        let result = store.insert("C".to_string(), 3000);

        assert!(result.inserted);
        assert_eq!(result.evicted_id, Some(1));
        assert_eq!(store.count(), 2);
        assert!(store.get_by_id(1).is_none());
    }

    #[test]
    fn ut_store_004_delete_existing_record() {
        let mut store = InMemoryStore::new(20);
        let result = store.insert("to delete".to_string(), 1000);

        let deleted = store.delete(result.inserted_id);
        assert!(deleted.is_ok());
        assert_eq!(store.count(), 0);
    }

    #[test]
    fn ut_store_005_delete_non_existing_returns_error() {
        let mut store = InMemoryStore::new(20);
        let deleted = store.delete(999);
        assert!(deleted.is_err());
    }

    #[test]
    fn ut_store_006_recent_returns_desc_order() {
        let mut store = InMemoryStore::new(20);
        store.insert("A".to_string(), 1000);
        store.insert("B".to_string(), 2000);
        let recent = store.get_recent(20);

        assert_eq!(recent[0].text_content, "B");
        assert_eq!(recent[1].text_content, "A");
    }

    #[test]
    fn ut_store_007_get_by_id_returns_correct_record() {
        let mut store = InMemoryStore::new(20);
        let result = store.insert("A".to_string(), 1000);
        assert_eq!(
            store.get_by_id(result.inserted_id).unwrap().text_content,
            "A"
        );
    }

    #[test]
    fn ut_store_008_empty_returns_empty_list() {
        let store = InMemoryStore::new(20);
        assert!(store.get_recent(20).is_empty());
    }
}
