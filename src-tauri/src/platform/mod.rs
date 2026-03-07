use std::{path::PathBuf, sync::Arc};

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

pub mod capabilities;
pub mod linux;
pub mod windows;
pub use capabilities::{PlatformCapabilities, PlatformCapabilityResolver};

pub fn create_platform_clipboard() -> Result<Arc<dyn PlatformClipboard>, AppError> {
    #[cfg(target_os = "macos")]
    {
        return Ok(Arc::new(MacosPlatformClipboard::new()?));
    }

    #[cfg(target_os = "windows")]
    {
        return Ok(Arc::new(WindowsPlatformClipboard::new()?));
    }

    #[cfg(target_os = "linux")]
    {
        return Ok(Arc::new(linux::LinuxPlatformClipboard::new()?));
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Ok(Arc::new(MacosPlatformClipboard::new()?))
    }
}

pub fn create_platform_key_simulator() -> Result<Arc<dyn PlatformKeySimulator>, AppError> {
    #[cfg(target_os = "macos")]
    {
        return Ok(Arc::new(MacosKeySimulator));
    }

    #[cfg(target_os = "windows")]
    {
        return Ok(Arc::new(WindowsKeySimulator));
    }

    #[cfg(target_os = "linux")]
    {
        let capabilities = PlatformCapabilityResolver::current().resolve();
        if capabilities.global_shortcut != capabilities::CapabilityState::Supported {
            return Ok(Arc::new(UnsupportedKeySimulator::new(
                capabilities.reasons.join(", "),
            )));
        }

        return Ok(Arc::new(linux::LinuxKeySimulator));
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Ok(Arc::new(MacosKeySimulator))
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
}

#[cfg(test)]
mod tests;
