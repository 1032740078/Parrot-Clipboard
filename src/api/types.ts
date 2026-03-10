export type { ErrorCode, IpcError } from "../types/error";

export type ContentType = "text" | "image" | "files" | "link" | "video" | "audio" | "document";
export type PasteMode = "original" | "plain_text";
export type ThumbnailState = "pending" | "ready" | "failed";
export type RecordUpdatedReason = "promoted" | "thumbnail_ready" | "thumbnail_failed";
export type RecordDeletedReason = "manual" | "retention";
export type PlatformKind = "macos" | "windows" | "linux";
export type ThemeMode = "light" | "dark" | "system";
export type CapabilityState = "supported" | "degraded" | "unsupported";
export type SessionType = "native" | "x11" | "wayland";
export type BlacklistMatchType = "bundle_id" | "process_name" | "app_id" | "wm_class";
export type PermissionAccessibilityState = "granted" | "missing" | "unsupported";
export type BuildProfile = "debug" | "release";
export type UpdateCheckStatus = "available" | "latest" | "failed";

export interface LegacyClipboardRecord {
  id: number;
  content_type: "text";
  text_content: string;
  created_at: number;
}

export interface TextMeta {
  char_count: number;
  line_count: number;
}

export interface ImageMeta {
  mime_type: string;
  pixel_width: number;
  pixel_height: number;
  thumbnail_path?: string | null;
  thumbnail_state: ThumbnailState;
}

export interface FilesMeta {
  count: number;
  primary_name: string;
  contains_directory: boolean;
}

export interface ImageDetail {
  original_path: string;
  mime_type: string;
  pixel_width: number;
  pixel_height: number;
  byte_size: number;
}

export interface FileItemDetail {
  path: string;
  display_name: string;
  entry_type: "file" | "directory";
  extension?: string | null;
}

export interface FilesDetail {
  items: FileItemDetail[];
}

export interface ClipboardRecordSummary {
  id: number;
  content_type: ContentType;
  preview_text: string;
  source_app?: string | null;
  created_at: number;
  last_used_at: number;
  text_meta?: TextMeta | null;
  image_meta?: ImageMeta | null;
  files_meta?: FilesMeta | null;
}

export interface ClipboardRecordDetail extends ClipboardRecordSummary {
  text_content?: string | null;
  rich_content?: string | null;
  image_detail?: ImageDetail | null;
  files_detail?: FilesDetail | null;
}

export interface PasteResult {
  record: ClipboardRecordSummary;
  paste_mode: PasteMode;
  executed_at: number;
}

export interface MonitoringStatus {
  monitoring: boolean;
}

export type MonitoringState = "running" | "paused";
export type PanelVisibilityReason =
  | "toggle_shortcut"
  | "focus_lost"
  | "escape"
  | "paste_completed"
  | "quick_paste"
  | "external_hide";

export interface MonitoringChangedPayload {
  monitoring: boolean;
  state: MonitoringState;
  changed_at: number;
}

export interface PanelVisibilityChangedPayload {
  panel_visible: boolean;
  reason: PanelVisibilityReason;
  record_id?: number | null;
}

export interface LaunchAtLoginChangedPayload {
  launch_at_login: boolean;
  changed_at: number;
}

export interface PreviewWindowRequestedPayload {
  record_id: number;
}

export interface PreviewWindowVisibilityChangedPayload {
  visible: boolean;
  record_id?: number | null;
}

export interface PermissionGuideWindowVisibilityChangedPayload {
  visible: boolean;
}

export interface GeneralSettingsPayload {
  theme: ThemeMode;
  language: string;
  launch_at_login: boolean;
}

export interface HistorySettingsPayload {
  max_text_records: number;
  max_image_records: number;
  max_file_records: number;
  max_image_storage_mb: number;
  capture_images: boolean;
  capture_files: boolean;
}

export interface ShortcutSettingsSnapshot {
  toggle_panel: string;
  platform_default: string;
}

export interface ShortcutValidationResult {
  normalized_shortcut: string;
  valid: boolean;
  conflict: boolean;
  reason?: string | null;
}

export interface BlacklistRule {
  id: string;
  app_name: string;
  platform: PlatformKind;
  match_type: BlacklistMatchType;
  app_identifier: string;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}

export interface CreateBlacklistRulePayload {
  app_name: string;
  platform: PlatformKind;
  match_type: BlacklistMatchType;
  app_identifier: string;
}

export interface UpdateBlacklistRulePayload extends CreateBlacklistRulePayload {
  id: string;
  enabled: boolean;
}

export interface DeleteBlacklistRulePayload {
  id: string;
}

export interface PrivacySettingsSnapshot {
  blacklist_rules: BlacklistRule[];
}

export interface SettingsSnapshot {
  config_version: 2;
  general: GeneralSettingsPayload;
  history: HistorySettingsPayload;
  shortcut: ShortcutSettingsSnapshot;
  privacy: PrivacySettingsSnapshot;
}

export interface PlatformCapabilities {
  platform: PlatformKind;
  session_type?: SessionType | null;
  clipboard_monitoring: CapabilityState;
  global_shortcut: CapabilityState;
  launch_at_login: CapabilityState;
  tray: CapabilityState;
  active_app_detection: CapabilityState;
  reasons: string[];
}

export interface PermissionStatus {
  platform: PlatformKind;
  accessibility: PermissionAccessibilityState;
  checked_at: number;
  reason?: string | null;
}

export interface ReleaseInfo {
  app_version: string;
  platform: PlatformKind;
  session_type?: SessionType | null;
  schema_version: number;
  config_version: number;
  build_profile: BuildProfile;
}

export interface UpdateCheckResult {
  status: UpdateCheckStatus;
  checked_at: number;
  current_version: string;
  latest_version?: string | null;
  release_notes_url?: string | null;
  download_url?: string | null;
  message?: string | null;
}

export interface MigrationStatus {
  current_schema_version: number;
  migrated: boolean;
  recovered_from_corruption: boolean;
  checked_at: number;
  backup_paths?: string[];
}

export interface CleanupSummary {
  deleted_original_files: number;
  deleted_thumbnail_files: number;
  executed_at: number;
}

export interface DiagnosticsSnapshot {
  release: ReleaseInfo;
  permission: PermissionStatus;
  log_directory: string;
  migration: MigrationStatus;
  last_orphan_cleanup?: CleanupSummary | null;
  capabilities: PlatformCapabilities;
}

export interface RuntimeStatus {
  monitoring: boolean;
  launch_at_login: boolean;
  panel_visible: boolean;
}

export interface ClearHistoryResult {
  deleted_records: number;
  deleted_image_assets: number;
  executed_at: number;
}

export type HistoryClearedPayload = ClearHistoryResult;
export type SettingsUpdatedPayload = SettingsSnapshot;

export interface ClearHistoryRequestPayload {
  confirm_token: string;
}

export interface NewRecordPayload {
  record: LegacyClipboardRecord;
  evicted_id?: number;
}

export interface NewRecordPayloadV2 {
  record: ClipboardRecordSummary;
  evicted_ids?: number[];
}

export interface RecordUpdatedPayload {
  reason: RecordUpdatedReason;
  record: ClipboardRecordSummary;
}

export interface RecordDeletedPayload {
  id: number;
  reason?: RecordDeletedReason;
}
