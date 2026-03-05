#![allow(unexpected_cfgs)]

use std::sync::Mutex;

use arboard::Clipboard;
use core_graphics::{
    event::{CGEvent, CGEventFlags, CGEventTapLocation},
    event_source::{CGEventSource, CGEventSourceStateID},
};
use objc::{class, msg_send, sel, sel_impl};

use crate::error::AppError;

use super::{PlatformClipboard, PlatformKeySimulator};

const KEY_V: u16 = 0x09;

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
                "read clipboard failed: {error}"
            ))),
        }
    }

    fn write_text(&self, text: &str) -> Result<(), AppError> {
        let mut clipboard = self.clipboard.lock().expect("clipboard lock poisoned");
        clipboard
            .set_text(text.to_string())
            .map_err(|error| AppError::ClipboardWrite(format!("write clipboard failed: {error}")))
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

        let key_up = CGEvent::new_keyboard_event(source, KEY_V, false)
            .map_err(|_| AppError::KeySimulation("failed to create key up event".to_string()))?;
        key_up.set_flags(CGEventFlags::CGEventFlagCommand);
        key_up.post(CGEventTapLocation::HID);

        Ok(())
    }
}
