# v1.2 DDD 战术设计文档

## 1. 文档概述

### 1.1 版本范围

`v1.2` 只描述当前版本为了收敛主面板交互与设置页信息架构而引入的领域模型调整：

- 卡片鼠标单击选中、双击粘贴
- 图片预览源解析与回退
- 基于可视区域的快捷编号与快贴映射
- 设置页双栏导航与会话能力独立分组

### 1.2 技术背景

- 前端继续使用 `React + TypeScript + Zustand`
- 后端继续使用 `Tauri + Rust`
- `v1.2` 不新增数据库表，不升级 `config_version`
- 当前版本新增的大部分概念属于**运行态领域**，主要存在于前端状态与 UI 协调层

---

## 2. 核心领域概念

### 2.1 限界上下文（Bounded Context）

| 上下文 | 职责 |
|--------|------|
| `PanelInteractionContext` | 管理主面板选中态、鼠标手势、可视槽位编号与粘贴触发 |
| `ClipboardHistoryContext` | 提供记录摘要、详情与置顶后的稳定顺序 |
| `PreviewDeliveryContext` | 管理图片预览源解析、缩略图完成事件与占位降级 |
| `SettingsWorkspaceContext` | 管理设置页导航结构、当前激活分组与未保存状态 |
| `PlatformCapabilityContext` | 输出当前平台 / 会话能力快照与降级原因 |

### 2.2 统一语言（Ubiquitous Language）

| 术语 | 定义 |
|------|------|
| `SelectionSource` | 触发选中的来源：`keyboard / mouse / quick_slot` |
| `PointerSelect` | 鼠标单击卡片后，仅更新选中态，不执行粘贴 |
| `DoubleClickPaste` | 鼠标双击卡片后，直接复用既有粘贴链路 |
| `VisibleQuickSlotWindow` | 基于当前视口计算出的 `1~9` 快捷编号窗口 |
| `ViewportAnchorCard` | 当前视口中最左侧的可见卡片，是 `1` 号槽位的起点 |
| `PreviewSource` | 图片卡片最终用于展示的预览源，可来自缩略图、原图或占位态 |
| `CapabilitySection` | 设置页中独立承载平台 / 会话能力状态的专门分组 |

---

## 3. 领域模型

### 3.1 聚合根（Aggregate Root）

#### `PanelInteractionSession`

职责：收敛主面板当前这一次打开周期中的交互状态。

核心属性：

- `selected_record_id`
- `selected_index`
- `selection_source`
- `visible_slot_window`
- `is_pasting`

约束：

- 任一时刻只允许一个“当前选中项”
- 双击粘贴期间需要防止重复提交
- `visible_slot_window` 必须基于当前滚动位置即时重算

#### `SettingsWorkspace`

职责：收敛设置窗口当前激活分组、双栏布局与未保存变更拦截。

核心属性：

- `active_section`
- `dirty_sections`
- `capability_snapshot`

约束：

- 左侧导航只负责切换分组，不直接改变配置数据
- `CapabilitySection` 是独立分组，不与 `general` 混排

### 3.2 实体（Entity）

| 实体 | 说明 |
|------|------|
| `ClipboardRecordProjection` | 主面板中用于渲染的记录投影，身份由 `record_id` 决定 |
| `VisibleQuickSlot` | 当前会话内的快捷槽位实体，包含 `slot`、`record_id`、`absolute_index` |
| `SettingsSection` | 设置分组实体，包含 `key`、`label`、`description`、`order` |

### 3.3 值对象（Value Object）

#### `VisibleQuickSlotWindow`

```ts
interface VisibleQuickSlotWindow {
  start_index: number;
  end_index: number;
  slot_count: number;
}
```

语义：描述当前视口编号窗口覆盖的绝对索引区间。

#### `PreviewSource`

```ts
type PreviewSourceKind = "thumbnail" | "original" | "placeholder";

interface PreviewSource {
  kind: PreviewSourceKind;
  path?: string | null;
}
```

语义：图片卡片最终可安全渲染的资源来源。

#### `PointerGesture`

```ts
type PointerGesture = "single_click" | "double_click";
```

语义：统一表达鼠标交互手势，不直接绑定 UI 组件实现细节。

### 3.4 领域事件（Domain Events）

| 事件 | 触发时机 |
|------|----------|
| `RecordSelectionChanged` | 键盘、鼠标或快捷槽位导致当前选中项变化 |
| `RecordPasteRequested` | `Enter`、`Command + 数字` 或双击卡片触发粘贴 |
| `VisibleQuickSlotWindowChanged` | 横向滚动或自动滚动导致可视槽位窗口变化 |
| `PreviewSourceResolved` | 图片卡片完成预览源决策 |
| `SettingsSectionChanged` | 设置页从一个分组切换到另一个分组 |

### 3.5 领域服务（Domain Services）

| 服务 | 职责 |
|------|------|
| `VisibleQuickSlotResolver` | 根据 `scrollLeft + viewportWidth + record order` 计算当前 `1~9` 槽位 |
| `PreviewSourceResolver` | 按“缩略图 -> 原图 -> 占位态”顺序解析图片预览源 |
| `PointerInteractionCoordinator` | 协调单击选中与双击粘贴，防止重复请求 |
| `CapabilitySectionAssembler` | 把 `PlatformCapabilities` 组装成设置页独立能力分组视图模型 |

### 3.6 仓储接口（Repository Interface）

| 接口 | 说明 |
|------|------|
| `ClipboardRecordRepository` | 读取记录摘要列表，用于绝对顺序与选中态映射 |
| `ClipboardRecordDetailRepository` | 在图片缩略图不可用时读取详情，用于原图回退 |
| `SettingsSnapshotRepository` | 读取 / 保存设置快照 |
| `PlatformCapabilityRepository` | 读取当前平台 / 会话能力快照 |

---

## 4. 聚合交互流程

### 4.1 鼠标单击选中

1. 用户单击卡片
2. `PointerInteractionCoordinator` 识别为 `single_click`
3. `PanelInteractionSession` 更新 `selected_record_id / selected_index / selection_source=mouse`
4. UI 使用与键盘一致的高亮样式刷新卡片边框与阴影

### 4.2 鼠标双击粘贴

1. 用户双击卡片
2. `PointerInteractionCoordinator` 识别为 `double_click`
3. 先确保卡片成为当前选中项
4. 触发 `RecordPasteRequested`
5. 复用 `paste_record` 命令执行粘贴
6. 成功后隐藏主面板；失败则保留当前面板与选中态

### 4.3 图片预览源解析

1. `ClipboardRecordProjection` 到达图片卡片组件
2. `PreviewSourceResolver` 先检查 `image_meta.thumbnail_path`
3. 若缩略图不可用，则按需读取 `image_detail.original_path`
4. 若原图也不可用，则返回 `placeholder`
5. 后续收到 `thumbnail_ready` 事件时重新解析并刷新预览

### 4.4 可视区域快捷编号

1. 列表滚动或自动滚动后，计算 `ViewportAnchorCard`
2. `VisibleQuickSlotResolver` 从锚点开始顺延分配 `1~9`
3. 右上角快捷编号与键盘 `1~9` / `Command + 1~9` 使用同一份槽位映射
4. 绝对索引仍用于真正的选中态与仓储读取，槽位只是一层运行态别名

### 4.5 设置页独立会话能力分组

1. 设置窗口加载 `SettingsSnapshot`
2. 同步读取 `PlatformCapabilities`
3. `CapabilitySectionAssembler` 生成独立的“会话能力”分组模型
4. 左侧导航展示该分组，右侧内容区展示完整支持 / 降级原因 / 能力卡片

---

## 5. 前端状态模型映射

### 5.1 `ClipboardStore`

- 继续作为记录列表与选中态的单一真相源
- `v1.2` 建议显式区分：`selectedIndex`、`selectedRecordId`、`selectionSource`

### 5.2 `UIStore`

- 承接主面板显隐、Toast、滚动相关运行态
- `v1.2` 可增加：`visibleSlotStartIndex`、`visibleSlotMap`

### 5.3 `SystemStore`

- 继续承接权限、监听状态、面板可见状态
- 不负责鼠标选中与快捷槽位映射

### 5.4 设置页局部状态

- `activeSection`
- `dirtySections`
- `capabilities`
- `capabilitySectionViewModel`

---

## 6. 防腐层（Anti-Corruption Layer）

- 原生路径到前端图片 `src` 的转换必须通过统一适配层处理，避免把不可直接渲染的文件路径裸传给 `<img>`
- 鼠标事件与键盘事件最终都要收敛成统一的 `RecordSelectionChanged / RecordPasteRequested` 语义
- `PlatformCapabilities` 属于平台能力模型，进入设置页前应先转换成面向用户的文案与分组视图模型

---

## 7. 模块与 DDD 概念映射

| 模块 / 文件 | DDD 角色 |
|-------------|----------|
| `src/components/MainPanel/CardList.tsx` | `PanelInteractionSession` 的主要 UI 承载点 |
| `src/components/MainPanel/QuickSelectBadge.tsx` | `VisibleQuickSlot` 视图投影 |
| `src/components/MainPanel/ImageCard.tsx` | `PreviewSource` 的渲染端 |
| `src/hooks/useKeyboard.ts` | `VisibleQuickSlotResolver` 的键盘消费入口 |
| `src/components/SettingsWindowPlaceholder.tsx` | `SettingsWorkspace` 与 `CapabilitySection` 的承载点 |
| `src/api/commands.ts` / `src/api/settings.ts` | 仓储 / 应用服务适配层 |

---

## 8. 与 v1.1 的主要差异

- `v1.1` 的交互焦点主要是键盘；`v1.2` 把鼠标正式纳入主面板主链路
- `v1.1` 的快捷编号是绝对索引视角；`v1.2` 改为可视槽位视角
- `v1.1` 的能力提示混在通用设置中；`v1.2` 将其独立为单独分组
- `v1.2` 不扩展持久化模型，重点在运行态建模与前端交互收敛
