use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::error::AppError;

pub const ABOUT_WINDOW_LABEL: &str = "about";
const ABOUT_WINDOW_URL: &str = "index.html?window=about";
const ABOUT_WINDOW_TITLE: &str = "关于";
const ABOUT_WINDOW_WIDTH: f64 = 720.0;
const ABOUT_WINDOW_HEIGHT: f64 = 640.0;
const ABOUT_WINDOW_MIN_WIDTH: f64 = 640.0;
const ABOUT_WINDOW_MIN_HEIGHT: f64 = 520.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AboutWindowOpenAction {
    Created,
    ActivatedExisting,
}

trait AboutWindowRuntime {
    fn window_exists(&self) -> bool;
    fn create_window(&self) -> Result<(), AppError>;
    fn restore_window(&self) -> Result<(), AppError>;
    fn show_window(&self) -> Result<(), AppError>;
    fn focus_window(&self) -> Result<(), AppError>;
}

struct TauriAboutWindowRuntime {
    app_handle: AppHandle,
}

impl TauriAboutWindowRuntime {
    fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    fn window(&self) -> Result<tauri::WebviewWindow, AppError> {
        self.app_handle
            .get_webview_window(ABOUT_WINDOW_LABEL)
            .ok_or_else(|| AppError::Window("about window not found".to_string()))
    }
}

impl AboutWindowRuntime for TauriAboutWindowRuntime {
    fn window_exists(&self) -> bool {
        self.app_handle
            .get_webview_window(ABOUT_WINDOW_LABEL)
            .is_some()
    }

    fn create_window(&self) -> Result<(), AppError> {
        WebviewWindowBuilder::new(
            &self.app_handle,
            ABOUT_WINDOW_LABEL,
            WebviewUrl::App(ABOUT_WINDOW_URL.into()),
        )
        .title(ABOUT_WINDOW_TITLE)
        .inner_size(ABOUT_WINDOW_WIDTH, ABOUT_WINDOW_HEIGHT)
        .min_inner_size(ABOUT_WINDOW_MIN_WIDTH, ABOUT_WINDOW_MIN_HEIGHT)
        .resizable(true)
        .skip_taskbar(false)
        .transparent(true)
        .decorations(false)
        .visible(false)
        .center()
        .build()
        .map_err(|error| AppError::Window(format!("build about window failed: {error}")))?;

        Ok(())
    }

    fn restore_window(&self) -> Result<(), AppError> {
        let window = self.window()?;
        if window
            .is_minimized()
            .map_err(|error| AppError::Window(format!("query minimized failed: {error}")))?
        {
            window
                .unminimize()
                .map_err(|error| AppError::Window(format!("unminimize failed: {error}")))?;
        }

        Ok(())
    }

    fn show_window(&self) -> Result<(), AppError> {
        self.window()?
            .show()
            .map_err(|error| AppError::Window(format!("show about window failed: {error}")))
    }

    fn focus_window(&self) -> Result<(), AppError> {
        self.window()?
            .set_focus()
            .map_err(|error| AppError::Window(format!("focus about window failed: {error}")))
    }
}

pub fn show_or_focus_about_window(
    app_handle: &AppHandle,
) -> Result<AboutWindowOpenAction, AppError> {
    let runtime = TauriAboutWindowRuntime::new(app_handle.clone());
    show_or_focus_with_runtime(&runtime)
}

fn show_or_focus_with_runtime(
    runtime: &dyn AboutWindowRuntime,
) -> Result<AboutWindowOpenAction, AppError> {
    let action = if runtime.window_exists() {
        AboutWindowOpenAction::ActivatedExisting
    } else {
        runtime.create_window()?;
        AboutWindowOpenAction::Created
    };

    runtime.restore_window()?;
    runtime.show_window()?;
    runtime.focus_window()?;

    Ok(action)
}

#[cfg(test)]
mod tests {
    use std::{cell::RefCell, rc::Rc};

    use crate::error::AppError;

    use super::{show_or_focus_with_runtime, AboutWindowOpenAction, AboutWindowRuntime};

    #[derive(Default, Clone)]
    struct RuntimeState {
        calls: Vec<&'static str>,
        existing: bool,
        fail_on_create: bool,
    }

    #[derive(Clone)]
    struct MockRuntime {
        state: Rc<RefCell<RuntimeState>>,
    }

    impl MockRuntime {
        fn new(existing: bool) -> (Self, Rc<RefCell<RuntimeState>>) {
            let state = Rc::new(RefCell::new(RuntimeState {
                existing,
                ..RuntimeState::default()
            }));
            (
                Self {
                    state: state.clone(),
                },
                state,
            )
        }
    }

    impl AboutWindowRuntime for MockRuntime {
        fn window_exists(&self) -> bool {
            self.state.borrow_mut().calls.push("window_exists");
            self.state.borrow().existing
        }

        fn create_window(&self) -> Result<(), AppError> {
            self.state.borrow_mut().calls.push("create_window");
            if self.state.borrow().fail_on_create {
                return Err(AppError::Window("create failed".to_string()));
            }

            Ok(())
        }

        fn restore_window(&self) -> Result<(), AppError> {
            self.state.borrow_mut().calls.push("restore_window");
            Ok(())
        }

        fn show_window(&self) -> Result<(), AppError> {
            self.state.borrow_mut().calls.push("show_window");
            Ok(())
        }

        fn focus_window(&self) -> Result<(), AppError> {
            self.state.borrow_mut().calls.push("focus_window");
            Ok(())
        }
    }

    #[test]
    fn creates_about_window_when_missing() {
        let (runtime, state) = MockRuntime::new(false);

        let action = show_or_focus_with_runtime(&runtime).expect("window should open");

        assert_eq!(action, AboutWindowOpenAction::Created);
        assert_eq!(
            state.borrow().calls,
            vec![
                "window_exists",
                "create_window",
                "restore_window",
                "show_window",
                "focus_window"
            ]
        );
    }

    #[test]
    fn focuses_existing_about_window_when_already_open() {
        let (runtime, state) = MockRuntime::new(true);

        let action = show_or_focus_with_runtime(&runtime).expect("window should focus");

        assert_eq!(action, AboutWindowOpenAction::ActivatedExisting);
        assert_eq!(
            state.borrow().calls,
            vec![
                "window_exists",
                "restore_window",
                "show_window",
                "focus_window"
            ]
        );
    }
}
