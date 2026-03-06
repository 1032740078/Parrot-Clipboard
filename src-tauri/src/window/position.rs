#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PanelFrame {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
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
    use super::{calculate_panel_frame, PanelFrame};

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
}
