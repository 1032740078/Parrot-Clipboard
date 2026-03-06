pub mod schema;

use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, RwLock},
};

use tauri::{AppHandle, Manager};

pub use schema::AppConfig;

pub struct ConfigStore {
    #[cfg_attr(not(test), allow(dead_code))]
    path: PathBuf,
    config: RwLock<AppConfig>,
}

impl ConfigStore {
    pub fn initialize(app_handle: &AppHandle) -> Result<Arc<Self>, String> {
        let path = resolve_config_path(app_handle)?;
        Self::initialize_at_path(path)
    }

    pub fn initialize_at_path(path: PathBuf) -> Result<Arc<Self>, String> {
        let config = load_or_create_at_path(&path)?;
        tracing::info!(
            path = %path.display(),
            max_text_records = config.max_text_records,
            max_image_records = config.max_image_records,
            max_file_records = config.max_file_records,
            toggle_shortcut = %config.toggle_shortcut,
            launch_at_login = config.launch_at_login,
            "application config loaded"
        );

        Ok(Arc::new(Self {
            path,
            config: RwLock::new(config),
        }))
    }

    pub fn current(&self) -> AppConfig {
        self.config
            .read()
            .expect("config read lock poisoned")
            .clone()
    }

    #[cfg(test)]
    pub fn set_launch_at_login(&self, launch_at_login: bool) -> Result<AppConfig, String> {
        let mut next = self.current();
        next.launch_at_login = launch_at_login;
        persist_config(&self.path, &next)?;
        *self.config.write().expect("config write lock poisoned") = next.clone();
        Ok(next)
    }
}

fn resolve_config_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path()
        .app_data_dir()
        .map(|dir| dir.join("config.json"))
        .map_err(|error| format!("resolve config path failed: {error}"))
}

fn load_or_create_at_path(path: &Path) -> Result<AppConfig, String> {
    if !path.exists() {
        let config = AppConfig::default();
        persist_config(path, &config)?;
        return Ok(config);
    }

    let raw = fs::read_to_string(path)
        .map_err(|error| format!("read config file `{}` failed: {error}", path.display()))?;
    let config: AppConfig = serde_json::from_str(&raw)
        .map_err(|error| format!("parse config file `{}` failed: {error}", path.display()))?;

    let normalized = serialize_config(&config)
        .map_err(|error| format!("serialize config file `{}` failed: {error}", path.display()))?;
    if raw != normalized {
        fs::write(path, normalized)
            .map_err(|error| format!("rewrite config file `{}` failed: {error}", path.display()))?;
    }

    Ok(config)
}

fn persist_config(path: &Path, config: &AppConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "create config directory `{}` failed: {error}",
                parent.display()
            )
        })?;
    }

    let content = serialize_config(config)
        .map_err(|error| format!("serialize config file `{}` failed: {error}", path.display()))?;
    fs::write(path, content)
        .map_err(|error| format!("write config file `{}` failed: {error}", path.display()))
}

fn serialize_config(config: &AppConfig) -> Result<String, serde_json::Error> {
    serde_json::to_string_pretty(config).map(|content| format!("{content}\n"))
}

#[cfg(test)]
mod tests {
    use std::{
        env, fs,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{load_or_create_at_path, AppConfig};

    #[test]
    fn load_or_create_creates_default_config_file() {
        let config_path = unique_test_dir().join("config.json");

        let config = load_or_create_at_path(&config_path).expect("config should be created");
        let saved = fs::read_to_string(&config_path).expect("config file should exist");

        assert_eq!(config, AppConfig::default());
        assert!(saved.contains("\"max_text_records\": 200"));
        assert!(saved.contains("\"max_image_records\": 50"));
        assert!(saved.contains("\"max_file_records\": 100"));
        assert!(saved.contains("\"launch_at_login\": true"));

        cleanup_test_dir(&config_path);
    }

    #[test]
    fn load_or_create_rewrites_legacy_config_with_new_limits() {
        let config_path = unique_test_dir().join("config.json");
        fs::create_dir_all(config_path.parent().expect("config parent should exist"))
            .expect("config parent should be created");
        fs::write(
            &config_path,
            r#"{
  "max_text_records": 88,
  "toggle_shortcut": "Shift+Command+V"
}
"#,
        )
        .expect("legacy config should be written");

        let config = load_or_create_at_path(&config_path).expect("legacy config should load");
        let saved = fs::read_to_string(&config_path).expect("config file should exist");

        assert_eq!(config.max_text_records, 88);
        assert_eq!(config.max_image_records, 50);
        assert_eq!(config.max_file_records, 100);
        assert!(config.launch_at_login);
        assert!(saved.contains("\"max_image_records\": 50"));
        assert!(saved.contains("\"max_file_records\": 100"));
        assert!(saved.contains("\"launch_at_login\": true"));

        cleanup_test_dir(&config_path);
    }

    #[test]
    fn set_launch_at_login_persists_updated_value() {
        let config_path = unique_test_dir().join("config.json");
        let store = super::ConfigStore::initialize_at_path(config_path.clone())
            .expect("config store should initialize");

        let updated = store
            .set_launch_at_login(false)
            .expect("launch_at_login should persist");
        let saved = fs::read_to_string(&config_path).expect("config file should exist");

        assert!(!updated.launch_at_login);
        assert!(!store.current().launch_at_login);
        assert!(saved.contains("\"launch_at_login\": false"));

        cleanup_test_dir(&config_path);
    }

    fn unique_test_dir() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        env::temp_dir().join(format!("clipboard-manager-config-test-{suffix}"))
    }

    fn cleanup_test_dir(config_path: &Path) {
        if let Some(parent) = config_path.parent() {
            let _ = fs::remove_dir_all(parent);
        }
    }
}
