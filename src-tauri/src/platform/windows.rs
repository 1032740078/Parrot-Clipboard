#![cfg_attr(not(target_os = "windows"), allow(dead_code))]

use std::{path::PathBuf, process::Command, sync::Mutex};

use arboard::{Clipboard, ImageData};

use crate::{
    clipboard::payload::ClipboardImageData, config::schema::PlatformKind, error::AppError,
};

use super::{
    ActiveApplication, PlatformActiveAppDetector, PlatformClipboard, PlatformKeySimulator,
};

const POWERSHELL_EXECUTABLE: &str = "powershell";
const POWERSHELL_ARGS: [&str; 5] = [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
];
const WINDOWS_PASTE_SCRIPT: &str =
    "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')";
const WINDOWS_ACTIVE_APP_SCRIPT: &str = r#"
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class User32 {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
$handle = [User32]::GetForegroundWindow()
if ($handle -eq [IntPtr]::Zero) { return }
$processId = 0
[void][User32]::GetWindowThreadProcessId($handle, [ref]$processId)
if (-not $processId) { return }
$process = Get-Process -Id $processId -ErrorAction Stop
$moduleName = $null
try {
  $moduleName = $process.MainModule.ModuleName
} catch {
  $moduleName = "$($process.ProcessName).exe"
}
Write-Output $moduleName
"#;

pub struct WindowsPlatformClipboard {
    clipboard: Mutex<Clipboard>,
}

impl WindowsPlatformClipboard {
    pub fn new() -> Result<Self, AppError> {
        let clipboard = Clipboard::new()
            .map_err(|error| AppError::ClipboardRead(format!("init clipboard failed: {error}")))?;

        Ok(Self {
            clipboard: Mutex::new(clipboard),
        })
    }
}

impl PlatformClipboard for WindowsPlatformClipboard {
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
pub struct WindowsKeySimulator;

impl PlatformKeySimulator for WindowsKeySimulator {
    fn simulate_paste(&self) -> Result<(), AppError> {
        let output = Command::new(POWERSHELL_EXECUTABLE)
            .args(build_paste_command_args())
            .output()
            .map_err(|error| {
                AppError::KeySimulation(format!("launch powershell failed: {error}"))
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(AppError::KeySimulation(format!(
                "powershell send keys failed: {stderr}"
            )));
        }

        Ok(())
    }
}

#[derive(Default)]
pub struct WindowsActiveAppDetector;

impl PlatformActiveAppDetector for WindowsActiveAppDetector {
    fn detect_active_application(&self) -> Result<Option<ActiveApplication>, AppError> {
        let output = Command::new(POWERSHELL_EXECUTABLE)
            .args(build_active_app_command_args())
            .output()
            .map_err(|error| {
                AppError::MonitorControl(format!("launch powershell failed: {error}"))
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(AppError::MonitorControl(format!(
                "read foreground application failed: {stderr}"
            )));
        }

        let module_name = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if module_name.is_empty() {
            return Ok(None);
        }

        let normalized_name = module_name.to_ascii_lowercase();
        let app_name = module_name
            .trim_end_matches(".exe")
            .trim_end_matches(".EXE")
            .to_string();

        Ok(Some(ActiveApplication {
            platform: PlatformKind::Windows,
            app_name: if app_name.is_empty() {
                None
            } else {
                Some(app_name)
            },
            bundle_id: None,
            process_name: Some(normalized_name.clone()),
            app_id: Some(normalized_name),
            wm_class: None,
        }))
    }
}

fn build_paste_command_args() -> Vec<&'static str> {
    let mut args = POWERSHELL_ARGS.to_vec();
    args.push(WINDOWS_PASTE_SCRIPT);
    args
}

fn build_active_app_command_args() -> Vec<&'static str> {
    let mut args = POWERSHELL_ARGS.to_vec();
    args.push(WINDOWS_ACTIVE_APP_SCRIPT);
    args
}

#[cfg(test)]
mod tests {
    use super::{
        build_active_app_command_args, build_paste_command_args, POWERSHELL_EXECUTABLE,
        WINDOWS_ACTIVE_APP_SCRIPT, WINDOWS_PASTE_SCRIPT,
    };

    #[test]
    fn paste_command_uses_ctrl_v_send_keys_script() {
        let args = build_paste_command_args();

        assert_eq!(POWERSHELL_EXECUTABLE, "powershell");
        assert!(args.starts_with(&[
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
        ]));
        assert_eq!(args.last().copied(), Some(WINDOWS_PASTE_SCRIPT));
    }

    #[test]
    fn active_app_command_uses_powershell_foreground_process_script() {
        let args = build_active_app_command_args();

        assert_eq!(POWERSHELL_EXECUTABLE, "powershell");
        assert!(args.starts_with(&[
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
        ]));
        assert_eq!(args.last().copied(), Some(WINDOWS_ACTIVE_APP_SCRIPT));
    }
}
