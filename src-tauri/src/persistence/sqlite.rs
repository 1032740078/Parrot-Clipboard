#![allow(dead_code)]

use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

use rusqlite::{params, Connection};

use crate::{
    clipboard::{
        query::{ClipboardRecordDetail, ClipboardRecordSummary, FileItemDetail, FilesDetail},
        types::{ContentType, RecordId},
    },
    error::AppError,
};

use super::{
    migrations::{CURRENT_SCHEMA_VERSION, MIGRATIONS},
    row_mapper::{content_type_from_row, map_detail_row, map_file_item_row, map_summary_row},
};

const SUMMARY_SELECT_SQL: &str = r#"
    SELECT
      ci.id,
      ci.content_type,
      ci.preview_text,
      ci.source_app,
      ci.created_at,
      ci.last_used_at,
      ci.text_content,
      ia.thumbnail_path,
      ia.mime_type,
      ia.pixel_width,
      ia.pixel_height,
      ia.thumbnail_state,
      ci.file_count,
      (
        SELECT fi.display_name
        FROM file_items fi
        WHERE fi.item_id = ci.id
        ORDER BY fi.sort_order ASC
        LIMIT 1
      ) AS primary_name,
      EXISTS(
        SELECT 1
        FROM file_items fi
        WHERE fi.item_id = ci.id AND fi.entry_type = 'directory'
      ) AS contains_directory
    FROM clipboard_items ci
    LEFT JOIN image_assets ia ON ia.item_id = ci.id
    ORDER BY ci.last_used_at DESC, ci.id DESC
    LIMIT ?1
"#;

const DETAIL_SELECT_SQL: &str = r#"
    SELECT
      ci.id,
      ci.content_type,
      ci.preview_text,
      ci.source_app,
      ci.created_at,
      ci.last_used_at,
      ci.text_content,
      ci.rich_content,
      ia.original_path,
      ia.thumbnail_path,
      ia.mime_type,
      ia.pixel_width,
      ia.pixel_height,
      ia.byte_size,
      ia.thumbnail_state,
      ci.file_count,
      (
        SELECT fi.display_name
        FROM file_items fi
        WHERE fi.item_id = ci.id
        ORDER BY fi.sort_order ASC
        LIMIT 1
      ) AS primary_name,
      EXISTS(
        SELECT 1
        FROM file_items fi
        WHERE fi.item_id = ci.id AND fi.entry_type = 'directory'
      ) AS contains_directory
    FROM clipboard_items ci
    LEFT JOIN image_assets ia ON ia.item_id = ci.id
    WHERE ci.id = ?1
"#;

const FILE_ITEMS_SELECT_SQL: &str = r#"
    SELECT
      path,
      display_name,
      entry_type,
      extension
    FROM file_items
    WHERE item_id = ?1
    ORDER BY sort_order ASC, id ASC
"#;

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

        tracing::info!(
            path = %database_path.display(),
            schema_version = CURRENT_SCHEMA_VERSION,
            "sqlite database initialized"
        );

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

    pub fn list_record_summaries(
        &self,
        limit: usize,
    ) -> Result<Vec<ClipboardRecordSummary>, AppError> {
        let sql_limit = i64::try_from(limit)
            .map_err(|_| AppError::Db(format!("invalid sqlite limit `{limit}`")))?;

        self.with_connection(|connection| {
            let mut statement = connection.prepare(SUMMARY_SELECT_SQL).map_err(|error| {
                AppError::Db(format!("prepare sqlite summary query failed: {error}"))
            })?;
            let mut rows = statement.query(params![sql_limit]).map_err(|error| {
                AppError::Db(format!("execute sqlite summary query failed: {error}"))
            })?;

            let mut summaries = Vec::new();
            while let Some(row) = rows.next().map_err(|error| {
                AppError::Db(format!("iterate sqlite summary rows failed: {error}"))
            })? {
                summaries.push(map_summary_row(row)?);
            }

            Ok(summaries)
        })
    }

    pub fn find_record_detail(
        &self,
        id: RecordId,
    ) -> Result<Option<ClipboardRecordDetail>, AppError> {
        let sql_id = i64::try_from(id.value())
            .map_err(|_| AppError::Db(format!("invalid sqlite record id `{}`", id.value())))?;

        self.with_connection(|connection| {
            let mut statement = connection.prepare(DETAIL_SELECT_SQL).map_err(|error| {
                AppError::Db(format!("prepare sqlite detail query failed: {error}"))
            })?;
            let mut rows = statement.query(params![sql_id]).map_err(|error| {
                AppError::Db(format!("execute sqlite detail query failed: {error}"))
            })?;

            let Some(row) = rows.next().map_err(|error| {
                AppError::Db(format!("iterate sqlite detail rows failed: {error}"))
            })?
            else {
                return Ok(None);
            };

            let content_type = content_type_from_row(row, 1)?;
            let files_detail = if content_type == ContentType::Files {
                Some(FilesDetail {
                    items: load_file_items(connection, sql_id)?,
                })
            } else {
                None
            };

            map_detail_row(row, files_detail).map(Some)
        })
    }
}

fn load_file_items(connection: &Connection, item_id: i64) -> Result<Vec<FileItemDetail>, AppError> {
    let mut statement = connection.prepare(FILE_ITEMS_SELECT_SQL).map_err(|error| {
        AppError::Db(format!("prepare sqlite file items query failed: {error}"))
    })?;
    let mut rows = statement.query(params![item_id]).map_err(|error| {
        AppError::Db(format!("execute sqlite file items query failed: {error}"))
    })?;

    let mut items = Vec::new();
    while let Some(row) = rows
        .next()
        .map_err(|error| AppError::Db(format!("iterate sqlite file item rows failed: {error}")))?
    {
        items.push(map_file_item_row(row)?);
    }

    Ok(items)
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
    use crate::{
        clipboard::{
            query::{FileEntryType, ThumbnailState},
            types::{ContentType, RecordId},
        },
        error::AppError,
        persistence::migrations::CURRENT_SCHEMA_VERSION,
    };

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

    #[test]
    fn list_record_summaries_returns_mixed_records_in_desc_order() {
        let database_path = unique_test_dir().join("clipboard.db");
        let manager = SqliteConnectionManager::initialize_at(&database_path)
            .expect("sqlite database should initialize");
        seed_mixed_records(&manager);

        let summaries = manager
            .list_record_summaries(10)
            .expect("summaries should load");

        assert_eq!(summaries.len(), 3);

        assert_eq!(summaries[0].id, 3);
        assert_eq!(summaries[0].content_type, ContentType::Files);
        assert_eq!(
            summaries[0].files_meta.as_ref().expect("files meta").count,
            2
        );
        assert_eq!(
            summaries[0]
                .files_meta
                .as_ref()
                .expect("files meta")
                .primary_name,
            "合同.pdf"
        );
        assert!(
            summaries[0]
                .files_meta
                .as_ref()
                .expect("files meta")
                .contains_directory
        );

        assert_eq!(summaries[1].id, 2);
        assert_eq!(summaries[1].content_type, ContentType::Image);
        assert_eq!(
            summaries[1]
                .image_meta
                .as_ref()
                .expect("image meta")
                .thumbnail_state,
            ThumbnailState::Pending
        );
        assert_eq!(
            summaries[1]
                .image_meta
                .as_ref()
                .expect("image meta")
                .mime_type,
            "image/png"
        );

        assert_eq!(summaries[2].id, 1);
        assert_eq!(summaries[2].content_type, ContentType::Text);
        assert_eq!(
            summaries[2]
                .text_meta
                .as_ref()
                .expect("text meta")
                .char_count,
            7
        );
        assert_eq!(
            summaries[2]
                .text_meta
                .as_ref()
                .expect("text meta")
                .line_count,
            2
        );

        cleanup_test_dir(&database_path);
    }

    #[test]
    fn find_record_detail_returns_type_specific_payloads() {
        let database_path = unique_test_dir().join("clipboard.db");
        let manager = SqliteConnectionManager::initialize_at(&database_path)
            .expect("sqlite database should initialize");
        seed_mixed_records(&manager);

        let text_detail = manager
            .find_record_detail(RecordId::new(1))
            .expect("text detail query should succeed")
            .expect("text detail should exist");
        let image_detail = manager
            .find_record_detail(RecordId::new(2))
            .expect("image detail query should succeed")
            .expect("image detail should exist");
        let files_detail = manager
            .find_record_detail(RecordId::new(3))
            .expect("files detail query should succeed")
            .expect("files detail should exist");

        assert_eq!(text_detail.content_type, ContentType::Text);
        assert_eq!(text_detail.text_content.as_deref(), Some("第一行\n第二行"));
        assert_eq!(
            text_detail.rich_content.as_deref(),
            Some("<p>第一行<br/>第二行</p>")
        );
        assert!(text_detail.image_detail.is_none());
        assert!(text_detail.files_detail.is_none());

        assert_eq!(image_detail.content_type, ContentType::Image);
        assert_eq!(
            image_detail
                .image_detail
                .as_ref()
                .expect("image detail")
                .original_path,
            "/tmp/original/shot.png"
        );
        assert_eq!(
            image_detail
                .image_detail
                .as_ref()
                .expect("image detail")
                .byte_size,
            4096
        );
        assert!(image_detail.files_detail.is_none());

        assert_eq!(files_detail.content_type, ContentType::Files);
        assert_eq!(
            files_detail
                .files_detail
                .as_ref()
                .expect("files detail")
                .items
                .len(),
            2
        );
        assert_eq!(
            files_detail
                .files_detail
                .as_ref()
                .expect("files detail")
                .items[1]
                .entry_type,
            FileEntryType::Directory
        );
        assert!(files_detail.image_detail.is_none());

        cleanup_test_dir(&database_path);
    }

    #[test]
    fn find_record_detail_returns_none_when_record_missing() {
        let database_path = unique_test_dir().join("clipboard.db");
        let manager = SqliteConnectionManager::initialize_at(&database_path)
            .expect("sqlite database should initialize");

        let result = manager
            .find_record_detail(RecordId::new(404))
            .expect("detail query should succeed");

        assert!(result.is_none());

        cleanup_test_dir(&database_path);
    }

    fn seed_mixed_records(manager: &SqliteConnectionManager) {
        manager
            .with_connection(|connection| {
                connection.execute_batch(
                    r#"
                    INSERT INTO clipboard_items (
                      id,
                      content_type,
                      content_hash,
                      text_content,
                      rich_content,
                      preview_text,
                      search_text,
                      source_app,
                      file_count,
                      payload_bytes,
                      created_at,
                      last_used_at
                    ) VALUES
                      (1, 'text', 'hash-text', '第一行
第二行', '<p>第一行<br/>第二行</p>', '双行文本', '双行文本', 'Notes', 0, 12, 1000, 1500),
                      (2, 'image', 'hash-image', NULL, NULL, '屏幕截图 2026-03-06 10.13.22', '屏幕截图 2026-03-06 10.13.22', 'Preview', 0, 4096, 2000, 2500),
                      (3, 'files', 'hash-files', NULL, NULL, '合同.pdf 等 2 项', '合同.pdf 项目目录', 'Finder', 2, 0, 3000, 3500);

                    INSERT INTO image_assets (
                      item_id,
                      original_path,
                      thumbnail_path,
                      mime_type,
                      pixel_width,
                      pixel_height,
                      byte_size,
                      thumbnail_state,
                      created_at
                    ) VALUES (
                      2,
                      '/tmp/original/shot.png',
                      '/tmp/thumbs/shot.png',
                      'image/png',
                      1792,
                      1120,
                      4096,
                      'pending',
                      2000
                    );

                    INSERT INTO file_items (
                      item_id,
                      sort_order,
                      path,
                      display_name,
                      entry_type,
                      extension,
                      created_at
                    ) VALUES
                      (3, 0, '/Users/robin/Documents/合同.pdf', '合同.pdf', 'file', 'pdf', 3000),
                      (3, 1, '/Users/robin/Documents/项目目录', '项目目录', 'directory', NULL, 3000);
                    "#,
                )
                .map_err(|error| AppError::Db(format!("seed sqlite mixed records failed: {error}")))?;

                Ok(())
            })
            .expect("seed data should be inserted");
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
