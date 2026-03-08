pub const PANEL_HEIGHT_PX: f64 = 336.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PanelFrame {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WorkArea {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl WorkArea {
    pub fn contains(&self, x: f64, y: f64) -> bool {
        let right = f64::from(self.x) + f64::from(self.width);
        let bottom = f64::from(self.y) + f64::from(self.height);

        x >= f64::from(self.x) && x < right && y >= f64::from(self.y) && y < bottom
    }
}

pub fn calculate_macos_display_point_from_mouse_location(
    mouse_x: f64,
    mouse_y: f64,
    main_display_height: f64,
) -> (f64, f64) {
    (mouse_x, main_display_height - mouse_y)
}

pub fn select_target_work_area(
    work_areas: &[WorkArea],
    cursor_position: Option<(f64, f64)>,
    fallback: WorkArea,
) -> WorkArea {
    let Some((cursor_x, cursor_y)) = cursor_position else {
        return fallback;
    };

    work_areas
        .iter()
        .find(|work_area| work_area.contains(cursor_x, cursor_y))
        .copied()
        .unwrap_or(fallback)
}

pub fn calculate_panel_frame_for_work_area(
    work_area: WorkArea,
    preferred_panel_height: f64,
) -> PanelFrame {
    calculate_panel_frame(
        work_area.x,
        work_area.y,
        work_area.width,
        work_area.height,
        preferred_panel_height,
    )
}

pub fn calculate_panel_frame(
    work_area_x: i32,
    work_area_y: i32,
    work_area_width: u32,
    work_area_height: u32,
    preferred_panel_height: f64,
) -> PanelFrame {
    let panel_height = preferred_panel_height
        .clamp(0.0, f64::from(work_area_height))
        .round() as u32;
    let y = (f64::from(work_area_y) + f64::from(work_area_height) - f64::from(panel_height))
        .max(f64::from(work_area_y))
        .round() as i32;

    PanelFrame {
        x: work_area_x,
        y,
        width: work_area_width,
        height: panel_height,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        calculate_macos_display_point_from_mouse_location, calculate_panel_frame,
        calculate_panel_frame_for_work_area, select_target_work_area, PanelFrame, WorkArea,
        PANEL_HEIGHT_PX,
    };

    #[test]
    fn should_anchor_panel_to_bottom_of_physical_screen_frame_when_dock_is_bottom() {
        let frame = calculate_panel_frame(0, 0, 1512, 982, PANEL_HEIGHT_PX);

        assert_eq!(
            frame,
            PanelFrame {
                x: 0,
                y: 646,
                width: 1512,
                height: 336,
            }
        );
    }

    #[test]
    fn should_keep_full_width_when_dock_is_on_left() {
        let frame = calculate_panel_frame(0, 0, 1512, 982, PANEL_HEIGHT_PX);

        assert_eq!(
            frame,
            PanelFrame {
                x: 0,
                y: 646,
                width: 1512,
                height: 336,
            }
        );
    }

    #[test]
    fn should_keep_panel_height_336_when_dock_is_on_right() {
        let frame = calculate_panel_frame(1512, 0, 1728, 1117, PANEL_HEIGHT_PX);

        assert_eq!(frame.height, 336);
        assert_eq!(frame.x, 1512);
        assert_eq!(frame.width, 1728);
        assert_eq!(frame.y, 781);
    }

    #[test]
    fn should_clamp_panel_height_to_visible_work_area() {
        let frame = calculate_panel_frame(0, 24, 1440, 180, PANEL_HEIGHT_PX);

        assert_eq!(
            frame,
            PanelFrame {
                x: 0,
                y: 24,
                width: 1440,
                height: 180,
            }
        );
    }

    #[test]
    fn should_select_monitor_under_cursor_when_multiple_displays_are_available() {
        let primary = WorkArea {
            x: 0,
            y: 0,
            width: 1512,
            height: 945,
        };
        let secondary = WorkArea {
            x: 1512,
            y: 0,
            width: 1728,
            height: 1117,
        };

        let selected =
            select_target_work_area(&[primary, secondary], Some((2200.0, 600.0)), primary);
        let frame = calculate_panel_frame_for_work_area(selected, PANEL_HEIGHT_PX);

        assert_eq!(selected, secondary);
        assert_eq!(
            frame,
            PanelFrame {
                x: 1512,
                y: 781,
                width: 1728,
                height: 336,
            }
        );
    }

    #[test]
    fn should_fallback_to_primary_work_area_when_cursor_is_unavailable() {
        let primary = WorkArea {
            x: 0,
            y: 0,
            width: 1512,
            height: 945,
        };
        let secondary = WorkArea {
            x: 1512,
            y: 0,
            width: 1728,
            height: 1117,
        };

        let selected = select_target_work_area(&[primary, secondary], None, primary);

        assert_eq!(selected, primary);
    }

    #[test]
    fn should_fallback_to_primary_when_cursor_is_outside_known_work_areas() {
        let primary = WorkArea {
            x: 0,
            y: 0,
            width: 1512,
            height: 945,
        };
        let secondary = WorkArea {
            x: 1512,
            y: 0,
            width: 1728,
            height: 1117,
        };

        let selected =
            select_target_work_area(&[primary, secondary], Some((-200.0, -200.0)), primary);

        assert_eq!(selected, primary);
    }

    #[test]
    fn should_convert_macos_mouse_location_to_global_display_coordinates() {
        let point = calculate_macos_display_point_from_mouse_location(2_200.0, 320.0, 1_440.0);

        assert_eq!(point, (2_200.0, 1_120.0));
    }

    #[test]
    fn should_anchor_panel_to_bottom_of_shifted_retina_work_area_without_extra_scaling() {
        let work_area = WorkArea {
            x: 3_440,
            y: -644,
            width: 1_440,
            height: 2_535,
        };

        let frame = calculate_panel_frame_for_work_area(work_area, PANEL_HEIGHT_PX);

        assert_eq!(
            frame,
            PanelFrame {
                x: 3_440,
                y: 1_555,
                width: 1_440,
                height: 336,
            }
        );
    }
}
