#![allow(dead_code)]

use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

use rusqlite::Connection;

use crate::error::AppError;

use super::migrations::{CURRENT_SCHEMA_VERSION, MIGRATIONS};

#[derive(Debug, Clone)]
pub struct SqliteConnectionManager {
    database_path: PathBuf,
}

impl SqliteConnectionManager {
    pub fn initialize_at(database_path: &Path) -> Result<Self, AppError> {
        if let Some(parent) = database_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                AppError::Db(format!(
                    "create database directory `{}` failed: {error}",
                    parent.display()
                ))
            })?;
        }

        let connection = open_connection(database_path)?;
        run_migrations(&connection)?;
        drop(connection);

        tracing::info!(path = %database_path.display(), schema_version = CURRENT_SCHEMA_VERSION, "sqlite database initialized");

        Ok(Self {
            database_path: database_path.to_path_buf(),
        })
    }

    pub fn database_path(&self) -> &Path {
        &self.database_path
    }

    pub fn connect(&self) -> Result<Connection, AppError> {
        open_connection(&self.database_path)
    }

    pub fn with_connection<T, F>(&self, operation: F) -> Result<T, AppError>
    where
        F: FnOnce(&Connection) -> Result<T, AppError>,
    {
        let connection = self.connect()?;
        operation(&connection)
    }
}

fn open_connection(database_path: &Path) -> Result<Connection, AppError> {
    let connection = Connection::open(database_path).map_err(|error| {
        AppError::Db(format!(
            "open sqlite database `{}` failed: {error}",
            database_path.display()
        ))
    })?;

    connection
        .busy_timeout(Duration::from_secs(2))
        .map_err(|error| AppError::Db(format!("configure sqlite busy_timeout failed: {error}")))?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| AppError::Db(format!("enable sqlite foreign_keys failed: {error}")))?;

    Ok(connection)
}

fn run_migrations(connection: &Connection) -> Result<(), AppError> {
    let current_version = connection
        .pragma_query_value(None, "user_version", |row| row.get::<_, u32>(0))
        .map_err(|error| AppError::Db(format!("read sqlite user_version failed: {error}")))?;

    for (version, sql) in MIGRATIONS {
        if *version <= current_version {
            continue;
        }

        let transaction = connection.unchecked_transaction().map_err(|error| {
            AppError::Db(format!(
                "start sqlite migration transaction failed: {error}"
            ))
        })?;
        transaction.execute_batch(sql).map_err(|error| {
            AppError::Db(format!("apply sqlite migration v{version} failed: {error}"))
        })?;
        transaction
            .pragma_update(None, "user_version", version)
            .map_err(|error| AppError::Db(format!("update sqlite user_version failed: {error}")))?;
        transaction
            .commit()
            .map_err(|error| AppError::Db(format!("commit sqlite migration failed: {error}")))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::{
        env, fs,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    use rusqlite::Connection;

    use super::SqliteConnectionManager;
    use crate::persistence::migrations::CURRENT_SCHEMA_VERSION;

    #[test]
    fn initialize_database_creates_tables_indexes_and_schema_version() {
        let database_path = unique_test_dir().join("clipboard.db");

        let manager = SqliteConnectionManager::initialize_at(&database_path)
            .expect("sqlite database should initialize");

        assert_eq!(manager.database_path(), database_path.as_path());
        assert!(database_path.exists());

        let connection = Connection::open(&database_path).expect("sqlite db should open");

        assert!(has_sqlite_object(&connection, "table", "clipboard_items"));
        assert!(has_sqlite_object(&connection, "table", "image_assets"));
        assert!(has_sqlite_object(&connection, "table", "file_items"));
        assert!(has_sqlite_object(
            &connection,
            "index",
            "idx_clipboard_items_last_used_at"
        ));
        assert!(has_sqlite_object(
            &connection,
            "index",
            "idx_clipboard_items_content_type_last_used_at"
        ));
        assert!(has_sqlite_object(
            &connection,
            "index",
            "idx_image_assets_thumbnail_state"
        ));
        assert!(has_sqlite_object(
            &connection,
            "index",
            "idx_file_items_item_id_sort_order"
        ));
        assert_eq!(sqlite_user_version(&connection), CURRENT_SCHEMA_VERSION);

        cleanup_test_dir(&database_path);
    }

    #[test]
    fn initialize_database_is_idempotent() {
        let database_path = unique_test_dir().join("clipboard.db");

        SqliteConnectionManager::initialize_at(&database_path)
            .expect("sqlite database should initialize");
        SqliteConnectionManager::initialize_at(&database_path)
            .expect("sqlite database should reinitialize");

        let connection = Connection::open(&database_path).expect("sqlite db should open");
        assert_eq!(sqlite_user_version(&connection), CURRENT_SCHEMA_VERSION);

        cleanup_test_dir(&database_path);
    }

    fn has_sqlite_object(connection: &Connection, object_type: &str, name: &str) -> bool {
        connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = ?1 AND name = ?2)",
                (object_type, name),
                |row| row.get::<_, i64>(0),
            )
            .expect("sqlite master query should succeed")
            == 1
    }

    fn sqlite_user_version(connection: &Connection) -> u32 {
        connection
            .pragma_query_value(None, "user_version", |row| row.get::<_, u32>(0))
            .expect("user_version query should succeed")
    }

    fn unique_test_dir() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        env::temp_dir().join(format!("clipboard-manager-sqlite-test-{suffix}"))
    }

    fn cleanup_test_dir(database_path: &Path) {
        if let Some(parent) = database_path.parent() {
            let _ = fs::remove_dir_all(parent);
        }
    }
}
