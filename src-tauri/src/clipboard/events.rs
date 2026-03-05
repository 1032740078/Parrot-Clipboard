#![allow(dead_code)]
#![allow(clippy::enum_variant_names)]

use super::{record::ClipboardRecord, types::RecordId};

#[derive(Debug, Clone)]
pub enum ClipboardDomainEvent {
    RecordAdded { record: ClipboardRecord },
    RecordEvicted { id: RecordId },
    RecordRemoved { id: RecordId },
}
