pub const CURRENT_SCHEMA_VERSION: u32 = 3;

pub const MIGRATIONS: &[(u32, &str)] = &[
    (
        1,
        r#"
        CREATE TABLE IF NOT EXISTS clipboard_items (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          content_type    TEXT NOT NULL CHECK (content_type IN ('text', 'image', 'files')),
          content_hash    TEXT NOT NULL,
          text_content    TEXT,
          rich_content    TEXT,
          preview_text    TEXT NOT NULL,
          search_text     TEXT NOT NULL,
          source_app      TEXT,
          file_count      INTEGER NOT NULL DEFAULT 0,
          payload_bytes   INTEGER NOT NULL DEFAULT 0,
          created_at      INTEGER NOT NULL,
          last_used_at    INTEGER NOT NULL,
          UNIQUE(content_type, content_hash)
        );

        CREATE TABLE IF NOT EXISTS image_assets (
          item_id          INTEGER PRIMARY KEY,
          original_path    TEXT NOT NULL UNIQUE,
          thumbnail_path   TEXT,
          mime_type        TEXT NOT NULL,
          pixel_width      INTEGER NOT NULL,
          pixel_height     INTEGER NOT NULL,
          byte_size        INTEGER NOT NULL,
          thumbnail_state  TEXT NOT NULL CHECK (thumbnail_state IN ('pending', 'ready', 'failed')),
          created_at       INTEGER NOT NULL,
          FOREIGN KEY(item_id) REFERENCES clipboard_items(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS file_items (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id       INTEGER NOT NULL,
          sort_order    INTEGER NOT NULL,
          path          TEXT NOT NULL,
          display_name  TEXT NOT NULL,
          entry_type    TEXT NOT NULL CHECK (entry_type IN ('file', 'directory')),
          extension     TEXT,
          created_at    INTEGER NOT NULL,
          FOREIGN KEY(item_id) REFERENCES clipboard_items(id) ON DELETE CASCADE,
          UNIQUE(item_id, sort_order)
        );
        "#,
    ),
    (
        2,
        r#"
        CREATE INDEX IF NOT EXISTS idx_clipboard_items_last_used_at
          ON clipboard_items(last_used_at DESC, id DESC);

        CREATE INDEX IF NOT EXISTS idx_clipboard_items_content_type_last_used_at
          ON clipboard_items(content_type, last_used_at DESC, id DESC);

        CREATE INDEX IF NOT EXISTS idx_image_assets_thumbnail_state
          ON image_assets(thumbnail_state, item_id);

        CREATE INDEX IF NOT EXISTS idx_file_items_item_id_sort_order
          ON file_items(item_id, sort_order);
        "#,
    ),
    (
        3,
        r#"
        PRAGMA foreign_keys = OFF;

        CREATE TABLE clipboard_items_v3 (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          payload_type    TEXT NOT NULL CHECK (payload_type IN ('text', 'image', 'files')),
          content_type    TEXT NOT NULL CHECK (content_type IN ('text', 'image', 'files', 'link', 'video', 'audio', 'document')),
          content_hash    TEXT NOT NULL,
          text_content    TEXT,
          rich_content    TEXT,
          preview_text    TEXT NOT NULL,
          search_text     TEXT NOT NULL,
          source_app      TEXT,
          file_count      INTEGER NOT NULL DEFAULT 0,
          payload_bytes   INTEGER NOT NULL DEFAULT 0,
          created_at      INTEGER NOT NULL,
          last_used_at    INTEGER NOT NULL,
          UNIQUE(payload_type, content_hash)
        );

        INSERT INTO clipboard_items_v3 (
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
        )
        SELECT
          id,
          content_type,
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
        FROM clipboard_items;

        DROP TABLE clipboard_items;
        ALTER TABLE clipboard_items_v3 RENAME TO clipboard_items;

        CREATE INDEX IF NOT EXISTS idx_clipboard_items_last_used_at
          ON clipboard_items(last_used_at DESC, id DESC);

        CREATE INDEX IF NOT EXISTS idx_clipboard_items_content_type_last_used_at
          ON clipboard_items(content_type, last_used_at DESC, id DESC);

        CREATE INDEX IF NOT EXISTS idx_clipboard_items_payload_type_last_used_at
          ON clipboard_items(payload_type, last_used_at DESC, id DESC);

        PRAGMA foreign_keys = ON;
        "#,
    ),
];
