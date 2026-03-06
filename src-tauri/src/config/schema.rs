use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct AppConfig {
    pub max_text_records: usize,
    pub max_image_records: usize,
    pub max_file_records: usize,
    pub toggle_shortcut: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            max_text_records: 200,
            max_image_records: 50,
            max_file_records: 100,
            toggle_shortcut: "Shift+Command+V".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::AppConfig;

    #[test]
    fn default_config_matches_contract() {
        let config = AppConfig::default();
        assert_eq!(config.max_text_records, 200);
        assert_eq!(config.max_image_records, 50);
        assert_eq!(config.max_file_records, 100);
        assert_eq!(config.toggle_shortcut, "Shift+Command+V");
    }

    #[test]
    fn deserialize_legacy_config_fills_new_retention_limits() {
        let config: AppConfig = serde_json::from_str(
            r#"{
                "max_text_records": 32,
                "toggle_shortcut": "Shift+Command+V"
            }"#,
        )
        .expect("legacy config should deserialize");

        assert_eq!(config.max_text_records, 32);
        assert_eq!(config.max_image_records, 50);
        assert_eq!(config.max_file_records, 100);
        assert_eq!(config.toggle_shortcut, "Shift+Command+V");
    }
}
