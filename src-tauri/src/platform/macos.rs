#![allow(unexpected_cfgs)]

use std::{path::PathBuf, process::Command, sync::Mutex, thread, time::Duration};

use arboard::{Clipboard, ImageData};
use core_graphics::{
    event::{CGEvent, CGEventFlags, CGEventTapLocation},
    event_source::{CGEventSource, CGEventSourceStateID},
};
use objc::{class, msg_send, sel, sel_impl};

use crate::{
    clipboard::payload::ClipboardImageData, config::schema::PlatformKind, error::AppError,
};

use super::{
    ActiveApplication, PlatformActiveAppDetector, PlatformClipboard, PlatformKeySimulator,
};

const KEY_V: u16 = 0x09;
const OSASCRIPT_EXECUTABLE: &str = "osascript";
const FRONTMOST_BUNDLE_ID_SCRIPT: &str =
    "tell application \"System Events\" to get bundle identifier of first application process whose frontmost is true";
const FRONTMOST_NAME_SCRIPT: &str =
    "tell application \"System Events\" to get name of first application process whose frontmost is true";

pub struct MacosPlatformClipboard {
    clipboard: Mutex<Clipboard>,
}

impl MacosPlatformClipboard {
    pub fn new() -> Result<Self, AppError> {
        let clipboard = Clipboard::new()
            .map_err(|error| AppError::ClipboardRead(format!("init clipboard failed: {error}")))?;

        Ok(Self {
            clipboard: Mutex::new(clipboard),
        })
    }
}

impl PlatformClipboard for MacosPlatformClipboard {
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
        unsafe {
            let cls = class!(NSPasteboard);
            let pasteboard: *mut objc::runtime::Object = msg_send![cls, generalPasteboard];
            let count: isize = msg_send![pasteboard, changeCount];
            if count < 0 {
                0
            } else {
                count as u64
            }
        }
    }
}

#[derive(Default)]
pub struct MacosKeySimulator;

impl PlatformKeySimulator for MacosKeySimulator {
    fn simulate_paste(&self) -> Result<(), AppError> {
        let source = CGEventSource::new(CGEventSourceStateID::CombinedSessionState)
            .map_err(|_| AppError::KeySimulation("failed to create CGEventSource".to_string()))?;

        let key_down = CGEvent::new_keyboard_event(source.clone(), KEY_V, true)
            .map_err(|_| AppError::KeySimulation("failed to create key down event".to_string()))?;
        key_down.set_flags(CGEventFlags::CGEventFlagCommand);
        key_down.post(CGEventTapLocation::HID);

        thread::sleep(Duration::from_millis(20));

        let key_up = CGEvent::new_keyboard_event(source, KEY_V, false)
            .map_err(|_| AppError::KeySimulation("failed to create key up event".to_string()))?;
        key_up.set_flags(CGEventFlags::CGEventFlagCommand);
        key_up.post(CGEventTapLocation::HID);

        Ok(())
    }
}

#[derive(Default)]
pub struct MacosActiveAppDetector;

impl PlatformActiveAppDetector for MacosActiveAppDetector {
    fn detect_active_application(&self) -> Result<Option<ActiveApplication>, AppError> {
        let bundle_id = run_osascript(FRONTMOST_BUNDLE_ID_SCRIPT)?;
        if bundle_id.is_empty() {
            return Ok(None);
        }

        let app_name = run_osascript(FRONTMOST_NAME_SCRIPT)
            .ok()
            .filter(|value| !value.is_empty());

        Ok(Some(ActiveApplication {
            platform: PlatformKind::Macos,
            app_name,
            bundle_id: Some(bundle_id.to_ascii_lowercase()),
            process_name: None,
            app_id: None,
            wm_class: None,
        }))
    }
}

fn run_osascript(script: &str) -> Result<String, AppError> {
    let output = Command::new(OSASCRIPT_EXECUTABLE)
        .args(["-e", script])
        .output()
        .map_err(|error| AppError::MonitorControl(format!("launch osascript failed: {error}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(AppError::MonitorControl(format!(
            "read frontmost application failed: {stderr}"
        )));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
