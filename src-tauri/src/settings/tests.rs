use crate::config::schema::{
    BlacklistMatchType, GeneralConfig, HistoryConfig, PlatformKind, ShortcutConfig, ThemeMode,
};

use super::{BlacklistRuleDraft, SettingsError, SettingsProfile, SettingsValidationService};

#[test]
fn settings_profile_accepts_default_config() {
    let profile = SettingsProfile::new(crate::config::AppConfig::default())
        .expect("default config should be valid");

    assert_eq!(profile.config().config_version, 2);
    assert_eq!(profile.general().theme, ThemeMode::System);
    assert!(profile.blacklist_rules().is_empty());
}

#[test]
fn update_general_rejects_unsupported_language() {
    let mut profile = SettingsProfile::default();

    let error = profile
        .update_general(GeneralConfig {
            theme: ThemeMode::Dark,
            language: "en-US".to_string(),
            launch_at_login: true,
        })
        .expect_err("unsupported language should fail");

    assert_eq!(
        error,
        SettingsError::Validation("当前版本仅支持 zh-CN 语言配置".to_string())
    );
}

#[test]
fn update_history_rejects_zero_limits() {
    let mut profile = SettingsProfile::default();

    let error = profile
        .update_history(HistoryConfig {
            max_text_records: 0,
            ..HistoryConfig::default()
        })
        .expect_err("zero text limit should fail");

    assert_eq!(
        error,
        SettingsError::Validation("history.max_text_records 必须大于 0".to_string())
    );
}

#[test]
fn update_shortcut_rejects_empty_value() {
    let mut profile = SettingsProfile::default();

    let error = profile
        .update_shortcut(ShortcutConfig {
            toggle_panel: "   ".to_string(),
        })
        .expect_err("empty shortcut should fail");

    assert_eq!(
        error,
        SettingsError::Validation("shortcut.toggle_panel 不能为空".to_string())
    );
}

#[test]
fn create_blacklist_rule_normalizes_identifier_and_persists() {
    let mut profile = SettingsProfile::default();

    let rule = profile
        .create_blacklist_rule(
            BlacklistRuleDraft {
                app_name: " 微信 ".to_string(),
                platform: PlatformKind::Macos,
                match_type: BlacklistMatchType::BundleId,
                app_identifier: " Com.Tencent.XinWeChat ".to_string(),
                enabled: true,
            },
            1_773_000_000_000,
        )
        .expect("rule should be created");

    assert_eq!(profile.blacklist_rules().len(), 1);
    assert_eq!(rule.app_name, "微信");
    assert_eq!(rule.app_identifier, "com.tencent.xinwechat");
    assert_eq!(rule.created_at, 1_773_000_000_000);
    assert_eq!(rule.updated_at, 1_773_000_000_000);
}

#[test]
fn create_blacklist_rule_rejects_duplicate_identifier() {
    let mut profile = SettingsProfile::default();
    profile
        .create_blacklist_rule(
            BlacklistRuleDraft {
                app_name: "微信".to_string(),
                platform: PlatformKind::Macos,
                match_type: BlacklistMatchType::BundleId,
                app_identifier: "com.tencent.xinwechat".to_string(),
                enabled: true,
            },
            1_000,
        )
        .expect("first rule should be created");

    let error = profile
        .create_blacklist_rule(
            BlacklistRuleDraft {
                app_name: "微信-重复".to_string(),
                platform: PlatformKind::Macos,
                match_type: BlacklistMatchType::BundleId,
                app_identifier: " COM.TENCENT.XINWECHAT ".to_string(),
                enabled: false,
            },
            2_000,
        )
        .expect_err("duplicate rule should fail");

    assert_eq!(
        error,
        SettingsError::BlacklistRuleDuplicate {
            platform: PlatformKind::Macos,
            match_type: BlacklistMatchType::BundleId,
            app_identifier: "com.tencent.xinwechat".to_string(),
        }
    );
}

#[test]
fn update_blacklist_rule_preserves_created_at_and_refreshes_updated_at() {
    let mut profile = SettingsProfile::default();
    let created = profile
        .create_blacklist_rule(
            BlacklistRuleDraft {
                app_name: "微信".to_string(),
                platform: PlatformKind::Macos,
                match_type: BlacklistMatchType::BundleId,
                app_identifier: "com.tencent.xinwechat".to_string(),
                enabled: true,
            },
            1_000,
        )
        .expect("rule should be created");

    let updated = profile
        .update_blacklist_rule(
            &created.id,
            BlacklistRuleDraft {
                app_name: "企业微信".to_string(),
                platform: PlatformKind::Macos,
                match_type: BlacklistMatchType::BundleId,
                app_identifier: "com.tencent.wework".to_string(),
                enabled: false,
            },
            2_000,
        )
        .expect("rule should update");

    assert_eq!(updated.id, created.id);
    assert_eq!(updated.created_at, 1_000);
    assert_eq!(updated.updated_at, 2_000);
    assert_eq!(updated.app_name, "企业微信");
    assert_eq!(updated.app_identifier, "com.tencent.wework");
    assert!(!updated.enabled);
}

#[test]
fn delete_blacklist_rule_removes_existing_rule() {
    let mut profile = SettingsProfile::default();
    let created = profile
        .create_blacklist_rule(
            BlacklistRuleDraft {
                app_name: "微信".to_string(),
                platform: PlatformKind::Macos,
                match_type: BlacklistMatchType::BundleId,
                app_identifier: "com.tencent.xinwechat".to_string(),
                enabled: true,
            },
            1_000,
        )
        .expect("rule should be created");

    let deleted = profile
        .delete_blacklist_rule(&created.id)
        .expect("rule should delete");

    assert_eq!(deleted.id, created.id);
    assert!(profile.blacklist_rules().is_empty());
}

#[test]
fn validation_service_rejects_invalid_blacklist_rule() {
    let error = SettingsValidationService::validate_blacklist_draft(&BlacklistRuleDraft {
        app_name: "  ".to_string(),
        platform: PlatformKind::Windows,
        match_type: BlacklistMatchType::AppId,
        app_identifier: "".to_string(),
        enabled: true,
    })
    .expect_err("invalid draft should fail");

    assert_eq!(
        error,
        SettingsError::Validation("blacklist.app_name 不能为空".to_string())
    );
}
