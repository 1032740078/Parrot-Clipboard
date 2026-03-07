use crate::{
    config::schema::PlatformKind,
    platform::{
        capabilities::{CapabilityState, SessionEnvironment, SessionType},
        PlatformCapabilityResolver,
    },
};

#[test]
fn resolves_macos_native_capabilities() {
    let capabilities =
        PlatformCapabilityResolver::new(PlatformKind::Macos, SessionEnvironment::default())
            .resolve();

    assert_eq!(capabilities.platform, PlatformKind::Macos);
    assert_eq!(capabilities.session_type, Some(SessionType::Native));
    assert_eq!(
        capabilities.clipboard_monitoring,
        CapabilityState::Supported
    );
    assert_eq!(capabilities.global_shortcut, CapabilityState::Supported);
    assert_eq!(capabilities.launch_at_login, CapabilityState::Supported);
    assert_eq!(capabilities.tray, CapabilityState::Supported);
    assert_eq!(
        capabilities.active_app_detection,
        CapabilityState::Supported
    );
    assert!(capabilities.reasons.is_empty());
}

#[test]
fn resolves_windows_native_capabilities() {
    let capabilities =
        PlatformCapabilityResolver::new(PlatformKind::Windows, SessionEnvironment::default())
            .resolve();

    assert_eq!(capabilities.platform, PlatformKind::Windows);
    assert_eq!(capabilities.session_type, Some(SessionType::Native));
    assert_eq!(capabilities.global_shortcut, CapabilityState::Supported);
    assert_eq!(
        capabilities.clipboard_monitoring,
        CapabilityState::Supported
    );
}

#[test]
fn resolves_linux_x11_capabilities() {
    let capabilities = PlatformCapabilityResolver::new(
        PlatformKind::Linux,
        SessionEnvironment {
            xdg_session_type: Some("x11".to_string()),
            wayland_display: None,
            display: Some(":0".to_string()),
        },
    )
    .resolve();

    assert_eq!(capabilities.platform, PlatformKind::Linux);
    assert_eq!(capabilities.session_type, Some(SessionType::X11));
    assert_eq!(capabilities.global_shortcut, CapabilityState::Supported);
    assert_eq!(
        capabilities.clipboard_monitoring,
        CapabilityState::Supported
    );
    assert_eq!(
        capabilities.active_app_detection,
        CapabilityState::Supported
    );
    assert!(capabilities.reasons.is_empty());
}

#[test]
fn resolves_linux_wayland_capabilities_with_degradation_reasons() {
    let capabilities = PlatformCapabilityResolver::new(
        PlatformKind::Linux,
        SessionEnvironment {
            xdg_session_type: Some("wayland".to_string()),
            wayland_display: Some("wayland-0".to_string()),
            display: None,
        },
    )
    .resolve();

    assert_eq!(capabilities.platform, PlatformKind::Linux);
    assert_eq!(capabilities.session_type, Some(SessionType::Wayland));
    assert_eq!(capabilities.global_shortcut, CapabilityState::Unsupported);
    assert_eq!(capabilities.clipboard_monitoring, CapabilityState::Degraded);
    assert_eq!(capabilities.launch_at_login, CapabilityState::Supported);
    assert_eq!(capabilities.tray, CapabilityState::Supported);
    assert_eq!(
        capabilities.active_app_detection,
        CapabilityState::Unsupported
    );
    assert_eq!(
        capabilities.reasons,
        vec![
            "wayland_global_shortcut_unavailable".to_string(),
            "wayland_clipboard_monitoring_limited".to_string(),
            "wayland_active_app_detection_unavailable".to_string(),
        ]
    );
}

#[test]
fn resolves_linux_unknown_session_as_degraded() {
    let capabilities =
        PlatformCapabilityResolver::new(PlatformKind::Linux, SessionEnvironment::default())
            .resolve();

    assert_eq!(capabilities.platform, PlatformKind::Linux);
    assert_eq!(capabilities.session_type, None);
    assert_eq!(capabilities.global_shortcut, CapabilityState::Degraded);
    assert_eq!(capabilities.clipboard_monitoring, CapabilityState::Degraded);
    assert_eq!(capabilities.active_app_detection, CapabilityState::Degraded);
    assert_eq!(
        capabilities.reasons,
        vec!["linux_session_type_unknown".to_string()]
    );
}
