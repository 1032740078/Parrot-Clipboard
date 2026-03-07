#![cfg_attr(not(target_os = "windows"), allow(dead_code))]

use std::{path::PathBuf, process::Command, sync::Arc};

use tauri::{process::current_binary, AppHandle, Manager};

use crate::error::AppError;

use super::AutostartControl;

const RUN_KEY_PATH: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
const DEFAULT_APP_NAME: &str = "ClipboardRecordManager";

pub struct WindowsAutostartService {
    app_name: String,
    executable_path: PathBuf,
}

impl WindowsAutostartService {
    pub fn initialize(app_handle: &AppHandle) -> Result<Arc<Self>, AppError> {
        let executable_path = current_binary(&app_handle.env()).map_err(|error| {
            AppError::Autostart(format!("resolve current executable failed: {error}"))
        })?;

        Ok(Arc::new(Self {
            app_name: DEFAULT_APP_NAME.to_string(),
            executable_path,
        }))
    }

    #[cfg(test)]
    pub fn initialize_with_path(
        app_name: impl Into<String>,
        executable_path: PathBuf,
    ) -> Arc<Self> {
        Arc::new(Self {
            app_name: app_name.into(),
            executable_path,
        })
    }

    fn query_args(&self) -> Vec<String> {
        vec![
            "query".to_string(),
            RUN_KEY_PATH.to_string(),
            "/v".to_string(),
            self.app_name.clone(),
        ]
    }

    fn add_args(&self) -> Vec<String> {
        vec![
            "add".to_string(),
            RUN_KEY_PATH.to_string(),
            "/v".to_string(),
            self.app_name.clone(),
            "/t".to_string(),
            "REG_SZ".to_string(),
            "/d".to_string(),
            self.executable_path.display().to_string(),
            "/f".to_string(),
        ]
    }

    fn delete_args(&self) -> Vec<String> {
        vec![
            "delete".to_string(),
            RUN_KEY_PATH.to_string(),
            "/v".to_string(),
            self.app_name.clone(),
            "/f".to_string(),
        ]
    }

    fn run_reg_command(&self, args: &[String]) -> Result<std::process::Output, AppError> {
        Command::new("reg")
            .args(args)
            .output()
            .map_err(|error| AppError::Autostart(format!("run reg command failed: {error}")))
    }

    fn enable(&self) -> Result<bool, AppError> {
        let output = self.run_reg_command(&self.add_args())?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(AppError::Autostart(format!(
                "enable registry autostart failed: {stderr}"
            )));
        }
        Ok(true)
    }

    fn disable(&self) -> Result<bool, AppError> {
        if !self.is_enabled()? {
            return Ok(false);
        }

        let output = self.run_reg_command(&self.delete_args())?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(AppError::Autostart(format!(
                "disable registry autostart failed: {stderr}"
            )));
        }
        Ok(false)
    }
}

impl AutostartControl for WindowsAutostartService {
    fn is_enabled(&self) -> Result<bool, AppError> {
        Ok(self.run_reg_command(&self.query_args())?.status.success())
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
    use std::path::PathBuf;

    use super::{WindowsAutostartService, RUN_KEY_PATH};

    #[test]
    fn registry_add_args_match_windows_run_key_contract() {
        let service = WindowsAutostartService::initialize_with_path(
            "ClipboardRecordManager",
            PathBuf::from(r"C:\Program Files\Clipboard Manager\clipboard-manager.exe"),
        );

        assert_eq!(
            service.add_args(),
            vec![
                "add",
                RUN_KEY_PATH,
                "/v",
                "ClipboardRecordManager",
                "/t",
                "REG_SZ",
                "/d",
                r"C:\Program Files\Clipboard Manager\clipboard-manager.exe",
                "/f",
            ]
        );
    }

    #[test]
    fn registry_query_and_delete_args_use_same_value_name() {
        let service = WindowsAutostartService::initialize_with_path(
            "ClipboardRecordManager",
            PathBuf::from(r"C:\clipboard-manager.exe"),
        );

        assert_eq!(
            service.query_args(),
            vec!["query", RUN_KEY_PATH, "/v", "ClipboardRecordManager"]
        );
        assert_eq!(
            service.delete_args(),
            vec!["delete", RUN_KEY_PATH, "/v", "ClipboardRecordManager", "/f"]
        );
    }
}
