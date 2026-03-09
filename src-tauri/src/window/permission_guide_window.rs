use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

use crate::{
    error::AppError,
    ipc::events::emit_permission_guide_window_visibility_changed,
};

pub const PERMISSION_GUIDE_WINDOW_LABEL: &str = "permission-guide";
const PERMISSION_GUIDE_WINDOW_URL: &str = "index.html?window=permission-guide";
const PERMISSION_GUIDE_WINDOW_TITLE: &str = "权限引导";
const PERMISSION_GUIDE_WINDOW_WIDTH: f64 = 620.0;
const PERMISSION_GUIDE_WINDOW_HEIGHT: f64 = 560.0;
const PERMISSION_GUIDE_WINDOW_MIN_WIDTH: f64 = 560.0;
const PERMISSION_GUIDE_WINDOW_MIN_HEIGHT: f64 = 480.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermissionGuideWindowOpenAction {
    Created,
    ActivatedExisting,
}

trait PermissionGuideWindowRuntime {
    fn window_exists(&self) -> bool;
    fn create_window(&self) -> Result<(), AppError>;
    fn restore_window(&self) -> Result<(), AppError>;
    fn show_window(&self) -> Result<(), AppError>;
    fn focus_window(&self) -> Result<(), AppError>;
    fn notify_visibility_changed(&self, visible: bool) -> Result<(), AppError>;
}

struct TauriPermissionGuideWindowRuntime {
    app_handle: AppHandle,
}

impl TauriPermissionGuideWindowRuntime {
    fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    fn window(&self) -> Result<tauri::WebviewWindow, AppError> {
        self.app_handle
            .get_webview_window(PERMISSION_GUIDE_WINDOW_LABEL)
            .ok_or_else(|| AppError::Window("permission guide window not found".to_string()))
    }
}

impl PermissionGuideWindowRuntime for TauriPermissionGuideWindowRuntime {
    fn window_exists(&self) -> bool {
        self.app_handle
            .get_webview_window(PERMISSION_GUIDE_WINDOW_LABEL)
            .is_some()
    }

    fn create_window(&self) -> Result<(), AppError> {
        let app_handle = self.app_handle.clone();
        let window = WebviewWindowBuilder::new(
            &self.app_handle,
            PERMISSION_GUIDE_WINDOW_LABEL,
            WebviewUrl::App(PERMISSION_GUIDE_WINDOW_URL.into()),
        )
        .title(PERMISSION_GUIDE_WINDOW_TITLE)
        .inner_size(PERMISSION_GUIDE_WINDOW_WIDTH, PERMISSION_GUIDE_WINDOW_HEIGHT)
        .min_inner_size(
            PERMISSION_GUIDE_WINDOW_MIN_WIDTH,
            PERMISSION_GUIDE_WINDOW_MIN_HEIGHT,
        )
        .resizable(true)
        .skip_taskbar(false)
        .visible(false)
        .center()
        .build()
        .map_err(|error| {
            AppError::Window(format!("build permission guide window failed: {error}"))
        })?;

        window.on_window_event(move |event| {
            if matches!(event, WindowEvent::Destroyed) {
                let _ = emit_permission_guide_window_visibility_changed(&app_handle, false);
            }
        });

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
        self.window()?.show().map_err(|error| {
            AppError::Window(format!("show permission guide window failed: {error}"))
        })
    }

    fn focus_window(&self) -> Result<(), AppError> {
        self.window()?.set_focus().map_err(|error| {
            AppError::Window(format!("focus permission guide window failed: {error}"))
        })
    }

    fn notify_visibility_changed(&self, visible: bool) -> Result<(), AppError> {
        emit_permission_guide_window_visibility_changed(&self.app_handle, visible)
    }
}

pub fn show_or_focus_permission_guide_window(
    app_handle: &AppHandle,
) -> Result<PermissionGuideWindowOpenAction, AppError> {
    let runtime = TauriPermissionGuideWindowRuntime::new(app_handle.clone());
    show_or_focus_with_runtime(&runtime)
}

pub fn close_permission_guide_window(app_handle: &AppHandle) -> Result<(), AppError> {
    if let Some(window) = app_handle.get_webview_window(PERMISSION_GUIDE_WINDOW_LABEL) {
        window.close().map_err(|error| {
            AppError::Window(format!("close permission guide window failed: {error}"))
        })?;
    }

    Ok(())
}

fn show_or_focus_with_runtime(
    runtime: &dyn PermissionGuideWindowRuntime,
) -> Result<PermissionGuideWindowOpenAction, AppError> {
    let action = if runtime.window_exists() {
        PermissionGuideWindowOpenAction::ActivatedExisting
    } else {
        runtime.create_window()?;
        PermissionGuideWindowOpenAction::Created
    };

    runtime.restore_window()?;
    runtime.show_window()?;
    runtime.focus_window()?;
    runtime.notify_visibility_changed(true)?;

    Ok(action)
}

#[cfg(test)]
mod tests {
    use std::{cell::RefCell, rc::Rc};

    use crate::error::AppError;

    use super::{
        show_or_focus_with_runtime, PermissionGuideWindowOpenAction, PermissionGuideWindowRuntime,
    };

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

    impl PermissionGuideWindowRuntime for MockRuntime {
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

        fn notify_visibility_changed(&self, _visible: bool) -> Result<(), AppError> {
            self.state.borrow_mut().calls.push("notify_visibility_changed");
            Ok(())
        }
    }

    #[test]
    fn creates_permission_guide_window_when_missing() {
        let (runtime, state) = MockRuntime::new(false);

        let action = show_or_focus_with_runtime(&runtime).expect("window should open");

        assert_eq!(action, PermissionGuideWindowOpenAction::Created);
        assert_eq!(
            state.borrow().calls,
            vec![
                "window_exists",
                "create_window",
                "restore_window",
                "show_window",
                "focus_window",
                "notify_visibility_changed",
            ]
        );
    }

    #[test]
    fn focuses_existing_permission_guide_window() {
        let (runtime, state) = MockRuntime::new(true);

        let action = show_or_focus_with_runtime(&runtime).expect("window should focus");

        assert_eq!(action, PermissionGuideWindowOpenAction::ActivatedExisting);
        assert_eq!(
            state.borrow().calls,
            vec![
                "window_exists",
                "restore_window",
                "show_window",
                "focus_window",
                "notify_visibility_changed",
            ]
        );
    }
}
