use crate::error::AppError;

pub trait PlatformClipboard: Send + Sync {
    fn read_text(&self) -> Result<Option<String>, AppError>;
    fn write_text(&self, text: &str) -> Result<(), AppError>;
    fn change_count(&self) -> u64;
}

pub trait PlatformKeySimulator: Send + Sync {
    fn simulate_paste(&self) -> Result<(), AppError>;
}

#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(target_os = "macos")]
pub use macos::{MacosKeySimulator, MacosPlatformClipboard};

#[cfg(not(target_os = "macos"))]
pub mod macos {
    use std::sync::Mutex;

    use crate::error::AppError;

    use super::{PlatformClipboard, PlatformKeySimulator};

    pub struct MacosPlatformClipboard {
        text: Mutex<Option<String>>,
    }

    impl MacosPlatformClipboard {
        pub fn new() -> Result<Self, AppError> {
            Ok(Self {
                text: Mutex::new(None),
            })
        }
    }

    impl PlatformClipboard for MacosPlatformClipboard {
        fn read_text(&self) -> Result<Option<String>, AppError> {
            Ok(self.text.lock().expect("lock poisoned").clone())
        }

        fn write_text(&self, text: &str) -> Result<(), AppError> {
            *self.text.lock().expect("lock poisoned") = Some(text.to_string());
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
