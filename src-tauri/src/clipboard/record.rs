#![allow(dead_code)]

use serde::{Deserialize, Serialize};

use super::types::{ContentType, RecordId};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ClipboardRecord {
    pub id: u64,
    pub content_type: ContentType,
    pub text_content: String,
    pub created_at: i64,
}

impl ClipboardRecord {
    pub fn new_text(id: RecordId, text: String, created_at: i64) -> Self {
        Self {
            id: id.value(),
            content_type: ContentType::Text,
            text_content: text,
            created_at,
        }
    }

    pub fn preview_text(&self, max_chars: usize) -> &str {
        if max_chars == 0 {
            ""
        } else {
            self.text_content
                .get(..max_chars)
                .unwrap_or(&self.text_content)
        }
    }

    pub fn char_count(&self) -> usize {
        self.text_content.chars().count()
    }
}
