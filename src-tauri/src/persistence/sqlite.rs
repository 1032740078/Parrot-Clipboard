#![allow(dead_code)]

use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

use rusqlite::{params, Connection};

use crate::{
    clipboard::{
        query::{
            ClipboardRecordDetail, ClipboardRecordSummary, FileItemDetail, FilesDetail,
            PreviewStatus,
        },
        types::{ContentType, PayloadType, RecordId},
    },
    error::AppError,
};

use super::{
    migrations::{CURRENT_SCHEMA_VERSION, MIGRATIONS},
    row_mapper::{map_detail_row, map_file_item_row, map_summary_row, PreviewAssetRow},
};

const SUMMARY_SELECT_SQL: &str = r#"
    SELECT
      ci.id,
      ci.payload_type,
      ci.content_type,
      ci.preview_text,
      ci.source_app,
      ci.created_at,
      ci.last_used_at,
      CASE
        WHEN ci.text_content IS NULL THEN NULL
        ELSE length(ci.text_content)
      END AS text_char_count,
      CASE
        WHEN ci.text_content IS NULL THEN NULL
        WHEN ci.text_content = '' THEN 0
        ELSE length(ci.text_content) - length(replace(ci.text_content, char(10), '')) + 1
      END AS text_line_count,
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
      ci.payload_type,
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
      ) AS contains_directory,
      ci.primary_uri,
      ci.preview_renderer,
      ci.preview_status,
      ci.preview_error_code,
      ci.preview_error_message
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

const PREVIEW_ASSETS_SELECT_SQL: &str = r#"
    SELECT
      asset_role,
      storage_path,
      text_content,
      mime_type,
      byte_size,
      status,
      updated_at
    FROM preview_assets
    WHERE item_id = ?1
    ORDER BY asset_role ASC, id ASC
"#;

const SEARCH_SUMMARY_SELECT_PREFIX_SQL: &str = r#"
    SELECT
      ci.id,
      ci.payload_type,
      ci.content_type,
      ci.preview_text,
      ci.source_app,
      ci.created_at,
      ci.last_used_at,
      CASE
        WHEN ci.text_content IS NULL THEN NULL
        ELSE length(ci.text_content)
      END AS text_char_count,
      CASE
        WHEN ci.text_content IS NULL THEN NULL
        WHEN ci.text_content = '' THEN 0
        ELSE length(ci.text_content) - length(replace(ci.text_content, char(10), '')) + 1
      END AS text_line_count,
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
"#;

const RETENTION_CANDIDATES_SELECT_SQL: &str = r#"
    SELECT
      ci.id,
      ia.original_path,
      ia.thumbnail_path
    FROM clipboard_items ci
    LEFT JOIN image_assets ia ON ia.item_id = ci.id
    WHERE ci.content_type = ?1
    ORDER BY ci.last_used_at ASC, ci.id ASC
    LIMIT ?2
"#;

const RETENTION_CANDIDATES_BY_PAYLOAD_SQL: &str = r#"
    SELECT
      ci.id,
      ia.original_path,
      ia.thumbnail_path
    FROM clipboard_items ci
    LEFT JOIN image_assets ia ON ia.item_id = ci.id
    WHERE ci.payload_type = ?1
    ORDER BY ci.last_used_at ASC, ci.id ASC
    LIMIT ?2
"#;

const ORPHANED_IMAGE_PATHS_SQL: &str = r#"
    SELECT
      original_path,
      thumbnail_path
    FROM image_assets
"#;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImageAssetCleanupPaths {
    pub original_path: String,
    pub thumbnail_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct RetentionPruneResult {
    pub deleted_record_ids: Vec<u64>,
    pub deleted_image_assets: Vec<ImageAssetCleanupPaths>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ClearHistoryDbResult {
    pub deleted_records: usize,
    pub deleted_image_assets: Vec<ImageAssetCleanupPaths>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct OrphanedImageFiles {
    pub original_files: Vec<PathBuf>,
    pub thumbnail_files: Vec<PathBuf>,
}

#[derive(Debug, Clone)]
pub struct SqliteConnectionManager {
    database_path: PathBuf,
}

pub(crate) struct SqliteInitialization {
    pub manager: SqliteConnectionManager,
    pub migrated: bool,
}

impl SqliteConnectionManager {
    pub fn initialize_at(database_path: &Path) -> Result<Self, AppError> {
        Self::initialize_with_summary_at(database_path).map(|initialized| initialized.manager)
    }

    pub(crate) fn initialize_with_summary_at(
        database_path: &Path,
    ) -> Result<SqliteInitialization, AppError> {
        if let Some(parent) = database_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                AppError::Db(format!(
                    "create database directory `{}` failed: {error}",
                    parent.display()
                ))
            })?;
        }

        let connection = open_connection(database_path)?;
        let migrated = run_migrations(&connection)?;
        drop(connection);

        tracing::info!(
            path = %database_path.display(),
            migrated,
            schema_version = CURRENT_SCHEMA_VERSION,
            "sqlite database initialized"
        );

        Ok(SqliteInitialization {
            manager: Self {
                database_path: database_path.to_path_buf(),
            },
            migrated,
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

            let payload_type = super::row_mapper::payload_type_from_row(row, 1)?;
            let files_detail = if payload_type == PayloadType::Files {
                Some(FilesDetail {
                    items: load_file_items(connection, sql_id)?,
                })
            } else {
                None
            };
            let preview_assets = load_preview_assets(connection, sql_id)?;

            map_detail_row(row, files_detail, preview_assets).map(Some)
        })
    }

    pub fn prune_excess_records(
        &self,
        content_type: ContentType,
        max_records: usize,
    ) -> Result<RetentionPruneResult, AppError> {
        let content_type_value = content_type.as_str();

        self.with_connection(|connection| {
            let total_count: i64 = connection
                .query_row(
                    "SELECT COUNT(1) FROM clipboard_items WHERE content_type = ?1",
                    params![content_type_value],
                    |row| row.get(0),
                )
                .map_err(|error| {
                    AppError::Db(format!(
                        "count sqlite records for retention failed: {error}"
                    ))
                })?;

            let total_count = usize::try_from(total_count).map_err(|_| {
                AppError::Db(format!("invalid sqlite record count `{total_count}`"))
            })?;

            if total_count <= max_records {
                return Ok(RetentionPruneResult::default());
            }

            let excess_count = total_count - max_records;
            let candidates =
                load_retention_candidates(connection, content_type_value, excess_count)?;
            if candidates.is_empty() {
                return Ok(RetentionPruneResult::default());
            }

            let transaction = connection.unchecked_transaction().map_err(|error| {
                AppError::Db(format!(
                    "start sqlite retention transaction failed: {error}"
                ))
            })?;

            for candidate in &candidates {
                let sql_id = i64::try_from(candidate.id).map_err(|_| {
                    AppError::Db(format!("invalid sqlite delete id `{}`", candidate.id))
                })?;
                transaction
                    .execute("DELETE FROM clipboard_items WHERE id = ?1", params![sql_id])
                    .map_err(|error| {
                        AppError::Db(format!(
                            "delete sqlite retention candidate `{}` failed: {error}",
                            candidate.id
                        ))
                    })?;
            }

            transaction.commit().map_err(|error| {
                AppError::Db(format!(
                    "commit sqlite retention transaction failed: {error}"
                ))
            })?;

            Ok(RetentionPruneResult {
                deleted_record_ids: candidates.iter().map(|candidate| candidate.id).collect(),
                deleted_image_assets: candidates
                    .into_iter()
                    .filter_map(|candidate| {
                        candidate
                            .original_path
                            .map(|original_path| ImageAssetCleanupPaths {
                                original_path,
                                thumbnail_path: candidate.thumbnail_path,
                            })
                    })
                    .collect(),
            })
        })
    }

    pub fn prune_excess_records_by_payload(
        &self,
        payload_type: PayloadType,
        max_records: usize,
    ) -> Result<RetentionPruneResult, AppError> {
        let payload_type_value = payload_type.as_str();

        self.with_connection(|connection| {
            let total_count: i64 = connection
                .query_row(
                    "SELECT COUNT(1) FROM clipboard_items WHERE payload_type = ?1",
                    params![payload_type_value],
                    |row| row.get(0),
                )
                .map_err(|error| {
                    AppError::Db(format!(
                        "count sqlite records for payload retention failed: {error}"
                    ))
                })?;

            let total_count = usize::try_from(total_count).map_err(|_| {
                AppError::Db(format!(
                    "invalid sqlite payload record count `{total_count}`"
                ))
            })?;

            if total_count <= max_records {
                return Ok(RetentionPruneResult::default());
            }

            let excess_count = total_count - max_records;
            let candidates =
                load_retention_candidates_by_payload(connection, payload_type_value, excess_count)?;
            if candidates.is_empty() {
                return Ok(RetentionPruneResult::default());
            }

            let transaction = connection.unchecked_transaction().map_err(|error| {
                AppError::Db(format!(
                    "start sqlite payload retention transaction failed: {error}"
                ))
            })?;

            for candidate in &candidates {
                let sql_id = i64::try_from(candidate.id).map_err(|_| {
                    AppError::Db(format!("invalid sqlite delete id `{}`", candidate.id))
                })?;
                transaction
                    .execute("DELETE FROM clipboard_items WHERE id = ?1", params![sql_id])
                    .map_err(|error| {
                        AppError::Db(format!(
                            "delete sqlite payload retention candidate `{}` failed: {error}",
                            candidate.id
                        ))
                    })?;
            }

            transaction.commit().map_err(|error| {
                AppError::Db(format!(
                    "commit sqlite payload retention transaction failed: {error}"
                ))
            })?;

            Ok(RetentionPruneResult {
                deleted_record_ids: candidates.iter().map(|candidate| candidate.id).collect(),
                deleted_image_assets: candidates
                    .into_iter()
                    .filter_map(|candidate| {
                        candidate
                            .original_path
                            .map(|original_path| ImageAssetCleanupPaths {
                                original_path,
                                thumbnail_path: candidate.thumbnail_path,
                            })
                    })
                    .collect(),
            })
        })
    }

    pub fn search_record_summaries(
        &self,
        query: &str,
        content_type: Option<ContentType>,
        limit: usize,
    ) -> Result<Vec<ClipboardRecordSummary>, AppError> {
        let sql_limit = i64::try_from(limit)
            .map_err(|_| AppError::Db(format!("invalid sqlite limit `{limit}`")))?;
        let normalized_query = query.trim().to_lowercase();
        let like_pattern = format!("%{normalized_query}%");

        self.with_connection(|connection| {
            let sql = if content_type.is_some() {
                format!(
                    "{SEARCH_SUMMARY_SELECT_PREFIX_SQL}\nWHERE lower(ci.search_text) LIKE ?1 AND ci.content_type = ?2\nORDER BY ci.last_used_at DESC, ci.id DESC\nLIMIT ?3"
                )
            } else {
                format!(
                    "{SEARCH_SUMMARY_SELECT_PREFIX_SQL}\nWHERE lower(ci.search_text) LIKE ?1\nORDER BY ci.last_used_at DESC, ci.id DESC\nLIMIT ?2"
                )
            };
            let mut statement = connection.prepare(&sql).map_err(|error| {
                AppError::Db(format!("prepare sqlite search query failed: {error}"))
            })?;
            let mut rows = if let Some(content_type) = content_type {
                statement
                    .query(params![like_pattern, content_type.as_str(), sql_limit])
                    .map_err(|error| {
                        AppError::Db(format!("execute sqlite search query failed: {error}"))
                    })?
            } else {
                statement.query(params![like_pattern, sql_limit]).map_err(|error| {
                    AppError::Db(format!("execute sqlite search query failed: {error}"))
                })?
            };

            let mut summaries = Vec::new();
            while let Some(row) = rows
                .next()
                .map_err(|error| AppError::Db(format!("iterate sqlite search rows failed: {error}")))?
            {
                summaries.push(map_summary_row(row)?);
            }

            Ok(summaries)
        })
    }

    pub fn clear_history(&self) -> Result<ClearHistoryDbResult, AppError> {
        self.with_connection(|connection| {
            let transaction = connection.unchecked_transaction().map_err(|error| {
                AppError::Db(format!(
                    "start sqlite clear_history transaction failed: {error}"
                ))
            })?;

            let deleted_records = transaction
                .query_row("SELECT COUNT(*) FROM clipboard_items", [], |row| {
                    row.get::<_, i64>(0)
                })
                .map_err(|error| {
                    AppError::Db(format!("count sqlite clipboard_items failed: {error}"))
                })? as usize;

            let mut statement = transaction
                .prepare("SELECT original_path, thumbnail_path FROM image_assets")
                .map_err(|error| {
                    AppError::Db(format!(
                        "prepare sqlite clear_history asset query failed: {error}"
                    ))
                })?;
            let mut rows = statement.query([]).map_err(|error| {
                AppError::Db(format!(
                    "execute sqlite clear_history asset query failed: {error}"
                ))
            })?;
            let mut deleted_image_assets = Vec::new();
            while let Some(row) = rows.next().map_err(|error| {
                AppError::Db(format!(
                    "iterate sqlite clear_history asset rows failed: {error}"
                ))
            })? {
                deleted_image_assets.push(ImageAssetCleanupPaths {
                    original_path: row.get(0).map_err(|error| {
                        AppError::Db(format!(
                            "read sqlite clear_history original_path failed: {error}"
                        ))
                    })?,
                    thumbnail_path: row.get(1).map_err(|error| {
                        AppError::Db(format!(
                            "read sqlite clear_history thumbnail_path failed: {error}"
                        ))
                    })?,
                });
            }
            drop(rows);
            drop(statement);

            transaction
                .execute("DELETE FROM clipboard_items", [])
                .map_err(|error| {
                    AppError::Db(format!("delete sqlite clipboard_items failed: {error}"))
                })?;
            transaction.commit().map_err(|error| {
                AppError::Db(format!(
                    "commit sqlite clear_history transaction failed: {error}"
                ))
            })?;

            Ok(ClearHistoryDbResult {
                deleted_records,
                deleted_image_assets,
            })
        })
    }

    pub fn scan_orphaned_image_files(
        &self,
        original_dir: &Path,
        thumbnail_dir: &Path,
    ) -> Result<OrphanedImageFiles, AppError> {
        let referenced_paths = self.with_connection(load_referenced_image_paths)?;
        let mut original_files = list_files_if_exists(original_dir)?
            .into_iter()
            .filter(|path| !referenced_paths.contains(path))
            .collect::<Vec<_>>();
        let mut thumbnail_files = list_files_if_exists(thumbnail_dir)?
            .into_iter()
            .filter(|path| !referenced_paths.contains(path))
            .collect::<Vec<_>>();

        original_files.sort();
        thumbnail_files.sort();

        Ok(OrphanedImageFiles {
            original_files,
            thumbnail_files,
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

fn load_preview_assets(
    connection: &Connection,
    item_id: i64,
) -> Result<Vec<PreviewAssetRow>, AppError> {
    let mut statement = connection
        .prepare(PREVIEW_ASSETS_SELECT_SQL)
        .map_err(|error| {
            AppError::Db(format!(
                "prepare sqlite preview assets query failed: {error}"
            ))
        })?;
    let mut rows = statement.query(params![item_id]).map_err(|error| {
        AppError::Db(format!(
            "execute sqlite preview assets query failed: {error}"
        ))
    })?;

    let mut assets = Vec::new();
    while let Some(row) = rows.next().map_err(|error| {
        AppError::Db(format!("iterate sqlite preview asset rows failed: {error}"))
    })? {
        let status: String = row.get(5).map_err(|error| {
            AppError::Db(format!("read sqlite preview asset status failed: {error}"))
        })?;
        let status = PreviewStatus::from_db(&status).ok_or_else(|| {
            AppError::Db(format!(
                "unsupported preview asset status `{status}` in sqlite row"
            ))
        })?;

        assets.push(PreviewAssetRow {
            asset_role: row.get(0).map_err(|error| {
                AppError::Db(format!("read sqlite preview asset role failed: {error}"))
            })?,
            storage_path: row.get(1).map_err(|error| {
                AppError::Db(format!(
                    "read sqlite preview asset storage_path failed: {error}"
                ))
            })?,
            text_content: row.get(2).map_err(|error| {
                AppError::Db(format!(
                    "read sqlite preview asset text_content failed: {error}"
                ))
            })?,
            mime_type: row.get(3).map_err(|error| {
                AppError::Db(format!(
                    "read sqlite preview asset mime_type failed: {error}"
                ))
            })?,
            byte_size: row.get(4).map_err(|error| {
                AppError::Db(format!(
                    "read sqlite preview asset byte_size failed: {error}"
                ))
            })?,
            status,
            updated_at: row.get(6).map_err(|error| {
                AppError::Db(format!(
                    "read sqlite preview asset updated_at failed: {error}"
                ))
            })?,
        });
    }

    Ok(assets)
}

#[derive(Debug, Clone)]
struct RetentionCandidate {
    id: u64,
    original_path: Option<String>,
    thumbnail_path: Option<String>,
}

fn load_retention_candidates(
    connection: &Connection,
    content_type: &str,
    excess_count: usize,
) -> Result<Vec<RetentionCandidate>, AppError> {
    let sql_limit = i64::try_from(excess_count)
        .map_err(|_| AppError::Db(format!("invalid sqlite excess_count `{excess_count}`")))?;
    let mut statement = connection
        .prepare(RETENTION_CANDIDATES_SELECT_SQL)
        .map_err(|error| AppError::Db(format!("prepare sqlite retention query failed: {error}")))?;
    let mut rows = statement
        .query(params![content_type, sql_limit])
        .map_err(|error| AppError::Db(format!("execute sqlite retention query failed: {error}")))?;

    let mut candidates = Vec::new();
    while let Some(row) = rows
        .next()
        .map_err(|error| AppError::Db(format!("iterate sqlite retention rows failed: {error}")))?
    {
        let id = row.get::<_, i64>(0).map_err(|error| {
            AppError::Db(format!(
                "read sqlite retention candidate id failed: {error}"
            ))
        })?;
        let id = u64::try_from(id)
            .map_err(|_| AppError::Db(format!("invalid sqlite retention id `{id}`")))?;

        candidates.push(RetentionCandidate {
            id,
            original_path: row.get(1).map_err(|error| {
                AppError::Db(format!(
                    "read sqlite retention original_path failed: {error}"
                ))
            })?,
            thumbnail_path: row.get(2).map_err(|error| {
                AppError::Db(format!(
                    "read sqlite retention thumbnail_path failed: {error}"
                ))
            })?,
        });
    }

    Ok(candidates)
}

fn load_retention_candidates_by_payload(
    connection: &Connection,
    payload_type: &str,
    excess_count: usize,
) -> Result<Vec<RetentionCandidate>, AppError> {
    let sql_limit = i64::try_from(excess_count)
        .map_err(|_| AppError::Db(format!("invalid sqlite excess_count `{excess_count}`")))?;
    let mut statement = connection
        .prepare(RETENTION_CANDIDATES_BY_PAYLOAD_SQL)
        .map_err(|error| {
            AppError::Db(format!(
                "prepare sqlite payload retention query failed: {error}"
            ))
        })?;
    let mut rows = statement
        .query(params![payload_type, sql_limit])
        .map_err(|error| {
            AppError::Db(format!(
                "execute sqlite payload retention query failed: {error}"
            ))
        })?;

    let mut candidates = Vec::new();
    while let Some(row) = rows.next().map_err(|error| {
        AppError::Db(format!(
            "iterate sqlite payload retention rows failed: {error}"
        ))
    })? {
        let id = row.get::<_, i64>(0).map_err(|error| {
            AppError::Db(format!(
                "read sqlite payload retention candidate id failed: {error}"
            ))
        })?;
        let id = u64::try_from(id)
            .map_err(|_| AppError::Db(format!("invalid sqlite payload retention id `{id}`")))?;

        candidates.push(RetentionCandidate {
            id,
            original_path: row.get(1).map_err(|error| {
                AppError::Db(format!(
                    "read sqlite payload retention original_path failed: {error}"
                ))
            })?,
            thumbnail_path: row.get(2).map_err(|error| {
                AppError::Db(format!(
                    "read sqlite payload retention thumbnail_path failed: {error}"
                ))
            })?,
        });
    }

    Ok(candidates)
}

fn load_referenced_image_paths(connection: &Connection) -> Result<HashSet<PathBuf>, AppError> {
    let mut statement = connection
        .prepare(ORPHANED_IMAGE_PATHS_SQL)
        .map_err(|error| {
            AppError::Db(format!("prepare sqlite orphan scan query failed: {error}"))
        })?;
    let mut rows = statement.query([]).map_err(|error| {
        AppError::Db(format!("execute sqlite orphan scan query failed: {error}"))
    })?;

    let mut referenced_paths = HashSet::new();
    while let Some(row) = rows
        .next()
        .map_err(|error| AppError::Db(format!("iterate sqlite orphan scan rows failed: {error}")))?
    {
        let original_path: String = row.get(0).map_err(|error| {
            AppError::Db(format!("read sqlite orphan original_path failed: {error}"))
        })?;
        referenced_paths.insert(PathBuf::from(original_path));

        let thumbnail_path: Option<String> = row.get(1).map_err(|error| {
            AppError::Db(format!("read sqlite orphan thumbnail_path failed: {error}"))
        })?;
        if let Some(thumbnail_path) = thumbnail_path {
            referenced_paths.insert(PathBuf::from(thumbnail_path));
        }
    }

    Ok(referenced_paths)
}

fn list_files_if_exists(directory: &Path) -> Result<Vec<PathBuf>, AppError> {
    if !directory.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(directory).map_err(|error| {
        AppError::Db(format!(
            "read image cleanup directory `{}` failed: {error}",
            directory.display()
        ))
    })?;

    let mut files = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| {
            AppError::Db(format!(
                "read image cleanup entry in `{}` failed: {error}",
                directory.display()
            ))
        })?;

        let path = entry.path();
        if path.is_file() {
            files.push(path);
        }
    }

    Ok(files)
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

fn run_migrations(connection: &Connection) -> Result<bool, AppError> {
    let current_version = connection
        .pragma_query_value(None, "user_version", |row| row.get::<_, u32>(0))
        .map_err(|error| AppError::Db(format!("read sqlite user_version failed: {error}")))?;
    let mut migrated = false;

    for (version, sql) in MIGRATIONS {
        if *version <= current_version {
            continue;
        }

        migrated = true;

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

    Ok(migrated)
}

#[cfg(test)]
mod tests {
    use std::{
        env, fs,
        path::{Path, PathBuf},
        time::{Duration, Instant, SystemTime, UNIX_EPOCH},
    };

    use rusqlite::Connection;

    use super::SqliteConnectionManager;
    use crate::{
        clipboard::{
            query::{FileEntryType, PreviewRenderer, PreviewStatus, ThumbnailState},
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
    fn list_record_summaries_preserves_empty_text_meta() {
        let database_path = unique_test_dir().join("clipboard.db");
        let manager = SqliteConnectionManager::initialize_at(&database_path)
            .expect("sqlite database should initialize");

        manager
            .with_connection(|connection| {
                connection
                    .execute(
                        "INSERT INTO clipboard_items (id, payload_type, content_type, content_hash, text_content, rich_content, preview_text, search_text, source_app, file_count, payload_bytes, created_at, last_used_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                        rusqlite::params![
                            1_i64,
                            "text",
                            "text",
                            "empty-text-hash",
                            "",
                            Option::<String>::None,
                            "空文本",
                            "空文本",
                            "Notes",
                            0_i64,
                            0_i64,
                            1_000_i64,
                            1_000_i64,
                        ],
                    )
                    .map_err(|error| AppError::Db(format!("seed sqlite empty text record failed: {error}")))?;
                Ok(())
            })
            .expect("empty text record should be inserted");

        let summaries = manager
            .list_record_summaries(10)
            .expect("summaries should load");

        assert_eq!(summaries.len(), 1);
        assert_eq!(
            summaries[0]
                .text_meta
                .as_ref()
                .expect("text meta should exist")
                .char_count,
            0
        );
        assert_eq!(
            summaries[0]
                .text_meta
                .as_ref()
                .expect("text meta should exist")
                .line_count,
            0
        );

        cleanup_test_dir(&database_path);
    }

    #[test]
    fn list_recent_100_summaries_stays_under_80ms() {
        let database_path = unique_test_dir().join("clipboard.db");
        let manager = SqliteConnectionManager::initialize_at(&database_path)
            .expect("sqlite database should initialize");
        seed_bulk_mixed_records(&manager, 100);

        let started_at = Instant::now();
        let summaries = manager
            .list_record_summaries(100)
            .expect("summaries should load");
        let elapsed = started_at.elapsed();

        assert_eq!(summaries.len(), 100);
        assert_eq!(summaries.first().map(|record| record.id), Some(100));
        assert!(
            elapsed < Duration::from_millis(80),
            "loading 100 summaries took {:?}, expected < 80ms",
            elapsed
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
    fn find_record_detail_builds_audio_preview_payload() {
        let test_dir = unique_test_dir();
        let database_path = test_dir.join("clipboard.db");
        let audio_path = test_dir.join("voice-note.mp3");
        fs::create_dir_all(&test_dir).expect("audio fixture directory should be created");
        fs::write(&audio_path, vec![1_u8; 4096]).expect("audio fixture should be written");

        let manager = SqliteConnectionManager::initialize_at(&database_path)
            .expect("sqlite database should initialize");
        seed_audio_preview_record(&manager, &audio_path);

        let detail = manager
            .find_record_detail(RecordId::new(9))
            .expect("audio detail query should succeed")
            .expect("audio detail should exist");

        assert_eq!(detail.content_type, ContentType::Audio);
        assert_eq!(detail.preview_renderer, Some(PreviewRenderer::Audio));
        assert_eq!(detail.preview_status, Some(PreviewStatus::Ready));
        assert_eq!(
            detail.audio_detail.as_ref().map(|value| value.src.as_str()),
            Some(audio_path.to_string_lossy().as_ref())
        );
        assert_eq!(
            detail
                .audio_detail
                .as_ref()
                .and_then(|value| value.mime_type.as_deref()),
            Some("audio/mpeg")
        );
        assert_eq!(
            detail
                .audio_detail
                .as_ref()
                .and_then(|value| value.byte_size),
            Some(4096)
        );
        assert!(detail.video_detail.is_none());

        cleanup_test_dir(&database_path);
    }

    #[test]
    fn find_record_detail_promotes_legacy_pending_audio_preview_to_ready() {
        let test_dir = unique_test_dir();
        let database_path = test_dir.join("clipboard.db");
        let audio_path = test_dir.join("legacy-voice-note.mp3");
        fs::create_dir_all(&test_dir).expect("audio fixture directory should be created");
        fs::write(&audio_path, vec![3_u8; 2048]).expect("audio fixture should be written");

        let manager = SqliteConnectionManager::initialize_at(&database_path)
            .expect("sqlite database should initialize");
        seed_audio_preview_record_with_status(&manager, &audio_path, "pending");

        let detail = manager
            .find_record_detail(RecordId::new(9))
            .expect("audio detail query should succeed")
            .expect("audio detail should exist");

        assert_eq!(detail.preview_renderer, Some(PreviewRenderer::Audio));
        assert_eq!(detail.preview_status, Some(PreviewStatus::Ready));
        assert_eq!(
            detail.audio_detail.as_ref().map(|value| value.src.as_str()),
            Some(audio_path.to_string_lossy().as_ref())
        );

        cleanup_test_dir(&database_path);
    }

    #[test]
    fn find_record_detail_builds_video_preview_payload() {
        let test_dir = unique_test_dir();
        let database_path = test_dir.join("clipboard.db");
        let video_path = test_dir.join("demo.mp4");
        fs::create_dir_all(&test_dir).expect("video fixture directory should be created");
        fs::write(&video_path, vec![2_u8; 8192]).expect("video fixture should be written");

        let manager = SqliteConnectionManager::initialize_at(&database_path)
            .expect("sqlite database should initialize");
        seed_video_preview_record(&manager, &video_path);

        let detail = manager
            .find_record_detail(RecordId::new(10))
            .expect("video detail query should succeed")
            .expect("video detail should exist");

        assert_eq!(detail.content_type, ContentType::Video);
        assert_eq!(detail.preview_renderer, Some(PreviewRenderer::Video));
        assert_eq!(detail.preview_status, Some(PreviewStatus::Ready));
        assert_eq!(
            detail.video_detail.as_ref().map(|value| value.src.as_str()),
            Some(video_path.to_string_lossy().as_ref())
        );
        assert_eq!(
            detail
                .video_detail
                .as_ref()
                .and_then(|value| value.mime_type.as_deref()),
            Some("video/mp4")
        );
        assert!(detail.audio_detail.is_none());

        cleanup_test_dir(&database_path);
    }

    #[test]
    fn find_record_detail_promotes_legacy_pending_video_preview_to_ready() {
        let test_dir = unique_test_dir();
        let database_path = test_dir.join("clipboard.db");
        let video_path = test_dir.join("legacy-demo.mp4");
        fs::create_dir_all(&test_dir).expect("video fixture directory should be created");
        fs::write(&video_path, vec![4_u8; 4096]).expect("video fixture should be written");

        let manager = SqliteConnectionManager::initialize_at(&database_path)
            .expect("sqlite database should initialize");
        seed_video_preview_record_with_status(&manager, &video_path, "pending");

        let detail = manager
            .find_record_detail(RecordId::new(10))
            .expect("video detail query should succeed")
            .expect("video detail should exist");

        assert_eq!(detail.preview_renderer, Some(PreviewRenderer::Video));
        assert_eq!(detail.preview_status, Some(PreviewStatus::Ready));
        assert_eq!(
            detail.video_detail.as_ref().map(|value| value.src.as_str()),
            Some(video_path.to_string_lossy().as_ref())
        );

        cleanup_test_dir(&database_path);
    }

    #[test]
    fn find_record_detail_promotes_pdf_preview_status_to_ready_when_source_exists() {
        let test_dir = unique_test_dir();
        let database_path = test_dir.join("clipboard.db");
        let pdf_path = test_dir.join("report.pdf");
        fs::create_dir_all(&test_dir).expect("pdf fixture directory should be created");
        fs::write(&pdf_path, b"%PDF-test").expect("pdf fixture should be written");

        let manager = SqliteConnectionManager::initialize_at(&database_path)
            .expect("sqlite database should initialize");
        seed_pdf_preview_record(&manager, &pdf_path);

        let detail = manager
            .find_record_detail(RecordId::new(11))
            .expect("pdf detail query should succeed")
            .expect("pdf detail should exist");

        assert_eq!(detail.preview_renderer, Some(PreviewRenderer::Pdf));
        assert_eq!(detail.preview_status, Some(PreviewStatus::Ready));
        assert_eq!(
            detail
                .document_detail
                .as_ref()
                .map(|value| value.document_kind.clone()),
            Some(crate::clipboard::query::DocumentKind::Pdf)
        );

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

    #[test]
    fn prune_excess_records_removes_oldest_of_same_type_only_and_returns_image_assets() {
        let database_path = unique_test_dir().join("clipboard.db");
        let manager = SqliteConnectionManager::initialize_at(&database_path)
            .expect("sqlite database should initialize");
        seed_retention_records(&manager);

        let text_result = manager
            .prune_excess_records(ContentType::Text, 2)
            .expect("text retention should succeed");
        let image_result = manager
            .prune_excess_records(ContentType::Image, 1)
            .expect("image retention should succeed");

        assert_eq!(text_result.deleted_record_ids, vec![11]);
        assert!(text_result.deleted_image_assets.is_empty());
        assert_eq!(image_result.deleted_record_ids, vec![21]);
        assert_eq!(image_result.deleted_image_assets.len(), 1);
        assert_eq!(
            image_result.deleted_image_assets[0].original_path,
            "/tmp/original/old.png"
        );
        assert_eq!(
            image_result.deleted_image_assets[0]
                .thumbnail_path
                .as_deref(),
            Some("/tmp/thumbs/old.png")
        );

        let summaries = manager
            .list_record_summaries(20)
            .expect("summaries should still load");
        let ids = summaries.iter().map(|record| record.id).collect::<Vec<_>>();

        assert!(!ids.contains(&11));
        assert!(!ids.contains(&21));
        assert!(ids.contains(&12));
        assert!(ids.contains(&13));
        assert!(ids.contains(&22));
        assert!(ids.contains(&31));

        cleanup_test_dir(&database_path);
    }

    #[test]
    fn clear_history_removes_all_records_and_returns_image_assets() {
        let database_path = unique_test_dir().join("clipboard.db");
        let manager = SqliteConnectionManager::initialize_at(&database_path)
            .expect("sqlite database should initialize");
        seed_mixed_records(&manager);

        let result = manager
            .clear_history()
            .expect("clear history should succeed");

        assert_eq!(result.deleted_records, 3);
        assert_eq!(result.deleted_image_assets.len(), 1);
        assert_eq!(
            result.deleted_image_assets[0].original_path,
            "/tmp/original/shot.png"
        );
        assert_eq!(
            result.deleted_image_assets[0].thumbnail_path.as_deref(),
            Some("/tmp/thumbs/shot.png")
        );
        assert!(manager
            .list_record_summaries(10)
            .expect("summaries should load after clear")
            .is_empty());
        assert!(manager
            .find_record_detail(RecordId::new(1))
            .expect("text detail query should succeed")
            .is_none());
        assert!(manager
            .find_record_detail(RecordId::new(2))
            .expect("image detail query should succeed")
            .is_none());
        assert!(manager
            .find_record_detail(RecordId::new(3))
            .expect("files detail query should succeed")
            .is_none());

        cleanup_test_dir(&database_path);
    }

    #[test]
    fn scan_orphaned_image_files_returns_unreferenced_files() {
        let test_root = unique_test_dir();
        let database_path = test_root.join("clipboard.db");
        let original_dir = test_root.join("images/original");
        let thumbnail_dir = test_root.join("images/thumbs");
        fs::create_dir_all(&original_dir).expect("original dir should be created");
        fs::create_dir_all(&thumbnail_dir).expect("thumb dir should be created");

        let manager = SqliteConnectionManager::initialize_at(&database_path)
            .expect("sqlite database should initialize");
        let referenced_original = original_dir.join("kept.png");
        let referenced_thumb = thumbnail_dir.join("kept-thumb.png");
        let orphan_original = original_dir.join("orphan.png");
        let orphan_thumb = thumbnail_dir.join("orphan-thumb.png");

        fs::write(&referenced_original, b"kept").expect("referenced original should exist");
        fs::write(&referenced_thumb, b"kept-thumb").expect("referenced thumb should exist");
        fs::write(&orphan_original, b"orphan").expect("orphan original should exist");
        fs::write(&orphan_thumb, b"orphan-thumb").expect("orphan thumb should exist");

        seed_orphan_scan_record(&manager, &referenced_original, &referenced_thumb);

        let orphaned = manager
            .scan_orphaned_image_files(&original_dir, &thumbnail_dir)
            .expect("orphan scan should succeed");

        assert_eq!(orphaned.original_files, vec![orphan_original]);
        assert_eq!(orphaned.thumbnail_files, vec![orphan_thumb]);

        cleanup_test_dir(&database_path);
    }

    fn seed_mixed_records(manager: &SqliteConnectionManager) {
        manager
            .with_connection(|connection| {
                connection.execute_batch(
                    r#"
                    INSERT INTO clipboard_items (
                      id,
                      payload_type,
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
                      (1, 'text', 'text', 'hash-text', '第一行
第二行', '<p>第一行<br/>第二行</p>', '双行文本', '双行文本', 'Notes', 0, 12, 1000, 1500),
                      (2, 'image', 'image', 'hash-image', NULL, NULL, '屏幕截图 2026-03-06 10.13.22', '屏幕截图 2026-03-06 10.13.22', 'Preview', 0, 4096, 2000, 2500),
                      (3, 'files', 'files', 'hash-files', NULL, NULL, '合同.pdf 等 2 项', '合同.pdf 项目目录', 'Finder', 2, 0, 3000, 3500);

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

    fn seed_bulk_mixed_records(manager: &SqliteConnectionManager, total: usize) {
        manager
            .with_connection(|connection| {
                let transaction = connection.unchecked_transaction().map_err(|error| {
                    AppError::Db(format!(
                        "start sqlite bulk performance seed transaction failed: {error}"
                    ))
                })?;

                {
                    let mut insert_item = transaction
                        .prepare(
                            "INSERT INTO clipboard_items (id, payload_type, content_type, content_hash, text_content, rich_content, preview_text, search_text, source_app, file_count, payload_bytes, created_at, last_used_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                        )
                        .map_err(|error| {
                            AppError::Db(format!(
                                "prepare sqlite bulk performance item seed failed: {error}"
                            ))
                        })?;
                    let mut insert_image = transaction
                        .prepare(
                            "INSERT INTO image_assets (item_id, original_path, thumbnail_path, mime_type, pixel_width, pixel_height, byte_size, thumbnail_state, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                        )
                        .map_err(|error| {
                            AppError::Db(format!(
                                "prepare sqlite bulk performance image seed failed: {error}"
                            ))
                        })?;
                    let mut insert_file = transaction
                        .prepare(
                            "INSERT INTO file_items (item_id, sort_order, path, display_name, entry_type, extension, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                        )
                        .map_err(|error| {
                            AppError::Db(format!(
                                "prepare sqlite bulk performance file seed failed: {error}"
                            ))
                        })?;

                    for index in 0..total {
                        let record_id = (index + 1) as i64;
                        let created_at = 10_000_i64 + record_id;
                        let content_hash = format!("perf-hash-{record_id}");

                        match index % 3 {
                            0 => {
                                let text_content = format!("性能回归文本记录 {record_id}");
                                insert_item
                                    .execute(rusqlite::params![
                                        record_id,
                                        "text",
                                        "text",
                                        content_hash,
                                        text_content,
                                        Option::<String>::None,
                                        format!("文本摘要 {record_id}"),
                                        format!("文本摘要 {record_id}"),
                                        "PerfTest",
                                        0_i64,
                                        128_i64,
                                        created_at,
                                        created_at,
                                    ])
                                    .map_err(|error| {
                                        AppError::Db(format!(
                                            "seed sqlite bulk performance text record failed: {error}"
                                        ))
                                    })?;
                            }
                            1 => {
                                insert_item
                                    .execute(rusqlite::params![
                                        record_id,
                                        "image",
                                        "image",
                                        content_hash,
                                        Option::<String>::None,
                                        Option::<String>::None,
                                        format!("截图 {record_id}"),
                                        format!("截图 {record_id}"),
                                        "Preview",
                                        0_i64,
                                        4096_i64,
                                        created_at,
                                        created_at,
                                    ])
                                    .map_err(|error| {
                                        AppError::Db(format!(
                                            "seed sqlite bulk performance image record failed: {error}"
                                        ))
                                    })?;
                                insert_image
                                    .execute(rusqlite::params![
                                        record_id,
                                        format!("/tmp/perf-original-{record_id}.png"),
                                        format!("/tmp/perf-thumb-{record_id}.png"),
                                        "image/png",
                                        1440_i64,
                                        900_i64,
                                        4096_i64,
                                        "ready",
                                        created_at,
                                    ])
                                    .map_err(|error| {
                                        AppError::Db(format!(
                                            "seed sqlite bulk performance image asset failed: {error}"
                                        ))
                                    })?;
                            }
                            _ => {
                                insert_item
                                    .execute(rusqlite::params![
                                        record_id,
                                        "files",
                                        "files",
                                        content_hash,
                                        Option::<String>::None,
                                        Option::<String>::None,
                                        format!("文件 {record_id}"),
                                        format!("文件 {record_id}"),
                                        "Finder",
                                        1_i64,
                                        0_i64,
                                        created_at,
                                        created_at,
                                    ])
                                    .map_err(|error| {
                                        AppError::Db(format!(
                                            "seed sqlite bulk performance file record failed: {error}"
                                        ))
                                    })?;
                                insert_file
                                    .execute(rusqlite::params![
                                        record_id,
                                        0_i64,
                                        format!("/tmp/perf-file-{record_id}.txt"),
                                        format!("perf-file-{record_id}.txt"),
                                        "file",
                                        "txt",
                                        created_at,
                                    ])
                                    .map_err(|error| {
                                        AppError::Db(format!(
                                            "seed sqlite bulk performance file item failed: {error}"
                                        ))
                                    })?;
                            }
                        }
                    }
                }

                transaction.commit().map_err(|error| {
                    AppError::Db(format!(
                        "commit sqlite bulk performance seed transaction failed: {error}"
                    ))
                })?;

                Ok(())
            })
            .expect("bulk performance seed data should be inserted");
    }

    fn seed_retention_records(manager: &SqliteConnectionManager) {
        manager
            .with_connection(|connection| {
                connection.execute_batch(
                    r#"
                    INSERT INTO clipboard_items (
                      id,
                      payload_type,
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
                      (11, 'text', 'text', 'retention-text-1', 'old text', NULL, 'old text', 'old text', 'Notes', 0, 8, 1000, 1000),
                      (12, 'text', 'text', 'retention-text-2', 'mid text', NULL, 'mid text', 'mid text', 'Notes', 0, 8, 2000, 2000),
                      (13, 'text', 'text', 'retention-text-3', 'new text', NULL, 'new text', 'new text', 'Notes', 0, 8, 3000, 3000),
                      (21, 'image', 'image', 'retention-image-1', NULL, NULL, 'old image', 'old image', 'Preview', 0, 4096, 1100, 1100),
                      (22, 'image', 'image', 'retention-image-2', NULL, NULL, 'new image', 'new image', 'Preview', 0, 4096, 2200, 2200),
                      (31, 'files', 'files', 'retention-files-1', NULL, NULL, 'keep files', 'keep files', 'Finder', 1, 0, 3300, 3300);

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
                    ) VALUES
                      (21, '/tmp/original/old.png', '/tmp/thumbs/old.png', 'image/png', 1280, 720, 4096, 'ready', 1100),
                      (22, '/tmp/original/new.png', '/tmp/thumbs/new.png', 'image/png', 1280, 720, 4096, 'ready', 2200);

                    INSERT INTO file_items (
                      item_id,
                      sort_order,
                      path,
                      display_name,
                      entry_type,
                      extension,
                      created_at
                    ) VALUES
                      (31, 0, '/Users/robin/Documents/report.pdf', 'report.pdf', 'file', 'pdf', 3300);
                    "#,
                )
                .map_err(|error| {
                    AppError::Db(format!("seed sqlite retention records failed: {error}"))
                })?;

                Ok(())
            })
            .expect("retention seed data should be inserted");
    }

    fn seed_audio_preview_record(manager: &SqliteConnectionManager, audio_path: &Path) {
        seed_audio_preview_record_with_status(manager, audio_path, "ready");
    }

    fn seed_audio_preview_record_with_status(
        manager: &SqliteConnectionManager,
        audio_path: &Path,
        preview_status: &str,
    ) {
        let audio_path = audio_path.to_string_lossy();

        manager
            .with_connection(|connection| {
                connection
                    .execute_batch(&format!(
                        r#"
                        INSERT INTO clipboard_items (
                          id,
                          payload_type,
                          content_type,
                          content_hash,
                          text_content,
                          rich_content,
                          preview_text,
                          search_text,
                          source_app,
                          file_count,
                          payload_bytes,
                          primary_uri,
                          preview_renderer,
                          preview_status,
                          created_at,
                          last_used_at
                        ) VALUES (
                          9,
                          'files',
                          'audio',
                          'audio-preview-hash',
                          NULL,
                          NULL,
                          'voice-note.mp3',
                          'voice-note.mp3',
                          'Finder',
                          1,
                          4096,
                          '{audio_path}',
                          'audio',
                          '{preview_status}',
                          9000,
                          9000
                        );

                        INSERT INTO file_items (
                          item_id,
                          sort_order,
                          path,
                          display_name,
                          entry_type,
                          extension,
                          created_at
                        ) VALUES (
                          9,
                          0,
                          '{audio_path}',
                          'voice-note.mp3',
                          'file',
                          'mp3',
                          9000
                        );
                        "#
                    ))
                    .map_err(|error| {
                        AppError::Db(format!("seed sqlite audio preview record failed: {error}"))
                    })?;

                Ok(())
            })
            .expect("audio preview seed data should be inserted");
    }

    fn seed_video_preview_record(manager: &SqliteConnectionManager, video_path: &Path) {
        seed_video_preview_record_with_status(manager, video_path, "ready");
    }

    fn seed_video_preview_record_with_status(
        manager: &SqliteConnectionManager,
        video_path: &Path,
        preview_status: &str,
    ) {
        let video_path = video_path.to_string_lossy();

        manager
            .with_connection(|connection| {
                connection
                    .execute_batch(&format!(
                        r#"
                        INSERT INTO clipboard_items (
                          id,
                          payload_type,
                          content_type,
                          content_hash,
                          text_content,
                          rich_content,
                          preview_text,
                          search_text,
                          source_app,
                          file_count,
                          payload_bytes,
                          primary_uri,
                          preview_renderer,
                          preview_status,
                          created_at,
                          last_used_at
                        ) VALUES (
                          10,
                          'files',
                          'video',
                          'video-preview-hash',
                          NULL,
                          NULL,
                          'demo.mp4',
                          'demo.mp4',
                          'Finder',
                          1,
                          8192,
                          '{video_path}',
                          'video',
                          '{preview_status}',
                          10000,
                          10000
                        );

                        INSERT INTO file_items (
                          item_id,
                          sort_order,
                          path,
                          display_name,
                          entry_type,
                          extension,
                          created_at
                        ) VALUES (
                          10,
                          0,
                          '{video_path}',
                          'demo.mp4',
                          'file',
                          'mp4',
                          10000
                        );
                        "#
                    ))
                    .map_err(|error| {
                        AppError::Db(format!("seed sqlite video preview record failed: {error}"))
                    })?;

                Ok(())
            })
            .expect("video preview seed data should be inserted");
    }

    fn seed_pdf_preview_record(manager: &SqliteConnectionManager, pdf_path: &Path) {
        let pdf_path = pdf_path.to_string_lossy();

        manager
            .with_connection(|connection| {
                connection
                    .execute_batch(&format!(
                        r#"
                        INSERT INTO clipboard_items (
                          id,
                          payload_type,
                          content_type,
                          content_hash,
                          text_content,
                          rich_content,
                          preview_text,
                          search_text,
                          source_app,
                          file_count,
                          payload_bytes,
                          primary_uri,
                          preview_renderer,
                          preview_status,
                          created_at,
                          last_used_at
                        ) VALUES (
                          11,
                          'files',
                          'document',
                          'pdf-preview-hash',
                          NULL,
                          NULL,
                          'report.pdf',
                          'report.pdf',
                          'Finder',
                          1,
                          4096,
                          '{pdf_path}',
                          'pdf',
                          'pending',
                          11000,
                          11000
                        );

                        INSERT INTO file_items (
                          item_id,
                          sort_order,
                          path,
                          display_name,
                          entry_type,
                          extension,
                          created_at
                        ) VALUES (
                          11,
                          0,
                          '{pdf_path}',
                          'report.pdf',
                          'file',
                          'pdf',
                          11000
                        );
                        "#
                    ))
                    .map_err(|error| {
                        AppError::Db(format!("seed sqlite pdf preview record failed: {error}"))
                    })?;

                Ok(())
            })
            .expect("pdf preview seed data should be inserted");
    }

    fn seed_orphan_scan_record(
        manager: &SqliteConnectionManager,
        referenced_original: &Path,
        referenced_thumb: &Path,
    ) {
        manager
            .with_connection(|connection| {
                connection.execute_batch(&format!(
                    "
                    INSERT INTO clipboard_items (
                      id,
                      payload_type,
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
                      (41, 'image', 'image', 'orphan-scan-image', NULL, NULL, 'referenced image', 'referenced image', 'Preview', 0, 2048, 4100, 4100);

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
                      41,
                      '{}',
                      '{}',
                      'image/png',
                      640,
                      480,
                      2048,
                      'ready',
                      4100
                    );
                    ",
                    referenced_original.display(),
                    referenced_thumb.display()
                ))
                .map_err(|error| AppError::Db(format!("seed sqlite orphan scan record failed: {error}")))?;

                Ok(())
            })
            .expect("orphan scan seed data should be inserted");
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
        static NEXT_TEST_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        let unique_id = NEXT_TEST_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        env::temp_dir().join(format!(
            "clipboard-manager-sqlite-test-{suffix}-{unique_id}"
        ))
    }

    fn cleanup_test_dir(database_path: &Path) {
        if let Some(parent) = database_path.parent() {
            let _ = fs::remove_dir_all(parent);
        }
    }
}
