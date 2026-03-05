use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AppConfig {
    pub max_text_records: usize,
    pub toggle_shortcut: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            max_text_records: 20,
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
        assert_eq!(config.max_text_records, 20);
        assert_eq!(config.toggle_shortcut, "Shift+Command+V");
    }
}
