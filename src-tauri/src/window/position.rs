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
        calculate_panel_frame, calculate_panel_frame_for_work_area, select_target_work_area,
        PanelFrame, WorkArea,
    };

    #[test]
    fn should_anchor_panel_to_bottom_of_work_area() {
        let frame = calculate_panel_frame(0, 0, 1512, 945, 220.0);

        assert_eq!(
            frame,
            PanelFrame {
                x: 0,
                y: 725,
                width: 1512,
                height: 220,
            }
        );
    }

    #[test]
    fn should_follow_shifted_work_area_when_dock_is_on_side() {
        let frame = calculate_panel_frame(96, 0, 1416, 982, 220.0);

        assert_eq!(
            frame,
            PanelFrame {
                x: 96,
                y: 762,
                width: 1416,
                height: 220,
            }
        );
    }

    #[test]
    fn should_clamp_panel_height_to_visible_work_area() {
        let frame = calculate_panel_frame(0, 24, 1440, 180, 220.0);

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
        let frame = calculate_panel_frame_for_work_area(selected, 220.0);

        assert_eq!(selected, secondary);
        assert_eq!(
            frame,
            PanelFrame {
                x: 1512,
                y: 897,
                width: 1728,
                height: 220,
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
}
