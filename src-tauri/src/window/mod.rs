use std::sync::{Arc, Mutex};

use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager};

use crate::error::AppError;

use self::position::calculate_bottom_position;

#[cfg(target_os = "macos")]
use objc::{class, msg_send, runtime::Object, sel, sel_impl};

pub mod position;

pub trait WindowManager: Send + Sync {
    fn show(&self) -> Result<(), AppError>;
    fn hide(&self) -> Result<(), AppError>;
    fn toggle(&self) -> Result<bool, AppError>;
    fn is_visible(&self) -> Result<bool, AppError>;
}

pub struct TauriWindowManager {
    app_handle: AppHandle,
    label: String,
    panel_height: f64,
    last_active_app_pid: Mutex<Option<i32>>,
}

impl TauriWindowManager {
    #[cfg(target_os = "macos")]
    const NS_APPLICATION_ACTIVATE_IGNORING_OTHER_APPS: usize = 1 << 1;

    pub fn new(app_handle: AppHandle, label: impl Into<String>, panel_height: f64) -> Arc<Self> {
        Arc::new(Self {
            app_handle,
            label: label.into(),
            panel_height,
            last_active_app_pid: Mutex::new(None),
        })
    }

    fn window(&self) -> Result<tauri::WebviewWindow, AppError> {
        self.app_handle
            .get_webview_window(&self.label)
            .ok_or_else(|| AppError::Window("main window not found".to_string()))
    }

    fn resize_and_position(&self, window: &tauri::WebviewWindow) -> Result<(), AppError> {
        let monitor = self
            .app_handle
            .primary_monitor()
            .map_err(|error| AppError::Window(format!("read monitor failed: {error}")))?
            .ok_or_else(|| AppError::Window("primary monitor not available".to_string()))?;

        let screen_width = monitor.size().width as f64;
        let screen_height = monitor.size().height as f64;
        let y = calculate_bottom_position(screen_height, self.panel_height);

        window
            .set_size(LogicalSize::new(screen_width, self.panel_height))
            .map_err(|error| AppError::Window(format!("set size failed: {error}")))?;
        window
            .set_position(LogicalPosition::new(0.0, y))
            .map_err(|error| AppError::Window(format!("set position failed: {error}")))?;

        Ok(())
    }

    #[cfg(target_os = "macos")]
    fn capture_frontmost_app_pid(&self) -> Option<i32> {
        unsafe {
            let workspace_class = class!(NSWorkspace);
            let workspace: *mut Object = msg_send![workspace_class, sharedWorkspace];
            if workspace.is_null() {
                return None;
            }

            let frontmost_app: *mut Object = msg_send![workspace, frontmostApplication];
            if frontmost_app.is_null() {
                return None;
            }

            let pid: i32 = msg_send![frontmost_app, processIdentifier];
            if pid <= 0 || pid == std::process::id() as i32 {
                return None;
            }

            Some(pid)
        }
    }

    #[cfg(not(target_os = "macos"))]
    fn capture_frontmost_app_pid(&self) -> Option<i32> {
        None
    }

    #[cfg(target_os = "macos")]
    fn restore_focus_to_app(&self, pid: i32) -> Result<(), AppError> {
        unsafe {
            let running_app_class = class!(NSRunningApplication);
            let app: *mut Object =
                msg_send![running_app_class, runningApplicationWithProcessIdentifier: pid];

            if app.is_null() {
                return Err(AppError::Window(format!(
                    "restore focus failed: app `{pid}` not found"
                )));
            }

            let activated: bool = msg_send![
                app,
                activateWithOptions: Self::NS_APPLICATION_ACTIVATE_IGNORING_OTHER_APPS
            ];
            if !activated {
                return Err(AppError::Window(format!(
                    "restore focus failed: activate app `{pid}` returned false"
                )));
            }
        }

        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    fn restore_focus_to_app(&self, _pid: i32) -> Result<(), AppError> {
        Ok(())
    }
}

impl WindowManager for TauriWindowManager {
    fn show(&self) -> Result<(), AppError> {
        tracing::debug!("window show requested");

        let previous_frontmost_pid = self.capture_frontmost_app_pid();
        *self
            .last_active_app_pid
            .lock()
            .expect("window focus state lock poisoned") = previous_frontmost_pid;

        if let Some(pid) = previous_frontmost_pid {
            tracing::debug!(pid, "captured frontmost app before showing panel");
        }

        let window = self.window()?;
        self.resize_and_position(&window)?;
        window
            .show()
            .map_err(|error| AppError::Window(format!("show failed: {error}")))?;
        window
            .set_focus()
            .map_err(|error| AppError::Window(format!("set focus failed: {error}")))?;
        tracing::info!("window shown");
        Ok(())
    }

    fn hide(&self) -> Result<(), AppError> {
        tracing::debug!("window hide requested");
        let window = self.window()?;
        window
            .hide()
            .map_err(|error| AppError::Window(format!("hide failed: {error}")))?;

        let target_pid = self
            .last_active_app_pid
            .lock()
            .expect("window focus state lock poisoned")
            .take();
        if let Some(pid) = target_pid {
            match self.restore_focus_to_app(pid) {
                Ok(()) => tracing::debug!(pid, "restored frontmost app focus"),
                Err(error) => tracing::warn!(
                    pid,
                    error = %error,
                    "restore previous app focus failed"
                ),
            }
        }

        tracing::info!("window hidden");
        Ok(())
    }

    fn toggle(&self) -> Result<bool, AppError> {
        if self.is_visible()? {
            self.hide()?;
            tracing::debug!("window toggled to hidden");
            return Ok(false);
        }

        self.show()?;
        tracing::debug!("window toggled to visible");
        Ok(true)
    }

    fn is_visible(&self) -> Result<bool, AppError> {
        let window = self.window()?;
        window
            .is_visible()
            .map_err(|error| AppError::Window(format!("query visible failed: {error}")))
    }
}
