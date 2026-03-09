use std::{str::FromStr, sync::Arc};

use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::{
    config::schema::PlatformKind,
    error::AppError,
    ipc::events::{emit_panel_visibility_changed, PanelVisibilityReasonPayload},
    platform::{capabilities::CapabilityState, PlatformCapabilities, PlatformCapabilityResolver},
    tray,
    window::WindowManager,
};

#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
pub struct ShortcutValidationResult {
    pub normalized_shortcut: String,
    pub valid: bool,
    pub conflict: bool,
    pub reason: Option<String>,
}

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
    let app_handle = app.clone();

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
                tracing::debug!(shortcut = %shortcut_string, "toggle shortcut pressed");
                match window_manager.toggle() {
                    Ok(panel_visible) => {
                        if let Err(error) = emit_panel_visibility_changed(
                            &app_handle,
                            panel_visible,
                            PanelVisibilityReasonPayload::ToggleShortcut,
                            None,
                        ) {
                            tracing::warn!(
                                error = %error,
                                panel_visible,
                                "emit panel visibility after shortcut failed"
                            );
                        }

                        if let Err(error) = tray::refresh(&app_handle) {
                            tracing::warn!(
                                error = %error,
                                panel_visible,
                                "refresh tray after shortcut toggle failed"
                            );
                        }
                    }
                    Err(error) => {
                        tracing::error!(error = %error, "toggle window failed");
                    }
                }
            }
        })
        .map_err(|error| {
            AppError::InvalidParam(format!("register shortcut `{shortcut}` failed: {error}"))
        })?;

    tracing::info!(shortcut = %shortcut, "toggle shortcut registered");
    Ok(ShortcutRegistrationOutcome::Registered)
}

pub fn validate_toggle_shortcut(
    shortcut: &str,
    capabilities: &PlatformCapabilities,
) -> ShortcutValidationResult {
    if capabilities.global_shortcut != CapabilityState::Supported {
        return ShortcutValidationResult {
            normalized_shortcut: shortcut.trim().to_string(),
            valid: false,
            conflict: false,
            reason: Some("当前会话不支持全局快捷键，请改用托盘菜单打开主面板".to_string()),
        };
    }

    let parsed = match Shortcut::from_str(shortcut.trim()) {
        Ok(parsed) => parsed,
        Err(error) => {
            return ShortcutValidationResult {
                normalized_shortcut: shortcut.trim().to_string(),
                valid: false,
                conflict: false,
                reason: Some(format!("快捷键格式无效：{error}")),
            };
        }
    };

    let normalized = normalize_shortcut(&parsed);

    if parsed.mods.is_empty() {
        return ShortcutValidationResult {
            normalized_shortcut: normalized,
            valid: false,
            conflict: false,
            reason: Some("快捷键至少需要一个修饰键".to_string()),
        };
    }
    if let Some(reason) = reserved_shortcut_reason(capabilities.platform, &normalized) {
        return ShortcutValidationResult {
            normalized_shortcut: normalized,
            valid: true,
            conflict: true,
            reason: Some(reason),
        };
    }

    ShortcutValidationResult {
        normalized_shortcut: normalized,
        valid: true,
        conflict: false,
        reason: None,
    }
}

pub fn reregister_toggle_shortcut(
    app: &AppHandle,
    current_shortcut: &str,
    next_shortcut: &str,
    window_manager: Arc<dyn WindowManager>,
) -> Result<ShortcutRegistrationOutcome, AppError> {
    if current_shortcut == next_shortcut {
        return Ok(ShortcutRegistrationOutcome::Registered);
    }

    let global_shortcut = app.global_shortcut();
    let had_existing_registration = global_shortcut.is_registered(current_shortcut);

    if had_existing_registration {
        global_shortcut
            .unregister(current_shortcut)
            .map_err(|error| {
                AppError::InvalidParam(format!(
                    "unregister shortcut `{current_shortcut}` failed: {error}"
                ))
            })?;
    }

    match register_toggle_shortcut(app, next_shortcut, window_manager.clone()) {
        Ok(result) => Ok(result),
        Err(error) => {
            if had_existing_registration {
                let rollback = register_toggle_shortcut(app, current_shortcut, window_manager)
                    .map_err(|rollback_error| {
                        tracing::error!(
                            error = %rollback_error,
                            shortcut = %current_shortcut,
                            "rollback shortcut registration failed"
                        );
                        rollback_error
                    });
                if let Err(rollback_error) = rollback {
                    tracing::error!(error = %rollback_error, "shortcut rollback failed");
                }
            }
            Err(error)
        }
    }
}

fn should_register_toggle_shortcut(capabilities: &PlatformCapabilities) -> bool {
    capabilities.global_shortcut == CapabilityState::Supported
}

fn normalize_shortcut(shortcut: &Shortcut) -> String {
    let mut tokens: Vec<String> = Vec::new();

    if shortcut
        .mods
        .contains(tauri_plugin_global_shortcut::Modifiers::SHIFT)
    {
        tokens.push("shift".to_string());
    }
    if shortcut
        .mods
        .contains(tauri_plugin_global_shortcut::Modifiers::CONTROL)
    {
        tokens.push("control".to_string());
    }
    if shortcut
        .mods
        .contains(tauri_plugin_global_shortcut::Modifiers::ALT)
    {
        tokens.push("alt".to_string());
    }
    if shortcut
        .mods
        .contains(tauri_plugin_global_shortcut::Modifiers::SUPER)
    {
        tokens.push("super".to_string());
    }

    let key = shortcut.key.to_string();
    let normalized_key = key
        .strip_prefix("Key")
        .or_else(|| key.strip_prefix("Digit"))
        .unwrap_or(&key)
        .to_lowercase();
    tokens.push(normalized_key);

    tokens.join("+")
}

fn reserved_shortcut_reason(platform: PlatformKind, normalized_shortcut: &str) -> Option<String> {
    let reserved = match platform {
        PlatformKind::Macos => ["super+space", "super+tab", "super+shift+4"].as_slice(),
        PlatformKind::Windows | PlatformKind::Linux => {
            ["alt+tab", "control+alt+delete", "super+space"].as_slice()
        }
    };

    reserved
        .iter()
        .any(|candidate| candidate == &normalized_shortcut)
        .then(|| "当前组合键与系统保留快捷键冲突，请改用其他组合".to_string())
}

#[cfg(test)]
mod tests {
    use crate::{
        config::schema::PlatformKind,
        platform::{capabilities::SessionType, PlatformCapabilities},
    };

    use super::{
        should_register_toggle_shortcut, validate_toggle_shortcut, ShortcutRegistrationOutcome,
    };

    fn supported_capabilities() -> PlatformCapabilities {
        PlatformCapabilities {
            platform: PlatformKind::Windows,
            session_type: Some(SessionType::Native),
            clipboard_monitoring: crate::platform::capabilities::CapabilityState::Supported,
            global_shortcut: crate::platform::capabilities::CapabilityState::Supported,
            launch_at_login: crate::platform::capabilities::CapabilityState::Supported,
            tray: crate::platform::capabilities::CapabilityState::Supported,
            active_app_detection: crate::platform::capabilities::CapabilityState::Supported,
            reasons: Vec::new(),
        }
    }

    #[test]
    fn shortcut_registration_is_allowed_for_supported_capability() {
        assert!(should_register_toggle_shortcut(&supported_capabilities()));
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

    #[test]
    fn shortcut_validation_normalizes_valid_shortcut() {
        let result = validate_toggle_shortcut("Ctrl+Shift+V", &supported_capabilities());

        assert!(result.valid);
        assert!(!result.conflict);
        assert_eq!(result.normalized_shortcut, "shift+control+v");
        assert_eq!(result.reason, None);
    }

    #[test]
    fn shortcut_validation_rejects_missing_modifier() {
        let result = validate_toggle_shortcut("V", &supported_capabilities());

        assert!(!result.valid);
        assert!(!result.conflict);
        assert_eq!(result.reason, Some("快捷键至少需要一个修饰键".to_string()));
    }

    #[test]
    fn shortcut_validation_detects_reserved_shortcut_conflict() {
        let result = validate_toggle_shortcut("Alt+Tab", &supported_capabilities());

        assert!(result.valid);
        assert!(result.conflict);
        assert_eq!(
            result.reason,
            Some("当前组合键与系统保留快捷键冲突，请改用其他组合".to_string())
        );
    }

    #[test]
    fn shortcut_validation_detects_macos_reserved_shortcut_conflict() {
        let capabilities = PlatformCapabilities {
            platform: PlatformKind::Macos,
            session_type: Some(SessionType::Native),
            clipboard_monitoring: crate::platform::capabilities::CapabilityState::Supported,
            global_shortcut: crate::platform::capabilities::CapabilityState::Supported,
            launch_at_login: crate::platform::capabilities::CapabilityState::Supported,
            tray: crate::platform::capabilities::CapabilityState::Supported,
            active_app_detection: crate::platform::capabilities::CapabilityState::Supported,
            reasons: Vec::new(),
        };

        let result = validate_toggle_shortcut("Command+Space", &capabilities);

        assert!(result.valid);
        assert!(result.conflict);
        assert_eq!(
            result.reason,
            Some("当前组合键与系统保留快捷键冲突，请改用其他组合".to_string())
        );
    }

    #[test]
    fn shortcut_validation_returns_unsupported_for_wayland() {
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

        let result = validate_toggle_shortcut("Ctrl+Shift+V", &capabilities);

        assert!(!result.valid);
        assert!(!result.conflict);
        assert_eq!(
            result.reason,
            Some("当前会话不支持全局快捷键，请改用托盘菜单打开主面板".to_string())
        );
    }
}
