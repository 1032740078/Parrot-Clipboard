use serde::{Deserialize, Serialize};

use crate::config::schema::{BlacklistMatchType, BlacklistRule, PlatformKind};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BlacklistRuleDraft {
    pub app_name: String,
    pub platform: PlatformKind,
    pub match_type: BlacklistMatchType,
    pub app_identifier: String,
    pub enabled: bool,
}

impl BlacklistRuleDraft {
    pub fn normalized(&self) -> Self {
        Self {
            app_name: self.app_name.trim().to_string(),
            platform: self.platform,
            match_type: self.match_type,
            app_identifier: normalize_identifier(&self.app_identifier),
            enabled: self.enabled,
        }
    }
}

pub fn build_rule(draft: &BlacklistRuleDraft, timestamp: i64) -> BlacklistRule {
    let draft = draft.normalized();
    let id = build_rule_id(&draft, timestamp);

    BlacklistRule {
        id,
        app_name: draft.app_name,
        platform: draft.platform,
        match_type: draft.match_type,
        app_identifier: draft.app_identifier,
        enabled: draft.enabled,
        created_at: timestamp,
        updated_at: timestamp,
    }
}

pub fn update_rule(
    existing: &BlacklistRule,
    draft: &BlacklistRuleDraft,
    timestamp: i64,
) -> BlacklistRule {
    let draft = draft.normalized();

    BlacklistRule {
        id: existing.id.clone(),
        app_name: draft.app_name,
        platform: draft.platform,
        match_type: draft.match_type,
        app_identifier: draft.app_identifier,
        enabled: draft.enabled,
        created_at: existing.created_at,
        updated_at: timestamp,
    }
}

pub fn is_duplicate_rule(existing: &BlacklistRule, draft: &BlacklistRuleDraft) -> bool {
    let draft = draft.normalized();

    existing.platform == draft.platform
        && existing.match_type == draft.match_type
        && normalize_identifier(&existing.app_identifier) == draft.app_identifier
}

pub fn normalize_identifier(identifier: &str) -> String {
    identifier.trim().to_ascii_lowercase()
}

fn build_rule_id(draft: &BlacklistRuleDraft, timestamp: i64) -> String {
    let slug = draft
        .app_identifier
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
        .collect::<String>()
        .trim_matches('_')
        .to_string();

    format!(
        "blr_{:?}_{:?}_{}_{}",
        draft.platform, draft.match_type, slug, timestamp
    )
    .to_ascii_lowercase()
}
