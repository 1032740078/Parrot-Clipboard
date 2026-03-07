use std::sync::Arc;

use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::{
    error::AppError,
    platform::{capabilities::CapabilityState, PlatformCapabilities, PlatformCapabilityResolver},
    window::WindowManager,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ShortcutRegistrationOutcome {
    Registered,
    SkippedUnsupported { reasons: Vec<String> },
}

pub fn register_toggle_shortcut(
    app: &AppHandle,
    shortcut: &str,
    window_manager: Arc<dyn WindowManager>,
) -> Result<ShortcutRegistrationOutcome, AppError> {
    let shortcut_string = shortcut.to_string();
    let capabilities = PlatformCapabilityResolver::current().resolve();

    if !should_register_toggle_shortcut(&capabilities) {
        tracing::warn!(
            shortcut = %shortcut_string,
            reasons = ?capabilities.reasons,
            "toggle shortcut skipped due to unsupported platform capability"
        );
        return Ok(ShortcutRegistrationOutcome::SkippedUnsupported {
            reasons: capabilities.reasons,
        });
    }

    tracing::info!(shortcut = %shortcut_string, "registering toggle shortcut");

    app.global_shortcut()
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                tracing::debug!("toggle shortcut pressed");
                if let Err(error) = window_manager.toggle() {
                    tracing::error!(error = %error, "toggle window failed");
                }
            }
        })
        .map_err(|error| {
            AppError::InvalidParam(format!(
                "register shortcut `{shortcut_string}` failed: {error}"
            ))
        })?;

    tracing::info!(shortcut = %shortcut_string, "toggle shortcut registered");
    Ok(ShortcutRegistrationOutcome::Registered)
}

fn should_register_toggle_shortcut(capabilities: &PlatformCapabilities) -> bool {
    capabilities.global_shortcut == CapabilityState::Supported
}

#[cfg(test)]
mod tests {
    use crate::{
        config::schema::PlatformKind,
        platform::{capabilities::SessionType, PlatformCapabilities},
    };

    use super::{should_register_toggle_shortcut, ShortcutRegistrationOutcome};

    #[test]
    fn shortcut_registration_is_allowed_for_supported_capability() {
        let capabilities = PlatformCapabilities {
            platform: PlatformKind::Windows,
            session_type: Some(SessionType::Native),
            clipboard_monitoring: crate::platform::capabilities::CapabilityState::Supported,
            global_shortcut: crate::platform::capabilities::CapabilityState::Supported,
            launch_at_login: crate::platform::capabilities::CapabilityState::Supported,
            tray: crate::platform::capabilities::CapabilityState::Supported,
            active_app_detection: crate::platform::capabilities::CapabilityState::Supported,
            reasons: Vec::new(),
        };

        assert!(should_register_toggle_shortcut(&capabilities));
    }

    #[test]
    fn shortcut_registration_is_blocked_for_wayland_unsupported_capability() {
        let capabilities = PlatformCapabilities {
            platform: PlatformKind::Linux,
            session_type: Some(SessionType::Wayland),
            clipboard_monitoring: crate::platform::capabilities::CapabilityState::Degraded,
            global_shortcut: crate::platform::capabilities::CapabilityState::Unsupported,
            launch_at_login: crate::platform::capabilities::CapabilityState::Supported,
            tray: crate::platform::capabilities::CapabilityState::Supported,
            active_app_detection: crate::platform::capabilities::CapabilityState::Unsupported,
            reasons: vec!["wayland_global_shortcut_unavailable".to_string()],
        };

        assert!(!should_register_toggle_shortcut(&capabilities));
        assert_eq!(
            ShortcutRegistrationOutcome::SkippedUnsupported {
                reasons: vec!["wayland_global_shortcut_unavailable".to_string()]
            },
            ShortcutRegistrationOutcome::SkippedUnsupported {
                reasons: capabilities.reasons.clone()
            }
        );
    }
}
