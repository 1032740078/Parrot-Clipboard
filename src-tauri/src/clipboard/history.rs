#![allow(dead_code)]

use super::{
    events::ClipboardDomainEvent,
    filter::{find_record_index_by_text, is_duplicate_of_latest},
    record::ClipboardRecord,
    types::RecordId,
};

pub struct ClipboardHistory {
    records: Vec<ClipboardRecord>,
    max_records: usize,
    next_id: u64,
}

impl ClipboardHistory {
    pub const DEFAULT_MAX_RECORDS: usize = 20;

    pub fn new(max_records: usize) -> Self {
        Self {
            records: Vec::new(),
            max_records,
            next_id: 1,
        }
    }

    pub fn add_record(&mut self, text: String, captured_at: i64) -> Vec<ClipboardDomainEvent> {
        if text.trim().is_empty() {
            return Vec::new();
        }

        if is_duplicate_of_latest(self.records.first(), &text) {
            return Vec::new();
        }

        if let Some(existing_index) = find_record_index_by_text(&self.records, &text) {
            let mut record = self.records.remove(existing_index);
            record.created_at = captured_at;
            self.records.insert(0, record.clone());
            return vec![ClipboardDomainEvent::RecordAdded { record }];
        }

        let record = ClipboardRecord::new_text(RecordId::new(self.next_id), text, captured_at);
        self.next_id += 1;
        self.records.insert(0, record.clone());

        let mut events = vec![ClipboardDomainEvent::RecordAdded { record }];

        if self.records.len() > self.max_records {
            if let Some(evicted) = self.records.pop() {
                events.push(ClipboardDomainEvent::RecordEvicted {
                    id: RecordId::new(evicted.id),
                });
            }
        }

        events
    }

    pub fn promote_record(&mut self, id: RecordId) -> Option<ClipboardRecord> {
        let index = self
            .records
            .iter()
            .position(|record| record.id == id.value())?;

        if index == 0 {
            return self.records.first().cloned();
        }

        let record = self.records.remove(index);
        self.records.insert(0, record.clone());
        Some(record)
    }

    pub fn remove_record(&mut self, id: RecordId) -> Option<RecordId> {
        let index = self
            .records
            .iter()
            .position(|record| record.id == id.value())?;
        self.records.remove(index);
        Some(id)
    }

    pub fn get_by_id(&self, id: RecordId) -> Option<ClipboardRecord> {
        self.records
            .iter()
            .find(|record| record.id == id.value())
            .cloned()
    }

    pub fn records(&self) -> &[ClipboardRecord] {
        &self.records
    }

    pub fn recent(&self, limit: usize) -> Vec<ClipboardRecord> {
        self.records.iter().take(limit).cloned().collect()
    }

    pub fn count(&self) -> usize {
        self.records.len()
    }

    pub fn is_empty(&self) -> bool {
        self.records.is_empty()
    }
}

impl Default for ClipboardHistory {
    fn default() -> Self {
        Self::new(Self::DEFAULT_MAX_RECORDS)
    }
}

#[cfg(test)]
mod tests {
    use super::ClipboardHistory;
    use crate::clipboard::{events::ClipboardDomainEvent, types::RecordId};

    #[test]
    fn ut_hist_001_add_record_triggers_event() {
        let mut history = ClipboardHistory::new(20);
        let events = history.add_record("A".to_string(), 1000);
        assert_eq!(events.len(), 1);
        assert!(matches!(
            events[0],
            ClipboardDomainEvent::RecordAdded { .. }
        ));
    }

    #[test]
    fn ut_hist_002_full_capacity_triggers_evicted_event() {
        let mut history = ClipboardHistory::new(2);
        history.add_record("A".to_string(), 1000);
        history.add_record("B".to_string(), 2000);
        let events = history.add_record("C".to_string(), 3000);

        assert_eq!(events.len(), 2);
        assert!(events
            .iter()
            .any(|event| matches!(event, ClipboardDomainEvent::RecordEvicted { .. })));
    }

    #[test]
    fn ut_hist_003_duplicate_text_returns_empty_events() {
        let mut history = ClipboardHistory::new(20);
        history.add_record("same".to_string(), 1000);
        let events = history.add_record("same".to_string(), 2000);

        assert!(events.is_empty());
        assert_eq!(history.count(), 1);
    }

    #[test]
    fn ut_hist_003b_duplicate_of_non_latest_moves_existing_record_to_front() {
        let mut history = ClipboardHistory::new(20);
        history.add_record("A".to_string(), 1000);
        history.add_record("B".to_string(), 2000);

        let events = history.add_record("A".to_string(), 3000);

        assert_eq!(history.count(), 2);
        assert_eq!(history.records()[0].text_content, "A");
        assert_eq!(history.records()[0].created_at, 3000);
        assert_eq!(history.records()[1].text_content, "B");
        assert_eq!(events.len(), 1);

        match &events[0] {
            ClipboardDomainEvent::RecordAdded { record } => {
                assert_eq!(record.text_content, "A");
                assert_eq!(record.created_at, 3000);
            }
            _ => panic!("expect added event"),
        }
    }

    #[test]
    fn ut_hist_004_delete_triggers_removed_event_semantics() {
        let mut history = ClipboardHistory::new(20);
        let events = history.add_record("to delete".to_string(), 1000);

        let id = match &events[0] {
            ClipboardDomainEvent::RecordAdded { record } => RecordId::new(record.id),
            _ => panic!("expect added event"),
        };

        let removed_id = history.remove_record(id);
        assert_eq!(removed_id, Some(id));

        let removed_event = ClipboardDomainEvent::RecordRemoved { id };
        assert!(matches!(
            removed_event,
            ClipboardDomainEvent::RecordRemoved { .. }
        ));
    }

    #[test]
    fn ut_hist_005_delete_reduces_length() {
        let mut history = ClipboardHistory::new(20);
        let events = history.add_record("to delete".to_string(), 1000);

        let id = match &events[0] {
            ClipboardDomainEvent::RecordAdded { record } => RecordId::new(record.id),
            _ => panic!("expect added event"),
        };

        let before = history.count();
        history.remove_record(id);
        assert_eq!(history.count(), before - 1);
    }

    #[test]
    fn ut_hist_006_promote_record_moves_existing_record_to_front_without_creating_new_one() {
        let mut history = ClipboardHistory::new(20);
        history.add_record("A".to_string(), 1000);
        let events = history.add_record("B".to_string(), 2000);

        let id = match &events[0] {
            ClipboardDomainEvent::RecordAdded { record } => RecordId::new(record.id),
            _ => panic!("expect added event"),
        };

        let promoted = history.promote_record(id).expect("record should exist");

        assert_eq!(history.count(), 2);
        assert_eq!(promoted.id, id.value());
        assert_eq!(history.records()[0].id, id.value());
        assert_eq!(history.records()[0].created_at, 2000);
    }
}
