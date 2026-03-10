use std::{path::PathBuf, sync::Arc};

use crate::{
    clipboard::payload::ClipboardImageData,
    config::schema::{BlacklistMatchType, PlatformKind},
    error::AppError,
};

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub struct UnsupportedKeySimulator {
    message: String,
}

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
impl UnsupportedKeySimulator {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

pub mod capabilities;
pub mod linux;
pub mod windows;
pub use capabilities::{PlatformCapabilities, PlatformCapabilityResolver};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccessibilityPermissionSnapshot {
    pub trusted: bool,
    pub reason_code: Option<String>,
}

pub fn detect_accessibility_permission() -> Result<Option<AccessibilityPermissionSnapshot>, AppError>
{
    #[cfg(target_os = "macos")]
    {
        return Ok(Some(macos::detect_accessibility_permission()));
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(None)
    }
}

pub fn open_accessibility_settings() -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    {
        return macos::open_accessibility_settings();
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err(AppError::UnsupportedPlatformFeature(
            "accessibility settings are only available on macOS".to_string(),
        ))
    }
}

pub fn resolve_source_app_icon_png(
    source_app: &str,
    size: u32,
) -> Result<Option<Vec<u8>>, AppError> {
    #[cfg(target_os = "macos")]
    {
        return macos::resolve_source_app_icon_png(source_app, size);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (source_app, size);
        Ok(None)
    }
}

pub fn create_platform_clipboard() -> Result<Arc<dyn PlatformClipboard>, AppError> {
    #[cfg(target_os = "macos")]
    {
        Ok(Arc::new(MacosPlatformClipboard::new()?))
    }

    #[cfg(target_os = "windows")]
    {
        Ok(Arc::new(WindowsPlatformClipboard::new()?))
    }

    #[cfg(target_os = "linux")]
    {
        Ok(Arc::new(linux::LinuxPlatformClipboard::new()?))
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Ok(Arc::new(MacosPlatformClipboard::new()?))
    }
}

pub fn create_platform_key_simulator() -> Result<Arc<dyn PlatformKeySimulator>, AppError> {
    #[cfg(target_os = "macos")]
    {
        Ok(Arc::new(MacosKeySimulator))
    }

    #[cfg(target_os = "windows")]
    {
        Ok(Arc::new(WindowsKeySimulator))
    }

    #[cfg(target_os = "linux")]
    {
        let capabilities = PlatformCapabilityResolver::current().resolve();
        if capabilities.global_shortcut != capabilities::CapabilityState::Supported {
            return Ok(Arc::new(UnsupportedKeySimulator::new(
                capabilities.reasons.join(", "),
            )));
        }

        Ok(Arc::new(linux::LinuxKeySimulator))
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Ok(Arc::new(MacosKeySimulator))
    }
}

pub fn create_platform_active_app_detector() -> Arc<dyn PlatformActiveAppDetector> {
    #[cfg(target_os = "macos")]
    {
        Arc::new(macos::MacosActiveAppDetector)
    }

    #[cfg(target_os = "windows")]
    {
        Arc::new(windows::WindowsActiveAppDetector)
    }

    #[cfg(target_os = "linux")]
    {
        Arc::new(linux::LinuxActiveAppDetector)
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Arc::new(NoopActiveAppDetector)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActiveApplication {
    pub platform: PlatformKind,
    pub app_name: Option<String>,
    pub bundle_id: Option<String>,
    pub process_name: Option<String>,
    pub app_id: Option<String>,
    pub wm_class: Option<String>,
}

impl ActiveApplication {
    pub fn identifier_for(&self, match_type: BlacklistMatchType) -> Option<&str> {
        match match_type {
            BlacklistMatchType::BundleId => self.bundle_id.as_deref(),
            BlacklistMatchType::ProcessName => self.process_name.as_deref(),
            BlacklistMatchType::AppId => self.app_id.as_deref(),
            BlacklistMatchType::WmClass => self.wm_class.as_deref(),
        }
    }

    pub fn display_name(&self) -> Option<&str> {
        self.app_name
            .as_deref()
            .or(self.bundle_id.as_deref())
            .or(self.process_name.as_deref())
            .or(self.app_id.as_deref())
            .or(self.wm_class.as_deref())
    }
}

pub trait PlatformActiveAppDetector: Send + Sync {
    fn detect_active_application(&self) -> Result<Option<ActiveApplication>, AppError>;
}

#[cfg_attr(
    any(target_os = "macos", target_os = "windows", target_os = "linux"),
    allow(dead_code)
)]
#[derive(Default)]
pub struct NoopActiveAppDetector;

impl PlatformActiveAppDetector for NoopActiveAppDetector {
    fn detect_active_application(&self) -> Result<Option<ActiveApplication>, AppError> {
        Ok(None)
    }
}

pub trait PlatformClipboard: Send + Sync {
    fn read_text(&self) -> Result<Option<String>, AppError>;
    fn read_html(&self) -> Result<Option<String>, AppError>;
    fn read_image(&self) -> Result<Option<ClipboardImageData>, AppError>;
    fn read_file_list(&self) -> Result<Option<Vec<PathBuf>>, AppError>;
    fn write_text(&self, text: &str) -> Result<(), AppError>;
    fn write_html(&self, html: &str, alt_text: &str) -> Result<(), AppError>;
    fn write_image(&self, image: &ClipboardImageData) -> Result<(), AppError>;
    fn write_file_list(&self, file_list: &[PathBuf]) -> Result<(), AppError>;
    fn change_count(&self) -> u64;
}

pub trait PlatformKeySimulator: Send + Sync {
    fn simulate_paste(&self) -> Result<(), AppError>;
}

impl PlatformKeySimulator for UnsupportedKeySimulator {
    fn simulate_paste(&self) -> Result<(), AppError> {
        Err(AppError::UnsupportedPlatformFeature(self.message.clone()))
    }
}

#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(target_os = "macos")]
pub use macos::{MacosKeySimulator, MacosPlatformClipboard};

#[cfg(not(target_os = "macos"))]
pub mod macos {
    use std::{path::PathBuf, sync::Mutex};

    use crate::{clipboard::payload::ClipboardImageData, error::AppError};

    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    pub struct UnsupportedKeySimulator {
        message: String,
    }

    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    impl UnsupportedKeySimulator {
        pub fn new(message: impl Into<String>) -> Self {
            Self {
                message: message.into(),
            }
        }
    }

    use super::{PlatformClipboard, PlatformKeySimulator};

    #[derive(Default)]
    struct ClipboardState {
        text: Option<String>,
        html: Option<String>,
        image: Option<ClipboardImageData>,
        files: Option<Vec<PathBuf>>,
    }

    pub struct MacosPlatformClipboard {
        state: Mutex<ClipboardState>,
    }

    impl MacosPlatformClipboard {
        pub fn new() -> Result<Self, AppError> {
            Ok(Self {
                state: Mutex::new(ClipboardState::default()),
            })
        }
    }

    impl PlatformClipboard for MacosPlatformClipboard {
        fn read_text(&self) -> Result<Option<String>, AppError> {
            Ok(self.state.lock().expect("lock poisoned").text.clone())
        }

        fn read_html(&self) -> Result<Option<String>, AppError> {
            Ok(self.state.lock().expect("lock poisoned").html.clone())
        }

        fn read_image(&self) -> Result<Option<ClipboardImageData>, AppError> {
            Ok(self.state.lock().expect("lock poisoned").image.clone())
        }

        fn read_file_list(&self) -> Result<Option<Vec<PathBuf>>, AppError> {
            Ok(self.state.lock().expect("lock poisoned").files.clone())
        }

        fn write_text(&self, text: &str) -> Result<(), AppError> {
            let mut state = self.state.lock().expect("lock poisoned");
            state.text = Some(text.to_string());
            state.html = None;
            state.image = None;
            state.files = None;
            Ok(())
        }

        fn write_html(&self, html: &str, alt_text: &str) -> Result<(), AppError> {
            let mut state = self.state.lock().expect("lock poisoned");
            state.text = Some(alt_text.to_string());
            state.html = Some(html.to_string());
            state.image = None;
            state.files = None;
            Ok(())
        }

        fn write_image(&self, image: &ClipboardImageData) -> Result<(), AppError> {
            let mut state = self.state.lock().expect("lock poisoned");
            state.text = None;
            state.html = None;
            state.image = Some(image.clone());
            state.files = None;
            Ok(())
        }

        fn write_file_list(&self, file_list: &[PathBuf]) -> Result<(), AppError> {
            let mut state = self.state.lock().expect("lock poisoned");
            state.text = None;
            state.html = None;
            state.image = None;
            state.files = Some(file_list.to_vec());
            Ok(())
        }

        fn change_count(&self) -> u64 {
            0
        }
    }

    #[derive(Default)]
    pub struct MacosKeySimulator;

    impl PlatformKeySimulator for MacosKeySimulator {
        fn simulate_paste(&self) -> Result<(), AppError> {
            Ok(())
        }
    }

    pub fn resolve_source_app_icon_png(
        _source_app: &str,
        _size: u32,
    ) -> Result<Option<Vec<u8>>, AppError> {
        Ok(None)
    }
}

#[cfg(test)]
mod tests;
