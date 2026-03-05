pub fn calculate_bottom_position(screen_height: f64, panel_height: f64) -> f64 {
    (screen_height - panel_height).max(0.0)
}
