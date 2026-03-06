# v0.2 API 契约文档

## 1. 文档概述

### 1.1 版本范围

本文档定义 **v0.2 Alpha 版本** 的前后端 IPC 契约，仅覆盖主面板与粘贴板历史相关接口。

### 1.2 通信机制

- 前端通过 Tauri `invoke()` 调用 Command
- 后端通过 Tauri `emit()` 向前端推送 Event
- 所有时间字段统一使用 Unix 毫秒时间戳
- 所有 JSON 字段统一使用 `snake_case`

### 1.3 通用约定

| 约定 | 说明 |
|------|------|
| 内容类型 | `text` / `image` / `files` |
| 粘贴模式 | `original` / `plain_text` |
| 列表接口 | 仅返回卡片渲染所需摘要，不返回大体积原图字节 |
| 详情接口 | 返回按类型展开的完整负载 |

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

### 2.3 `ClipboardRecordSummary`

```typescript
interface ClipboardRecordSummary {
  id: number;
  content_type: ContentType;
  preview_text: string;
  source_app?: string | null;
  created_at: number;
  last_used_at: number;
  text_meta?: {
    char_count: number;
    line_count: number;
  } | null;
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

### 2.4 `ClipboardRecordDetail`

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

### 2.5 `PasteResult`

```typescript
interface PasteResult {
  record: ClipboardRecordSummary;
  paste_mode: PasteMode;
  executed_at: number;
}
```

---

## 3. Tauri Command 接口（前端 → 后端）

### CMD-001：`get_records`

**用途**：获取主面板初始渲染所需的历史摘要列表。

**参数**：

```typescript
{ limit: number }
```

**返回值**：

```typescript
ClipboardRecordSummary[]
```

**约束**：
- `limit` 必须大于 `0` 且不超过 `500`
- 按 `last_used_at DESC, id DESC` 返回

**示例返回**：

```json
[
  {
    "id": 101,
    "content_type": "image",
    "preview_text": "屏幕截图 2026-03-06 10.13.22",
    "created_at": 1772753602000,
    "last_used_at": 1772753602000,
    "image_meta": {
      "mime_type": "image/png",
      "pixel_width": 1792,
      "pixel_height": 1120,
      "thumbnail_path": "/app/images/thumbs/abc.png",
      "thumbnail_state": "ready"
    }
  }
]
```

### CMD-002：`get_record_detail`

**用途**：获取单条记录的完整详情，用于粘贴、调试或后续扩展。

**参数**：

```typescript
{ id: number }
```

**返回值**：

```typescript
ClipboardRecordDetail
```

### CMD-003：`delete_record`

**用途**：删除单条历史记录及其关联资源。

**参数**：

```typescript
{ id: number }
```

**返回值**：

```typescript
void
```

### CMD-004：`paste_record`

**用途**：恢复记录到系统粘贴板并执行粘贴。

**参数**：

```typescript
{ id: number; mode: PasteMode }
```

**返回值**：

```typescript
PasteResult
```

**约束**：
- `plain_text` 仅允许 `text` 类型记录
- 成功后后端必须显式置顶该记录并返回新的 `record` 摘要

### CMD-005：`hide_panel`

**用途**：显式关闭主面板。

**参数**：无

**返回值**：`void`

### CMD-006：`get_monitoring_status`

**用途**：读取当前监听状态。

**参数**：无

**返回值**：

```typescript
{ monitoring: boolean }
```

---

## 4. Tauri Event 接口（后端 → 前端）

### EVT-001：`clipboard:new-record`

**用途**：新增记录或首次捕获成功后通知前端。

**Payload**：

```typescript
{
  record: ClipboardRecordSummary;
  evicted_ids?: number[];
}
```

### EVT-002：`clipboard:record-updated`

**用途**：记录被复用置顶、缩略图状态变化或摘要刷新时通知前端。

**Payload**：

```typescript
{
  reason: "promoted" | "thumbnail_ready" | "thumbnail_failed";
  record: ClipboardRecordSummary;
}
```

### EVT-003：`clipboard:record-deleted`

**用途**：记录被用户删除或自动清理时通知前端。

**Payload**：

```typescript
{
  id: number;
  reason: "manual" | "retention";
}
```

---

## 5. 前端 API 封装层（`src/api/`）

### 5.1 `commands.ts`

建议暴露以下封装：

```typescript
export function getRecords(limit = 100): Promise<ClipboardRecordSummary[]>;
export function getRecordDetail(id: number): Promise<ClipboardRecordDetail>;
export function deleteRecord(id: number): Promise<void>;
export function pasteRecord(id: number, mode: PasteMode): Promise<PasteResult>;
export function hidePanel(): Promise<void>;
export function getMonitoringStatus(): Promise<{ monitoring: boolean }>;
```

### 5.2 `events.ts`

建议暴露以下订阅函数：

```typescript
export function onNewRecord(
  handler: (payload: { record: ClipboardRecordSummary; evicted_ids?: number[] }) => void,
): Promise<UnlistenFn>;

export function onRecordUpdated(
  handler: (payload: { reason: "promoted" | "thumbnail_ready" | "thumbnail_failed"; record: ClipboardRecordSummary }) => void,
): Promise<UnlistenFn>;

export function onRecordDeleted(
  handler: (payload: { id: number; reason: "manual" | "retention" }) => void,
): Promise<UnlistenFn>;
```

---

## 6. 后端 Command 注册建议（`src-tauri/src/ipc/commands.rs`）

`v0.2` 需要在现有基础上扩展：
- `get_record_detail`
- `paste_record` 返回 `PasteResult`
- `get_monitoring_status` 返回对象而不是裸布尔值，方便未来扩展

---

## 7. 版本变更记录

| 项目 | v0.1 | v0.2 |
|------|------|------|
| 内容类型 | 仅文本 | 文本 + 图片 + 文件 |
| 列表返回 | 简单文本记录 | 混合摘要 DTO |
| 详情接口 | 无 | 新增 `get_record_detail` |
| 事件类型 | 新增、删除 | 新增、更新、删除 |
| 粘贴返回 | 记录本身 | `PasteResult` |
