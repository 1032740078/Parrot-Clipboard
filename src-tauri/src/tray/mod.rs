use std::sync::Arc;

use tauri::{
    image::Image,
    menu::{CheckMenuItem, IsMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    tray::{TrayIcon, TrayIconBuilder},
    AppHandle, Emitter, Manager, Wry,
};

use crate::{
    error::AppError,
    ipc::commands::CLEAR_HISTORY_CONFIRM_TOKEN,
    platform::{
        capabilities::{CapabilityState, PlatformCapabilities, SessionType},
        PlatformCapabilityResolver,
    },
    state::AppState,
    window::{
        about_window::show_or_focus_about_window, settings_window::show_or_focus_settings_window,
    },
};

pub const TRAY_ID: &str = "main-tray";
pub const MENU_TOGGLE_PANEL: &str = "tray.toggle_panel";
pub const MENU_OPEN_SETTINGS: &str = "tray.open_settings";
pub const MENU_OPEN_ABOUT: &str = "tray.open_about";
pub const MENU_TOGGLE_MONITORING: &str = "tray.toggle_monitoring";
pub const MENU_TOGGLE_LAUNCH_AT_LOGIN: &str = "tray.toggle_launch_at_login";
pub const MENU_CLEAR_HISTORY: &str = "tray.clear_history";
pub const MENU_OPEN_LOG_DIRECTORY: &str = "tray.open_log_directory";
pub const MENU_QUIT: &str = "tray.quit";
pub const EVENT_CLEAR_HISTORY_REQUESTED: &str = "system:clear-history-requested";

#[derive(Debug, Clone, serde::Serialize)]
pub struct ClearHistoryRequestPayload {
    pub confirm_token: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayStatus {
    Active,
    Paused,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrayRuntimeSnapshot {
    pub monitoring: bool,
    pub panel_visible: bool,
    pub launch_at_login: bool,
    pub platform_capabilities: PlatformCapabilities,
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

    pub fn supports_monitoring_toggle(&self) -> bool {
        self.platform_capabilities.clipboard_monitoring != CapabilityState::Unsupported
    }

    pub fn supports_launch_at_login_toggle(&self) -> bool {
        self.platform_capabilities.launch_at_login == CapabilityState::Supported
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
            AppError::Tray(format!(
                "load tray icon image for `{status:?}` failed: {error}"
            ))
        })
    }

    pub fn validate() -> Result<(), AppError> {
        if Self::icon_bytes(TrayStatus::Active).is_empty() {
            return Err(AppError::Tray(
                "active tray icon bytes are empty".to_string(),
            ));
        }
        if Self::icon_bytes(TrayStatus::Paused).is_empty() {
            return Err(AppError::Tray(
                "paused tray icon bytes are empty".to_string(),
            ));
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
        .map_err(|error| {
            AppError::Tray(format!("create tray toggle_panel item failed: {error}"))
        })?;
        let open_settings = MenuItem::with_id(
            app_handle,
            MENU_OPEN_SETTINGS,
            "打开设置",
            true,
            None::<&str>,
        )
        .map_err(|error| {
            AppError::Tray(format!("create tray open_settings item failed: {error}"))
        })?;
        let open_about = MenuItem::with_id(app_handle, MENU_OPEN_ABOUT, "关于", true, None::<&str>)
            .map_err(|error| {
                AppError::Tray(format!("create tray open_about item failed: {error}"))
            })?;
        let toggle_monitoring = MenuItem::with_id(
            app_handle,
            MENU_TOGGLE_MONITORING,
            snapshot.monitoring_label(),
            snapshot.supports_monitoring_toggle(),
            None::<&str>,
        )
        .map_err(|error| {
            AppError::Tray(format!(
                "create tray toggle_monitoring item failed: {error}"
            ))
        })?;
        let toggle_launch_at_login = CheckMenuItem::with_id(
            app_handle,
            MENU_TOGGLE_LAUNCH_AT_LOGIN,
            "开机自启动",
            snapshot.supports_launch_at_login_toggle(),
            snapshot.launch_at_login,
            None::<&str>,
        )
        .map_err(|error| {
            AppError::Tray(format!(
                "create tray toggle_launch_at_login item failed: {error}"
            ))
        })?;
        let clear_history = MenuItem::with_id(
            app_handle,
            MENU_CLEAR_HISTORY,
            "清空历史",
            true,
            None::<&str>,
        )
        .map_err(|error| {
            AppError::Tray(format!("create tray clear_history item failed: {error}"))
        })?;
        let open_log_directory = MenuItem::with_id(
            app_handle,
            MENU_OPEN_LOG_DIRECTORY,
            "打开日志目录",
            true,
            None::<&str>,
        )
        .map_err(|error| {
            AppError::Tray(format!(
                "create tray open_log_directory item failed: {error}"
            ))
        })?;
        let quit = MenuItem::with_id(app_handle, MENU_QUIT, "退出应用", true, None::<&str>)
            .map_err(|error| AppError::Tray(format!("create tray quit item failed: {error}")))?;
        let capability_items = create_capability_notice_items(
            app_handle,
            &tray_capability_messages(&snapshot.platform_capabilities),
        )?;
        let separator_capability = PredefinedMenuItem::separator(app_handle)
            .map_err(|error| AppError::Tray(format!("create tray separator failed: {error}")))?;
        let separator_utility = PredefinedMenuItem::separator(app_handle)
            .map_err(|error| AppError::Tray(format!("create tray separator failed: {error}")))?;
        let separator_danger = PredefinedMenuItem::separator(app_handle)
            .map_err(|error| AppError::Tray(format!("create tray separator failed: {error}")))?;

        let mut menu_items: Vec<&dyn IsMenuItem<Wry>> = vec![
            &toggle_panel,
            &open_settings,
            &open_about,
            &toggle_monitoring,
            &toggle_launch_at_login,
        ];

        if !capability_items.is_empty() {
            menu_items.push(&separator_capability);
            for item in &capability_items {
                menu_items.push(item);
            }
        }

        menu_items.push(&separator_utility);
        menu_items.push(&clear_history);
        menu_items.push(&open_log_directory);
        menu_items.push(&separator_danger);
        menu_items.push(&quit);

        let menu = Menu::with_items(app_handle, &menu_items)
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
        launch_at_login: state.config_store.current().launch_at_login(),
        platform_capabilities: PlatformCapabilityResolver::current().resolve(),
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
        MENU_OPEN_SETTINGS => {
            let action = show_or_focus_settings_window(app_handle)?;
            tracing::info!(?action, "tray opened settings window");
            Ok(())
        }
        MENU_OPEN_ABOUT => {
            let action = show_or_focus_about_window(app_handle)?;
            tracing::info!(?action, "tray opened about window");
            Ok(())
        }
        MENU_TOGGLE_MONITORING => toggle_monitoring_from_tray(app_handle),
        MENU_TOGGLE_LAUNCH_AT_LOGIN => toggle_launch_at_login_from_tray(app_handle),
        MENU_OPEN_LOG_DIRECTORY => open_log_directory(app_handle),
        MENU_QUIT => {
            tracing::info!("tray requested app exit");
            app_handle.exit(0);
            Ok(())
        }
        MENU_CLEAR_HISTORY => {
            let state = app_handle.state::<AppState>();
            state.window_manager.show()?;
            app_handle
                .emit(
                    EVENT_CLEAR_HISTORY_REQUESTED,
                    ClearHistoryRequestPayload {
                        confirm_token: CLEAR_HISTORY_CONFIRM_TOKEN.to_string(),
                    },
                )
                .map_err(|error| {
                    AppError::Tray(format!("emit clear history request failed: {error}"))
                })?;
            refresh(app_handle)?;
            Ok(())
        }
        _ => Ok(()),
    }
}

fn create_capability_notice_items(
    app_handle: &AppHandle,
    messages: &[String],
) -> Result<Vec<MenuItem<Wry>>, AppError> {
    messages
        .iter()
        .enumerate()
        .map(|(index, message)| {
            MenuItem::with_id(
                app_handle,
                format!("tray.capability_hint.{index}"),
                message,
                false,
                None::<&str>,
            )
            .map_err(|error| AppError::Tray(format!("create tray capability item failed: {error}")))
        })
        .collect()
}

fn tray_capability_messages(capabilities: &PlatformCapabilities) -> Vec<String> {
    if capabilities.reasons.is_empty() {
        return Vec::new();
    }

    if capabilities
        .reasons
        .iter()
        .any(|reason| reason == "linux_session_type_unknown")
    {
        return vec![
            "当前 Linux 会话类型未识别".to_string(),
            "快捷键与监听能力可能受限，请优先使用托盘入口".to_string(),
        ];
    }

    let session_message = match capabilities.session_type {
        Some(SessionType::Wayland) => "当前会话：Wayland（能力受限）".to_string(),
        Some(SessionType::X11) => "当前会话：X11".to_string(),
        Some(SessionType::Native) => "当前平台能力存在限制".to_string(),
        None => "当前平台能力存在限制".to_string(),
    };

    let guidance_message = if capabilities.global_shortcut != CapabilityState::Supported {
        "全局快捷键不可用，请改用托盘打开主面板".to_string()
    } else if capabilities.clipboard_monitoring == CapabilityState::Degraded {
        "剪贴板监听能力受限，采集可能不稳定".to_string()
    } else if capabilities.active_app_detection != CapabilityState::Supported {
        "活动应用识别受限，请在设置中查看详细说明".to_string()
    } else {
        "请打开设置查看当前平台限制说明".to_string()
    };

    vec![session_message, guidance_message]
}

fn toggle_monitoring_from_tray(app_handle: &AppHandle) -> Result<(), AppError> {
    let state = app_handle.state::<AppState>();
    let enabled = !state.monitor.is_monitoring();

    if enabled {
        state
            .monitor
            .sync_clipboard_state()
            .map_err(|error| AppError::MonitorControl(error.to_string()))?;
        state.monitor.resume();
    } else {
        state.monitor.pause();
    }

    let monitoring = state.monitor.is_monitoring();
    let changed_at = now_ms();
    state
        .event_emitter
        .emit_monitoring_changed(monitoring, changed_at)?;
    tracing::info!(monitoring, changed_at, "tray toggled monitoring state");
    refresh(app_handle)?;
    Ok(())
}

fn toggle_launch_at_login_from_tray(app_handle: &AppHandle) -> Result<(), AppError> {
    let state = app_handle.state::<AppState>();
    let next_enabled = !state.config_store.current().launch_at_login();

    state.autostart.reconcile(next_enabled)?;
    let updated = state
        .config_store
        .set_launch_at_login(next_enabled)
        .map_err(AppError::Autostart)?;

    tracing::info!(
        launch_at_login = updated.launch_at_login(),
        "tray updated launch_at_login state"
    );
    refresh(app_handle)?;
    Ok(())
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

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use crate::{
        config::schema::PlatformKind,
        platform::capabilities::{CapabilityState, PlatformCapabilities, SessionType},
    };

    use super::{tray_capability_messages, TrayIconAssets, TrayRuntimeSnapshot, TrayStatus};

    fn supported_capabilities() -> PlatformCapabilities {
        PlatformCapabilities {
            platform: PlatformKind::Windows,
            session_type: Some(SessionType::Native),
            clipboard_monitoring: CapabilityState::Supported,
            global_shortcut: CapabilityState::Supported,
            launch_at_login: CapabilityState::Supported,
            tray: CapabilityState::Supported,
            active_app_detection: CapabilityState::Supported,
            reasons: Vec::new(),
        }
    }

    #[test]
    fn runtime_snapshot_returns_expected_labels() {
        let active = TrayRuntimeSnapshot {
            monitoring: true,
            panel_visible: false,
            launch_at_login: true,
            platform_capabilities: supported_capabilities(),
        };
        let paused = TrayRuntimeSnapshot {
            monitoring: false,
            panel_visible: true,
            launch_at_login: false,
            platform_capabilities: supported_capabilities(),
        };

        assert_eq!(active.status(), TrayStatus::Active);
        assert_eq!(active.panel_label(), "显示主面板");
        assert_eq!(active.monitoring_label(), "暂停监听");
        assert!(active.supports_monitoring_toggle());
        assert!(active.supports_launch_at_login_toggle());

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

    #[test]
    fn tray_capability_messages_are_empty_when_platform_is_fully_supported() {
        assert!(tray_capability_messages(&supported_capabilities()).is_empty());
    }

    #[test]
    fn tray_capability_messages_include_wayland_guidance() {
        let capabilities = PlatformCapabilities {
            platform: PlatformKind::Linux,
            session_type: Some(SessionType::Wayland),
            clipboard_monitoring: CapabilityState::Degraded,
            global_shortcut: CapabilityState::Unsupported,
            launch_at_login: CapabilityState::Supported,
            tray: CapabilityState::Supported,
            active_app_detection: CapabilityState::Unsupported,
            reasons: vec![
                "wayland_global_shortcut_unavailable".to_string(),
                "wayland_clipboard_monitoring_limited".to_string(),
                "wayland_active_app_detection_unavailable".to_string(),
            ],
        };

        assert_eq!(
            tray_capability_messages(&capabilities),
            vec![
                "当前会话：Wayland（能力受限）".to_string(),
                "全局快捷键不可用，请改用托盘打开主面板".to_string(),
            ]
        );
    }

    #[test]
    fn tray_capability_messages_warn_for_unknown_linux_session() {
        let capabilities = PlatformCapabilities {
            platform: PlatformKind::Linux,
            session_type: None,
            clipboard_monitoring: CapabilityState::Degraded,
            global_shortcut: CapabilityState::Degraded,
            launch_at_login: CapabilityState::Supported,
            tray: CapabilityState::Supported,
            active_app_detection: CapabilityState::Degraded,
            reasons: vec!["linux_session_type_unknown".to_string()],
        };

        assert_eq!(
            tray_capability_messages(&capabilities),
            vec![
                "当前 Linux 会话类型未识别".to_string(),
                "快捷键与监听能力可能受限，请优先使用托盘入口".to_string(),
            ]
        );
    }
}
