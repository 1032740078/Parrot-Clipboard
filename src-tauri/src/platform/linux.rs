#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

use std::{path::PathBuf, process::Command, sync::Mutex};

use arboard::{Clipboard, ImageData};

use crate::{clipboard::payload::ClipboardImageData, error::AppError};

use super::{PlatformClipboard, PlatformKeySimulator};

const XDG_PASTE_EXECUTABLE: &str = "xdotool";
const XDG_PASTE_ARGS: [&str; 3] = ["key", "--clearmodifiers", "ctrl+v"];

pub struct LinuxPlatformClipboard {
    clipboard: Mutex<Clipboard>,
}

impl LinuxPlatformClipboard {
    pub fn new() -> Result<Self, AppError> {
        let clipboard = Clipboard::new()
            .map_err(|error| AppError::ClipboardRead(format!("init clipboard failed: {error}")))?;

        Ok(Self {
            clipboard: Mutex::new(clipboard),
        })
    }
}

impl PlatformClipboard for LinuxPlatformClipboard {
    fn read_text(&self) -> Result<Option<String>, AppError> {
        let mut clipboard = self.clipboard.lock().expect("clipboard lock poisoned");
        match clipboard.get_text() {
            Ok(text) => Ok(Some(text)),
            Err(arboard::Error::ContentNotAvailable) => Ok(None),
            Err(error) => Err(AppError::ClipboardRead(format!(
                "read clipboard text failed: {error}"
            ))),
        }
    }

    fn read_html(&self) -> Result<Option<String>, AppError> {
        let mut clipboard = self.clipboard.lock().expect("clipboard lock poisoned");
        match clipboard.get().html() {
            Ok(html) => Ok(Some(html)),
            Err(arboard::Error::ContentNotAvailable) => Ok(None),
            Err(error) => Err(AppError::ClipboardRead(format!(
                "read clipboard html failed: {error}"
            ))),
        }
    }

    fn read_image(&self) -> Result<Option<ClipboardImageData>, AppError> {
        let mut clipboard = self.clipboard.lock().expect("clipboard lock poisoned");
        match clipboard.get_image() {
            Ok(image) => Ok(Some(ClipboardImageData {
                width: image.width,
                height: image.height,
                bytes: image.bytes.into_owned(),
            })),
            Err(arboard::Error::ContentNotAvailable) => Ok(None),
            Err(error) => Err(AppError::ClipboardRead(format!(
                "read clipboard image failed: {error}"
            ))),
        }
    }

    fn read_file_list(&self) -> Result<Option<Vec<PathBuf>>, AppError> {
        let mut clipboard = self.clipboard.lock().expect("clipboard lock poisoned");
        match clipboard.get().file_list() {
            Ok(files) if files.is_empty() => Ok(None),
            Ok(files) => Ok(Some(files)),
            Err(arboard::Error::ContentNotAvailable) => Ok(None),
            Err(error) => Err(AppError::ClipboardRead(format!(
                "read clipboard file list failed: {error}"
            ))),
        }
    }

    fn write_text(&self, text: &str) -> Result<(), AppError> {
        let mut clipboard = self.clipboard.lock().expect("clipboard lock poisoned");
        clipboard.set_text(text.to_string()).map_err(|error| {
            AppError::ClipboardWrite(format!("write clipboard text failed: {error}"))
        })
    }

    fn write_html(&self, html: &str, alt_text: &str) -> Result<(), AppError> {
        let mut clipboard = self.clipboard.lock().expect("clipboard lock poisoned");
        clipboard
            .set_html(html.to_string(), Some(alt_text.to_string()))
            .map_err(|error| {
                AppError::ClipboardWrite(format!("write clipboard html failed: {error}"))
            })
    }

    fn write_image(&self, image: &ClipboardImageData) -> Result<(), AppError> {
        let mut clipboard = self.clipboard.lock().expect("clipboard lock poisoned");
        clipboard
            .set_image(ImageData {
                width: image.width,
                height: image.height,
                bytes: image.bytes.clone().into(),
            })
            .map_err(|error| {
                AppError::ClipboardWrite(format!("write clipboard image failed: {error}"))
            })
    }

    fn write_file_list(&self, file_list: &[PathBuf]) -> Result<(), AppError> {
        let mut clipboard = self.clipboard.lock().expect("clipboard lock poisoned");
        clipboard.set().file_list(file_list).map_err(|error| {
            AppError::ClipboardWrite(format!("write clipboard file list failed: {error}"))
        })
    }

    fn change_count(&self) -> u64 {
        0
    }
}

#[derive(Default)]
pub struct LinuxKeySimulator;

impl PlatformKeySimulator for LinuxKeySimulator {
    fn simulate_paste(&self) -> Result<(), AppError> {
        let output = Command::new(XDG_PASTE_EXECUTABLE)
            .args(XDG_PASTE_ARGS)
            .output()
            .map_err(|error| AppError::KeySimulation(format!("launch xdotool failed: {error}")))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(AppError::KeySimulation(format!(
                "xdotool paste simulation failed: {stderr}"
            )));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{XDG_PASTE_ARGS, XDG_PASTE_EXECUTABLE};

    #[test]
    fn linux_paste_command_uses_xdotool_ctrl_v() {
        assert_eq!(XDG_PASTE_EXECUTABLE, "xdotool");
        assert_eq!(XDG_PASTE_ARGS, ["key", "--clearmodifiers", "ctrl+v"]);
    }
}
