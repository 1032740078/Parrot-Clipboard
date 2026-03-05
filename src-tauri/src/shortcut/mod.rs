use std::sync::Arc;

use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::{error::AppError, window::WindowManager};

pub fn register_toggle_shortcut(
    app: &AppHandle,
    shortcut: &str,
    window_manager: Arc<dyn WindowManager>,
) -> Result<(), AppError> {
    let shortcut_string = shortcut.to_string();

    app.global_shortcut()
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                if let Err(error) = window_manager.toggle() {
                    eprintln!("toggle window failed: {error:?}");
                }
            }
        })
        .map_err(|error| {
            AppError::InvalidParam(format!(
                "register shortcut `{shortcut_string}` failed: {error}"
            ))
        })
}
