# v1.5 DDD 战术设计文档

## 1. 文档概述

### 1.1 版本范围

本文档只覆盖 `v1.5` 的 4 个核心改动：音效反馈、预览联动、媒体预览升级、文稿与超链接预览升级。

### 1.2 技术背景

- 前端继续以 `React + TypeScript + Zustand` 为主，预览窗口与主面板交互主要集中在 `src/components/`、`src/hooks/` 与 `src/stores/`
- 后端继续以 `Tauri + Rust + SQLite` 提供剪贴板采集、查询、预览资源准备、粘贴与窗口协同能力
- `v1.5` 相比 `v1.4` 的关键变化是：预览窗口从“静态详情查看器”升级为“可联动、可渲染多类内容的预览工作区”，并新增后台音效反馈能力

---

## 2. 核心领域概念

### 2.1 限界上下文（Bounded Context）

| 上下文 | 说明 | 主要模块 |
|--------|------|----------|
| `ClipboardCaptureContext` | 采集剪贴板原始载荷、来源应用与基础摘要 | `src-tauri/src/clipboard/` |
| `SoundFeedbackContext` | 依据复制、粘贴、预览显示等领域事件决定是否播放音效 | 建议新增 `src-tauri/src/sound/` |
| `PreviewSessionContext` | 管理预览窗口显隐、目标记录切换、联动边界与状态广播 | `src/components/PreviewWindow.tsx`、`src/hooks/useKeyboard.ts`、`src-tauri/src/window/preview_window.rs` |
| `MediaPreviewContext` | 负责音频、视频资源映射与播放器所需元信息 | 建议新增 `src/components/preview/`、`src-tauri/src/preview/` |
| `DocumentPreviewContext` | 负责 PDF 与 Office 文稿的预览抽取、缓存与降级 | 建议新增 `src-tauri/src/preview/document.rs` |
| `LinkPreviewContext` | 负责链接抓取、摘要生成、站点信息整理与缓存 | 建议新增 `src-tauri/src/preview/link.rs` |

### 2.2 统一语言（Ubiquitous Language）

| 术语 | 定义 |
|------|------|
| `Sound Cue` | 一次可播放的音效指令，取值为 `copy_captured / paste_completed / preview_revealed` |
| `Preview Session` | 当前独立预览窗口的一次打开会话 |
| `Preview Target Record` | 预览窗口当前正在展示的记录 |
| `Preview Follow` | 预览窗口可见时，跟随主面板当前选中卡片自动切换目标记录 |
| `Preview Renderer` | 针对不同内容类型选择的预览渲染器，如 `audio / video / pdf / document / link / text / image / file_list` |
| `Preview Asset` | 为预览而准备的附加资源，如文稿 HTML、链接摘要、视频封面 |
| `Preview Status` | 当前预览资源状态，取值为 `pending / ready / failed / unsupported` |
| `Primary URI` | 链接或媒体内容的规范化主地址 |
| `Structured Document Preview` | 文稿无法高保真还原时，用结构化文本、表格或页摘要呈现主要内容 |

---

## 3. 领域模型

### 3.1 聚合根（Aggregate Root）

#### `ClipboardRecordAggregate`

负责承接单条记录的“原始载荷 + 展示语义 + 预览入口能力”。

**核心职责**：
- 继续保存 `payload_type` 与 `content_type` 的双层语义
- 为不同 `content_type` 推导默认 `preview_renderer`
- 提供 `primary_uri`、文件路径、摘要文本等预览输入
- 决定纯文本粘贴仍以 `payload_type` 为准，而不是被预览能力反向改变

#### `PreviewSessionAggregate`

负责承接独立预览窗口当前会话的目标记录、渲染器、资源状态与联动边界。

**核心职责**：
- 跟踪当前 `preview_target_record_id`
- 管理“打开预览”“预览可见时切换目标”“关闭预览后停止联动”三种状态切换
- 驱动预览窗口在不重建窗口的前提下更新内容
- 控制预览首次显示成功后触发 `preview_revealed` 音效

#### `PreviewAssetAggregate`

负责承接为特定记录准备的预览资源缓存。

**核心职责**：
- 保存文稿抽取内容、链接摘要、视频封面、音频附加元信息等资源引用
- 标记当前资源状态为 `pending / ready / failed / unsupported`
- 为重新生成、缓存失效与降级回退提供统一入口

### 3.2 实体（Entity）

| 实体 | 所属聚合 | 说明 |
|------|----------|------|
| `ClipboardRecordEntity` | `ClipboardRecordAggregate` | 记录本身，包含 `payload_type / content_type / preview_text / source_app` |
| `PreviewTargetState` | `PreviewSessionAggregate` | 当前目标记录、来源触发方式、联动是否开启 |
| `PreviewWindowState` | `PreviewSessionAggregate` | 预览窗口是否可见、是否首次渲染成功、当前渲染器 |
| `PreviewAssetEntity` | `PreviewAssetAggregate` | 单个资源项，如 `document_html`、`link_summary`、`video_poster` |
| `DocumentOutlineEntity` | `PreviewAssetAggregate` | 文稿页数、工作表、幻灯片等结构信息 |
| `LinkSnapshotEntity` | `PreviewAssetAggregate` | 标题、摘要、站点名、主图等链接快照 |

### 3.3 值对象（Value Object）

#### `SoundCue`

- `kind`
- `asset_key`
- `played_at`
- `trigger_reason`

#### `PreviewDescriptor`

- `renderer`
- `status`
- `display_name`
- `source_path`
- `primary_uri`

#### `PreviewAssetRef`

- `asset_role`
- `storage_path`
- `mime_type`
- `byte_size`
- `generated_at`

#### `DocumentPreviewSlice`

- `document_kind`
- `page_or_sheet`
- `title`
- `content_excerpt`

#### `LinkSummary`

- `url`
- `title`
- `site_name`
- `description`
- `cover_image`

### 3.4 领域事件（Domain Events）

| 事件 | 说明 |
|------|------|
| `RecordCaptured` | 新记录成功入库 |
| `PasteExecuted` | 粘贴链路成功完成 |
| `PreviewWindowOpened` | 预览窗口打开 |
| `PreviewTargetChanged` | 预览目标记录切换 |
| `PreviewContentRevealed` | 预览内容已成功显示给用户 |
| `PreviewAssetPrepared` | 文稿 / 链接 / 封面等预览资源准备完成 |
| `PreviewAssetPreparationFailed` | 预览资源准备失败 |
| `SoundCueRequested` | 某条音效指令被发布 |

### 3.5 领域服务（Domain Services）

| 服务 | 职责 |
|------|------|
| `SoundEffectService` | 订阅复制、粘贴、预览显示等成功事件，解析英文音效资源并执行播放 |
| `PreviewTargetSyncService` | 当预览窗口可见时，把主面板选中记录同步为新的 `Preview Target Record` |
| `PreviewRendererResolverService` | 根据 `content_type`、文件扩展名、`primary_uri` 与资源状态选择合适渲染器 |
| `MediaPreviewService` | 构建音频 / 视频预览所需播放源、封面与基础元信息 |
| `DocumentPreviewService` | 负责 PDF 与 Office 文稿的正文抽取、结构化内容准备与缓存 |
| `LinkPreviewService` | 负责抓取网页标题、摘要、主图与站点信息，并输出安全摘要 |

### 3.6 仓储接口（Repository Interface）

| 仓储接口 | 说明 |
|----------|------|
| `ClipboardQueryRepository` | 读取摘要记录、详情记录与当前选中记录详情 |
| `PreviewAssetRepository` | 保存与读取预览缓存资源 |
| `DocumentPreviewRepository` | 读取文稿抽取内容与结构化切片 |
| `LinkPreviewRepository` | 读取链接摘要缓存与重新抓取结果 |
| `SoundAssetRepository` | 根据音效键定位项目内英文音效文件 |

---

## 4. 聚合交互流程

### 4.1 新记录入库与复制音效

1. `ClipboardCaptureContext` 接收原始载荷并完成入库
2. `ClipboardRecordAggregate` 生成摘要记录并发布 `RecordCaptured`
3. `SoundFeedbackContext` 收到事件后生成 `SoundCue(copy_captured)`
4. `SoundEffectService` 解析 `copy-notification.mp3`
5. 音效播放成功或失败都不影响入库链路返回

### 4.2 粘贴执行与粘贴音效

1. 用户触发 `paste_record`
2. `ClipboardRecordAggregate` 仍依据 `payload_type` 决定粘贴语义
3. 粘贴成功后发布 `PasteExecuted`
4. `SoundEffectService` 播放 `paste-notification.mp3`
5. 若粘贴失败，则只返回结构化错误，不派发成功音效

### 4.3 打开预览与预览联动

1. 用户在主面板中显式触发预览
2. `PreviewSessionAggregate` 建立新会话并设置 `preview_target_record_id`
3. 预览窗口加载详情并渲染对应 `Preview Renderer`
4. 首次成功显示内容后发布 `PreviewContentRevealed`
5. `SoundEffectService` 播放 `preview-open.mp3`
6. 预览窗口可见时，主面板选中变化触发 `PreviewTargetChanged`
7. `PreviewTargetSyncService` 复用同一窗口刷新内容，而不是重建窗口

### 4.4 媒体预览

1. `PreviewRendererResolverService` 判断记录 `content_type = audio / video`
2. `MediaPreviewService` 根据文件路径生成本地可播放源
3. 若存在封面或元信息则一并返回
4. 前端渲染音频 / 视频播放器
5. 源不可访问时回退到“不可预览 + 文件元信息”降级态

### 4.5 文稿与链接预览

1. `PreviewRendererResolverService` 判断记录 `content_type = document / link`
2. `DocumentPreviewService` 或 `LinkPreviewService` 查缓存；无缓存则启动准备流程
3. `PreviewAssetAggregate` 在准备期间标记为 `pending`
4. 准备成功则写入 `PreviewAssetRepository` 并发布 `PreviewAssetPrepared`
5. 前端收到更新事件后刷新当前预览
6. 若解析失败或能力不足，则标记为 `failed / unsupported` 并进入安全降级视图

---

## 5. 前端状态模型映射

### 5.1 `ClipboardStore`

- 继续承接记录列表与选中索引
- 需要补充当前选中记录变化时的订阅友好接口，供预览联动使用
- 当 `clipboard:record-updated` 包含预览资源状态变化时，应同步刷新对应记录摘要

### 5.2 `UIStore`

建议扩展以下运行态：

- `previewSession?: { visible; recordId; followSelection; revealed }`
- `previewRenderState?: { renderer; status; loadingReason? }`
- `lastExplicitPreviewRecordId?: number`

### 5.3 `SystemStore`

- 保持对窗口可见性与监听状态的管理
- 可新增只读快照：`preview_window_visible`
- 音效播放结果不必进入全局 store，只保留日志

### 5.4 组件局部状态

- 音频 / 视频播放位置、暂停状态、静音状态适合留在预览组件局部状态
- 文稿当前页、当前工作表、当前幻灯片索引适合保留在局部视图状态
- 链接主图加载失败与外链按钮 hover 态适合留在局部状态

---

## 6. 防腐层（Anti-Corruption Layer）

- 前端继续通过 `src/api/commands.ts` 访问后端，不在组件中直接拼接 Tauri `invoke`
- 文件本地路径转 WebView 可读地址时，必须统一经过 `toPreviewSrc` 或新的预览资源适配函数
- 链接预览正文与摘要必须通过后端清洗与抽取后再渲染，不直接信任远端网页原始 HTML
- 音效资源定位由后端或统一资源层处理，组件层不直接引用 `docs/音效/` 中文路径

---

## 7. 模块与 DDD 概念映射

| DDD 概念 | 建议实现位置 |
|----------|--------------|
| `PreviewSessionAggregate` | `src/components/PreviewWindow.tsx`、`src/hooks/usePreviewFollow.ts` |
| `SoundEffectService` | `src-tauri/src/sound/` |
| `PreviewRendererResolverService` | `src/components/preview/rendererResolver.ts` 或 `src-tauri/src/preview/mod.rs` |
| `DocumentPreviewService` | `src-tauri/src/preview/document.rs` |
| `LinkPreviewService` | `src-tauri/src/preview/link.rs` |
| `PreviewAssetRepository` | `src-tauri/src/persistence/sqlite.rs` + 预览缓存目录 |

---

## 8. 与 v1.4 的主要差异

- `v1.4` 的预览窗口主要覆盖 `text / image / file_list`，`v1.5` 把预览域扩展到 `audio / video / document / link`
- `v1.4` 的预览窗口以“显式打开一次”为主，`v1.5` 新增“窗口可见时自动跟随选中卡片切换内容”
- `v1.4` 没有统一音效反馈能力，`v1.5` 引入独立 `SoundFeedbackContext`
- `v1.4` 文稿与链接更多停留在分类与筛选语义层，`v1.5` 要把它们提升为真正可预览的内容层
