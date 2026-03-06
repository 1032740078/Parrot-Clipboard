use crate::error::AppError;

pub const TRAY_ID: &str = "main-tray";
pub const MENU_TOGGLE_PANEL: &str = "tray.toggle_panel";
pub const MENU_TOGGLE_MONITORING: &str = "tray.toggle_monitoring";
pub const MENU_TOGGLE_LAUNCH_AT_LOGIN: &str = "tray.toggle_launch_at_login";
pub const MENU_CLEAR_HISTORY: &str = "tray.clear_history";
pub const MENU_OPEN_LOG_DIRECTORY: &str = "tray.open_log_directory";
pub const MENU_QUIT: &str = "tray.quit";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayStatus {
    Active,
    Paused,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TrayRuntimeSnapshot {
    pub monitoring: bool,
    pub panel_visible: bool,
    pub launch_at_login: bool,
}

impl TrayRuntimeSnapshot {
    pub fn status(&self) -> TrayStatus {
        if self.monitoring {
            TrayStatus::Active
        } else {
            TrayStatus::Paused
        }
    }

    pub fn panel_label(&self) -> &'static str {
        if self.panel_visible {
            "隐藏主面板"
        } else {
            "显示主面板"
        }
    }

    pub fn monitoring_label(&self) -> &'static str {
        if self.monitoring {
            "暂停监听"
        } else {
            "恢复监听"
        }
    }
}

pub struct TrayIconAssets;

impl TrayIconAssets {
    pub fn icon_bytes(status: TrayStatus) -> &'static [u8] {
        match status {
            TrayStatus::Active => include_bytes!("../../icons/tray-active.png"),
            TrayStatus::Paused => include_bytes!("../../icons/tray-paused.png"),
        }
    }

    pub fn validate() -> Result<(), AppError> {
        if Self::icon_bytes(TrayStatus::Active).is_empty() {
            return Err(AppError::Tray("active tray icon bytes are empty".to_string()));
        }
        if Self::icon_bytes(TrayStatus::Paused).is_empty() {
            return Err(AppError::Tray("paused tray icon bytes are empty".to_string()));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{TrayIconAssets, TrayRuntimeSnapshot, TrayStatus};

    #[test]
    fn runtime_snapshot_returns_expected_labels() {
        let active = TrayRuntimeSnapshot {
            monitoring: true,
            panel_visible: false,
            launch_at_login: true,
        };
        let paused = TrayRuntimeSnapshot {
            monitoring: false,
            panel_visible: true,
            launch_at_login: false,
        };

        assert_eq!(active.status(), TrayStatus::Active);
        assert_eq!(active.panel_label(), "显示主面板");
        assert_eq!(active.monitoring_label(), "暂停监听");

        assert_eq!(paused.status(), TrayStatus::Paused);
        assert_eq!(paused.panel_label(), "隐藏主面板");
        assert_eq!(paused.monitoring_label(), "恢复监听");
    }

    #[test]
    fn tray_icon_assets_are_embedded() {
        assert!(TrayIconAssets::validate().is_ok());
        assert!(!TrayIconAssets::icon_bytes(TrayStatus::Active).is_empty());
        assert!(!TrayIconAssets::icon_bytes(TrayStatus::Paused).is_empty());
    }
}
