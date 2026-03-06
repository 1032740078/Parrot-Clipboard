# v0.1 API 契约文档

## 1. 文档概述

### 1.1 版本范围

本文档定义 **v0.1 MVP 版本**前后端 IPC 通信的完整 API 契约，包括所有 Tauri Command（invoke）和 Event（listen）的接口规范。

### 1.2 通信机制

| 方向 | 机制 | 说明 |
|------|------|------|
| 前端 → 后端 | `invoke(command, args)` | 主动请求，类 RPC 调用，有返回值 |
| 后端 → 前端 | `emit(event, payload)` | 被动推送，事件驱动，无需等待 |

### 1.3 通用约定

- 所有参数和返回值使用 **JSON 序列化**（Rust serde_json）
- 字段命名统一使用 **snake_case**
- 时间戳统一使用 **Unix 毫秒整数**（i64）
- 枚举值使用**小写字符串**（如 `"text"`，`"original"`）
- 错误统一通过 Tauri 的 `Err` 返回机制传递，前端 invoke 会 reject Promise

---

## 2. 共享数据类型

### 2.1 ClipboardRecord（粘贴板记录）

所有 API 中传输的记录使用此统一类型。

```typescript
/**
 * 粘贴板记录（前后端共享类型）
 * 对应后端 Rust 结构体 ClipboardRecord
 */
interface ClipboardRecord {
  /** 记录唯一 ID（正整数，v0.1 内存自增） */
  id: number;

  /** 内容类型（v0.1 固定为 "text"） */
  content_type: 'text';

  /** 纯文本内容（content_type 为 text 时必填） */
  text_content: string;

  /** 捕获时间戳（Unix 毫秒） */
  created_at: number;
}
```

```rust
// 对应后端 Rust 类型（serde Serialize/Deserialize）
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ClipboardRecord {
    pub id: u64,
    pub content_type: String,   // "text"
    pub text_content: String,
    pub created_at: i64,
}
```

### 2.2 PasteMode（粘贴模式）

```typescript
/** 粘贴模式（v0.1 仅支持 original） */
type PasteMode = 'original';
// PlainText 模式在 v0.2 引入
```

---

## 3. Tauri Command 接口（前端 → 后端）

### CMD-001：get_records

获取最近的粘贴板历史记录列表。

**接口定义**：

```typescript
invoke('get_records', { limit: number }): Promise<ClipboardRecord[]>
```

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `limit` | `number` | 是 | 返回记录的最大数量，v0.1 建议传 20 |

**返回值**：

```typescript
ClipboardRecord[]
// 按 created_at 倒序排列，索引 0 为最新记录
// 数组长度 ≤ limit
```

**返回示例**：

```json
[
  {
    "id": 5,
    "content_type": "text",
    "text_content": "最新复制的内容",
    "created_at": 1709123456789
  },
  {
    "id": 4,
    "content_type": "text",
    "text_content": "上一条内容",
    "created_at": 1709123400000
  }
]
```

**错误情况**：

| 场景 | 错误码 | 错误消息 |
|------|--------|----------|
| limit 为 0 | `INVALID_PARAM` | `"limit must be > 0"` |
| limit 超过 1000 | `INVALID_PARAM` | `"limit must be <= 1000"` |

---

### CMD-002：delete_record

删除指定 ID 的粘贴板记录。

**接口定义**：

```typescript
invoke('delete_record', { id: number }): Promise<void>
```

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `number` | 是 | 要删除的记录 ID |

**返回值**：`void`（Promise 成功 resolve 即表示删除成功）

**错误情况**：

| 场景 | 错误码 | 错误消息 |
|------|--------|----------|
| 记录不存在 | `RECORD_NOT_FOUND` | `"Record with id {id} not found"` |

---

### CMD-003：paste_record

将指定记录的内容粘贴到当前活动应用。

**接口定义**：

```typescript
invoke('paste_record', {
  id: number,
  mode: PasteMode
}): Promise<void>
```

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `number` | 是 | 要粘贴的记录 ID |
| `mode` | `PasteMode` | 是 | 粘贴模式，v0.1 仅接受 `"original"` |

**返回值**：`ClipboardRecord`

- 含义：粘贴成功后，被置顶到列表最左侧的那条记录（沿用原有 `id`）

**副作用（按执行顺序）**：

1. 暂停粘贴板监听（防止触发新记录）
2. 将记录文本写入系统粘贴板
3. 同步监听器快照，避免把应用自身写入再次捕获
4. 隐藏主面板窗口
5. 模拟 Cmd+V 按键
6. 将该记录移动到历史列表最前面
7. 恢复粘贴板监听

**错误情况**：

| 场景 | 错误码 | 错误消息 |
|------|--------|----------|
| 记录不存在 | `RECORD_NOT_FOUND` | `"Record with id {id} not found"` |
| 粘贴板写入失败 | `CLIPBOARD_WRITE_ERROR` | `"Failed to write to clipboard"` |
| 按键模拟失败 | `KEY_SIM_ERROR` | `"Failed to simulate paste key"` |
| mode 不合法 | `INVALID_PARAM` | `"Unsupported paste mode: {mode}"` |

---

### CMD-004：hide_panel

隐藏主面板窗口（不执行粘贴操作，仅隐藏）。

**接口定义**：

```typescript
invoke('hide_panel'): Promise<void>
```

**参数**：无

**返回值**：`void`

**使用场景**：用户按 Esc 键或点击面板外区域时调用。

**错误情况**：

| 场景 | 错误码 | 错误消息 |
|------|--------|----------|
| 窗口管理器错误 | `WINDOW_ERROR` | `"Failed to hide panel window"` |

---

### CMD-005：get_monitoring_status

获取当前粘贴板监听状态。

**接口定义**：

```typescript
invoke('get_monitoring_status'): Promise<boolean>
```

**参数**：无

**返回值**：

```typescript
boolean
// true = 正在监听
// false = 已暂停
```

---

## 4. Tauri Event 接口（后端 → 前端）

### EVT-001：clipboard:new-record

当监听模块捕获到新的文本，或命中已有文本并将原记录置顶时触发。

**事件名**：`clipboard:new-record`

**Payload 类型**：

```typescript
interface NewRecordPayload {
  record: ClipboardRecord;
  /** 是否有旧记录因数量上限被淘汰（用于前端同步删除） */
  evicted_id?: number;
}
```

**监听示例**（前端）：

```typescript
import { listen } from '@tauri-apps/api/event';

const unlisten = await listen<NewRecordPayload>('clipboard:new-record', (event) => {
  const { record, evicted_id } = event.payload;

  // 将新记录插入列表头部
  useClipboardStore.getState().addRecord(record);

  // 若有被淘汰的记录，同步从列表移除
  if (evicted_id !== undefined) {
    useClipboardStore.getState().removeRecord(evicted_id);
  }
});
```

**触发时机**：

- 监听服务检测到粘贴板 changeCount 变化
- 新内容为文本类型
- 若内容为全新文本，则新增记录并触发事件
- 若内容命中旧记录，则复用原记录并触发事件以通知前端将其置顶

---

### EVT-002：clipboard:record-deleted

当记录被删除时触发（主动删除或因淘汰而删除）。

**事件名**：`clipboard:record-deleted`

**Payload 类型**：

```typescript
interface RecordDeletedPayload {
  id: number;
}
```

**监听示例**（前端）：

```typescript
const unlisten = await listen<RecordDeletedPayload>('clipboard:record-deleted', (event) => {
  useClipboardStore.getState().removeRecord(event.payload.id);
});
```

**触发时机**：

- 后端收到 `delete_record` Command 并成功删除
- 注意：因淘汰产生的删除通过 `clipboard:new-record` 的 `evicted_id` 字段传递，不重复触发本事件

---

## 5. 前端 API 封装层（src/api/）

所有 IPC 调用必须通过此封装层调用，禁止在组件中直接调用 `invoke`。

### commands.ts

```typescript
// src/api/commands.ts
import { invoke } from '@tauri-apps/api/core';
import type { ClipboardRecord, PasteMode } from '../types/clipboard';

/** CMD-001：获取最近记录列表 */
export async function getRecords(limit: number = 20): Promise<ClipboardRecord[]> {
  return invoke<ClipboardRecord[]>('get_records', { limit });
}

/** CMD-002：删除指定记录 */
export async function deleteRecord(id: number): Promise<void> {
  return invoke<void>('delete_record', { id });
}

/** CMD-003：粘贴指定记录 */
export async function pasteRecord(id: number, mode: PasteMode = 'original'): Promise<void> {
  return invoke<void>('paste_record', { id, mode });
}

/** CMD-004：隐藏面板 */
export async function hidePanel(): Promise<void> {
  return invoke<void>('hide_panel');
}

/** CMD-005：获取监听状态 */
export async function getMonitoringStatus(): Promise<boolean> {
  return invoke<boolean>('get_monitoring_status');
}
```

### events.ts

```typescript
// src/api/events.ts
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { ClipboardRecord } from '../types/clipboard';

export interface NewRecordPayload {
  record: ClipboardRecord;
  evicted_id?: number;
}

export interface RecordDeletedPayload {
  id: number;
}

/** EVT-001：监听新记录事件 */
export async function onNewRecord(
  handler: (payload: NewRecordPayload) => void
): Promise<UnlistenFn> {
  return listen<NewRecordPayload>('clipboard:new-record', (e) => handler(e.payload));
}

/** EVT-002：监听记录删除事件 */
export async function onRecordDeleted(
  handler: (payload: RecordDeletedPayload) => void
): Promise<UnlistenFn> {
  return listen<RecordDeletedPayload>('clipboard:record-deleted', (e) => handler(e.payload));
}
```

---

## 6. 后端 Command 注册（src-tauri/src/ipc/commands.rs）

```rust
use tauri::State;
use crate::clipboard::repository::ClipboardRecordRepository;
use crate::paste::PasteService;
use crate::window::WindowManager;

/// CMD-001
#[tauri::command]
pub async fn get_records(
    limit: usize,
    repository: State<'_, Arc<dyn ClipboardRecordRepository>>,
) -> Result<Vec<ClipboardRecord>, AppError> {
    if limit == 0 || limit > 1000 {
        return Err(AppError::InvalidParam("limit must be > 0 and <= 1000".into()));
    }
    Ok(repository.get_recent(limit))
}

/// CMD-002
#[tauri::command]
pub async fn delete_record(
    id: u64,
    repository: State<'_, Arc<dyn ClipboardRecordRepository>>,
    app: tauri::AppHandle,
) -> Result<(), AppError> {
    let deleted = repository.delete(RecordId::new(id));
    if !deleted {
        return Err(AppError::RecordNotFound(id));
    }
    emit_record_deleted(&app, id);
    Ok(())
}

/// CMD-003
#[tauri::command]
pub async fn paste_record(
    id: u64,
    mode: String,
    paste_service: State<'_, Arc<PasteService>>,
) -> Result<(), AppError> {
    let paste_mode = match mode.as_str() {
        "original" => PasteMode::Original,
        other => return Err(AppError::InvalidParam(format!("Unsupported mode: {}", other))),
    };
    paste_service.paste(RecordId::new(id), paste_mode).await
}

/// CMD-004
#[tauri::command]
pub async fn hide_panel(
    window_manager: State<'_, Arc<dyn WindowManager>>,
) -> Result<(), AppError> {
    window_manager.hide().map_err(AppError::WindowError)
}

/// CMD-005
#[tauri::command]
pub async fn get_monitoring_status(
    monitor: State<'_, Arc<ClipboardMonitorService>>,
) -> Result<bool, AppError> {
    Ok(monitor.is_running())
}
```

---

## 7. 版本变更记录

| 版本 | 变更内容 |
|------|----------|
| v0.1 | 初始版本，定义 5 个 Command + 2 个 Event |
| v0.2（预告） | 新增 `get_image_thumbnail`、`search_records`、`pause_monitoring`、`resume_monitoring` 等接口 |

---

**文档版本**：v1.0
**编写日期**：2026-03-05
**版本范围**：v0.1 MVP
**文档状态**：已完成
