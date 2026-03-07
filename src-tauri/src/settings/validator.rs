use crate::config::schema::{
    AppConfig, BlacklistRule, GeneralConfig, HistoryConfig, ShortcutConfig,
};

use super::{blacklist::BlacklistRuleDraft, SettingsError};

pub struct SettingsValidationService;

impl SettingsValidationService {
    pub fn validate_config(config: &AppConfig) -> Result<(), SettingsError> {
        Self::validate_general(&config.general)?;
        Self::validate_history(&config.history)?;
        Self::validate_shortcut(&config.shortcut)?;

        for rule in &config.privacy.blacklist_rules {
            Self::validate_blacklist_rule(rule)?;
        }

        Ok(())
    }

    pub fn validate_general(general: &GeneralConfig) -> Result<(), SettingsError> {
        if general.language.trim().is_empty() {
            return Err(SettingsError::validation("language 不能为空"));
        }

        if general.language != "zh-CN" {
            return Err(SettingsError::validation("当前版本仅支持 zh-CN 语言配置"));
        }

        Ok(())
    }

    pub fn validate_history(history: &HistoryConfig) -> Result<(), SettingsError> {
        validate_positive("history.max_text_records", history.max_text_records)?;
        validate_positive("history.max_image_records", history.max_image_records)?;
        validate_positive("history.max_file_records", history.max_file_records)?;
        validate_positive("history.max_image_storage_mb", history.max_image_storage_mb)?;

        Ok(())
    }

    pub fn validate_shortcut(shortcut: &ShortcutConfig) -> Result<(), SettingsError> {
        if shortcut.toggle_panel.trim().is_empty() {
            return Err(SettingsError::validation("shortcut.toggle_panel 不能为空"));
        }

        Ok(())
    }

    pub fn validate_blacklist_rule(rule: &BlacklistRule) -> Result<(), SettingsError> {
        let draft = BlacklistRuleDraft {
            app_name: rule.app_name.clone(),
            platform: rule.platform,
            match_type: rule.match_type,
            app_identifier: rule.app_identifier.clone(),
            enabled: rule.enabled,
        };

        Self::validate_blacklist_draft(&draft)
    }

    pub fn validate_blacklist_draft(draft: &BlacklistRuleDraft) -> Result<(), SettingsError> {
        if draft.app_name.trim().is_empty() {
            return Err(SettingsError::validation("blacklist.app_name 不能为空"));
        }

        if draft.app_identifier.trim().is_empty() {
            return Err(SettingsError::validation(
                "blacklist.app_identifier 不能为空",
            ));
        }

        Ok(())
    }
}

fn validate_positive(field: &str, value: usize) -> Result<(), SettingsError> {
    if value == 0 {
        return Err(SettingsError::validation(format!("{field} 必须大于 0")));
    }

    Ok(())
}
