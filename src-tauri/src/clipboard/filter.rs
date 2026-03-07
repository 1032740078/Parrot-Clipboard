use crate::{
    config::schema::BlacklistRule, platform::ActiveApplication,
    settings::blacklist::normalize_identifier,
};

use super::record::ClipboardRecord;

pub fn is_duplicate_of_latest(latest: Option<&ClipboardRecord>, incoming_text: &str) -> bool {
    latest
        .map(|record| record.text_content == incoming_text)
        .unwrap_or(false)
}

pub fn find_record_index_by_text(
    records: &[ClipboardRecord],
    incoming_text: &str,
) -> Option<usize> {
    records
        .iter()
        .position(|record| record.text_content == incoming_text)
}

pub fn match_blacklist_rule<'a>(
    rules: &'a [BlacklistRule],
    active_application: &ActiveApplication,
) -> Option<&'a BlacklistRule> {
    rules.iter().find(|rule| {
        rule.enabled
            && rule.platform == active_application.platform
            && active_application
                .identifier_for(rule.match_type)
                .map(normalize_identifier)
                .map(|current| current == normalize_identifier(&rule.app_identifier))
                .unwrap_or(false)
    })
}

#[cfg(test)]
mod tests {
    use crate::{
        config::schema::{BlacklistMatchType, BlacklistRule, PlatformKind},
        platform::ActiveApplication,
    };

    use super::match_blacklist_rule;

    fn build_rule(match_type: BlacklistMatchType, app_identifier: &str) -> BlacklistRule {
        BlacklistRule {
            id: format!("rule-{app_identifier}"),
            app_name: "测试应用".to_string(),
            platform: PlatformKind::Windows,
            match_type,
            app_identifier: app_identifier.to_string(),
            enabled: true,
            created_at: 1,
            updated_at: 1,
        }
    }

    fn active_application() -> ActiveApplication {
        ActiveApplication {
            platform: PlatformKind::Windows,
            app_name: Some("WeChat".to_string()),
            bundle_id: None,
            process_name: Some("wechat.exe".to_string()),
            app_id: Some("wechat.exe".to_string()),
            wm_class: None,
        }
    }

    #[test]
    fn matches_enabled_rule_by_current_identifier() {
        let rules = vec![build_rule(BlacklistMatchType::AppId, "WECHAT.EXE")];
        let matched = match_blacklist_rule(&rules, &active_application());

        assert_eq!(
            matched.map(|rule| rule.id.as_str()),
            Some("rule-WECHAT.EXE")
        );
    }

    #[test]
    fn matches_linux_wm_class_rule() {
        let rules = vec![BlacklistRule {
            id: "rule-linux-wezterm".to_string(),
            app_name: "WezTerm".to_string(),
            platform: PlatformKind::Linux,
            match_type: BlacklistMatchType::WmClass,
            app_identifier: "Org.Wezfurlong.Wezterm".to_string(),
            enabled: true,
            created_at: 1,
            updated_at: 1,
        }];
        let active_application = ActiveApplication {
            platform: PlatformKind::Linux,
            app_name: Some("WezTerm".to_string()),
            bundle_id: None,
            process_name: Some("wezterm".to_string()),
            app_id: None,
            wm_class: Some("org.wezfurlong.wezterm".to_string()),
        };

        let matched = match_blacklist_rule(&rules, &active_application);
        assert_eq!(
            matched.map(|rule| rule.id.as_str()),
            Some("rule-linux-wezterm")
        );
    }

    #[test]
    fn ignores_disabled_or_other_platform_rules() {
        let mut disabled = build_rule(BlacklistMatchType::ProcessName, "wechat.exe");
        disabled.enabled = false;
        let mut other_platform = build_rule(BlacklistMatchType::ProcessName, "wechat.exe");
        other_platform.platform = PlatformKind::Linux;

        let rules = vec![disabled, other_platform];
        assert!(match_blacklist_rule(&rules, &active_application()).is_none());
    }
}
