use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder, WindowEvent};

#[cfg(target_os = "macos")]
use objc::{msg_send, runtime::Object, sel, sel_impl};

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

    Some(select_target_work_area(
        &work_areas,
        cursor_position,
        fallback,
    ))
}

pub const PREVIEW_WINDOW_LABEL: &str = "preview";
const PREVIEW_WINDOW_TITLE: &str = "卡片预览";
const PREVIEW_WINDOW_WIDTH: f64 = 960.0;
const PREVIEW_WINDOW_HEIGHT: f64 = 760.0;
const PREVIEW_WINDOW_MIN_WIDTH: f64 = 720.0;
const PREVIEW_WINDOW_MIN_HEIGHT: f64 = 560.0;

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGWindowLevelForKey(key: i32) -> i32;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PreviewWindowOpenAction {
    Created,
    ActivatedExisting,
}

trait PreviewWindowRuntime {
    fn window_exists(&self) -> bool;
    fn create_window(&self, record_id: u64) -> Result<(), AppError>;
    fn restore_window(&self) -> Result<(), AppError>;
    fn prepare_window_for_display(&self) -> Result<(), AppError>;
    fn show_window(&self) -> Result<(), AppError>;
    fn bring_window_to_front(&self) -> Result<(), AppError>;
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
    #[cfg(target_os = "macos")]
    const CG_POPUP_MENU_WINDOW_LEVEL_KEY: i32 = 11;
    #[cfg(target_os = "macos")]
    const NS_WINDOW_COLLECTION_BEHAVIOR_CAN_JOIN_ALL_SPACES: usize = 1 << 0;
    #[cfg(target_os = "macos")]
    const NS_WINDOW_COLLECTION_BEHAVIOR_FULL_SCREEN_AUXILIARY: usize = 1 << 8;

    fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    fn window(&self) -> Result<tauri::WebviewWindow, AppError> {
        self.app_handle
            .get_webview_window(PREVIEW_WINDOW_LABEL)
            .ok_or_else(|| AppError::Window("preview window not found".to_string()))
    }

    #[cfg(target_os = "macos")]
    fn native_macos_window(&self, window: &tauri::WebviewWindow) -> Result<*mut Object, AppError> {
        let native_window = window.ns_window().map_err(|error| {
            AppError::Window(format!("get preview native window failed: {error}"))
        })? as *mut Object;

        if native_window.is_null() {
            return Err(AppError::Window(
                "preview native window is null".to_string(),
            ));
        }

        Ok(native_window)
    }

    #[cfg(target_os = "macos")]
    fn macos_preview_window_level(&self) -> isize {
        unsafe { CGWindowLevelForKey(Self::CG_POPUP_MENU_WINDOW_LEVEL_KEY) as isize }
    }

    #[cfg(target_os = "macos")]
    fn apply_macos_preview_level(&self, native_window: *mut Object) {
        let level = self.macos_preview_window_level();

        unsafe {
            let _: () = msg_send![native_window, setLevel: level];
        }
    }

    #[cfg(target_os = "macos")]
    fn apply_macos_collection_behavior(&self, native_window: *mut Object) {
        unsafe {
            let mut collection_behavior: usize = msg_send![native_window, collectionBehavior];
            collection_behavior |= Self::NS_WINDOW_COLLECTION_BEHAVIOR_CAN_JOIN_ALL_SPACES;
            collection_behavior |= Self::NS_WINDOW_COLLECTION_BEHAVIOR_FULL_SCREEN_AUXILIARY;
            let _: () = msg_send![native_window, setCollectionBehavior: collection_behavior];
        }
    }

    #[cfg(target_os = "macos")]
    fn configure_window_for_display(&self, window: &tauri::WebviewWindow) -> Result<(), AppError> {
        window
            .set_visible_on_all_workspaces(true)
            .map_err(|error| {
                AppError::Window(format!(
                    "set preview visible on all workspaces failed: {error}"
                ))
            })?;

        let native_window = self.native_macos_window(window)?;
        self.apply_macos_preview_level(native_window);
        self.apply_macos_collection_behavior(native_window);

        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    fn configure_window_for_display(&self, _window: &tauri::WebviewWindow) -> Result<(), AppError> {
        Ok(())
    }

    #[cfg(target_os = "macos")]
    fn order_window_front_regardless(&self, window: &tauri::WebviewWindow) -> Result<(), AppError> {
        let native_window = self.native_macos_window(window)?;
        self.apply_macos_preview_level(native_window);
        self.apply_macos_collection_behavior(native_window);

        unsafe {
            let _: () = msg_send![native_window, orderFrontRegardless];
        }

        self.apply_macos_preview_level(native_window);

        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    fn order_window_front_regardless(
        &self,
        _window: &tauri::WebviewWindow,
    ) -> Result<(), AppError> {
        Ok(())
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
            let (x, y) =
                center_in_work_area(work_area, PREVIEW_WINDOW_WIDTH, PREVIEW_WINDOW_HEIGHT);
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

    fn prepare_window_for_display(&self) -> Result<(), AppError> {
        let window = self.window()?;
        self.configure_window_for_display(&window)
    }

    fn show_window(&self) -> Result<(), AppError> {
        self.window()?
            .show()
            .map_err(|error| AppError::Window(format!("show preview window failed: {error}")))
    }

    fn bring_window_to_front(&self) -> Result<(), AppError> {
        let window = self.window()?;
        self.order_window_front_regardless(&window)
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

pub fn sync_preview_window_record(
    app_handle: &AppHandle,
    record_id: u64,
) -> Result<bool, AppError> {
    let runtime = TauriPreviewWindowRuntime::new(app_handle.clone());
    sync_record_with_runtime(&runtime, record_id)
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
    runtime.prepare_window_for_display()?;
    runtime.show_window()?;
    runtime.bring_window_to_front()?;
    runtime.focus_window()?;
    runtime.bring_window_to_front()?;
    runtime.notify_visibility_changed(true, Some(record_id))?;

    Ok(action)
}

fn sync_record_with_runtime(
    runtime: &dyn PreviewWindowRuntime,
    record_id: u64,
) -> Result<bool, AppError> {
    if !runtime.window_exists() {
        return Ok(false);
    }

    runtime.notify_record_changed(record_id)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use std::{cell::RefCell, rc::Rc};

    use crate::error::AppError;

    use super::{
        show_or_focus_with_runtime, sync_record_with_runtime, PreviewWindowOpenAction,
        PreviewWindowRuntime,
    };

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

        fn prepare_window_for_display(&self) -> Result<(), AppError> {
            self.state
                .borrow_mut()
                .calls
                .push("prepare_window_for_display".to_string());
            Ok(())
        }

        fn show_window(&self) -> Result<(), AppError> {
            self.state
                .borrow_mut()
                .calls
                .push("show_window".to_string());
            Ok(())
        }

        fn bring_window_to_front(&self) -> Result<(), AppError> {
            self.state
                .borrow_mut()
                .calls
                .push("bring_window_to_front".to_string());
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
                "prepare_window_for_display",
                "show_window",
                "bring_window_to_front",
                "focus_window",
                "bring_window_to_front",
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
                "prepare_window_for_display",
                "show_window",
                "bring_window_to_front",
                "focus_window",
                "bring_window_to_front",
                "notify_visibility_changed:true:7",
            ]
        );
    }

    #[test]
    fn sync_preview_record_is_noop_when_window_missing() {
        let (runtime, state) = MockRuntime::new(false);

        let synced = sync_record_with_runtime(&runtime, 13).expect("sync should not fail");

        assert!(!synced);
        assert_eq!(state.borrow().calls, vec!["window_exists"]);
    }

    #[test]
    fn sync_preview_record_updates_existing_window_without_refocus() {
        let (runtime, state) = MockRuntime::new(true);

        let synced = sync_record_with_runtime(&runtime, 13).expect("sync should succeed");

        assert!(synced);
        assert_eq!(
            state.borrow().calls,
            vec!["window_exists", "notify_record_changed:13",]
        );
    }
}
