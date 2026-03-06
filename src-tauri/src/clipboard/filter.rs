use super::record::ClipboardRecord;

pub fn is_duplicate_of_latest(latest: Option<&ClipboardRecord>, incoming_text: &str) -> bool {
    latest
        .map(|record| record.text_content == incoming_text)
        .unwrap_or(false)
}

pub fn find_record_index_by_text(records: &[ClipboardRecord], incoming_text: &str) -> Option<usize> {
    records
        .iter()
        .position(|record| record.text_content == incoming_text)
}
