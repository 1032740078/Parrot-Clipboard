#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

use std::{path::PathBuf, process::Command, sync::Mutex};

use arboard::{Clipboard, ImageData};

use crate::{
    clipboard::payload::ClipboardImageData, config::schema::PlatformKind, error::AppError,
};

use super::{
    capabilities::CapabilityState, ActiveApplication, PlatformActiveAppDetector,
    PlatformCapabilityResolver, PlatformClipboard, PlatformKeySimulator,
};

const XDG_PASTE_EXECUTABLE: &str = "xdotool";
const XDG_PASTE_ARGS: [&str; 3] = ["key", "--clearmodifiers", "ctrl+v"];
const XPROP_EXECUTABLE: &str = "xprop";
const PS_EXECUTABLE: &str = "ps";

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

#[derive(Default)]
pub struct LinuxActiveAppDetector;

impl PlatformActiveAppDetector for LinuxActiveAppDetector {
    fn detect_active_application(&self) -> Result<Option<ActiveApplication>, AppError> {
        let capabilities = PlatformCapabilityResolver::current().resolve();
        if capabilities.active_app_detection != CapabilityState::Supported {
            return Ok(None);
        }

        let Some(window_id) = read_active_window_id()? else {
            return Ok(None);
        };
        let metadata = read_window_metadata(&window_id)?;
        let process_name = metadata
            .pid
            .and_then(|pid| read_process_name(pid).ok().flatten());
        let app_name = metadata.wm_class.clone().or_else(|| process_name.clone());

        Ok(Some(ActiveApplication {
            platform: PlatformKind::Linux,
            app_name,
            bundle_id: None,
            process_name,
            app_id: None,
            wm_class: metadata.wm_class,
        }))
    }
}

#[derive(Debug, Default, PartialEq, Eq)]
struct LinuxWindowMetadata {
    wm_class: Option<String>,
    pid: Option<u32>,
}

fn read_active_window_id() -> Result<Option<String>, AppError> {
    let output = Command::new(XPROP_EXECUTABLE)
        .args(["-root", "_NET_ACTIVE_WINDOW"])
        .output()
        .map_err(|error| AppError::MonitorControl(format!("launch xprop failed: {error}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(AppError::MonitorControl(format!(
            "read active window failed: {stderr}"
        )));
    }

    Ok(parse_active_window_id(&String::from_utf8_lossy(
        &output.stdout,
    )))
}

fn read_window_metadata(window_id: &str) -> Result<LinuxWindowMetadata, AppError> {
    let output = Command::new(XPROP_EXECUTABLE)
        .args(["-id", window_id, "WM_CLASS", "_NET_WM_PID"])
        .output()
        .map_err(|error| AppError::MonitorControl(format!("launch xprop failed: {error}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(AppError::MonitorControl(format!(
            "read active window metadata failed: {stderr}"
        )));
    }

    Ok(parse_window_metadata(&String::from_utf8_lossy(
        &output.stdout,
    )))
}

fn read_process_name(pid: u32) -> Result<Option<String>, AppError> {
    let output = Command::new(PS_EXECUTABLE)
        .args(["-p", &pid.to_string(), "-o", "comm="])
        .output()
        .map_err(|error| AppError::MonitorControl(format!("launch ps failed: {error}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(AppError::MonitorControl(format!(
            "read process name failed: {stderr}"
        )));
    }

    let process_name = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if process_name.is_empty() {
        return Ok(None);
    }

    Ok(Some(process_name.to_ascii_lowercase()))
}

fn parse_active_window_id(output: &str) -> Option<String> {
    output
        .split_whitespace()
        .find(|token| token.starts_with("0x"))
        .map(|token| token.trim().trim_end_matches(',').to_string())
        .filter(|token| token != "0x0")
}

fn parse_window_metadata(output: &str) -> LinuxWindowMetadata {
    let mut metadata = LinuxWindowMetadata::default();

    for line in output.lines() {
        if line.contains("WM_CLASS") {
            metadata.wm_class = parse_wm_class(line);
        }

        if line.contains("_NET_WM_PID") {
            metadata.pid = line
                .split('=')
                .nth(1)
                .and_then(|value| value.trim().parse::<u32>().ok());
        }
    }

    metadata
}

fn parse_wm_class(line: &str) -> Option<String> {
    let values = line
        .split('"')
        .skip(1)
        .step_by(2)
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();

    values.last().cloned()
}

#[cfg(test)]
mod tests {
    use super::{
        parse_active_window_id, parse_window_metadata, XDG_PASTE_ARGS, XDG_PASTE_EXECUTABLE,
    };

    #[test]
    fn linux_paste_command_uses_xdotool_ctrl_v() {
        assert_eq!(XDG_PASTE_EXECUTABLE, "xdotool");
        assert_eq!(XDG_PASTE_ARGS, ["key", "--clearmodifiers", "ctrl+v"]);
    }

    #[test]
    fn parses_active_window_id_from_xprop_output() {
        let output = "_NET_ACTIVE_WINDOW(WINDOW): window id # 0x3e00007\n";

        assert_eq!(parse_active_window_id(output).as_deref(), Some("0x3e00007"));
        assert_eq!(
            parse_active_window_id("_NET_ACTIVE_WINDOW(WINDOW): window id # 0x0\n"),
            None
        );
    }

    #[test]
    fn parses_wm_class_and_pid_from_xprop_output() {
        let output =
            "WM_CLASS(STRING) = \"Navigator\", \"firefox\"\n_NET_WM_PID(CARDINAL) = 4321\n";
        let metadata = parse_window_metadata(output);

        assert_eq!(metadata.wm_class.as_deref(), Some("firefox"));
        assert_eq!(metadata.pid, Some(4321));
    }
}
