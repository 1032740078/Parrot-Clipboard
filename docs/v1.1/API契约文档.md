# v1.1 API 契约文档

## 1. 文档概述

### 1.1 版本范围

`v1.1` API 契约在 `v1.0` 基线之上，只描述当前版本 **新增或语义调整** 的命令、事件与数据类型。

### 1.2 通信机制

- 前端通过 `Tauri Command` 调用后端能力
- 后端通过 `Tauri Event` 向前端广播运行态变化
- `v1.1` 的关键新增是：把 **面板显隐变化** 显式事件化，避免前端自行猜测窗口状态

### 1.3 通用约定

- 所有新增字段使用 `snake_case`
- `Command + 数字` 快贴仍复用既有 `paste_record` 命令，不新增专用粘贴命令
- 当前版本只对 `macOS` 启用 `Command + 1~9` 快贴，其他平台保持原行为

---

## 2. 共享数据类型

### 2.1 `PanelVisibilityReason`

```ts
export type PanelVisibilityReason =
  | "toggle_shortcut"
  | "focus_lost"
  | "escape"
  | "paste_completed"
  | "quick_paste"
  | "external_hide";
```

说明：主面板显隐变化原因枚举，用于日志、前端状态同步与自动化验收。

### 2.2 `PanelVisibilityChangedPayload`

```ts
export interface PanelVisibilityChangedPayload {
  panel_visible: boolean;
  reason: PanelVisibilityReason;
  record_id?: number | null;
}
```

字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `panel_visible` | `boolean` | 主面板当前是否可见 |
| `reason` | `PanelVisibilityReason` | 本次显隐变化原因 |
| `record_id` | `number?` | 当原因为 `quick_paste / paste_completed` 时，可选回传对应记录 |

---

## 3. Tauri Command 接口（前端 → 后端）

### 3.1 沿用命令（v1.1 语义更新）

| Command | 说明 | 请求 | 响应 |
|---------|------|------|------|
| `paste_record` | 执行记录粘贴；`v1.1` 新增被 `Command + 数字` 触发的调用路径 | `{ id, mode }` | `PasteResult` |
| `hide_panel` | 主动隐藏主面板；`v1.1` 用于与失焦自动隐藏后的前端收敛配合 | `void` | `void` |
| `get_runtime_status` | 读取当前运行态；字段保持兼容 | `void` | `RuntimeStatus` |

### 3.2 `v1.1` 命令结论

- **不新增 IPC Command**
- 快贴能力由前端键盘层解析后，直接复用 `paste_record`
- 自动隐藏由窗口层或事件层触发，不需要新增 `auto_hide_panel` 命令

---

## 4. Tauri Event 接口（后端 → 前端）

### 4.1 新增事件

#### EVT-111：`system:panel-visibility-changed`

用途：在原生窗口显示、隐藏或因失焦自动隐藏后，通知前端同步 `UIStore / SystemStore`。

**Payload**：`PanelVisibilityChangedPayload`

**触发时机**：

- 主面板通过全局快捷键显示
- 用户按 `Esc` 主动隐藏
- 主面板失去焦点后自动隐藏
- 粘贴成功后自动隐藏
- `Command + 数字` 快贴成功后自动隐藏

### 4.2 沿用事件

| 事件名 | 本版用途 |
|--------|----------|
| `clipboard:new-record` | 仍用于实时插入新记录 |
| `clipboard:record-updated` | 粘贴成功置顶后继续复用 |
| `clipboard:record-deleted` | 删除记录后继续复用 |
| `system:monitoring-changed` | 与本版无直接变化 |
| `system:settings-updated` | 与本版无直接变化 |

---

## 5. 前端 API 封装层建议

| 文件 | 职责 |
|------|------|
| `src/api/commands.ts` | 继续承接 `paste_record / hide_panel / get_runtime_status` |
| `src/api/events.ts` | 新增 `onPanelVisibilityChanged` 订阅封装 |
| `src/hooks/useKeyboard.ts` | 解析 `Command + 数字` 与 `1~9` 的差异语义 |
| `src/components/MainPanel/CardList.tsx` | 实现 `ensure visible` 的自动滚动策略 |

---

## 6. 兼容性约定

- 现有 `v1.0` 前端若不订阅 `system:panel-visibility-changed`，仍可继续运行，但会失去 `v1.1` 的显隐状态一致性保障
- 当前版本不修改 `paste_record` 的请求与响应结构，因此老测试夹具可直接复用
- `Command + 数字` 快贴属于前端手势层扩展，不影响后端存储与数据契约
