#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

use std::{fs, path::PathBuf, sync::Arc};

use tauri::{process::current_binary, AppHandle, Manager};

use crate::error::AppError;

use super::AutostartControl;

const DEFAULT_DESKTOP_FILE_NAME: &str = "com.robin.parrot-clipboard.desktop";

pub struct LinuxAutostartService {
    desktop_file_path: PathBuf,
    executable_path: PathBuf,
}

impl LinuxAutostartService {
    pub fn initialize(app_handle: &AppHandle) -> Result<Arc<Self>, AppError> {
        let config_dir = app_handle.path().config_dir().map_err(|error| {
            AppError::Autostart(format!("resolve config directory failed: {error}"))
        })?;
        let executable_path = current_binary(&app_handle.env()).map_err(|error| {
            AppError::Autostart(format!("resolve current executable failed: {error}"))
        })?;

        Ok(Arc::new(Self {
            desktop_file_path: config_dir.join("autostart").join(DEFAULT_DESKTOP_FILE_NAME),
            executable_path,
        }))
    }

    #[cfg(test)]
    pub fn initialize_with_path(desktop_file_path: PathBuf, executable_path: PathBuf) -> Arc<Self> {
        Arc::new(Self {
            desktop_file_path,
            executable_path,
        })
    }

    fn desktop_entry(&self) -> String {
        format!(
            concat!(
                "[Desktop Entry]\n",
                "Type=Application\n",
                "Version=1.0\n",
                "Name=Parrot Clipboard\n",
                "Exec={}\n",
                "X-GNOME-Autostart-enabled=true\n",
                "Terminal=false\n"
            ),
            self.executable_path.display()
        )
    }

    fn enable(&self) -> Result<bool, AppError> {
        if let Some(parent) = self.desktop_file_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                AppError::Autostart(format!(
                    "create xdg autostart directory `{}` failed: {error}",
                    parent.display()
                ))
            })?;
        }

        fs::write(&self.desktop_file_path, self.desktop_entry()).map_err(|error| {
            AppError::Autostart(format!(
                "write xdg autostart file `{}` failed: {error}",
                self.desktop_file_path.display()
            ))
        })?;

        Ok(true)
    }

    fn disable(&self) -> Result<bool, AppError> {
        if self.desktop_file_path.exists() {
            fs::remove_file(&self.desktop_file_path).map_err(|error| {
                AppError::Autostart(format!(
                    "remove xdg autostart file `{}` failed: {error}",
                    self.desktop_file_path.display()
                ))
            })?;
        }

        Ok(false)
    }
}

impl AutostartControl for LinuxAutostartService {
    fn is_enabled(&self) -> Result<bool, AppError> {
        Ok(self.desktop_file_path.exists())
    }

    fn set_enabled(&self, enabled: bool) -> Result<bool, AppError> {
        if enabled {
            self.enable()
        } else {
            self.disable()
        }
    }

    fn reconcile(&self, enabled: bool) -> Result<bool, AppError> {
        let current = self.is_enabled()?;
        if current == enabled {
            return Ok(current);
        }

        self.set_enabled(enabled)
    }
}

#[cfg(test)]
mod tests {
    use std::{
        env, fs,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{AutostartControl, LinuxAutostartService};

    #[test]
    fn enable_writes_xdg_autostart_file() {
        let desktop_path = unique_test_dir().join("autostart/app.desktop");
        let service = LinuxAutostartService::initialize_with_path(
            desktop_path.clone(),
            PathBuf::from("/opt/clipboard-manager/bin/clipboard-manager"),
        );

        let enabled = service.set_enabled(true).expect("enable should succeed");
        let saved = fs::read_to_string(&desktop_path).expect("desktop file should exist");

        assert!(enabled);
        assert!(saved.contains("[Desktop Entry]"));
        assert!(saved.contains("Exec=/opt/clipboard-manager/bin/clipboard-manager"));
        assert!(service.is_enabled().expect("query should succeed"));

        cleanup_test_dir(&desktop_path);
    }

    #[test]
    fn disable_removes_xdg_autostart_file() {
        let desktop_path = unique_test_dir().join("autostart/app.desktop");
        let service = LinuxAutostartService::initialize_with_path(
            desktop_path.clone(),
            PathBuf::from("/opt/clipboard-manager/bin/clipboard-manager"),
        );

        service.set_enabled(true).expect("enable should succeed");
        let enabled = service.set_enabled(false).expect("disable should succeed");

        assert!(!enabled);
        assert!(!desktop_path.exists());
        assert!(!service.is_enabled().expect("query should succeed"));

        cleanup_test_dir(&desktop_path);
    }

    fn unique_test_dir() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        env::temp_dir().join(format!("clipboard-manager-linux-autostart-test-{suffix}"))
    }

    fn cleanup_test_dir(desktop_path: &Path) {
        if let Some(parent) = desktop_path.parent().and_then(|path| path.parent()) {
            let _ = fs::remove_dir_all(parent);
        }
    }
}
