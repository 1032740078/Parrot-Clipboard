use serde::{de::Error as DeError, Deserialize, Deserializer, Serialize};

const CONFIG_VERSION_V2: u8 = 2;
const DEFAULT_MAX_TEXT_RECORDS: usize = 200;
const DEFAULT_MAX_IMAGE_RECORDS: usize = 50;
const DEFAULT_MAX_FILE_RECORDS: usize = 100;
const DEFAULT_MAX_IMAGE_STORAGE_MB: usize = 512;
const DEFAULT_LANGUAGE: &str = "zh-CN";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ThemeMode {
    Light,
    Dark,
    System,
}

impl Default for ThemeMode {
    fn default() -> Self {
        Self::System
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PlatformKind {
    Macos,
    Windows,
    Linux,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BlacklistMatchType {
    BundleId,
    ProcessName,
    AppId,
    WmClass,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct BlacklistRule {
    pub id: String,
    pub app_name: String,
    pub platform: PlatformKind,
    pub match_type: BlacklistMatchType,
    pub app_identifier: String,
    pub enabled: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

impl Default for BlacklistRule {
    fn default() -> Self {
        Self {
            id: String::new(),
            app_name: String::new(),
            platform: default_platform_kind(),
            match_type: default_blacklist_match_type(),
            app_identifier: String::new(),
            enabled: true,
            created_at: 0,
            updated_at: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct GeneralConfig {
    pub theme: ThemeMode,
    pub language: String,
    pub launch_at_login: bool,
}

impl Default for GeneralConfig {
    fn default() -> Self {
        Self {
            theme: ThemeMode::System,
            language: DEFAULT_LANGUAGE.to_string(),
            launch_at_login: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct HistoryConfig {
    pub max_text_records: usize,
    pub max_image_records: usize,
    pub max_file_records: usize,
    pub max_image_storage_mb: usize,
    pub capture_images: bool,
    pub capture_files: bool,
}

impl Default for HistoryConfig {
    fn default() -> Self {
        Self {
            max_text_records: DEFAULT_MAX_TEXT_RECORDS,
            max_image_records: DEFAULT_MAX_IMAGE_RECORDS,
            max_file_records: DEFAULT_MAX_FILE_RECORDS,
            max_image_storage_mb: DEFAULT_MAX_IMAGE_STORAGE_MB,
            capture_images: true,
            capture_files: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct ShortcutConfig {
    pub toggle_panel: String,
}

impl Default for ShortcutConfig {
    fn default() -> Self {
        Self {
            toggle_panel: default_toggle_shortcut(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(default)]
pub struct PrivacyConfig {
    pub blacklist_rules: Vec<BlacklistRule>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(default)]
pub struct AppConfig {
    pub config_version: u8,
    pub general: GeneralConfig,
    pub history: HistoryConfig,
    pub shortcut: ShortcutConfig,
    pub privacy: PrivacyConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            config_version: CONFIG_VERSION_V2,
            general: GeneralConfig::default(),
            history: HistoryConfig::default(),
            shortcut: ShortcutConfig::default(),
            privacy: PrivacyConfig::default(),
        }
    }
}

impl AppConfig {
    pub fn max_text_records(&self) -> usize {
        self.history.max_text_records
    }

    pub fn max_image_records(&self) -> usize {
        self.history.max_image_records
    }

    pub fn max_file_records(&self) -> usize {
        self.history.max_file_records
    }

    pub fn toggle_shortcut(&self) -> &str {
        &self.shortcut.toggle_panel
    }

    pub fn launch_at_login(&self) -> bool {
        self.general.launch_at_login
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn set_launch_at_login(&mut self, launch_at_login: bool) {
        self.general.launch_at_login = launch_at_login;
    }

    fn normalized(mut self) -> Self {
        self.config_version = CONFIG_VERSION_V2;
        if self.general.language.trim().is_empty() {
            self.general.language = DEFAULT_LANGUAGE.to_string();
        }
        if self.shortcut.toggle_panel.trim().is_empty() {
            self.shortcut.toggle_panel = default_toggle_shortcut();
        }
        self
    }
}

impl<'de> Deserialize<'de> for AppConfig {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = serde_json::Value::deserialize(deserializer)?;

        if looks_like_grouped_config(&value) {
            let config =
                serde_json::from_value::<GroupedAppConfig>(value).map_err(D::Error::custom)?;
            return Ok(config.into());
        }

        let config = serde_json::from_value::<LegacyFlatConfig>(value).map_err(D::Error::custom)?;
        Ok(config.into())
    }
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(default)]
struct GroupedAppConfig {
    config_version: Option<u8>,
    general: Option<GeneralConfig>,
    history: Option<HistoryConfig>,
    shortcut: Option<ShortcutConfig>,
    privacy: Option<PrivacyConfig>,
}

impl From<GroupedAppConfig> for AppConfig {
    fn from(value: GroupedAppConfig) -> Self {
        let default = AppConfig::default();
        AppConfig {
            config_version: value.config_version.unwrap_or(CONFIG_VERSION_V2),
            general: value.general.unwrap_or(default.general),
            history: value.history.unwrap_or(default.history),
            shortcut: value.shortcut.unwrap_or(default.shortcut),
            privacy: value.privacy.unwrap_or(default.privacy),
        }
        .normalized()
    }
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(default)]
struct LegacyFlatConfig {
    max_text_records: Option<usize>,
    max_image_records: Option<usize>,
    max_file_records: Option<usize>,
    toggle_shortcut: Option<String>,
    launch_at_login: Option<bool>,
}

impl From<LegacyFlatConfig> for AppConfig {
    fn from(value: LegacyFlatConfig) -> Self {
        let mut config = AppConfig::default();
        if let Some(max_text_records) = value.max_text_records {
            config.history.max_text_records = max_text_records;
        }
        if let Some(max_image_records) = value.max_image_records {
            config.history.max_image_records = max_image_records;
        }
        if let Some(max_file_records) = value.max_file_records {
            config.history.max_file_records = max_file_records;
        }
        if let Some(toggle_shortcut) = value.toggle_shortcut {
            config.shortcut.toggle_panel = toggle_shortcut;
        }
        if let Some(launch_at_login) = value.launch_at_login {
            config.general.launch_at_login = launch_at_login;
        }
        config.normalized()
    }
}

fn looks_like_grouped_config(value: &serde_json::Value) -> bool {
    let Some(object) = value.as_object() else {
        return false;
    };

    object.contains_key("config_version")
        || object.contains_key("general")
        || object.contains_key("history")
        || object.contains_key("shortcut")
        || object.contains_key("privacy")
}

pub fn platform_default_toggle_shortcut() -> String {
    default_toggle_shortcut()
}

fn default_toggle_shortcut() -> String {
    #[cfg(target_os = "macos")]
    {
        return "Shift+Command+V".to_string();
    }

    #[cfg(not(target_os = "macos"))]
    {
        "Shift+Control+V".to_string()
    }
}

fn default_platform_kind() -> PlatformKind {
    #[cfg(target_os = "windows")]
    {
        return PlatformKind::Windows;
    }

    #[cfg(target_os = "linux")]
    {
        return PlatformKind::Linux;
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        PlatformKind::Macos
    }
}

fn default_blacklist_match_type() -> BlacklistMatchType {
    #[cfg(target_os = "macos")]
    {
        return BlacklistMatchType::BundleId;
    }

    #[cfg(target_os = "windows")]
    {
        return BlacklistMatchType::AppId;
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        BlacklistMatchType::ProcessName
    }
}

#[cfg(test)]
mod tests {
    use super::{AppConfig, ThemeMode};

    #[test]
    fn default_config_matches_contract() {
        let config = AppConfig::default();

        assert_eq!(config.config_version, 2);
        assert_eq!(config.general.theme, ThemeMode::System);
        assert_eq!(config.general.language, "zh-CN");
        assert!(config.general.launch_at_login);
        assert_eq!(config.history.max_text_records, 200);
        assert_eq!(config.history.max_image_records, 50);
        assert_eq!(config.history.max_file_records, 100);
        assert_eq!(config.history.max_image_storage_mb, 512);
        assert!(config.history.capture_images);
        assert!(config.history.capture_files);
        assert!(config.privacy.blacklist_rules.is_empty());
    }

    #[test]
    fn deserialize_legacy_config_migrates_to_grouped_structure() {
        let config: AppConfig = serde_json::from_str(
            r#"{
                "max_text_records": 32,
                "max_image_records": 12,
                "max_file_records": 9,
                "toggle_shortcut": "Shift+Command+V",
                "launch_at_login": false
            }"#,
        )
        .expect("legacy config should deserialize");

        assert_eq!(config.config_version, 2);
        assert_eq!(config.history.max_text_records, 32);
        assert_eq!(config.history.max_image_records, 12);
        assert_eq!(config.history.max_file_records, 9);
        assert_eq!(config.shortcut.toggle_panel, "Shift+Command+V");
        assert!(!config.general.launch_at_login);
        assert_eq!(config.general.theme, ThemeMode::System);
        assert!(config.privacy.blacklist_rules.is_empty());
    }

    #[test]
    fn deserialize_partial_grouped_config_keeps_defaults_for_missing_sections() {
        let config: AppConfig = serde_json::from_str(
            r#"{
                "config_version": 1,
                "general": {
                  "theme": "dark",
                  "language": "zh-CN",
                  "launch_at_login": false
                },
                "history": {
                  "max_text_records": 80,
                  "max_image_records": 20,
                  "max_file_records": 10,
                  "max_image_storage_mb": 128,
                  "capture_images": false,
                  "capture_files": true
                }
            }"#,
        )
        .expect("grouped config should deserialize");

        assert_eq!(config.config_version, 2);
        assert_eq!(config.general.theme, ThemeMode::Dark);
        assert!(!config.general.launch_at_login);
        assert_eq!(config.history.max_text_records, 80);
        assert_eq!(config.history.max_image_storage_mb, 128);
        assert!(!config.history.capture_images);
        assert_eq!(
            config.shortcut.toggle_panel,
            super::default_toggle_shortcut()
        );
        assert!(config.privacy.blacklist_rules.is_empty());
    }
}
