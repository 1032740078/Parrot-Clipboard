use super::record::ClipboardRecord;

pub fn is_duplicate_of_latest(latest: Option<&ClipboardRecord>, incoming_text: &str) -> bool {
    latest
        .map(|record| record.text_content == incoming_text)
        .unwrap_or(false)
}
