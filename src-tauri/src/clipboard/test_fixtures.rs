#![allow(dead_code)]

use super::{record::ClipboardRecord, types::RecordId};

pub fn record(id: u64, text: &str, created_at: i64) -> ClipboardRecord {
    ClipboardRecord::new_text(RecordId::new(id), text.to_string(), created_at)
}

pub fn records() -> Vec<ClipboardRecord> {
    vec![
        record(1, "Alpha", 1000),
        record(2, "Beta", 2000),
        record(3, "Gamma", 3000),
    ]
}
