# v1.4 DDD 战术设计文档

## 1. 文档概述

### 1.1 版本范围

本文档只覆盖 `v1.4` 的 4 个核心改动：主面板信息架构重构、类型扩展与搜索筛选、全窗口毛玻璃视觉统一、文本预览增强与多屏定位。

### 1.2 技术背景

- 前端继续以 `React + TypeScript + Zustand` 为主，主面板交互集中在 `src/components/MainPanel/`、`src/hooks/` 与 `src/stores/`
- 后端继续以 `Tauri + Rust + SQLite` 提供剪贴板采集、分类、查询、粘贴、窗口定位与事件广播能力
- `v1.4` 相比 `v1.3` 的关键变化不只是视觉层，还引入了**搜索建模、语义分类建模与多屏窗口协同建模**

---

## 2. 核心领域概念

### 2.1 限界上下文（Bounded Context）

| 上下文 | 说明 | 主要模块 |
|--------|------|----------|
| `ClipboardCaptureContext` | 采集剪贴板原始载荷、基础详情与来源应用信息 | `src-tauri/src/clipboard/monitor.rs`、`record.rs` |
| `RecordClassificationContext` | 把原始载荷识别为面向用户的语义类型 | `src-tauri/src/clipboard/classifier.rs`、前端类型映射层 |
| `PanelDiscoveryContext` | 主面板搜索、筛选、排序、选中态与列表结果集 | `src/components/MainPanel/`、`src/stores/useClipboardStore.ts` |
| `PreviewWorkspaceContext` | 独立预览窗口的内容呈现、代码高亮、搜索、替换 | `src/components/PreviewWindow.tsx`、新预览工作区模块 |
| `WindowPlacementContext` | 主面板、预览窗口与多显示器的空间定位协同 | `src-tauri/src/window/position.rs`、`preview_window.rs` |
| `VisualPresentationContext` | 主面板、卡片、设置、关于等窗口的玻璃视觉令牌与类型色系统 | `src/index.css`、卡片视觉模块 |

### 2.2 统一语言（Ubiquitous Language）

| 术语 | 定义 |
|------|------|
| `Payload Type` | 原始载荷类型，决定底层存储和粘贴语义，取值为 `text / image / files` |
| `Semantic Type` | 面向用户展示与筛选的语义类型，取值为 `text / image / files / link / video / audio / document` |
| `Path Paste Semantics` | 当记录底层 `payloadType = files` 且用户触发 `plain_text` 粘贴时，输出换行分隔的路径列表 |
| `Type Filter` | 主面板左侧竖向快捷筛选条件 |
| `Search Query` | 当前主面板模糊搜索关键字 |
| `Result Set` | 经过搜索与筛选后得到的当前列表结果集 |
| `Source App Icon` | 卡片标题栏右侧展示的来源应用图标或降级占位 |
| `Active Display Context` | 当前主面板所在屏幕及其可视区域信息 |
| `Preview Workspace` | 独立预览窗口中的正文工作区与工具条 |
| `Replace Session` | 文本预览中的查找替换会话 |

---

## 3. 领域模型

### 3.1 聚合根（Aggregate Root）

#### `ClipboardRecordAggregate`

负责承接单条记录的“原始载荷 + 语义分类 + 展示摘要”。

**核心职责**：
- 保存 `payloadType` 与 `semanticType` 的双层语义
- 提供可搜索文本、卡片标题、辅助信息与来源应用信息
- 决定该记录在主面板与预览中的展示策略
- 决定 `plain_text` 粘贴时是输出正文文本、OCR 文本还是文件路径列表

#### `PanelDiscoverySession`

负责承接主面板当前会话的搜索、筛选、选中和结果集。

**核心职责**：
- 跟踪当前 `searchQuery`
- 跟踪当前 `typeFilter`
- 根据搜索和筛选生成 `resultSet`
- 保证筛选变化后选中项、滚动定位与预览入口仍然一致

#### `PreviewWorkspaceSession`

负责承接独立预览窗口中目标记录与工具态。

**核心职责**：
- 跟踪当前预览目标记录
- 管理文本预览中的 `codeHighlight / find / replace`
- 区分非文本记录的只读预览与文本记录的可操作工作区

#### `WindowPlacementSession`

负责根据主面板当前屏幕决定预览窗口位置。

**核心职责**：
- 解析当前主面板所属显示器
- 生成预览窗口的目标屏幕与初始位置
- 在定位失败时回退到安全位置

### 3.2 实体（Entity）

| 实体 | 所属聚合 | 说明 |
|------|----------|------|
| `ClipboardRecordEntity` | `ClipboardRecordAggregate` | 记录本身，包含 `payloadType / semanticType / previewText / sourceApp` |
| `SearchSessionState` | `PanelDiscoverySession` | 当前搜索词、匹配数量、是否为空结果 |
| `TypeFilterState` | `PanelDiscoverySession` | 当前筛选类型 |
| `PreviewDocumentState` | `PreviewWorkspaceSession` | 记录详情、文本内容、语法模式、工具栏状态 |
| `DisplayPlacementTarget` | `WindowPlacementSession` | 目标屏幕、工作区矩形、降级定位方案 |

### 3.3 值对象（Value Object）

#### `RecordSemanticDescriptor`

- `payload_type`
- `semantic_type`
- `detected_by`
- `confidence`

#### `SearchSpec`

- `query`
- `type_filter`
- `limit`
- `offset`

#### `TypeThemeToken`

- `title_color`
- `background_color`
- `icon_color`
- `accent_border`

#### `SourceAppIconRef`

- `app_name`
- `bundle_or_process_id`
- `icon_cache_key`
- `fallback_kind`

#### `ReplaceOperation`

- `find_text`
- `replace_text`
- `replace_mode`
- `match_count`

#### `DisplayAffinity`

- `display_id`
- `origin_x`
- `origin_y`
- `work_width`
- `work_height`

### 3.4 领域事件（Domain Events）

| 事件 | 说明 |
|------|------|
| `RecordSemanticClassified` | 原始记录已完成语义分类 |
| `PanelSearchChanged` | 搜索关键字已更新 |
| `PanelTypeFilterChanged` | 左侧类型筛选已切换 |
| `PanelResultSetRecomputed` | 结果集已重算 |
| `PreviewWorkspaceOpened` | 预览窗口已打开 |
| `PreviewReplaceExecuted` | 文本预览执行了替换 |
| `PreviewDisplayResolved` | 预览窗口的目标屏幕已确定 |
| `GlassVisualThemeApplied` | 玻璃视觉令牌已应用到窗口 |

### 3.5 领域服务（Domain Services）

| 服务 | 职责 |
|------|------|
| `RecordSemanticClassifierService` | 根据载荷、MIME、扩展名、URL 与文本特征推导语义类型 |
| `PanelSearchService` | 负责模糊匹配、组合筛选与结果集排序 |
| `TypeThemeService` | 为不同语义类型提供标题色、背景色与图标色令牌 |
| `SourceAppIconResolveService` | 根据来源应用标识解析可展示图标，并处理降级 |
| `PreviewTextWorkspaceService` | 承接文本预览的代码高亮、查找、替换逻辑 |
| `DisplayPlacementService` | 读取主面板所在屏幕并计算预览窗口位置 |

### 3.6 仓储接口（Repository Interface）

| 仓储接口 | 说明 |
|----------|------|
| `ClipboardQueryRepository` | 读取记录摘要、详情与搜索结果 |
| `ClipboardMutationRepository` | 执行更新、删除、粘贴等命令 |
| `RecordClassificationRepository` | 保存或重建记录的语义类型字段 |
| `DisplayCapabilityRepository` | 提供屏幕列表、窗口位置与可视区域信息 |
| `IconCacheRepository` | 提供来源应用图标缓存或降级占位 |

---

## 4. 聚合交互流程

### 4.1 记录分类与入库

1. `ClipboardCaptureContext` 接收原始载荷
2. `RecordSemanticClassifierService` 判断 `payloadType`
3. 再根据 URL、扩展名、MIME、文本特征推导 `semanticType`
4. 发布 `RecordSemanticClassified`
5. `ClipboardRecordAggregate` 写入摘要、搜索文本与语义类型

### 4.2 主面板搜索与类型筛选

1. 用户输入 `Search Query` 或切换 `Type Filter`
2. `PanelDiscoverySession` 更新会话状态
3. `PanelSearchService` 基于索引文本与筛选条件计算 `Result Set`
4. 发布 `PanelResultSetRecomputed`
5. 主面板刷新卡片列表并保留稳定选中逻辑

### 4.3 打开独立预览窗口

1. 用户在主面板中选中某条记录并触发预览
2. `WindowPlacementSession` 获取主面板当前 `Active Display Context`
3. `DisplayPlacementService` 计算预览窗口目标屏幕与初始位置
4. `PreviewWorkspaceSession` 拉取详情并初始化对应工作区
5. 文本记录进入可搜索 / 可替换的工作模式，其他类型进入只读详情模式

### 4.4 `Shift+Enter` 纯文本粘贴

1. 用户对当前记录触发 `plain_text` 粘贴
2. `ClipboardRecordAggregate` 先依据 `payloadType` 决定粘贴语义
3. 若 `payloadType = text`，输出文本正文；若 `payloadType = image`，走 OCR 文本；若 `payloadType = files`，输出换行分隔的路径列表
4. `semanticType = video / audio / document / files` 的记录在该链路下统一视为“文件路径纯文本粘贴”
5. 粘贴完成后继续复用既有隐藏面板与事件同步链路

### 4.5 文本搜索与替换

1. 用户在预览工具栏中输入查找关键字
2. `PreviewTextWorkspaceService` 计算命中集合并高亮正文
3. 用户执行单次或全部替换
4. 发布 `PreviewReplaceExecuted`
5. 若替换结果需要持久化，则调用更新命令并同步事件

---

## 5. 前端状态模型映射

### 5.1 `ClipboardStore`

- 增加 `semanticType`、`payloadType`、`searchableText`
- 增加 `searchQuery`、`typeFilter`、`filteredRecordIds`
- 对外提供 `getFilteredRecords()`、`getSearchStats()`

### 5.2 `UIStore`

建议扩展以下运行态：

- `panelSearch?: { query; activeType; resultCount }`
- `previewWorkspace?: { recordId; findText; replaceText; highlightMode }`
- `displayAffinity?: { panelDisplayId; previewDisplayId }`

### 5.3 `SystemStore`

- 继续负责权限、平台能力与窗口显隐
- 新增与多屏能力有关的只读状态快照缓存

### 5.4 组件局部状态

- 搜索框动态宽度动画值适合保留在组件局部状态
- 文本预览中的光标、滚动位置与当前命中索引适合保留在局部工作区状态

---

## 6. 防腐层（Anti-Corruption Layer）

- `src/api/commands.ts` 继续作为前端访问 Tauri Command 的唯一入口
- 分类结果不能直接把底层 `payloadType` 暴露成 UI 唯一类型，必须经过前端适配层转换为 `semanticType`
- 预览窗口不应直接调用平台 API 读取显示器信息，应通过后端窗口定位服务取得统一结果

---

## 7. 模块与 DDD 概念映射

| DDD 概念 | 推荐模块 |
|----------|----------|
| `PanelDiscoverySession` | `src/components/MainPanel/index.tsx`、新增搜索与筛选 hooks / store |
| `PreviewWorkspaceSession` | `src/components/PreviewWindow.tsx`、新增文本预览工作区组件 |
| `WindowPlacementSession` | `src-tauri/src/window/position.rs`、`preview_window.rs` |
| `RecordSemanticClassifierService` | `src-tauri/src/clipboard/classifier.rs` |
| `TypeThemeService` | `src/components/MainPanel/contentTypeTheme.ts`、`src/index.css` |
| `SourceAppIconResolveService` | 新增前后端来源应用图标解析模块 |

---

## 8. 与 v1.3 的主要差异

- `v1.3` 重点是预览入口、右键菜单与玻璃风基础，`v1.4` 则把重点转向**搜索发现效率、语义类型扩展、文本工作区能力和多屏窗口协同**
- `v1.3` 主要沿用既有三类内容，`v1.4` 需要显式建模 `payloadType` 与 `semanticType` 的区别
- `v1.3` 的预览窗口是“看内容”，`v1.4` 的文本预览升级为“可定位、可替换、可高亮的工作区”
