use std::sync::Arc;

use tauri::{
    image::Image,
    menu::{CheckMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    tray::{TrayIcon, TrayIconBuilder},
    AppHandle, Manager, Wry,
};

use crate::{error::AppError, state::AppState};

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

    pub fn icon(status: TrayStatus) -> Result<Image<'static>, AppError> {
        Image::from_bytes(Self::icon_bytes(status)).map_err(|error| {
            AppError::Tray(format!("load tray icon image for `{status:?}` failed: {error}"))
        })
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

pub struct TrayController {
    tray: TrayIcon<Wry>,
    toggle_panel: MenuItem<Wry>,
    toggle_monitoring: MenuItem<Wry>,
    toggle_launch_at_login: CheckMenuItem<Wry>,
}

impl TrayController {
    pub fn initialize(
        app_handle: &AppHandle,
        snapshot: TrayRuntimeSnapshot,
    ) -> Result<Arc<Self>, AppError> {
        TrayIconAssets::validate()?;

        let toggle_panel = MenuItem::with_id(
            app_handle,
            MENU_TOGGLE_PANEL,
            snapshot.panel_label(),
            true,
            None::<&str>,
        )
        .map_err(|error| AppError::Tray(format!("create tray toggle_panel item failed: {error}")))?;
        let toggle_monitoring = MenuItem::with_id(
            app_handle,
            MENU_TOGGLE_MONITORING,
            snapshot.monitoring_label(),
            true,
            None::<&str>,
        )
        .map_err(|error| {
            AppError::Tray(format!("create tray toggle_monitoring item failed: {error}"))
        })?;
        let toggle_launch_at_login = CheckMenuItem::with_id(
            app_handle,
            MENU_TOGGLE_LAUNCH_AT_LOGIN,
            "开机自启动",
            true,
            snapshot.launch_at_login,
            None::<&str>,
        )
        .map_err(|error| {
            AppError::Tray(format!("create tray toggle_launch_at_login item failed: {error}"))
        })?;
        let clear_history = MenuItem::with_id(
            app_handle,
            MENU_CLEAR_HISTORY,
            "清空历史",
            true,
            None::<&str>,
        )
        .map_err(|error| AppError::Tray(format!("create tray clear_history item failed: {error}")))?;
        let open_log_directory = MenuItem::with_id(
            app_handle,
            MENU_OPEN_LOG_DIRECTORY,
            "打开日志目录",
            true,
            None::<&str>,
        )
        .map_err(|error| {
            AppError::Tray(format!("create tray open_log_directory item failed: {error}"))
        })?;
        let quit = MenuItem::with_id(app_handle, MENU_QUIT, "退出应用", true, None::<&str>)
            .map_err(|error| AppError::Tray(format!("create tray quit item failed: {error}")))?;
        let separator_primary = PredefinedMenuItem::separator(app_handle)
            .map_err(|error| AppError::Tray(format!("create tray separator failed: {error}")))?;
        let separator_danger = PredefinedMenuItem::separator(app_handle)
            .map_err(|error| AppError::Tray(format!("create tray separator failed: {error}")))?;
        let menu = Menu::with_items(
            app_handle,
            &[
                &toggle_panel,
                &toggle_monitoring,
                &toggle_launch_at_login,
                &separator_primary,
                &clear_history,
                &open_log_directory,
                &separator_danger,
                &quit,
            ],
        )
        .map_err(|error| AppError::Tray(format!("create tray menu failed: {error}")))?;
        let tray = TrayIconBuilder::with_id(TRAY_ID)
            .menu(&menu)
            .icon(TrayIconAssets::icon(snapshot.status())?)
            .tooltip("粘贴板记录管理工具")
            .icon_as_template(true)
            .show_menu_on_left_click(true)
            .on_menu_event(|app, event| {
                if let Err(error) = handle_menu_event(app, &event) {
                    tracing::error!(error = %error, event_id = %event.id().as_ref(), "handle tray menu event failed");
                }
            })
            .build(app_handle)
            .map_err(|error| AppError::Tray(format!("build tray icon failed: {error}")))?;

        Ok(Arc::new(Self {
            tray,
            toggle_panel,
            toggle_monitoring,
            toggle_launch_at_login,
        }))
    }

    pub fn apply_snapshot(&self, snapshot: TrayRuntimeSnapshot) -> Result<(), AppError> {
        self.toggle_panel
            .set_text(snapshot.panel_label())
            .map_err(|error| AppError::Tray(format!("update tray panel label failed: {error}")))?;
        self.toggle_monitoring
            .set_text(snapshot.monitoring_label())
            .map_err(|error| {
                AppError::Tray(format!("update tray monitoring label failed: {error}"))
            })?;
        self.toggle_launch_at_login
            .set_checked(snapshot.launch_at_login)
            .map_err(|error| {
                AppError::Tray(format!("update tray launch_at_login state failed: {error}"))
            })?;
        self.tray
            .set_icon(Some(TrayIconAssets::icon(snapshot.status())?))
            .map_err(|error| AppError::Tray(format!("update tray icon failed: {error}")))?;
        self.tray
            .set_icon_as_template(true)
            .map_err(|error| AppError::Tray(format!("set tray template mode failed: {error}")))?;
        Ok(())
    }
}

pub fn runtime_snapshot(app_handle: &AppHandle) -> Result<TrayRuntimeSnapshot, AppError> {
    let state = app_handle.state::<AppState>();
    Ok(TrayRuntimeSnapshot {
        monitoring: state.monitor.is_monitoring(),
        panel_visible: state.window_manager.is_visible()?,
        launch_at_login: state.config_store.current().launch_at_login,
    })
}

pub fn refresh(app_handle: &AppHandle) -> Result<(), AppError> {
    let Some(controller) = app_handle.try_state::<Arc<TrayController>>() else {
        return Ok(());
    };

    controller.apply_snapshot(runtime_snapshot(app_handle)?)
}

fn handle_menu_event(app_handle: &AppHandle, event: &MenuEvent) -> Result<(), AppError> {
    match event.id().as_ref() {
        MENU_TOGGLE_PANEL => {
            let state = app_handle.state::<AppState>();
            let visible = state.window_manager.toggle()?;
            tracing::info!(visible, "tray toggled panel visibility");
            refresh(app_handle)?;
            Ok(())
        }
        MENU_OPEN_LOG_DIRECTORY => open_log_directory(app_handle),
        MENU_QUIT => {
            tracing::info!("tray requested app exit");
            app_handle.exit(0);
            Ok(())
        }
        MENU_TOGGLE_MONITORING | MENU_TOGGLE_LAUNCH_AT_LOGIN | MENU_CLEAR_HISTORY => {
            tracing::debug!(event_id = %event.id().as_ref(), "tray menu action reserved for later task");
            Ok(())
        }
        _ => Ok(()),
    }
}

fn open_log_directory(app_handle: &AppHandle) -> Result<(), AppError> {
    let state = app_handle.state::<AppState>();
    std::process::Command::new("open")
        .arg(&state.logging_state.log_directory)
        .spawn()
        .map_err(|error| {
            AppError::FileAccess(format!(
                "open log directory `{}` failed: {error}",
                state.logging_state.log_directory
            ))
        })?;
    Ok(())
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
