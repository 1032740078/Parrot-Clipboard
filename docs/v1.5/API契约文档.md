# v1.5 API 契约文档

## 1. 文档概述

### 1.1 版本范围

本文档仅描述 `v1.5` 为支持音效反馈、预览联动、音频 / 视频 / 文稿 / 超链接预览所涉及的 API 契约结论。

### 1.2 通信机制

- 前端与后端继续通过 `Tauri Command` 通信
- 运行态同步继续通过 `Tauri Event` 订阅实现
- `v1.5` 相比 `v1.4` 重点扩展详情类型、预览状态事件与预览资源准备命令

### 1.3 通用约定

- API 必须继续显式区分 `payload_type` 与 `content_type`
- `content_type = link` 时底层 `payload_type` 继续保持 `text`
- `content_type = video / audio / document` 时底层 `payload_type` 继续保持 `files`
- `show_preview_window` 在 `v1.5` 中不仅承担“打开预览”，也承担“预览窗口存在时切换目标记录”的语义
- 音效由后端或统一服务层在成功事件后触发，不新增“让前端主动播放音效”的公开业务命令

---

## 2. 共享数据类型与前端派生类型

### 2.1 新增共享类型

```ts
type PreviewStatus = "pending" | "ready" | "failed" | "unsupported";

type PreviewRenderer =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "pdf"
  | "document"
  | "link"
  | "file_list"
  | "summary";
```

### 2.2 `AudioPreviewDetail`

```ts
interface AudioPreviewDetail {
  src: string;
  mime_type?: string | null;
  duration_ms?: number | null;
  byte_size?: number | null;
}
```

### 2.3 `VideoPreviewDetail`

```ts
interface VideoPreviewDetail {
  src: string;
  mime_type?: string | null;
  duration_ms?: number | null;
  pixel_width?: number | null;
  pixel_height?: number | null;
  poster_path?: string | null;
}
```

### 2.4 `DocumentPreviewDetail`

```ts
interface DocumentPreviewDetail {
  document_kind: "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx";
  preview_status: PreviewStatus;
  page_count?: number | null;
  sheet_names?: string[] | null;
  slide_count?: number | null;
  html_path?: string | null;
  text_content?: string | null;
}
```

### 2.5 `LinkPreviewDetail`

```ts
interface LinkPreviewDetail {
  url: string;
  title?: string | null;
  site_name?: string | null;
  description?: string | null;
  cover_image?: string | null;
  content_text?: string | null;
  fetched_at?: number | null;
}
```

### 2.6 `ClipboardRecordDetail`（`v1.5` 建议扩展）

```ts
interface ClipboardRecordDetail extends ClipboardRecordSummary {
  text_content?: string | null;
  rich_content?: string | null;
  image_detail?: ImageDetail | null;
  files_detail?: FilesDetail | null;
  primary_uri?: string | null;
  preview_renderer?: PreviewRenderer | null;
  preview_status?: PreviewStatus | null;
  preview_error_code?: string | null;
  preview_error_message?: string | null;
  audio_detail?: AudioPreviewDetail | null;
  video_detail?: VideoPreviewDetail | null;
  document_detail?: DocumentPreviewDetail | null;
  link_detail?: LinkPreviewDetail | null;
}
```

### 2.7 前端派生类型：`PreviewSessionState`

```ts
interface PreviewSessionState {
  recordId: number;
  visible: boolean;
  followSelection: boolean;
  renderer: PreviewRenderer;
  status: PreviewStatus;
}
```

---

## 3. Tauri Command 接口（前端 → 后端）

### 3.1 沿用命令（`v1.5` 继续使用）

| Command | 输入 | 输出 | `v1.5` 用途 |
|---------|------|------|-------------|
| `get_record_detail` | `id` | `ClipboardRecordDetail` | 返回扩展后的详情与预览信息 |
| `paste_record` | `id` + `mode` | `PasteResult` | 粘贴成功后触发音效 |
| `show_preview_window` | `recordId` | `void` | 打开预览或切换当前预览目标 |
| `close_preview_window_command` | - | `void` | 关闭预览并结束联动会话 |
| `update_text_record` | `id` + `text` | `ClipboardRecordDetail` | 继续承接文本编辑与保存 |

### 3.2 建议新增命令：`prepare_record_preview`

| Command | 输入 | 输出 | 说明 |
|---------|------|------|------|
| `prepare_record_preview` | `id` | `PreviewPreparationResult` | 为 `audio / video / document / link` 预先准备预览资源 |

建议返回：

```ts
interface PreviewPreparationResult {
  id: number;
  preview_status: PreviewStatus;
  renderer: PreviewRenderer;
  updated_at: number;
}
```

### 3.3 `show_preview_window` 在 `v1.5` 的语义扩展

- 当预览窗口不存在时：创建窗口并显示对应记录
- 当预览窗口已存在但当前不可见时：恢复显示并加载目标记录
- 当预览窗口已存在且当前可见时：只切换 `recordId`，不新建窗口
- 目标切换失败时应返回结构化错误，而不是静默保留旧内容

### 3.4 `get_record_detail` 的扩展结论

- 不建议新增 `get_audio_detail`、`get_video_detail`、`get_document_detail` 等碎片化命令
- `v1.5` 建议继续以 `get_record_detail` 作为统一详情入口，并在返回结构中补齐多类型预览字段
- 对于耗时资源，允许 `get_record_detail` 先返回 `preview_status = pending`，再通过事件通知刷新

---

## 4. Tauri Event 接口（后端 → 前端）

### 4.1 继续沿用的事件

| Event | 说明 |
|------|------|
| `clipboard:new-record` | 新记录进入列表 |
| `clipboard:record-updated` | 记录摘要更新 |
| `clipboard:record-deleted` | 记录被删除 |
| `system:preview-window-requested` | 当前预览目标记录变更 |
| `system:preview-window-visibility-changed` | 预览窗口显隐变化 |

### 4.2 `v1.5` 建议新增事件

| Event | 说明 |
|------|------|
| `clipboard:preview-asset-updated` | 某条记录的预览资源状态已更新 |
| `clipboard:preview-asset-failed` | 某条记录的预览资源准备失败 |

### 4.3 `v1.5` 的事件消费重点

- `clipboard:new-record`：若复制成功，应允许后端内部触发复制音效，不要求前端额外命令
- `system:preview-window-requested`：既表示首次打开，也表示预览联动切换目标记录
- `clipboard:preview-asset-updated`：当前预览目标命中该记录时，前端应刷新当前渲染器与正文

---

## 5. 前端 API 封装层建议

- 在 `src/api/commands.ts` 中新增 `prepareRecordPreview(id)` 封装
- 为扩展详情增加 `adaptPreviewRenderer()`、`adaptDocumentPreview()`、`adaptLinkPreview()` 等适配函数
- 主面板不应直接感知音效播放 API，只关注业务命令与事件
- 预览组件统一消费 `ClipboardRecordDetail`，避免为不同内容类型单独发散命令调用

---

## 6. 兼容性约定

- 旧记录若没有 `preview_renderer` 与 `preview_status`，前端可根据 `content_type` 临时推导默认值
- 若当前平台不支持某种媒体编码或文稿解析能力，允许返回 `preview_status = unsupported`
- 文稿与链接预览失败时，至少要保证 `files_detail`、`preview_text` 或 `primary_uri` 仍可用于降级展示
- `payload_type` 的既有语义不因 `v1.5` 新预览能力而改变
