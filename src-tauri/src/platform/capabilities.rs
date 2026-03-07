use serde::{Deserialize, Serialize};

use crate::config::schema::PlatformKind;

const REASON_WAYLAND_GLOBAL_SHORTCUT_UNAVAILABLE: &str = "wayland_global_shortcut_unavailable";
const REASON_WAYLAND_CLIPBOARD_MONITORING_LIMITED: &str = "wayland_clipboard_monitoring_limited";
const REASON_WAYLAND_ACTIVE_APP_DETECTION_UNAVAILABLE: &str =
    "wayland_active_app_detection_unavailable";
const REASON_LINUX_SESSION_TYPE_UNKNOWN: &str = "linux_session_type_unknown";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CapabilityState {
    Supported,
    Degraded,
    Unsupported,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionType {
    Native,
    X11,
    Wayland,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PlatformCapabilities {
    pub platform: PlatformKind,
    pub session_type: Option<SessionType>,
    pub clipboard_monitoring: CapabilityState,
    pub global_shortcut: CapabilityState,
    pub launch_at_login: CapabilityState,
    pub tray: CapabilityState,
    pub active_app_detection: CapabilityState,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SessionEnvironment {
    pub xdg_session_type: Option<String>,
    pub wayland_display: Option<String>,
    pub display: Option<String>,
}

impl SessionEnvironment {
    pub fn from_process_env() -> Self {
        Self {
            xdg_session_type: read_env("XDG_SESSION_TYPE"),
            wayland_display: read_env("WAYLAND_DISPLAY"),
            display: read_env("DISPLAY"),
        }
    }
}

#[derive(Debug, Clone)]
pub struct PlatformCapabilityResolver {
    platform: PlatformKind,
    env: SessionEnvironment,
}

impl PlatformCapabilityResolver {
    pub fn current() -> Self {
        Self {
            platform: current_platform_kind(),
            env: SessionEnvironment::from_process_env(),
        }
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn new(platform: PlatformKind, env: SessionEnvironment) -> Self {
        Self { platform, env }
    }

    pub fn resolve(&self) -> PlatformCapabilities {
        match self.platform {
            PlatformKind::Macos => PlatformCapabilities {
                platform: PlatformKind::Macos,
                session_type: Some(SessionType::Native),
                clipboard_monitoring: CapabilityState::Supported,
                global_shortcut: CapabilityState::Supported,
                launch_at_login: CapabilityState::Supported,
                tray: CapabilityState::Supported,
                active_app_detection: CapabilityState::Supported,
                reasons: Vec::new(),
            },
            PlatformKind::Windows => PlatformCapabilities {
                platform: PlatformKind::Windows,
                session_type: Some(SessionType::Native),
                clipboard_monitoring: CapabilityState::Supported,
                global_shortcut: CapabilityState::Supported,
                launch_at_login: CapabilityState::Supported,
                tray: CapabilityState::Supported,
                active_app_detection: CapabilityState::Supported,
                reasons: Vec::new(),
            },
            PlatformKind::Linux => self.resolve_linux_capabilities(),
        }
    }

    fn resolve_linux_capabilities(&self) -> PlatformCapabilities {
        match detect_linux_session_type(&self.env) {
            Some(SessionType::X11) => PlatformCapabilities {
                platform: PlatformKind::Linux,
                session_type: Some(SessionType::X11),
                clipboard_monitoring: CapabilityState::Supported,
                global_shortcut: CapabilityState::Supported,
                launch_at_login: CapabilityState::Supported,
                tray: CapabilityState::Supported,
                active_app_detection: CapabilityState::Supported,
                reasons: Vec::new(),
            },
            Some(SessionType::Wayland) => PlatformCapabilities {
                platform: PlatformKind::Linux,
                session_type: Some(SessionType::Wayland),
                clipboard_monitoring: CapabilityState::Degraded,
                global_shortcut: CapabilityState::Unsupported,
                launch_at_login: CapabilityState::Supported,
                tray: CapabilityState::Supported,
                active_app_detection: CapabilityState::Unsupported,
                reasons: vec![
                    REASON_WAYLAND_GLOBAL_SHORTCUT_UNAVAILABLE.to_string(),
                    REASON_WAYLAND_CLIPBOARD_MONITORING_LIMITED.to_string(),
                    REASON_WAYLAND_ACTIVE_APP_DETECTION_UNAVAILABLE.to_string(),
                ],
            },
            Some(SessionType::Native) | None => PlatformCapabilities {
                platform: PlatformKind::Linux,
                session_type: None,
                clipboard_monitoring: CapabilityState::Degraded,
                global_shortcut: CapabilityState::Degraded,
                launch_at_login: CapabilityState::Supported,
                tray: CapabilityState::Supported,
                active_app_detection: CapabilityState::Degraded,
                reasons: vec![REASON_LINUX_SESSION_TYPE_UNKNOWN.to_string()],
            },
        }
    }
}

pub fn current_platform_kind() -> PlatformKind {
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

fn detect_linux_session_type(env: &SessionEnvironment) -> Option<SessionType> {
    match env.xdg_session_type.as_deref() {
        Some(value) if value.eq_ignore_ascii_case("wayland") => return Some(SessionType::Wayland),
        Some(value) if value.eq_ignore_ascii_case("x11") => return Some(SessionType::X11),
        _ => {}
    }

    if env.wayland_display.is_some() {
        return Some(SessionType::Wayland);
    }

    if env.display.is_some() {
        return Some(SessionType::X11);
    }

    None
}

fn read_env(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .filter(|value| !value.trim().is_empty())
}
