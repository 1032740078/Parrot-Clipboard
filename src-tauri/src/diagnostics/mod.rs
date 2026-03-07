use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::{
    config::{schema::PlatformKind, AppConfig},
    persistence::MigrationStatus,
    platform::{capabilities::SessionType, PlatformCapabilities},
};

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)]
pub enum PermissionAccessibilityState {
    Granted,
    Missing,
    Unsupported,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct PermissionStatus {
    pub platform: PlatformKind,
    pub accessibility: PermissionAccessibilityState,
    pub checked_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BuildProfile {
    Debug,
    Release,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ReleaseInfo {
    pub app_version: String,
    pub platform: PlatformKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_type: Option<SessionType>,
    pub schema_version: u32,
    pub config_version: u8,
    pub build_profile: BuildProfile,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct CleanupSummary {
    pub deleted_original_files: usize,
    pub deleted_thumbnail_files: usize,
    pub executed_at: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct DiagnosticsSnapshot {
    pub release: ReleaseInfo,
    pub permission: PermissionStatus,
    pub log_directory: String,
    pub migration: MigrationStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_orphan_cleanup: Option<CleanupSummary>,
    pub capabilities: PlatformCapabilities,
}

pub fn build_release_info(
    config: &AppConfig,
    migration_status: &MigrationStatus,
    capabilities: &PlatformCapabilities,
) -> ReleaseInfo {
    ReleaseInfo {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        platform: capabilities.platform,
        session_type: capabilities.session_type,
        schema_version: migration_status.current_schema_version,
        config_version: config.config_version,
        build_profile: current_build_profile(),
    }
}

pub fn build_permission_status(capabilities: &PlatformCapabilities) -> PermissionStatus {
    let checked_at = now_ms();

    let (accessibility, reason) = match crate::platform::detect_accessibility_permission() {
        Ok(Some(true)) => (PermissionAccessibilityState::Granted, None),
        Ok(Some(false)) => (
            PermissionAccessibilityState::Missing,
            Some("macos_accessibility_not_granted".to_string()),
        ),
        Ok(None) => (
            PermissionAccessibilityState::Unsupported,
            Some("accessibility_permission_not_applicable".to_string()),
        ),
        Err(error) => (
            PermissionAccessibilityState::Unsupported,
            Some(error.to_string()),
        ),
    };

    build_permission_status_at(capabilities, checked_at, accessibility, reason)
}

pub fn build_diagnostics_snapshot(
    config: &AppConfig,
    log_directory: &str,
    migration_status: &MigrationStatus,
    capabilities: &PlatformCapabilities,
) -> DiagnosticsSnapshot {
    DiagnosticsSnapshot {
        release: build_release_info(config, migration_status, capabilities),
        permission: build_permission_status(capabilities),
        log_directory: log_directory.to_string(),
        migration: migration_status.clone(),
        last_orphan_cleanup: None,
        capabilities: capabilities.clone(),
    }
}

fn build_permission_status_at(
    capabilities: &PlatformCapabilities,
    checked_at: i64,
    accessibility: PermissionAccessibilityState,
    reason: Option<String>,
) -> PermissionStatus {
    PermissionStatus {
        platform: capabilities.platform,
        accessibility,
        checked_at,
        reason,
    }
}

fn current_build_profile() -> BuildProfile {
    if cfg!(debug_assertions) {
        BuildProfile::Debug
    } else {
        BuildProfile::Release
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use crate::{
        config::{schema::PlatformKind, AppConfig},
        persistence::MigrationStatus,
        platform::{
            capabilities::{CapabilityState, SessionType},
            PlatformCapabilities,
        },
    };

    use super::{
        build_diagnostics_snapshot, build_permission_status_at, build_release_info,
        PermissionAccessibilityState,
    };

    #[test]
    fn release_info_uses_capability_and_runtime_versions() {
        let config = AppConfig::default();
        let migration_status = MigrationStatus {
            current_schema_version: 2,
            migrated: true,
            recovered_from_corruption: false,
            checked_at: 1_700_000_000_000,
            backup_paths: Vec::new(),
        };
        let capabilities = sample_capabilities(PlatformKind::Linux, Some(SessionType::Wayland));

        let release = build_release_info(&config, &migration_status, &capabilities);

        assert_eq!(release.platform, PlatformKind::Linux);
        assert_eq!(release.session_type, Some(SessionType::Wayland));
        assert_eq!(release.schema_version, 2);
        assert_eq!(release.config_version, 2);
        assert_eq!(release.app_version, env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn permission_status_returns_platform_specific_fallback() {
        let macos_capabilities =
            sample_capabilities(PlatformKind::Macos, Some(SessionType::Native));
        let linux_capabilities = sample_capabilities(PlatformKind::Linux, Some(SessionType::X11));

        let macos_permission = build_permission_status_at(
            &macos_capabilities,
            1234,
            PermissionAccessibilityState::Missing,
            Some("macos_accessibility_not_granted".to_string()),
        );
        let linux_permission = build_permission_status_at(
            &linux_capabilities,
            5678,
            PermissionAccessibilityState::Unsupported,
            Some("accessibility_permission_not_applicable".to_string()),
        );

        assert_eq!(
            macos_permission.accessibility,
            PermissionAccessibilityState::Missing
        );
        assert_eq!(
            macos_permission.reason.as_deref(),
            Some("macos_accessibility_not_granted")
        );
        assert_eq!(
            linux_permission.accessibility,
            PermissionAccessibilityState::Unsupported
        );
        assert_eq!(
            linux_permission.reason.as_deref(),
            Some("accessibility_permission_not_applicable")
        );
    }

    #[test]
    fn diagnostics_snapshot_contains_release_log_and_migration() {
        let config = AppConfig::default();
        let migration_status = MigrationStatus {
            current_schema_version: 2,
            migrated: false,
            recovered_from_corruption: true,
            checked_at: 1_700_000_000_000,
            backup_paths: vec!["/tmp/clipboard.corrupt-1.db".to_string()],
        };
        let capabilities = sample_capabilities(PlatformKind::Windows, Some(SessionType::Native));

        let snapshot = build_diagnostics_snapshot(
            &config,
            "/tmp/clipboard/logs",
            &migration_status,
            &capabilities,
        );

        assert_eq!(snapshot.release.platform, PlatformKind::Windows);
        assert_eq!(snapshot.log_directory, "/tmp/clipboard/logs");
        assert_eq!(snapshot.migration, migration_status);
        assert_eq!(snapshot.capabilities, capabilities);
        assert!(snapshot.last_orphan_cleanup.is_none());
    }

    fn sample_capabilities(
        platform: PlatformKind,
        session_type: Option<SessionType>,
    ) -> PlatformCapabilities {
        PlatformCapabilities {
            platform,
            session_type,
            clipboard_monitoring: CapabilityState::Supported,
            global_shortcut: CapabilityState::Supported,
            launch_at_login: CapabilityState::Supported,
            tray: CapabilityState::Supported,
            active_app_detection: CapabilityState::Supported,
            reasons: Vec::new(),
        }
    }
}
