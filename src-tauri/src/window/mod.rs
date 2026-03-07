use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize};

#[cfg(target_os = "macos")]
use core_graphics::{display::CGDisplayBounds, geometry::CGPoint};

use crate::error::AppError;

use self::position::{
    calculate_macos_display_point_from_mouse_location, calculate_macos_work_area,
    calculate_panel_frame_for_work_area, select_target_work_area, WorkArea,
};

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
    #[cfg(target_os = "macos")]
    const NS_STATUS_WINDOW_LEVEL: isize = 25;
    #[cfg(target_os = "macos")]
    const NS_WINDOW_COLLECTION_BEHAVIOR_CAN_JOIN_ALL_SPACES: usize = 1 << 0;
    #[cfg(target_os = "macos")]
    const NS_WINDOW_COLLECTION_BEHAVIOR_FULL_SCREEN_AUXILIARY: usize = 1 << 8;

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

    fn resolve_target_work_area(&self) -> Result<WorkArea, AppError> {
        let primary_monitor = self
            .app_handle
            .primary_monitor()
            .map_err(|error| AppError::Window(format!("read primary monitor failed: {error}")))?
            .ok_or_else(|| AppError::Window("primary monitor not available".to_string()))?;
        let fallback = to_work_area(&primary_monitor);

        #[cfg(target_os = "macos")]
        if let Some(work_area) = self.resolve_target_work_area_macos()? {
            return Ok(work_area);
        }

        let available_monitors = self.app_handle.available_monitors().map_err(|error| {
            AppError::Window(format!("read available monitors failed: {error}"))
        })?;
        let work_areas = available_monitors
            .iter()
            .map(to_work_area)
            .collect::<Vec<_>>();

        let cursor_position = match self.app_handle.cursor_position() {
            Ok(position) => Some((position.x, position.y)),
            Err(error) => {
                tracing::warn!(error = %error, "read cursor position failed, fallback to primary monitor");
                None
            }
        };

        Ok(select_target_work_area(
            &work_areas,
            cursor_position,
            fallback,
        ))
    }

    #[cfg(target_os = "macos")]
    fn resolve_target_work_area_macos(&self) -> Result<Option<WorkArea>, AppError> {
        let display_id = match active_display_id_under_cursor() {
            Ok(Some(display_id)) => display_id,
            Ok(None) => return Ok(None),
            Err(error) => {
                tracing::warn!(error = %error, "resolve active macOS display failed, fallback to tauri cursor position");
                return Ok(None);
            }
        };

        let work_area = macos_work_area_for_display(display_id)?;
        tracing::debug!(
            display_id,
            x = work_area.x,
            y = work_area.y,
            width = work_area.width,
            height = work_area.height,
            "resolved active work area from macOS display services"
        );
        Ok(Some(work_area))
    }

    fn resize_and_position(&self, window: &tauri::WebviewWindow) -> Result<(), AppError> {
        let work_area = self.resolve_target_work_area()?;
        let panel_frame = calculate_panel_frame_for_work_area(work_area, self.panel_height);

        window
            .set_size(PhysicalSize::new(panel_frame.width, panel_frame.height))
            .map_err(|error| AppError::Window(format!("set size failed: {error}")))?;
        window
            .set_position(PhysicalPosition::new(panel_frame.x, panel_frame.y))
            .map_err(|error| AppError::Window(format!("set position failed: {error}")))?;

        Ok(())
    }

    fn configure_panel_window(&self, window: &tauri::WebviewWindow) -> Result<(), AppError> {
        window
            .set_always_on_top(true)
            .map_err(|error| AppError::Window(format!("set always on top failed: {error}")))?;

        #[cfg(target_os = "macos")]
        self.configure_macos_panel_window(window)?;

        Ok(())
    }

    #[cfg(target_os = "macos")]
    fn configure_macos_panel_window(&self, window: &tauri::WebviewWindow) -> Result<(), AppError> {
        window
            .set_visible_on_all_workspaces(true)
            .map_err(|error| {
                AppError::Window(format!("set visible on all workspaces failed: {error}"))
            })?;

        let native_window = window
            .ns_window()
            .map_err(|error| AppError::Window(format!("get native window failed: {error}")))?
            as *mut Object;

        if native_window.is_null() {
            return Err(AppError::Window("native window is null".to_string()));
        }

        unsafe {
            let _: () = msg_send![native_window, setLevel: Self::NS_STATUS_WINDOW_LEVEL];

            let mut collection_behavior: usize = msg_send![native_window, collectionBehavior];
            collection_behavior |= Self::NS_WINDOW_COLLECTION_BEHAVIOR_CAN_JOIN_ALL_SPACES;
            collection_behavior |= Self::NS_WINDOW_COLLECTION_BEHAVIOR_FULL_SCREEN_AUXILIARY;
            let _: () = msg_send![native_window, setCollectionBehavior: collection_behavior];
        }

        Ok(())
    }

    #[cfg(target_os = "macos")]
    fn bring_panel_to_front(&self, window: &tauri::WebviewWindow) -> Result<(), AppError> {
        let native_window = window
            .ns_window()
            .map_err(|error| AppError::Window(format!("get native window failed: {error}")))?
            as *mut Object;

        if native_window.is_null() {
            return Err(AppError::Window("native window is null".to_string()));
        }

        unsafe {
            let _: () = msg_send![native_window, orderFrontRegardless];
        }

        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    fn bring_panel_to_front(&self, _window: &tauri::WebviewWindow) -> Result<(), AppError> {
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

#[cfg(target_os = "macos")]
type CGDirectDisplayID = u32;

#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Clone, Copy)]
struct NSPoint {
    x: f64,
    y: f64,
}

#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Clone, Copy)]
struct NSSize {
    width: f64,
    height: f64,
}

#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Clone, Copy)]
struct NSRect {
    origin: NSPoint,
    size: NSSize,
}

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGGetDisplaysWithPoint(
        point: CGPoint,
        max_displays: u32,
        displays: *mut CGDirectDisplayID,
        matching_display_count: *mut u32,
    ) -> i32;
}

#[cfg(target_os = "macos")]
fn active_display_id_under_cursor() -> Result<Option<CGDirectDisplayID>, AppError> {
    let point: NSPoint = unsafe { msg_send![class!(NSEvent), mouseLocation] };
    let main_bounds = unsafe { CGDisplayBounds(core_graphics::display::CGMainDisplayID()) };
    let (display_x, display_y) = calculate_macos_display_point_from_mouse_location(
        point.x,
        point.y,
        main_bounds.size.height,
    );

    let mut display_id = 0_u32;
    let mut matching_display_count = 0_u32;
    let result = unsafe {
        CGGetDisplaysWithPoint(
            CGPoint::new(display_x, display_y),
            1,
            &mut display_id,
            &mut matching_display_count,
        )
    };

    if result != 0 {
        return Err(AppError::Window(format!(
            "CGGetDisplaysWithPoint failed with code {result}"
        )));
    }

    if matching_display_count == 0 {
        return Ok(None);
    }

    Ok(Some(display_id))
}

#[cfg(target_os = "macos")]
fn macos_work_area_for_display(display_id: CGDirectDisplayID) -> Result<WorkArea, AppError> {
    let screen = find_ns_screen_for_display(display_id)?;
    let scale_factor: f64 = unsafe { msg_send![screen, backingScaleFactor] };
    let frame: NSRect = unsafe { msg_send![screen, frame] };
    let visible_frame: NSRect = unsafe { msg_send![screen, visibleFrame] };
    let display_bounds = unsafe { CGDisplayBounds(display_id) };

    Ok(calculate_macos_work_area(
        display_bounds.origin.x,
        display_bounds.origin.y,
        frame.origin.x,
        visible_frame.origin.x,
        visible_frame.size.width,
        visible_frame.size.height,
        scale_factor,
    ))
}

#[cfg(target_os = "macos")]
fn find_ns_screen_for_display(display_id: CGDirectDisplayID) -> Result<*mut Object, AppError> {
    let screens: *mut Object = unsafe { msg_send![class!(NSScreen), screens] };
    if screens.is_null() {
        return Err(AppError::Window(
            "NSScreen.screens returned null".to_string(),
        ));
    }

    let key = ns_string("NSScreenNumber")?;
    let count: usize = unsafe { msg_send![screens, count] };

    for index in 0..count {
        let screen: *mut Object = unsafe { msg_send![screens, objectAtIndex: index] };
        if screen.is_null() {
            continue;
        }

        let device_description: *mut Object = unsafe { msg_send![screen, deviceDescription] };
        if device_description.is_null() {
            continue;
        }

        let value: *mut Object = unsafe { msg_send![device_description, objectForKey: key] };
        if value.is_null() {
            continue;
        }

        let screen_number: usize = unsafe { msg_send![value, unsignedIntegerValue] };
        if screen_number as u32 == display_id {
            return Ok(screen);
        }
    }

    Err(AppError::Window(format!(
        "failed to find NSScreen for display `{display_id}`"
    )))
}

#[cfg(target_os = "macos")]
fn ns_string(value: &str) -> Result<*mut Object, AppError> {
    let c_string = std::ffi::CString::new(value)
        .map_err(|error| AppError::Window(format!("build NSString source failed: {error}")))?;
    let string: *mut Object =
        unsafe { msg_send![class!(NSString), stringWithUTF8String: c_string.as_ptr()] };

    if string.is_null() {
        return Err(AppError::Window(format!(
            "create NSString `{value}` failed"
        )));
    }

    Ok(string)
}

fn to_work_area(monitor: &tauri::Monitor) -> WorkArea {
    let work_area = monitor.work_area();
    WorkArea {
        x: work_area.position.x,
        y: work_area.position.y,
        width: work_area.size.width,
        height: work_area.size.height,
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
        self.configure_panel_window(&window)?;
        window
            .show()
            .map_err(|error| AppError::Window(format!("show failed: {error}")))?;
        self.bring_panel_to_front(&window)?;
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
