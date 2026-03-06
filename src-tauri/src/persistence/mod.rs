pub mod migrations;
pub mod row_mapper;
pub mod sqlite;

use std::{
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::{AppHandle, Manager};

use crate::error::AppError;

pub use sqlite::SqliteConnectionManager;

pub fn initialize(app_handle: &AppHandle) -> Result<SqliteConnectionManager, AppError> {
    let database_path = resolve_database_path(app_handle)?;
    initialize_at_with_recovery(&database_path)
}

fn initialize_at_with_recovery(database_path: &Path) -> Result<SqliteConnectionManager, AppError> {
    match SqliteConnectionManager::initialize_at(database_path) {
        Ok(manager) => Ok(manager),
        Err(error) if should_recover_database(database_path, &error) => {
            tracing::warn!(
                path = %database_path.display(),
                error = %error,
                "sqlite database initialization failed, attempting recovery"
            );

            let backup_paths = backup_corrupted_database(database_path)?;
            tracing::warn!(
                path = %database_path.display(),
                backups = ?backup_paths,
                "corrupted sqlite database backed up before rebuild"
            );

            SqliteConnectionManager::initialize_at(database_path).map_err(|retry_error| {
                AppError::Db(format!(
                    "recover sqlite database `{}` failed after `{error}`: {retry_error}",
                    database_path.display()
                ))
            })
        }
        Err(error) => Err(error),
    }
}

fn should_recover_database(database_path: &Path, error: &AppError) -> bool {
    database_path.exists()
        && matches!(error, AppError::Db(message) if is_corrupted_database_message(message))
}

fn is_corrupted_database_message(message: &str) -> bool {
    let normalized = message.to_ascii_lowercase();
    [
        "file is not a database",
        "database disk image is malformed",
        "malformed database schema",
        "unsupported file format",
        "sqlite error 26",
        "notadb",
    ]
    .iter()
    .any(|pattern| normalized.contains(pattern))
}

fn backup_corrupted_database(database_path: &Path) -> Result<Vec<PathBuf>, AppError> {
    let backup_database_path = build_corruption_backup_path(database_path)?;
    let mut backup_paths = Vec::new();

    rename_file(database_path, &backup_database_path)?;
    backup_paths.push(backup_database_path.clone());

    for suffix in ["-wal", "-shm"] {
        let sidecar_path = append_path_suffix(database_path, suffix);
        if !sidecar_path.exists() {
            continue;
        }

        let backup_sidecar_path = append_path_suffix(&backup_database_path, suffix);
        rename_file(&sidecar_path, &backup_sidecar_path)?;
        backup_paths.push(backup_sidecar_path);
    }

    Ok(backup_paths)
}

fn rename_file(from: &Path, to: &Path) -> Result<(), AppError> {
    fs::rename(from, to).map_err(|error| {
        AppError::Db(format!(
            "backup corrupted sqlite file `{}` -> `{}` failed: {error}",
            from.display(),
            to.display()
        ))
    })
}

fn build_corruption_backup_path(database_path: &Path) -> Result<PathBuf, AppError> {
    let parent = database_path.parent().unwrap_or_else(|| Path::new("."));
    let file_stem = database_path
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "clipboard".to_string());
    let extension = database_path
        .extension()
        .map(|value| value.to_string_lossy().to_string());
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| {
            AppError::Db(format!(
                "read system clock for sqlite backup failed: {error}"
            ))
        })?
        .as_millis();

    for attempt in 0..10 {
        let suffix = if attempt == 0 {
            format!("corrupt-{timestamp}")
        } else {
            format!("corrupt-{timestamp}-{attempt}")
        };
        let file_name = match &extension {
            Some(extension) if !extension.is_empty() => {
                format!("{file_stem}.{suffix}.{extension}")
            }
            _ => format!("{file_stem}.{suffix}"),
        };
        let candidate = parent.join(file_name);
        if !candidate.exists() {
            return Ok(candidate);
        }
    }

    Err(AppError::Db(format!(
        "allocate corrupted sqlite backup path for `{}` failed",
        database_path.display()
    )))
}

fn append_path_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut value = OsString::from(path.as_os_str());
    value.push(suffix);
    PathBuf::from(value)
}

fn resolve_database_path(app_handle: &AppHandle) -> Result<PathBuf, AppError> {
    app_handle
        .path()
        .app_data_dir()
        .map(|dir| dir.join("clipboard.db"))
        .map_err(|error| AppError::Db(format!("resolve sqlite database path failed: {error}")))
}

#[cfg(test)]
mod tests {
    use std::{
        env, fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use rusqlite::Connection;

    use super::{append_path_suffix, initialize_at_with_recovery};

    #[test]
    fn initialize_with_recovery_rebuilds_corrupted_database_and_keeps_backup() {
        let test_root = unique_test_dir();
        let database_path = test_root.join("clipboard.db");
        let wal_path = append_path_suffix(&database_path, "-wal");
        let shm_path = append_path_suffix(&database_path, "-shm");
        fs::create_dir_all(&test_root).expect("test root should be created");
        fs::write(&database_path, b"not a sqlite database").expect("corrupted db should exist");
        fs::write(&wal_path, b"wal sidecar").expect("wal sidecar should exist");
        fs::write(&shm_path, b"shm sidecar").expect("shm sidecar should exist");

        let manager = initialize_at_with_recovery(&database_path)
            .expect("corrupted sqlite database should recover");

        assert_eq!(manager.database_path(), database_path.as_path());
        assert!(database_path.exists());
        assert!(!wal_path.exists());
        assert!(!shm_path.exists());

        let connection = Connection::open(&database_path).expect("rebuilt sqlite db should open");
        let clipboard_items_exists = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'clipboard_items')",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("sqlite master query should succeed");
        assert_eq!(clipboard_items_exists, 1);

        let backup_db_paths = fs::read_dir(&test_root)
            .expect("test root should list")
            .filter_map(|entry| entry.ok().map(|item| item.path()))
            .filter(|path| {
                path.file_name()
                    .and_then(|value| value.to_str())
                    .is_some_and(|value| {
                        value.starts_with("clipboard.corrupt-") && value.ends_with(".db")
                    })
            })
            .collect::<Vec<_>>();
        assert_eq!(backup_db_paths.len(), 1);
        assert_eq!(
            fs::read(&backup_db_paths[0]).expect("backup db should be readable"),
            b"not a sqlite database"
        );

        cleanup_test_dir(&test_root);
    }

    fn unique_test_dir() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        env::temp_dir().join(format!("clipboard-manager-persistence-test-{suffix}"))
    }

    fn cleanup_test_dir(test_root: &PathBuf) {
        let _ = fs::remove_dir_all(test_root);
    }
}
