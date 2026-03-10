# v1.4 API 契约文档

## 1. 文档概述

### 1.1 版本范围

本文档仅描述 `v1.4` 为支持类型扩展、模糊搜索、文本预览工作区与多屏定位所涉及的 API 契约结论。

### 1.2 通信机制

- 前端与后端继续通过 `Tauri Command` 通信
- 运行态同步继续通过 `Tauri Event` 订阅实现
- `v1.4` 相比 `v1.3` 建议新增**搜索查询**与**显示器定位**相关命令

### 1.3 通用约定

- API 必须显式区分 `payload_type` 与 `content_type`
- 主面板搜索与筛选结果应由后端查询能力或统一查询服务提供，避免前后端搜索规则不一致
- 文本预览的查找替换优先作为前端工作区能力，只有最终保存时才调用后端更新命令
- `plain_text` 粘贴语义优先由 `payload_type` 决定；`video / audio / document` 只要底层属于 `files`，`Shift+Enter` 就输出文件路径列表

---

## 2. 共享数据类型与前端派生类型

### 2.1 共享类型扩展

```ts
type PayloadType = "text" | "image" | "files";

type ContentType =
  | "text"
  | "image"
  | "files"
  | "link"
  | "video"
  | "audio"
  | "document";
```

### 2.2 `ClipboardRecordSummary`（`v1.4` 建议）

```ts
interface ClipboardRecordSummary {
  id: number;
  payload_type: PayloadType;
  content_type: ContentType;
  preview_text: string;
  searchable_text?: string | null;
  source_app?: string | null;
  source_app_id?: string | null;
  source_app_icon_key?: string | null;
  primary_uri?: string | null;
  created_at: number;
  last_used_at: number;
}
```

### 2.3 前端派生类型：`RecordTypeFilter`

```ts
type RecordTypeFilter =
  | "all"
  | "text"
  | "image"
  | "files"
  | "link"
  | "video"
  | "audio"
  | "document";
```

### 2.4 前端派生类型：`PanelSearchState`

```ts
interface PanelSearchState {
  query: string;
  activeType: RecordTypeFilter;
  resultCount: number;
  loading: boolean;
}
```

### 2.5 前端派生类型：`PreviewWorkspaceState`

```ts
interface PreviewWorkspaceState {
  recordId: number;
  contentType: ContentType;
  findText?: string;
  replaceText?: string;
  highlightMode?: "plain" | "code";
}
```

### 2.6 前端派生类型：`DisplayPlacementPayload`

```ts
interface DisplayPlacementPayload {
  panel_display_id?: string | null;
  pointer_x?: number | null;
  pointer_y?: number | null;
}
```

---

## 3. Tauri Command 接口（前端 → 后端）

### 3.1 沿用命令（`v1.4` 继续使用）

| Command | 输入 | 输出 | `v1.4` 用途 |
|---------|------|------|-------------|
| `get_record_detail` | `id` | `ClipboardRecordDetail` | 预览窗口按需拉取完整内容 |
| `update_text_record` | `id` + `text` | `ClipboardRecordDetail` | 文本替换或编辑后保存 |
| `paste_record` | `id` + `mode` | `PasteResult` | 搜索结果和筛选结果中的粘贴行为 |
| `delete_record` | `id` | `void` | 搜索结果、筛选结果中的删除 |
| `show_preview_window` | `recordId` + `placement?` | `void` | 打开独立预览窗口 |
| `close_preview_window_command` | - | `void` | 关闭独立预览窗口 |

补充约定：

- `paste_record(id, "plain_text")` 在 `payload_type = files` 时统一返回换行分隔的路径文本
- 因此 `content_type = video / audio / document / files` 的记录，只要底层是文件集合，`Shift+Enter` 与“纯文本粘贴”菜单项都走路径列表输出

### 3.2 建议新增命令：`search_records`

| Command | 输入 | 输出 | 说明 |
|---------|------|------|------|
| `search_records` | `query`、`type_filter`、`limit`、`offset?` | `ClipboardRecordSummary[]` | 按模糊搜索与类型筛选查询历史记录 |

输入示例：

```ts
{
  query: "github action",
  type_filter: "link",
  limit: 100,
  offset: 0
}
```

### 3.3 建议新增命令：`get_panel_display_context`

| Command | 输入 | 输出 | 说明 |
|---------|------|------|------|
| `get_panel_display_context` | - | `DisplayPlacementPayload` | 获取当前主面板所在屏幕及相关定位上下文 |

### 3.4 `show_preview_window` 在 `v1.4` 的语义扩展

- 输入可补充 `placement` 信息或由后端自行读取面板当前屏幕
- 若提供的显示器上下文失效，后端负责安全降级
- 打开失败时应返回结构化窗口错误，而不是静默回退

### 3.5 `v1.4` 命令结论

- `v1.4` 建议新增 `search_records` 与 `get_panel_display_context`
- `get_records(limit)` 可保留为默认列表初始化命令，但不再承担复杂搜索职责
- 文本预览中的查找替换不新增“replace”命令，仍复用 `update_text_record`

---

## 4. Tauri Event 接口（后端 → 前端）

### 4.1 继续沿用的事件

| Event | 说明 |
|------|------|
| `clipboard:new-record` | 新记录进入列表 |
| `clipboard:record-updated` | 记录摘要更新 |
| `clipboard:record-deleted` | 记录被删除 |
| `system:panel-visibility-changed` | 主面板显隐变化 |
| `window:preview-visibility-changed` | 预览窗口显隐变化 |

### 4.2 `v1.4` 建议新增事件

| Event | 说明 |
|------|------|
| `clipboard:record-classified` | 记录完成语义分类或重分类 |
| `window:preview-display-resolved` | 预览窗口最终定位到的屏幕已确定 |

### 4.3 `v1.4` 的事件消费重点

- `clipboard:new-record`：若当前存在搜索词，前端应重新评估该记录是否命中当前结果集
- `clipboard:record-updated`：文本替换保存后应同步刷新搜索索引、预览正文和主面板卡片
- `clipboard:record-classified`：若记录语义类型变化，应刷新类型色、筛选归属和搜索结果

---

## 5. 前端 API 封装层建议

- 在 `src/api/commands.ts` 中统一暴露 `searchRecords(query, typeFilter, limit, offset?)`
- 增加 `resolvePreviewPlacement()` 之类的封装，避免组件层自行拼装显示器上下文
- 增加 `adaptRecordSemanticType()` 适配函数，把后端字段稳定映射到前端 UI 语义

---

## 6. 兼容性约定

- 为了兼容旧记录，`payload_type` 缺失时可临时从旧 `content_type` 推导
- 若某平台无法稳定拿到来源应用图标，只允许降级为占位图，不允许影响列表与预览主链路
- 若当前运行环境无法提供显示器上下文，预览窗口仍必须可打开，只是定位降级
