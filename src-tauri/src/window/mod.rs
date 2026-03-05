use std::sync::Arc;

use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager};

use crate::error::AppError;

use self::position::calculate_bottom_position;

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
}

impl TauriWindowManager {
    pub fn new(app_handle: AppHandle, label: impl Into<String>, panel_height: f64) -> Arc<Self> {
        Arc::new(Self {
            app_handle,
            label: label.into(),
            panel_height,
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
}

impl WindowManager for TauriWindowManager {
    fn show(&self) -> Result<(), AppError> {
        let window = self.window()?;
        self.resize_and_position(&window)?;
        window
            .show()
            .map_err(|error| AppError::Window(format!("show failed: {error}")))?;
        window
            .set_focus()
            .map_err(|error| AppError::Window(format!("set focus failed: {error}")))?;
        Ok(())
    }

    fn hide(&self) -> Result<(), AppError> {
        let window = self.window()?;
        window
            .hide()
            .map_err(|error| AppError::Window(format!("hide failed: {error}")))
    }

    fn toggle(&self) -> Result<bool, AppError> {
        if self.is_visible()? {
            self.hide()?;
            return Ok(false);
        }

        self.show()?;
        Ok(true)
    }

    fn is_visible(&self) -> Result<bool, AppError> {
        let window = self.window()?;
        window
            .is_visible()
            .map_err(|error| AppError::Window(format!("query visible failed: {error}")))
    }
}
