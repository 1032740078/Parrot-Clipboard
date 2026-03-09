# v1.3 API 契约文档

## 1. 文档概述

### 1.1 版本范围

本文档仅描述 `v1.3` 为支持空格聚焦预览、右键上下文菜单与主面板视觉升级所涉及的 API 契约结论。

### 1.2 通信机制

- 前端与后端继续通过 `Tauri Command` 通信
- 运行态同步继续通过 `Tauri Event` 订阅实现
- `v1.3` 以**复用既有命令**为原则，不新增后端 IPC 命令

### 1.3 通用约定

- 菜单动作与键盘动作必须落到同一条业务命令语义上，避免分叉实现
- 预览层属于前端运行态视图，不单独要求后端维护“预览打开中”状态
- 若动作失败，主面板与预览层应尽量保持可恢复状态，而不是直接强制关闭

---

## 2. 共享数据类型与前端派生类型

### 2.1 继续沿用的共享类型

| 类型 | 用途 |
|------|------|
| `ClipboardRecordSummary` | 主列表卡片展示 |
| `ClipboardRecordDetail` | 预览层完整内容展示 |
| `PasteMode` | `original / plain_text` |
| `PanelVisibilityReason` | 面板显隐原因 |
| `RecordUpdatedPayload` | 记录更新事件 |
| `RecordDeletedPayload` | 记录删除事件 |

### 2.2 前端派生类型：`PreviewOpenTrigger`

```ts
type PreviewOpenTrigger = "keyboard_space" | "context_menu";
```

### 2.3 前端派生类型：`PreviewOverlayState`

```ts
interface PreviewOverlayState {
  visible: boolean;
  recordId: number;
  absoluteIndex: number;
  trigger: PreviewOpenTrigger;
  loading: boolean;
  errorMessage?: string;
}
```

### 2.4 前端派生类型：`ContextMenuAction`

```ts
type ContextMenuAction =
  | "preview"
  | "paste"
  | "paste_plain_text"
  | "delete";
```

### 2.5 前端派生类型：`ContextMenuState`

```ts
interface ContextMenuState {
  visible: boolean;
  recordId: number;
  absoluteIndex: number;
  anchorX: number;
  anchorY: number;
  actions: Array<{
    key: ContextMenuAction;
    enabled: boolean;
    danger?: boolean;
  }>;
}
```

---

## 3. Tauri Command 接口（前端 → 后端）

### 3.1 沿用命令（`v1.3` 语义更新）

| Command | 输入 | 输出 | `v1.3` 用途 |
|---------|------|------|-------------|
| `get_records` | `limit` | `ClipboardRecordSummary[]` | 主面板卡片列表继续使用摘要数据 |
| `get_record_detail` | `id` | `ClipboardRecordDetail` | 预览层按需拉取完整内容 |
| `paste_record` | `id` + `mode` | `PasteResult` | 菜单粘贴与键盘粘贴统一复用 |
| `delete_record` | `id` | `void` | 菜单删除动作复用 |
| `hide_panel` | `reason?` | `void` | 粘贴成功后保持既有隐藏逻辑 |

### 3.2 `get_record_detail` 在 `v1.3` 的新增使用重点

- 文本卡片：用于获取完整文本内容，而不是仅显示列表截断摘要
- 图片卡片：用于获得原图、缩略图、尺寸等完整预览信息
- 文件卡片：用于获得完整文件数量与文件项明细
- 详情读取只在打开预览时按需触发，不在列表初始化时批量调用

### 3.3 `paste_record` 在 `v1.3` 的新增触发源

| 触发源 | 模式 | 说明 |
|--------|------|------|
| `Enter` | `original` | 已有键盘粘贴 |
| `Shift + Enter` | `plain_text` | 已有文本纯文本粘贴 |
| `Command + 数字` | `original` | 已有可视区域快贴 |
| `右键菜单 -> 直接粘贴` | `original` | `v1.3` 新增鼠标操作入口 |
| `右键菜单 -> 纯文本粘贴` | `plain_text` | `v1.3` 新增鼠标操作入口，仅文本卡片可用 |

### 3.4 `delete_record` 在 `v1.3` 的新增触发源

- 既有 `Delete / Backspace` 快捷键删除继续保留
- `v1.3` 新增 `右键菜单 -> 删除记录` 作为鼠标删除入口

### 3.5 `v1.3` 命令结论

- `v1.3` **不新增 IPC 命令**
- 所有新增交互都建立在既有 `get_record_detail / paste_record / delete_record / hide_panel` 之上
- 风险主要集中在前端状态编排，而不是后端命令面扩张

---

## 4. Tauri Event 接口（后端 → 前端）

### 4.1 沿用事件

| Event | 说明 |
|------|------|
| `clipboard:new-record` | 新记录进入列表 |
| `clipboard:record-updated` | 记录摘要更新 |
| `clipboard:record-deleted` | 记录被删除 |
| `system:panel-visibility-changed` | 主面板显隐变化 |

### 4.2 `v1.3` 的事件消费重点

- `clipboard:record-deleted`：若被删除的记录正处于预览中或菜单打开中，应自动关闭相应 UI
- `clipboard:record-updated`：若预览中的记录被更新，可刷新预览头部摘要或详情读取时机
- `clipboard:new-record`：不打断当前预览；若主面板仍可见，列表按既有策略更新

---

## 5. 前端 API 封装层建议

- 继续统一从 `src/api/commands.ts` 发起后端调用
- 新增 `executeContextMenuAction(action, record)` 一类前端服务函数，避免组件层直接分支命令
- 新增 `loadPreviewDetail(recordId)` 一类前端查询函数，用于预览层收敛详情获取、错误处理与缓存策略

---

## 6. 兼容性约定

- 未支持 `plain_text` 的记录类型必须在前端先做禁用处理，不应依赖用户点了以后才报错
- `v1.3` 视觉升级不应改变既有 `Tauri Command` 的参数结构或返回结构
- 若某些平台背景模糊表现有限，也必须保证主面板至少具备半透明与清晰对比度，而不是退化为不可读界面
