# v0.5 API 契约文档

## 1. 文档概述

### 1.1 版本范围

本文档定义 **v0.5 Beta 版本** 的前后端 IPC 契约。

`v0.5` 在 `v0.3` 的历史记录、运行态、托盘与自启动接口之上，新增：

- 设置窗口打开接口
- 设置快照读取与分组更新接口
- 自定义快捷键校验与保存接口
- 黑名单规则增删改接口
- 平台能力查询接口

### 1.2 通信机制

- 前端通过 Tauri `invoke()` 调用 Command
- 后端通过 Tauri `emit()` 推送 Event
- 所有时间字段统一使用 Unix 毫秒时间戳
- 所有 JSON 字段统一使用 `snake_case`

### 1.3 通用约定

| 约定 | 说明 |
|------|------|
| 内容类型 | `text` / `image` / `files` |
| 粘贴模式 | `original` / `plain_text` |
| 监听状态 | `running` / `paused` |
| 主题模式 | `light` / `dark` / `system` |
| 平台 | `macos` / `windows` / `linux` |
| 能力状态 | `supported` / `degraded` / `unsupported` |
| 设置快照 | 返回当前完整配置结构，用于设置页首屏回显 |

---

## 2. 共享数据类型

### 2.1 `ContentType`

```typescript
type ContentType = "text" | "image" | "files";
```

### 2.2 `PasteMode`

```typescript
type PasteMode = "original" | "plain_text";
```

### 2.3 `ThemeMode`

```typescript
type ThemeMode = "light" | "dark" | "system";
```

### 2.4 `PlatformKind`

```typescript
type PlatformKind = "macos" | "windows" | "linux";
```

### 2.5 `CapabilityState`

```typescript
type CapabilityState = "supported" | "degraded" | "unsupported";
```

### 2.6 `ClipboardRecordSummary`

```typescript
interface ClipboardRecordSummary {
  id: number;
  content_type: ContentType;
  preview_text: string;
  source_app?: string | null;
  created_at: number;
  last_used_at: number;
  text_meta?: { char_count: number; line_count: number } | null;
  image_meta?: {
    mime_type: string;
    pixel_width: number;
    pixel_height: number;
    thumbnail_path?: string | null;
    thumbnail_state: "pending" | "ready" | "failed";
  } | null;
  files_meta?: {
    count: number;
    primary_name: string;
    contains_directory: boolean;
  } | null;
}
```

### 2.7 `ClipboardRecordDetail`

```typescript
interface ClipboardRecordDetail extends ClipboardRecordSummary {
  text_content?: string | null;
  rich_content?: string | null;
  image_detail?: {
    original_path: string;
    mime_type: string;
    pixel_width: number;
    pixel_height: number;
    byte_size: number;
  } | null;
  files_detail?: {
    items: Array<{
      path: string;
      display_name: string;
      entry_type: "file" | "directory";
      extension?: string | null;
    }>;
  } | null;
}
```

### 2.8 `PasteResult`

```typescript
interface PasteResult {
  record: ClipboardRecordSummary;
  paste_mode: PasteMode;
  executed_at: number;
}
```

### 2.9 `MonitoringStatus`

```typescript
interface MonitoringStatus {
  monitoring: boolean;
  state: "running" | "paused";
}
```

### 2.10 `RuntimeStatus`

```typescript
interface RuntimeStatus {
  monitoring: boolean;
  launch_at_login: boolean;
  panel_visible: boolean;
  platform: PlatformKind;
  session_type?: "native" | "x11" | "wayland" | null;
}
```

### 2.11 `BlacklistRule`

```typescript
interface BlacklistRule {
  id: string;
  app_name: string;
  platform: PlatformKind;
  match_type: "bundle_id" | "process_name" | "app_id" | "wm_class";
  app_identifier: string;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}
```

### 2.12 `SettingsSnapshot`

```typescript
interface SettingsSnapshot {
  config_version: 2;
  general: {
    theme: ThemeMode;
    language: string;
    launch_at_login: boolean;
  };
  history: {
    max_text_records: number;
    max_image_records: number;
    max_file_records: number;
    max_image_storage_mb: number;
    capture_images: boolean;
    capture_files: boolean;
  };
  shortcut: {
    toggle_panel: string;
    platform_default: string;
  };
  privacy: {
    blacklist_rules: BlacklistRule[];
  };
}
```

### 2.13 `ShortcutValidationResult`

```typescript
interface ShortcutValidationResult {
  normalized_shortcut: string;
  valid: boolean;
  conflict: boolean;
  reason?: string | null;
}
```

### 2.14 `PlatformCapabilities`

```typescript
interface PlatformCapabilities {
  platform: PlatformKind;
  session_type?: "native" | "x11" | "wayland" | null;
  clipboard_monitoring: CapabilityState;
  global_shortcut: CapabilityState;
  launch_at_login: CapabilityState;
  tray: CapabilityState;
  active_app_detection: CapabilityState;
  reasons: string[];
}
```

---

## 3. Tauri Command 接口（前端 → 后端）

### CMD-001：`get_records`

**用途**：获取主面板摘要列表。  
**参数**：`{ limit: number }`  
**返回值**：`ClipboardRecordSummary[]`

### CMD-002：`get_record_detail`

**用途**：获取单条记录详情。  
**参数**：`{ id: number }`  
**返回值**：`ClipboardRecordDetail`

### CMD-003：`delete_record`

**用途**：删除单条记录及关联资源。  
**参数**：`{ id: number }`  
**返回值**：`void`

### CMD-004：`paste_record`

**用途**：恢复记录并执行粘贴。  
**参数**：`{ id: number; mode: PasteMode }`  
**返回值**：`PasteResult`

### CMD-005：`hide_panel`

**用途**：显式隐藏主面板。  
**参数**：无  
**返回值**：`void`

### CMD-006：`get_monitoring_status`

**用途**：读取当前监听状态。  
**参数**：无  
**返回值**：`MonitoringStatus`

### CMD-007：`set_monitoring`

**用途**：暂停或恢复监听。  
**参数**：`{ enabled: boolean }`  
**返回值**：`MonitoringStatus`

### CMD-008：`clear_history`

**用途**：清空全部历史记录与图片资源。  
**参数**：`{ confirm_token: string }`  
**返回值**：

```typescript
{ deleted_records: number; deleted_image_assets: number; executed_at: number }
```

### CMD-009：`get_launch_at_login_status`

**用途**：读取开机自启动状态。  
**参数**：无  
**返回值**：`{ enabled: boolean }`

### CMD-010：`set_launch_at_login`

**用途**：开启或关闭开机自启动。  
**参数**：`{ enabled: boolean }`  
**返回值**：`{ enabled: boolean }`

### CMD-011：`get_runtime_status`

**用途**：读取运行态总览。  
**参数**：无  
**返回值**：`RuntimeStatus`

### CMD-012：`get_log_directory`

**用途**：获取日志目录。  
**参数**：无  
**返回值**：`string`

### CMD-013：`show_settings_window`

**用途**：打开或激活设置窗口。  
**参数**：无  
**返回值**：`void`

### CMD-014：`get_settings_snapshot`

**用途**：获取设置窗口完整快照。  
**参数**：无  
**返回值**：`SettingsSnapshot`

### CMD-015：`update_general_settings`

**用途**：更新通用设置。  
**参数**：

```typescript
{ theme: ThemeMode; language: string; launch_at_login: boolean }
```

**返回值**：`SettingsSnapshot`

### CMD-016：`update_history_settings`

**用途**：更新记录与存储设置。  
**参数**：

```typescript
{
  max_text_records: number;
  max_image_records: number;
  max_file_records: number;
  max_image_storage_mb: number;
  capture_images: boolean;
  capture_files: boolean;
}
```

**返回值**：`SettingsSnapshot`

### CMD-017：`validate_toggle_shortcut`

**用途**：校验新的全局快捷键是否合法且可用。  
**参数**：`{ shortcut: string }`  
**返回值**：`ShortcutValidationResult`

### CMD-018：`update_toggle_shortcut`

**用途**：保存并重注册调出主面板快捷键。  
**参数**：`{ shortcut: string }`  
**返回值**：`SettingsSnapshot`

### CMD-019：`create_blacklist_rule`

**用途**：新增黑名单规则。  
**参数**：

```typescript
{
  app_name: string;
  platform: PlatformKind;
  match_type: "bundle_id" | "process_name" | "app_id" | "wm_class";
  app_identifier: string;
}
```

**返回值**：`SettingsSnapshot`

### CMD-020：`update_blacklist_rule`

**用途**：更新黑名单规则。  
**参数**：

```typescript
{
  id: string;
  app_name: string;
  platform: PlatformKind;
  match_type: "bundle_id" | "process_name" | "app_id" | "wm_class";
  app_identifier: string;
  enabled: boolean;
}
```

**返回值**：`SettingsSnapshot`

### CMD-021：`delete_blacklist_rule`

**用途**：删除黑名单规则。  
**参数**：`{ id: string }`  
**返回值**：`SettingsSnapshot`

### CMD-022：`get_platform_capabilities`

**用途**：读取当前平台能力矩阵。  
**参数**：无  
**返回值**：`PlatformCapabilities`

---

## 4. Tauri Event 接口（后端 → 前端）

### EVT-001：`clipboard:new-record`

新增历史记录时触发，负载：`{ record: ClipboardRecordSummary; evicted_ids?: number[] }`

### EVT-002：`clipboard:record-updated`

历史记录被置顶或缩略图状态变化时触发。

### EVT-003：`clipboard:record-deleted`

记录删除时触发，负载：`{ id: number; reason?: string }`

### EVT-004：`clipboard:history-cleared`

历史清空后触发。

### EVT-005：`system:monitoring-changed`

监听状态切换时触发。

### EVT-006：`system:launch-at-login-changed`

自启动状态切换时触发，便于托盘与设置页同步。

### EVT-007：`system:settings-updated`

任一设置分组保存成功后触发，负载：`SettingsSnapshot`

---

## 5. 前端 API 封装层建议（`src/api/`）

### 5.1 `commands.ts`

继续承载历史记录、粘贴、监听、自启动、运行态相关命令。

### 5.2 `settings.ts`

新增设置相关封装：

- `showSettingsWindow()`
- `getSettingsSnapshot()`
- `updateGeneralSettings()`
- `updateHistorySettings()`
- `validateToggleShortcut()`
- `updateToggleShortcut()`
- `createBlacklistRule()`
- `updateBlacklistRule()`
- `deleteBlacklistRule()`
- `getPlatformCapabilities()`

### 5.3 `events.ts`

新增监听：

- `onSettingsUpdated()`
- `onLaunchAtLoginChanged()`

---

## 6. 与 v0.3 的主要差异

| 项目 | v0.3 | v0.5 |
|------|------|------|
| 设置窗口接口 | 无 | 新增 `show_settings_window` |
| 配置接口 | 仅零散系统项 | 新增 `get_settings_snapshot` 与分组更新 |
| 快捷键配置 | 固定默认值 | 支持校验与动态更新 |
| 黑名单接口 | 无 | 新增规则增删改 |
| 平台能力接口 | 无 | 新增能力矩阵查询 |

`v0.5` 的契约重点是：**把设置从“单个零散开关”升级为完整、可同步、可校验的配置接口集合**。
