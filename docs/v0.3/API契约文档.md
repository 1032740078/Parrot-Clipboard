# v0.3 API 契约文档

## 1. 文档概述

### 1.1 版本范围

本文档定义 **v0.3 Feature Complete 版本** 的前后端 IPC 契约。`v0.3` 在 `v0.2` 的历史记录 API 之上，新增系统集成与运行控制相关接口。

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
| 开机自启动 | `true` / `false` |
| 列表接口 | 仅返回卡片渲染需要的摘要 |

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

### 2.3 `MonitoringState`

```typescript
type MonitoringState = "running" | "paused";
```

### 2.4 `ClipboardRecordSummary`

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

### 2.5 `ClipboardRecordDetail`

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

### 2.6 `PasteResult`

```typescript
interface PasteResult {
  record: ClipboardRecordSummary;
  paste_mode: PasteMode;
  executed_at: number;
}
```

### 2.7 `MonitoringStatus`

```typescript
interface MonitoringStatus {
  monitoring: boolean;
  state: MonitoringState;
}
```

### 2.8 `LaunchAtLoginStatus`

```typescript
interface LaunchAtLoginStatus {
  enabled: boolean;
  managed_by: "launch_agent";
  updated_at?: number | null;
}
```

### 2.9 `ClearHistoryResult`

```typescript
interface ClearHistoryResult {
  deleted_records: number;
  deleted_image_assets: number;
  executed_at: number;
}
```

---

## 3. Tauri Command 接口（前端 → 后端）

### CMD-001：`get_records`

**用途**：获取主面板摘要列表。

**参数**：`{ limit: number }`

**返回值**：`ClipboardRecordSummary[]`

**约束**：
- `limit > 0 && limit <= 500`
- 按 `last_used_at DESC, id DESC` 排序

### CMD-002：`get_record_detail`

**用途**：获取单条记录详情。

**参数**：`{ id: number }`

**返回值**：`ClipboardRecordDetail`

### CMD-003：`delete_record`

**用途**：删除单条记录及其关联资源。

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

**参数**：

```typescript
{ enabled: boolean }
```

**返回值**：`MonitoringStatus`

**约束**：
- `enabled=true` 表示恢复监听
- `enabled=false` 表示暂停监听

### CMD-008：`clear_history`

**用途**：清空全部历史记录与关联图片资源。

**参数**：

```typescript
{ confirm_token: string }
```

**返回值**：`ClearHistoryResult`

**约束**：
- 必须携带确认令牌，避免误触直删

### CMD-009：`get_launch_at_login_status`

**用途**：读取开机自启动状态。

**参数**：无

**返回值**：`LaunchAtLoginStatus`

### CMD-010：`set_launch_at_login`

**用途**：开启或关闭开机自启动。

**参数**：

```typescript
{ enabled: boolean }
```

**返回值**：`LaunchAtLoginStatus`

### CMD-011：`get_runtime_status`

**用途**：读取当前运行态总览。

**参数**：无

**返回值**：

```typescript
{
  monitoring: boolean;
  launch_at_login: boolean;
  panel_visible: boolean;
}
```

### CMD-012：`get_log_directory`

**用途**：返回当前日志目录。

**参数**：无

**返回值**：`string`

---

## 4. Tauri Event 接口（后端 → 前端）

### EVT-001：`clipboard:new-record`

```typescript
{ record: ClipboardRecordSummary; evicted_ids?: number[] }
```

### EVT-002：`clipboard:record-updated`

```typescript
{ reason: "promoted" | "thumbnail_ready" | "thumbnail_failed"; record: ClipboardRecordSummary }
```

### EVT-003：`clipboard:record-deleted`

```typescript
{ id: number; reason: "manual" | "retention" }
```

### EVT-004：`clipboard:history-cleared`

```typescript
{ deleted_records: number; deleted_image_assets: number; executed_at: number }
```

### EVT-005：`system:monitoring-changed`

```typescript
{ monitoring: boolean; state: MonitoringState; changed_at: number }
```

### EVT-006：`system:clear-history-requested`

```typescript
{ confirm_token: string }
```

### EVT-007：`system:launch-at-login-changed`

```typescript
{ enabled: boolean; changed_at: number }
```

---

## 5. 前端 API 封装层建议（`src/api/`）

### 5.1 `commands.ts`

建议新增：

```typescript
export const setMonitoring = (enabled: boolean) =>
  invoke<MonitoringStatus>("set_monitoring", { enabled });

export const getRuntimeStatus = () =>
  invoke<RuntimeStatus>("get_runtime_status");

export const clearHistory = (confirmToken: string) =>
  invoke<ClearHistoryResult>("clear_history", { confirm_token: confirmToken });

export const setLaunchAtLogin = (enabled: boolean) =>
  invoke<LaunchAtLoginStatus>("set_launch_at_login", { enabled });
```

### 5.2 `events.ts`

建议新增监听器：
- `listenMonitoringChanged`
- `listenHistoryCleared`
- `listenClearHistoryRequested`
- `listenLaunchAtLoginChanged`

---

## 6. 后端 Command 注册建议（`src-tauri/src/ipc/commands.rs`）

`v0.3` 需要在现有命令基础上新增注册：
- `set_monitoring`
- `clear_history`
- `get_launch_at_login_status`
- `set_launch_at_login`
- `get_runtime_status`

---

## 7. 与 v0.2 的主要差异

| 项目 | v0.2 | v0.3 |
|------|------|------|
| 历史记录 API | 已有 | 继续沿用 |
| 监听控制 API | 仅只读 `get_monitoring_status` | 新增 `set_monitoring` |
| 批量清理 API | 无 | 新增 `clear_history` |
| 自启动 API | 无 | 新增查询与切换接口 |
| 系统事件 | 仅历史事件 | 新增监听 / 自启动 / 清空历史事件 |
