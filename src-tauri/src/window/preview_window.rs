use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder, WindowEvent};

use crate::{
    error::AppError,
    ipc::events::{emit_preview_window_requested, emit_preview_window_visibility_changed},
};

use super::position::{center_in_work_area, select_target_work_area, WorkArea};

fn to_work_area(monitor: &tauri::Monitor) -> WorkArea {
    let position = monitor.position();
    let size = monitor.size();

    WorkArea {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    }
}

fn resolve_target_work_area(app_handle: &AppHandle) -> Option<WorkArea> {
    let primary_monitor = app_handle.primary_monitor().ok().flatten()?;
    let fallback = to_work_area(&primary_monitor);

    let available_monitors = app_handle.available_monitors().ok()?;
    let work_areas: Vec<WorkArea> = available_monitors.iter().map(to_work_area).collect();

    let cursor_position = match app_handle.cursor_position() {
        Ok(position) => Some((position.x, position.y)),
        Err(error) => {
            tracing::warn!(error = %error, "preview: read cursor position failed");
            None
        }
    };

    Some(select_target_work_area(&work_areas, cursor_position, fallback))
}

pub const PREVIEW_WINDOW_LABEL: &str = "preview";
const PREVIEW_WINDOW_TITLE: &str = "卡片预览";
const PREVIEW_WINDOW_WIDTH: f64 = 960.0;
const PREVIEW_WINDOW_HEIGHT: f64 = 760.0;
const PREVIEW_WINDOW_MIN_WIDTH: f64 = 720.0;
const PREVIEW_WINDOW_MIN_HEIGHT: f64 = 560.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PreviewWindowOpenAction {
    Created,
    ActivatedExisting,
}

trait PreviewWindowRuntime {
    fn window_exists(&self) -> bool;
    fn create_window(&self, record_id: u64) -> Result<(), AppError>;
    fn restore_window(&self) -> Result<(), AppError>;
    fn show_window(&self) -> Result<(), AppError>;
    fn focus_window(&self) -> Result<(), AppError>;
    fn notify_record_changed(&self, record_id: u64) -> Result<(), AppError>;
    fn notify_visibility_changed(
        &self,
        visible: bool,
        record_id: Option<u64>,
    ) -> Result<(), AppError>;
}

struct TauriPreviewWindowRuntime {
    app_handle: AppHandle,
}

impl TauriPreviewWindowRuntime {
    fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    fn window(&self) -> Result<tauri::WebviewWindow, AppError> {
        self.app_handle
            .get_webview_window(PREVIEW_WINDOW_LABEL)
            .ok_or_else(|| AppError::Window("preview window not found".to_string()))
    }
}

impl PreviewWindowRuntime for TauriPreviewWindowRuntime {
    fn window_exists(&self) -> bool {
        self.app_handle
            .get_webview_window(PREVIEW_WINDOW_LABEL)
            .is_some()
    }

    fn create_window(&self, record_id: u64) -> Result<(), AppError> {
        let app_handle = self.app_handle.clone();
        let window = WebviewWindowBuilder::new(
            &self.app_handle,
            PREVIEW_WINDOW_LABEL,
            WebviewUrl::App(format!("index.html?window=preview&recordId={record_id}").into()),
        )
        .title(PREVIEW_WINDOW_TITLE)
        .inner_size(PREVIEW_WINDOW_WIDTH, PREVIEW_WINDOW_HEIGHT)
        .min_inner_size(PREVIEW_WINDOW_MIN_WIDTH, PREVIEW_WINDOW_MIN_HEIGHT)
        .decorations(false)
        .transparent(true)
        .resizable(true)
        .skip_taskbar(false)
        .visible(false)
        .build()
        .map_err(|error| AppError::Window(format!("build preview window failed: {error}")))?;

        if let Some(work_area) = resolve_target_work_area(&self.app_handle) {
            let (x, y) = center_in_work_area(work_area, PREVIEW_WINDOW_WIDTH, PREVIEW_WINDOW_HEIGHT);
            let _ = window.set_position(PhysicalPosition::new(x, y));
            tracing::debug!(x, y, "preview window positioned on target display");
        } else {
            let _ = window.center();
            tracing::debug!("preview window fallback to center");
        }

        window.on_window_event(move |event| {
            if matches!(event, WindowEvent::Destroyed) {
                let _ = emit_preview_window_visibility_changed(&app_handle, false, None);
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
        self.window()?
            .show()
            .map_err(|error| AppError::Window(format!("show preview window failed: {error}")))
    }

    fn focus_window(&self) -> Result<(), AppError> {
        self.window()?
            .set_focus()
            .map_err(|error| AppError::Window(format!("focus preview window failed: {error}")))
    }

    fn notify_record_changed(&self, record_id: u64) -> Result<(), AppError> {
        emit_preview_window_requested(&self.app_handle, record_id)
    }

    fn notify_visibility_changed(
        &self,
        visible: bool,
        record_id: Option<u64>,
    ) -> Result<(), AppError> {
        emit_preview_window_visibility_changed(&self.app_handle, visible, record_id)
    }
}

pub fn show_or_focus_preview_window(
    app_handle: &AppHandle,
    record_id: u64,
) -> Result<PreviewWindowOpenAction, AppError> {
    let runtime = TauriPreviewWindowRuntime::new(app_handle.clone());
    show_or_focus_with_runtime(&runtime, record_id)
}

pub fn close_preview_window(app_handle: &AppHandle) -> Result<(), AppError> {
    if let Some(window) = app_handle.get_webview_window(PREVIEW_WINDOW_LABEL) {
        window
            .close()
            .map_err(|error| AppError::Window(format!("close preview window failed: {error}")))?;
    }

    Ok(())
}

fn show_or_focus_with_runtime(
    runtime: &dyn PreviewWindowRuntime,
    record_id: u64,
) -> Result<PreviewWindowOpenAction, AppError> {
    let action = if runtime.window_exists() {
        runtime.notify_record_changed(record_id)?;
        PreviewWindowOpenAction::ActivatedExisting
    } else {
        runtime.create_window(record_id)?;
        PreviewWindowOpenAction::Created
    };

    runtime.restore_window()?;
    runtime.show_window()?;
    runtime.focus_window()?;
    runtime.notify_visibility_changed(true, Some(record_id))?;

    Ok(action)
}

#[cfg(test)]
mod tests {
    use std::{cell::RefCell, rc::Rc};

    use crate::error::AppError;

    use super::{show_or_focus_with_runtime, PreviewWindowOpenAction, PreviewWindowRuntime};

    #[derive(Default, Clone)]
    struct RuntimeState {
        calls: Vec<String>,
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

    impl PreviewWindowRuntime for MockRuntime {
        fn window_exists(&self) -> bool {
            self.state
                .borrow_mut()
                .calls
                .push("window_exists".to_string());
            self.state.borrow().existing
        }

        fn create_window(&self, record_id: u64) -> Result<(), AppError> {
            self.state
                .borrow_mut()
                .calls
                .push(format!("create_window:{record_id}"));
            if self.state.borrow().fail_on_create {
                return Err(AppError::Window("create failed".to_string()));
            }

            Ok(())
        }

        fn restore_window(&self) -> Result<(), AppError> {
            self.state
                .borrow_mut()
                .calls
                .push("restore_window".to_string());
            Ok(())
        }

        fn show_window(&self) -> Result<(), AppError> {
            self.state
                .borrow_mut()
                .calls
                .push("show_window".to_string());
            Ok(())
        }

        fn focus_window(&self) -> Result<(), AppError> {
            self.state
                .borrow_mut()
                .calls
                .push("focus_window".to_string());
            Ok(())
        }

        fn notify_record_changed(&self, record_id: u64) -> Result<(), AppError> {
            self.state
                .borrow_mut()
                .calls
                .push(format!("notify_record_changed:{record_id}"));
            Ok(())
        }

        fn notify_visibility_changed(
            &self,
            visible: bool,
            record_id: Option<u64>,
        ) -> Result<(), AppError> {
            self.state.borrow_mut().calls.push(format!(
                "notify_visibility_changed:{visible}:{}",
                record_id.map(|value| value.to_string()).unwrap_or_default()
            ));
            Ok(())
        }
    }

    #[test]
    fn creates_preview_window_when_missing() {
        let (runtime, state) = MockRuntime::new(false);

        let action = show_or_focus_with_runtime(&runtime, 42).expect("window should open");

        assert_eq!(action, PreviewWindowOpenAction::Created);
        assert_eq!(
            state.borrow().calls,
            vec![
                "window_exists",
                "create_window:42",
                "restore_window",
                "show_window",
                "focus_window",
                "notify_visibility_changed:true:42",
            ]
        );
    }

    #[test]
    fn focuses_existing_preview_window_and_updates_record() {
        let (runtime, state) = MockRuntime::new(true);

        let action = show_or_focus_with_runtime(&runtime, 7).expect("window should focus");

        assert_eq!(action, PreviewWindowOpenAction::ActivatedExisting);
        assert_eq!(
            state.borrow().calls,
            vec![
                "window_exists",
                "notify_record_changed:7",
                "restore_window",
                "show_window",
                "focus_window",
                "notify_visibility_changed:true:7",
            ]
        );
    }
}
