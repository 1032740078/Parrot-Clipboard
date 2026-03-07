# v1.0 API 契约文档

## 1. 文档概述

### 1.1 版本范围

本文档仅描述 `v1.0 Release` 当前版本的前后端契约。

`v1.0` 在 `v0.5` 既有命令基础上，补充以下面向正式发布的接口：

- 关于页所需的版本与诊断快照读取
- `macOS` 权限状态读取与引导动作
- 应用内手动检查更新
- 孤立图片文件清理与诊断统计
- 前端日志写入后端日志系统

### 1.2 通信机制

- 前端通过 `Tauri Command` 调用后端命令。
- 后端通过 `Tauri Event` 向前端广播状态变化。
- 所有 DTO 均使用 `snake_case` 字段命名。
- 失败时统一返回结构化错误对象，详见 `状态码契约文档`。

### 1.3 通用约定

1. 成功响应直接返回业务对象，不额外包裹 `success` 字段。
2. 失败响应统一返回：

```json
{
  "code": "DB_ERROR",
  "message": "execute sqlite migration failed"
}
```

3. 所有时间字段统一使用 `Unix Timestamp(ms)`。
4. 所有路径字段为当前本机可读路径，不保证跨机器可移植。
5. 对于受平台限制的能力，优先返回结构化状态，而不是静默失败。

---

## 2. 共享数据类型

### 2.1 既有核心类型（继承自 v0.5）

| 类型 | 说明 |
|------|------|
| `ContentType` | `text / image / files` |
| `PasteMode` | `original / plain_text` |
| `ThemeMode` | `light / dark / system` |
| `PlatformKind` | `macos / windows / linux` |
| `CapabilityState` | `supported / degraded / unsupported` |
| `ClipboardRecordSummary` | 历史记录摘要 |
| `ClipboardRecordDetail` | 历史记录详情 |
| `SettingsSnapshot` | 当前配置快照 |
| `PlatformCapabilities` | 平台能力矩阵 |
| `RuntimeStatus` | 运行态快照 |
| `ClearHistoryResult` | 清空历史结果 |

### 2.2 `PermissionStatus`

```ts
interface PermissionStatus {
  platform: "macos" | "windows" | "linux";
  accessibility: "granted" | "missing" | "unsupported";
  checked_at: number;
  reason?: string | null;
}
```

### 2.3 `ReleaseInfo`

```ts
interface ReleaseInfo {
  app_version: string;
  platform: "macos" | "windows" | "linux";
  session_type?: "native" | "x11" | "wayland" | null;
  schema_version: number;
  config_version: number;
  build_profile: "debug" | "release";
}
```

### 2.4 `UpdateCheckResult`

```ts
interface UpdateCheckResult {
  status: "available" | "latest" | "failed";
  checked_at: number;
  current_version: string;
  latest_version?: string | null;
  release_notes_url?: string | null;
  download_url?: string | null;
  message?: string | null;
}
```

### 2.5 `MigrationStatus`

```ts
interface MigrationStatus {
  current_schema_version: number;
  migrated: boolean;
  recovered_from_corruption: boolean;
  checked_at: number;
  backup_paths?: string[];
}
```

### 2.6 `CleanupSummary`

```ts
interface CleanupSummary {
  deleted_original_files: number;
  deleted_thumbnail_files: number;
  executed_at: number;
}
```

### 2.7 `DiagnosticsSnapshot`

```ts
interface DiagnosticsSnapshot {
  release: ReleaseInfo;
  permission: PermissionStatus;
  log_directory: string;
  migration: MigrationStatus;
  last_orphan_cleanup?: CleanupSummary | null;
  capabilities: PlatformCapabilities;
}
```

---

## 3. Tauri Command 接口（前端 → 后端）

### 3.1 继承命令（v0.5 基线）

| Command | 说明 | 请求 | 响应 |
|---------|------|------|------|
| `get_records` | 获取最近记录摘要 | `{ limit }` | `ClipboardRecordSummary[]` |
| `get_record_detail` | 获取记录详情 | `{ id }` | `ClipboardRecordDetail` |
| `delete_record` | 删除单条记录 | `{ id }` | `void` |
| `paste_record` | 执行粘贴 | `{ id, mode }` | `PasteResult` |
| `hide_panel` | 隐藏主面板 | `void` | `void` |
| `get_monitoring_status` | 获取监听状态 | `void` | `MonitoringStatus` |
| `set_monitoring` | 切换监听状态 | `{ enabled }` | `MonitoringStatus` |
| `get_runtime_status` | 获取运行态 | `void` | `RuntimeStatus` |
| `clear_history` | 清空全部历史 | `{ confirm_token }` | `ClearHistoryResult` |
| `get_log_directory` | 获取日志目录 | `void` | `string` |
| `write_client_log` | 前端写入日志 | `{ level, message, context? }` | `void` |
| `get_settings_snapshot` | 获取设置快照 | `void` | `SettingsSnapshot` |
| `update_general_settings` | 保存通用设置 | `GeneralSettingsPayload` | `SettingsSnapshot` |
| `update_history_settings` | 保存历史设置 | `HistorySettingsPayload` | `SettingsSnapshot` |
| `validate_toggle_shortcut` | 校验快捷键 | `{ shortcut }` | `ShortcutValidationResult` |
| `update_toggle_shortcut` | 保存快捷键 | `{ shortcut }` | `SettingsSnapshot` |
| `create_blacklist_rule` | 新增黑名单规则 | `CreateBlacklistRulePayload` | `SettingsSnapshot` |
| `update_blacklist_rule` | 更新黑名单规则 | `UpdateBlacklistRulePayload` | `SettingsSnapshot` |
| `delete_blacklist_rule` | 删除黑名单规则 | `{ id }` | `SettingsSnapshot` |
| `show_settings_window` | 打开设置窗口 | `void` | `void` |
| `get_platform_capabilities` | 获取平台能力矩阵 | `void` | `PlatformCapabilities` |

### 3.2 v1.0 新增命令

#### CMD-023：`get_release_info`

- **说明**：读取关于页基础信息
- **请求**：`void`
- **响应**：`ReleaseInfo`

#### CMD-024：`get_permission_status`

- **说明**：读取权限状态，当前版本重点面向 `macOS` 辅助功能权限
- **请求**：`void`
- **响应**：`PermissionStatus`

#### CMD-025：`open_accessibility_settings`

- **说明**：打开系统权限设置入口或返回不支持状态
- **请求**：`void`
- **响应**：`void`

#### CMD-026：`check_app_update`

- **说明**：执行一次手动检查更新
- **请求**：`void`
- **响应**：`UpdateCheckResult`

#### CMD-027：`get_diagnostics_snapshot`

- **说明**：读取关于页 / 诊断页完整快照
- **请求**：`void`
- **响应**：`DiagnosticsSnapshot`

#### CMD-028：`run_orphan_cleanup`

- **说明**：手动触发一次孤立图片文件清理
- **请求**：`void`
- **响应**：`CleanupSummary`

---

## 4. Tauri Event 接口（后端 → 前端）

### 4.1 继承事件（v0.5 基线）

| 事件名 | 载荷 |
|--------|------|
| `clipboard:new-record` | `NewRecordPayloadV2` |
| `clipboard:record-updated` | `RecordUpdatedPayload` |
| `clipboard:record-deleted` | `RecordDeletedPayload` |
| `clipboard:history-cleared` | `HistoryClearedPayload` |
| `system:monitoring-changed` | `MonitoringChangedPayload` |
| `system:launch-at-login-changed` | `LaunchAtLoginChangedPayload` |
| `system:settings-updated` | `SettingsUpdatedPayload` |

### 4.2 v1.0 新增事件

| 事件名 | 载荷 | 说明 |
|--------|------|------|
| `system:permission-status-changed` | `PermissionStatus` | 权限状态变化 |
| `system:update-check-finished` | `UpdateCheckResult` | 检查更新结束 |
| `system:diagnostics-updated` | `DiagnosticsSnapshot` | 迁移、恢复或清理后刷新诊断快照 |

---

## 5. 前端 API 封装层建议

| 文件 | 职责 |
|------|------|
| `src/api/commands.ts` | 剪贴板主流程与基础命令 |
| `src/api/settings.ts` | 设置相关命令 |
| `src/api/events.ts` | 统一事件订阅与数据校验 |
| `src/api/logger.ts` | 前端日志适配与错误标准化 |
| `src/api/diagnostics.ts` | `v1.0` 新增，承接关于页、更新与权限引导接口 |

---

## 6. 兼容性约定

- `v1.0` 保持 `v0.5` 既有命令与事件兼容，避免破坏已有主面板与设置窗口行为。
- 新增命令应以“只读查询 + 明确动作”为主，不反向污染 `SettingsSnapshot` 结构。
- 若当前平台不支持 `open_accessibility_settings` 或检查更新，应返回结构化错误或降级状态，不能无反馈失败。
