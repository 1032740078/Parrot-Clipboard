# v1.2 API 契约文档

## 1. 文档概述

### 1.1 版本范围

`v1.2` API 契约在 `v1.1` 基线之上，只描述当前版本**语义变化**与**前端派生约定**，不引入新的后端 IPC 命令族。

### 1.2 通信机制

- 前端继续通过 `Tauri Command` 调用后端能力
- 后端继续通过 `Tauri Event` 向前端广播记录更新与运行态变化
- `v1.2` 的核心变化主要发生在前端交互层：**鼠标双击也会复用 `paste_record`**，图片预览需要在前端做更稳健的资源解析与回退

### 1.3 通用约定

- 当前版本不新增数据库相关 IPC
- 当前版本不新增设置保存命令，设置页只是重组信息架构
- `1~9` / `Command + 1~9` 的“目标记录解析”改为基于**当前可视区域槽位映射**，但最终执行仍然传真实 `record_id`

---

## 2. 共享数据类型与前端派生类型

### 2.1 继续沿用的共享类型

| 类型 | 本版用途 |
|------|----------|
| `ClipboardRecordSummary` | 主面板卡片渲染与快捷编号映射 |
| `ClipboardRecordDetail` | 图片预览回退时提供 `image_detail.original_path` |
| `PasteResult` | 双击粘贴、快捷粘贴与 `Enter` 粘贴的统一结果 |
| `SettingsSnapshot` | 设置页内容渲染 |
| `PlatformCapabilities` | 会话能力独立分组展示 |

### 2.2 前端派生类型：`SelectionSource`

> 该类型属于前端运行态，不通过 IPC 直接传输。

```ts
export type SelectionSource = "keyboard" | "mouse" | "quick_slot";
```

### 2.3 前端派生类型：`VisibleQuickSlot`

> 该类型属于前端运行态，用于把当前视口中的卡片映射到 `1~9`。

```ts
export interface VisibleQuickSlot {
  slot: number;
  record_id: number;
  absolute_index: number;
}
```

### 2.4 前端派生类型：`PreviewSource`

```ts
export type PreviewSourceKind = "thumbnail" | "original" | "placeholder";

export interface PreviewSource {
  kind: PreviewSourceKind;
  path?: string | null;
}
```

---

## 3. Tauri Command 接口（前端 → 后端）

### 3.1 沿用命令（v1.2 语义更新）

| Command | 说明 | 请求 | 响应 |
|---------|------|------|------|
| `paste_record` | 继续执行粘贴；`v1.2` 新增被**鼠标双击**和**可视槽位快贴**触发的调用路径 | `{ id, mode }` | `PasteResult` |
| `get_record_detail` | 继续读取详情；`v1.2` 新增作为图片预览原图回退的数据来源 | `{ id }` | `ClipboardRecordDetail` |
| `get_settings_snapshot` | 结构不变；`v1.2` 用于设置页左右布局渲染 | `void` | `SettingsSnapshot` |
| `get_platform_capabilities` | 结构不变；`v1.2` 用于独立“会话能力”分组 | `void` | `PlatformCapabilities` |
| `hide_panel` | 行为不变；双击粘贴成功后仍复用既有隐藏逻辑 | `void` | `void` |

### 3.2 `paste_record` 在 `v1.2` 的新增触发源

| 触发源 | 是否新增 | 说明 |
|--------|----------|------|
| `Enter` | 否 | 沿用既有主粘贴语义 |
| `Shift + Enter` | 否 | 沿用纯文本粘贴语义 |
| `Command + 1~9` | 否（语义更新） | 仍然快贴，但目标记录从“绝对前 9 条”改为“当前可视槽位 1~9” |
| 鼠标双击卡片 | 是 | 双击后直接调用同一个 `paste_record` |

### 3.3 `v1.2` 命令结论

- **不新增 IPC Command**
- 鼠标双击与可视区域快贴只改变前端目标记录解析方式
- 图片预览修复优先在前端完成 `thumbnail -> original -> placeholder` 回退，不新增 `get_preview_src` 之类专用命令

---

## 4. Tauri Event 接口（后端 → 前端）

### 4.1 沿用事件

| 事件名 | 本版用途 |
|--------|----------|
| `clipboard:new-record` | 新记录插入后，重新参与可视槽位计算 |
| `clipboard:record-updated` | 图片缩略图从 `pending` 进入 `ready / failed` 时刷新预览 |
| `clipboard:record-deleted` | 删除后重新收敛选中态与可视槽位 |
| `system:panel-visibility-changed` | 双击粘贴与快贴完成后继续同步显隐状态 |
| `system:settings-updated` | 设置保存后继续刷新双栏内容，不改变分组契约 |

### 4.2 `clipboard:record-updated` 的 `v1.2` 使用重点

- 当前版本重点关注 `reason = thumbnail_ready / thumbnail_failed`
- 前端收到该事件后，需要重新解析图片卡片的 `PreviewSource`
- 缩略图失败不是致命错误，允许自动回退到原图或占位态

---

## 5. 前端 API 封装层建议

| 文件 | 职责 |
|------|------|
| `src/api/commands.ts` | 继续承接 `paste_record / get_record_detail / get_platform_capabilities` |
| `src/api/events.ts` | 订阅 `clipboard:record-updated`，驱动图片预览刷新 |
| `src/hooks/useKeyboard.ts` | 消费 `VisibleQuickSlot` 映射，处理 `1~9 / Command + 1~9` |
| `src/components/MainPanel/CardList.tsx` | 计算当前可视槽位窗口 |
| `src/components/MainPanel/ImageCard.tsx` | 根据 `PreviewSource` 渲染图片预览 |

---

## 6. 兼容性约定

- `v1.1` 前端若继续使用“绝对前 9 条”映射，在横向滚动后会与 `v1.2` 预期不一致
- `v1.2` 不要求后端同步升级新命令，因此老版本后端在契约层仍可兼容运行
- `SettingsSnapshot` 与 `PlatformCapabilities` 字段不变，兼容风险主要集中在前端展示层
