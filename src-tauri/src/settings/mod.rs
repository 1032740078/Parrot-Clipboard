pub mod blacklist;
pub mod model;
pub mod validator;

use std::fmt;

pub use blacklist::BlacklistRuleDraft;
pub use model::SettingsProfile;
pub use validator::SettingsValidationService;

use crate::config::schema::{BlacklistMatchType, PlatformKind};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SettingsError {
    Validation(String),
    BlacklistRuleDuplicate {
        platform: PlatformKind,
        match_type: BlacklistMatchType,
        app_identifier: String,
    },
    BlacklistRuleNotFound(String),
}

impl SettingsError {
    pub fn validation(message: impl Into<String>) -> Self {
        Self::Validation(message.into())
    }
}

impl fmt::Display for SettingsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Validation(message) => write!(f, "{message}"),
            Self::BlacklistRuleDuplicate {
                platform,
                match_type,
                app_identifier,
            } => write!(
                f,
                "同一平台与匹配类型下已存在相同应用标识：platform={platform:?}, match_type={match_type:?}, app_identifier={app_identifier}"
            ),
            Self::BlacklistRuleNotFound(rule_id) => {
                write!(f, "黑名单规则 `{rule_id}` 不存在")
            }
        }
    }
}

impl std::error::Error for SettingsError {}

#[cfg(test)]
mod tests;
