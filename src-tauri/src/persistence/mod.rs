pub mod migrations;
pub mod sqlite;

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::error::AppError;

pub use sqlite::SqliteConnectionManager;

pub fn initialize(app_handle: &AppHandle) -> Result<SqliteConnectionManager, AppError> {
    let database_path = resolve_database_path(app_handle)?;
    SqliteConnectionManager::initialize_at(&database_path)
}

fn resolve_database_path(app_handle: &AppHandle) -> Result<PathBuf, AppError> {
    app_handle
        .path()
        .app_data_dir()
        .map(|dir| dir.join("clipboard.db"))
        .map_err(|error| AppError::Db(format!("resolve sqlite database path failed: {error}")))
}
