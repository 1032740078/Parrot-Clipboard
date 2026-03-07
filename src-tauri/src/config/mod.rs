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
            config_version = config.config_version,
            max_text_records = config.max_text_records(),
            max_image_records = config.max_image_records(),
            max_file_records = config.max_file_records(),
            toggle_shortcut = %config.toggle_shortcut(),
            launch_at_login = config.launch_at_login(),
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

    pub fn set_launch_at_login(&self, launch_at_login: bool) -> Result<AppConfig, String> {
        let mut next = self.current();
        next.set_launch_at_login(launch_at_login);
        self.replace(next)
    }

    pub fn replace(&self, next: AppConfig) -> Result<AppConfig, String> {
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
    let config = match serde_json::from_str::<AppConfig>(&raw) {
        Ok(config) => config,
        Err(error) => {
            tracing::error!(path = %path.display(), error = %error, "parse config failed, fallback to default");
            let default_config = AppConfig::default();
            persist_config(path, &default_config)?;
            return Ok(default_config);
        }
    };

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
        assert!(saved.contains("\"config_version\": 2"));
        assert!(saved.contains("\"general\": {"));
        assert!(saved.contains("\"history\": {"));
        assert!(saved.contains("\"shortcut\": {"));
        assert!(saved.contains("\"privacy\": {"));

        cleanup_test_dir(&config_path);
    }

    #[test]
    fn load_or_create_rewrites_legacy_config_with_new_structure() {
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

        assert_eq!(config.config_version, 2);
        assert_eq!(config.history.max_text_records, 88);
        assert_eq!(config.history.max_image_records, 50);
        assert_eq!(config.history.max_file_records, 100);
        assert!(config.general.launch_at_login);
        assert_eq!(config.shortcut.toggle_panel, "Shift+Command+V");
        assert!(saved.contains("\"config_version\": 2"));
        assert!(saved.contains("\"history\": {"));
        assert!(saved.contains("\"max_text_records\": 88"));
        assert!(saved.contains("\"toggle_panel\": \"Shift+Command+V\""));

        cleanup_test_dir(&config_path);
    }

    #[test]
    fn load_or_create_falls_back_to_default_when_json_is_invalid() {
        let config_path = unique_test_dir().join("config.json");
        fs::create_dir_all(config_path.parent().expect("config parent should exist"))
            .expect("config parent should be created");
        fs::write(&config_path, "{ invalid json").expect("invalid config should be written");

        let config = load_or_create_at_path(&config_path).expect("invalid config should recover");
        let saved = fs::read_to_string(&config_path).expect("config file should exist");

        assert_eq!(config, AppConfig::default());
        assert!(saved.contains("\"config_version\": 2"));
        assert!(saved.contains("\"blacklist_rules\": []"));

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

        assert!(!updated.general.launch_at_login);
        assert!(!store.current().general.launch_at_login);
        let persisted: AppConfig =
            serde_json::from_str(&saved).expect("saved config should be valid json");
        assert!(!persisted.general.launch_at_login);

        cleanup_test_dir(&config_path);
    }

    #[test]
    fn replace_persists_grouped_config_updates() {
        let config_path = unique_test_dir().join("config.json");
        let store = super::ConfigStore::initialize_at_path(config_path.clone())
            .expect("config store should initialize");
        let mut next = store.current();
        next.general.theme = crate::config::schema::ThemeMode::Dark;
        next.history.max_text_records = 88;
        next.history.capture_files = false;

        let updated = store.replace(next).expect("config replace should persist");
        let saved = fs::read_to_string(&config_path).expect("config file should exist");

        assert_eq!(
            updated.general.theme,
            crate::config::schema::ThemeMode::Dark
        );
        assert_eq!(updated.history.max_text_records, 88);
        assert!(!updated.history.capture_files);
        assert!(saved.contains("\"theme\": \"dark\""));
        assert!(saved.contains("\"max_text_records\": 88"));
        assert!(saved.contains("\"capture_files\": false"));

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
