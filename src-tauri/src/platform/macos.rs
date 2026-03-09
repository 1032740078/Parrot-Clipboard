#![allow(unexpected_cfgs)]

use std::{
    ffi::c_void,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    thread,
    time::Duration,
};

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
    AccessibilityPermissionSnapshot, ActiveApplication, PlatformActiveAppDetector,
    PlatformClipboard, PlatformKeySimulator,
};

const KEY_V: u16 = 0x09;
const OPEN_EXECUTABLE: &str = "open";
const OSASCRIPT_EXECUTABLE: &str = "osascript";
const ACCESSIBILITY_SETTINGS_URL: &str =
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";
const FRONTMOST_BUNDLE_ID_SCRIPT: &str =
    "tell application \"System Events\" to get bundle identifier of first application process whose frontmost is true";
const FRONTMOST_NAME_SCRIPT: &str =
    "tell application \"System Events\" to get name of first application process whose frontmost is true";

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> bool;
    fn AXIsProcessTrustedWithOptions(options: *const c_void) -> bool;
}

const ACCESSIBILITY_REASON_NOT_GRANTED: &str = "macos_accessibility_not_granted";
const ACCESSIBILITY_REASON_UNSIGNED_OR_ADHOC: &str =
    "macos_accessibility_not_granted_unsigned_or_adhoc_build";

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

pub fn detect_accessibility_permission() -> AccessibilityPermissionSnapshot {
    if unsafe { AXIsProcessTrustedWithOptions(std::ptr::null()) || AXIsProcessTrusted() } {
        return AccessibilityPermissionSnapshot {
            trusted: true,
            reason_code: None,
        };
    }

    let reason_code = match detect_signature_kind() {
        SignatureKind::Unsigned | SignatureKind::Adhoc => {
            Some(ACCESSIBILITY_REASON_UNSIGNED_OR_ADHOC.to_string())
        }
        SignatureKind::Signed | SignatureKind::Unknown => {
            Some(ACCESSIBILITY_REASON_NOT_GRANTED.to_string())
        }
    };

    AccessibilityPermissionSnapshot {
        trusted: false,
        reason_code,
    }
}

pub fn open_accessibility_settings() -> Result<(), AppError> {
    open_accessibility_settings_with_launcher(&CommandAccessibilitySettingsLauncher)
}

trait AccessibilitySettingsLauncher {
    fn open(&self, target: &str) -> Result<(), AppError>;
}

struct CommandAccessibilitySettingsLauncher;

impl AccessibilitySettingsLauncher for CommandAccessibilitySettingsLauncher {
    fn open(&self, target: &str) -> Result<(), AppError> {
        let status = Command::new(OPEN_EXECUTABLE)
            .arg(target)
            .status()
            .map_err(|error| {
                AppError::UnsupportedPlatformFeature(format!(
                    "launch accessibility settings failed: {error}"
                ))
            })?;

        if !status.success() {
            return Err(AppError::UnsupportedPlatformFeature(format!(
                "open accessibility settings failed with status `{status}`"
            )));
        }

        Ok(())
    }
}

fn open_accessibility_settings_with_launcher(
    launcher: &dyn AccessibilitySettingsLauncher,
) -> Result<(), AppError> {
    launcher.open(ACCESSIBILITY_SETTINGS_URL)
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SignatureKind {
    Signed,
    Adhoc,
    Unsigned,
    Unknown,
}

fn detect_signature_kind() -> SignatureKind {
    let signing_target = resolve_codesign_target()
        .or_else(|| std::env::current_exe().ok())
        .filter(|path| path.exists());

    let Some(signing_target) = signing_target else {
        return SignatureKind::Unknown;
    };

    let output = match Command::new("codesign")
        .args(["-dv", "--verbose=4"])
        .arg(&signing_target)
        .output()
    {
        Ok(output) => output,
        Err(_) => return SignatureKind::Unknown,
    };

    let details = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    parse_signature_kind(details.trim())
}

fn resolve_codesign_target() -> Option<PathBuf> {
    let current_executable = std::env::current_exe().ok()?;
    resolve_bundle_path(&current_executable).or(Some(current_executable))
}

fn resolve_bundle_path(executable_path: &Path) -> Option<PathBuf> {
    let contents_dir = executable_path.parent()?.parent()?;
    if contents_dir.file_name()? != "Contents" {
        return None;
    }

    let bundle_dir = contents_dir.parent()?;
    if bundle_dir.extension()?.to_str()? != "app" {
        return None;
    }

    Some(bundle_dir.to_path_buf())
}

fn parse_signature_kind(details: &str) -> SignatureKind {
    let normalized = details.to_ascii_lowercase();

    if normalized.contains("signature=adhoc") {
        return SignatureKind::Adhoc;
    }

    if normalized.contains("code object is not signed at all")
        || normalized.contains("not signed at all")
    {
        return SignatureKind::Unsigned;
    }

    if normalized.contains("signature=") {
        return SignatureKind::Signed;
    }

    SignatureKind::Unknown
}

#[cfg(test)]
mod tests {
    use std::{
        cell::RefCell,
        path::{Path, PathBuf},
        rc::Rc,
    };

    use crate::error::AppError;

    use super::{
        open_accessibility_settings_with_launcher, parse_signature_kind, resolve_bundle_path,
        AccessibilitySettingsLauncher, SignatureKind, ACCESSIBILITY_SETTINGS_URL,
    };

    #[derive(Default, Clone)]
    struct LauncherState {
        targets: Vec<String>,
        fail: bool,
    }

    #[derive(Clone)]
    struct MockLauncher {
        state: Rc<RefCell<LauncherState>>,
    }

    impl MockLauncher {
        fn new() -> (Self, Rc<RefCell<LauncherState>>) {
            let state = Rc::new(RefCell::new(LauncherState::default()));
            (
                Self {
                    state: state.clone(),
                },
                state,
            )
        }
    }

    impl AccessibilitySettingsLauncher for MockLauncher {
        fn open(&self, target: &str) -> Result<(), AppError> {
            self.state.borrow_mut().targets.push(target.to_string());
            if self.state.borrow().fail {
                return Err(AppError::UnsupportedPlatformFeature(
                    "open failed".to_string(),
                ));
            }

            Ok(())
        }
    }

    #[test]
    fn open_accessibility_settings_uses_expected_url() {
        let (launcher, state) = MockLauncher::new();

        open_accessibility_settings_with_launcher(&launcher)
            .expect("accessibility settings should open");

        assert_eq!(
            state.borrow().targets,
            vec![ACCESSIBILITY_SETTINGS_URL.to_string()]
        );
    }

    #[test]
    fn parse_signature_kind_distinguishes_signed_states() {
        assert_eq!(
            parse_signature_kind("Signature=adhoc"),
            SignatureKind::Adhoc
        );
        assert_eq!(
            parse_signature_kind("codesign: code object is not signed at all"),
            SignatureKind::Unsigned
        );
        assert_eq!(
            parse_signature_kind("Signature=size=4"),
            SignatureKind::Signed
        );
        assert_eq!(
            parse_signature_kind("Identifier=com.robin.clipboard"),
            SignatureKind::Unknown
        );
    }

    #[test]
    fn resolve_bundle_path_returns_app_root_for_bundle_executable() {
        let bundle = resolve_bundle_path(Path::new(
            "/Applications/Clipboard Manager.app/Contents/MacOS/clipboard-manager",
        ));

        assert_eq!(
            bundle,
            Some(PathBuf::from("/Applications/Clipboard Manager.app"))
        );
    }
}
