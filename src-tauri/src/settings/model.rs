use crate::config::schema::{
    AppConfig, BlacklistRule, GeneralConfig, HistoryConfig, PrivacyConfig, ShortcutConfig,
};

use super::{
    blacklist::{build_rule, is_duplicate_rule, update_rule, BlacklistRuleDraft},
    SettingsError, SettingsValidationService,
};

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SettingsProfile {
    config: AppConfig,
}

impl SettingsProfile {
    pub fn new(config: AppConfig) -> Result<Self, SettingsError> {
        SettingsValidationService::validate_config(&config)?;
        Ok(Self { config })
    }

    pub fn config(&self) -> &AppConfig {
        &self.config
    }

    pub fn snapshot(&self) -> AppConfig {
        self.config.clone()
    }

    pub fn general(&self) -> &GeneralConfig {
        &self.config.general
    }

    pub fn history(&self) -> &HistoryConfig {
        &self.config.history
    }

    pub fn shortcut(&self) -> &ShortcutConfig {
        &self.config.shortcut
    }

    pub fn privacy(&self) -> &PrivacyConfig {
        &self.config.privacy
    }

    pub fn blacklist_rules(&self) -> &[BlacklistRule] {
        &self.config.privacy.blacklist_rules
    }

    pub fn update_general(&mut self, general: GeneralConfig) -> Result<(), SettingsError> {
        SettingsValidationService::validate_general(&general)?;
        self.config.general = general;
        Ok(())
    }

    pub fn update_history(&mut self, history: HistoryConfig) -> Result<(), SettingsError> {
        SettingsValidationService::validate_history(&history)?;
        self.config.history = history;
        Ok(())
    }

    pub fn update_shortcut(&mut self, shortcut: ShortcutConfig) -> Result<(), SettingsError> {
        SettingsValidationService::validate_shortcut(&shortcut)?;
        self.config.shortcut = shortcut;
        Ok(())
    }

    pub fn create_blacklist_rule(
        &mut self,
        draft: BlacklistRuleDraft,
        timestamp: i64,
    ) -> Result<BlacklistRule, SettingsError> {
        SettingsValidationService::validate_blacklist_draft(&draft)?;
        self.ensure_blacklist_rule_not_duplicated(None, &draft)?;

        let rule = build_rule(&draft, timestamp);
        self.config.privacy.blacklist_rules.push(rule.clone());
        Ok(rule)
    }

    pub fn update_blacklist_rule(
        &mut self,
        rule_id: &str,
        draft: BlacklistRuleDraft,
        timestamp: i64,
    ) -> Result<BlacklistRule, SettingsError> {
        SettingsValidationService::validate_blacklist_draft(&draft)?;
        self.ensure_blacklist_rule_not_duplicated(Some(rule_id), &draft)?;

        let Some(index) = self
            .config
            .privacy
            .blacklist_rules
            .iter()
            .position(|rule| rule.id == rule_id)
        else {
            return Err(SettingsError::BlacklistRuleNotFound(rule_id.to_string()));
        };

        let updated = update_rule(
            &self.config.privacy.blacklist_rules[index],
            &draft,
            timestamp,
        );
        self.config.privacy.blacklist_rules[index] = updated.clone();
        Ok(updated)
    }

    pub fn delete_blacklist_rule(&mut self, rule_id: &str) -> Result<BlacklistRule, SettingsError> {
        let Some(index) = self
            .config
            .privacy
            .blacklist_rules
            .iter()
            .position(|rule| rule.id == rule_id)
        else {
            return Err(SettingsError::BlacklistRuleNotFound(rule_id.to_string()));
        };

        Ok(self.config.privacy.blacklist_rules.remove(index))
    }

    fn ensure_blacklist_rule_not_duplicated(
        &self,
        exclude_rule_id: Option<&str>,
        draft: &BlacklistRuleDraft,
    ) -> Result<(), SettingsError> {
        if self
            .config
            .privacy
            .blacklist_rules
            .iter()
            .any(|rule| exclude_rule_id != Some(rule.id.as_str()) && is_duplicate_rule(rule, draft))
        {
            let normalized = draft.normalized();
            return Err(SettingsError::BlacklistRuleDuplicate {
                platform: normalized.platform,
                match_type: normalized.match_type,
                app_identifier: normalized.app_identifier,
            });
        }

        Ok(())
    }
}

impl From<AppConfig> for SettingsProfile {
    fn from(config: AppConfig) -> Self {
        Self { config }
    }
}

impl From<SettingsProfile> for AppConfig {
    fn from(value: SettingsProfile) -> Self {
        value.config
    }
}
