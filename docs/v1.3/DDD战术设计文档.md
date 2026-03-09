# v1.3 DDD 战术设计文档

## 1. 文档概述

### 1.1 版本范围

本文档只覆盖 `v1.3` 的 3 个核心改动：空格聚焦预览、右键上下文菜单、主面板视觉升级。

### 1.2 技术背景

- 前端仍以 `React + TypeScript + Zustand` 为主，主面板交互集中在 `src/components/MainPanel/`、`src/hooks/` 与 `src/stores/`
- 后端仍以 `Tauri + Rust` 提供剪贴板历史查询、详情读取、粘贴与删除能力
- `v1.3` 的预览与菜单行为主要属于**前端运行态交互建模**，不引入新的持久化模型

---

## 2. 核心领域概念

### 2.1 限界上下文（Bounded Context）

| 上下文 | 说明 | 主要模块 |
|--------|------|----------|
| `ClipboardHistoryContext` | 历史记录摘要、详情、删除与粘贴的业务来源 | `src/api/commands.ts`、`src-tauri/src/clipboard/`、`src-tauri/src/paste/` |
| `PanelInteractionContext` | 主面板选中、预览、菜单、快捷键与关闭行为 | `src/components/MainPanel/`、`src/hooks/useKeyboard.ts`、`src/stores/useClipboardStore.ts` |
| `VisualPresentationContext` | 面板外观、卡片状态、半透明层、光效与动效规范 | `src/index.css`、`src/components/MainPanel/` |

### 2.2 统一语言（Ubiquitous Language）

| 术语 | 定义 |
|------|------|
| `Selected Card` | 当前被键盘或鼠标选中的卡片 |
| `Focus Preview` | 由空格键或菜单触发的居中放大预览层 |
| `Preview Overlay` | 覆盖在主面板上方的预览层容器 |
| `Context Menu` | 卡片右键弹出的上下文菜单 |
| `Context Action` | 菜单中可执行的具体动作，如预览、粘贴、删除 |
| `Menu Anchor` | 菜单相对鼠标落点或卡片边界的锚点位置 |
| `Glass Surface` | 半透明、模糊、弱边框、带轻微光晕的面板外观 |
| `Previewing State` | 某张卡片正在被预览层承接时的视觉与交互状态 |

---

## 3. 领域模型

### 3.1 聚合根（Aggregate Root）

#### `PanelInteractionSession`

负责承接主面板的核心交互状态，是 `v1.3` 的主聚合根。

**核心职责**：
- 跟踪当前 `selectedRecordId / selectedIndex`
- 决定空格是否可打开预览
- 维护“预览中是否暂时抑制其他快捷操作”的规则
- 协调菜单、预览、主列表之间的互斥关系

#### `PreviewOverlaySession`

负责承接完整内容预览的生命周期。

**核心职责**：
- 跟踪当前是否正在预览、预览目标是谁、触发来源是什么
- 管理预览详情加载状态：`idle / loading / ready / error`
- 提供关闭语义：`escape / space / click_mask / action_completed`

#### `ContextMenuSession`

负责卡片右键菜单的打开、定位、动作可用性与关闭。

**核心职责**：
- 记录菜单是否打开以及归属的 `record_id`
- 保存菜单锚点位置与边界修正结果
- 维护动作清单和禁用态
- 保证同一时刻只存在一个打开的卡片菜单

### 3.2 实体（Entity）

| 实体 | 所属聚合 | 说明 |
|------|----------|------|
| `SelectedRecordRef` | `PanelInteractionSession` | 当前选中卡片引用，至少包含 `record_id / absolute_index` |
| `PreviewRecordSnapshot` | `PreviewOverlaySession` | 用于预览层显示的目标记录快照，包含摘要与可选详情 |
| `ContextActionItem` | `ContextMenuSession` | 菜单中的单项动作定义，包含文案、可用性、危险级别 |

### 3.3 值对象（Value Object）

#### `PreviewViewportState`

- `visible`
- `trigger`
- `close_reason`
- `loading_state`

#### `MenuAnchor`

- `x`
- `y`
- `placement`
- `collision_adjusted`

#### `GlassSurfaceSpec`

- `background_alpha`
- `blur_radius`
- `border_opacity`
- `glow_strength`

#### `CardAppearanceState`

- `default`
- `hovered`
- `selected`
- `previewing`
- `disabled_action`

### 3.4 领域事件（Domain Events）

| 事件 | 说明 |
|------|------|
| `CardPreviewRequested` | 用户请求打开卡片预览 |
| `CardPreviewLoaded` | 预览所需详情数据已准备完成 |
| `CardPreviewClosed` | 预览层被关闭 |
| `CardContextMenuOpened` | 右键菜单已打开 |
| `CardContextActionTriggered` | 菜单动作被触发 |
| `CardContextMenuClosed` | 菜单关闭 |
| `PanelVisualStyleApplied` | 新版玻璃科技风样式已应用 |

### 3.5 领域服务（Domain Services）

| 服务 | 职责 |
|------|------|
| `PreviewContentResolverService` | 根据记录类型决定预览层应直接使用摘要还是补充调用 `get_record_detail` |
| `ContextMenuActionService` | 统一解析右键菜单动作到既有命令链路 |
| `PanelVisualStyleService` | 输出面板、卡片、遮罩、菜单的视觉令牌与状态组合 |
| `ActionAvailabilityService` | 判断某张卡片在当前上下文下哪些菜单动作可用 |

### 3.6 仓储接口（Repository Interface）

| 仓储接口 | 说明 |
|----------|------|
| `ClipboardQueryRepository` | 读取记录摘要与详情，前端对应 `getRecords / getRecordDetail` |
| `ClipboardCommandRepository` | 执行 `paste_record / delete_record / hide_panel` |
| `PanelTokenProvider` | 提供视觉令牌；属于前端样式提供者，不进入数据库 |

---

## 4. 聚合交互流程

### 4.1 空格打开聚焦预览

1. `PanelInteractionSession` 确认当前存在 `SelectedRecordRef`
2. 发布 `CardPreviewRequested`
3. `PreviewOverlaySession` 进入 `loading` 或 `ready` 状态
4. `PreviewContentResolverService` 判断是否需要读取详情
5. 预览层居中展示，原列表保持可见但失去主交互焦点

### 4.2 关闭预览

1. 用户触发 `Esc / Space / 点击遮罩`
2. `PreviewOverlaySession` 记录 `close_reason`
3. 发布 `CardPreviewClosed`
4. `PanelInteractionSession` 恢复主列表焦点，不改变原选中项

### 4.3 右键菜单与动作执行

1. 用户右键卡片
2. `PanelInteractionSession` 先更新 `SelectedRecordRef`
3. `ContextMenuSession` 生成 `MenuAnchor` 与 `ContextActionItem[]`
4. 用户点击菜单动作后，`ContextMenuActionService` 解析为既有命令
5. 执行成功则关闭菜单；失败则保留主面板并反馈错误

### 4.4 主面板科技风样式应用

1. `PanelVisualStyleService` 提供玻璃面板与卡片状态令牌
2. `PanelInteractionSession` 根据 `selected / previewing / hovered` 输出视图状态
3. `PanelVisualStyleApplied` 作为前端内部完成事件记录样式切换完成

---

## 5. 前端状态模型映射

### 5.1 `ClipboardStore`

- 继续负责 `records / selectedIndex / getSelectedRecord`
- `v1.3` 不建议把预览层状态混入记录仓储本身
- 可新增轻量辅助选择器：`getSelectedRecordId`、`findRecordById`

### 5.2 `UIStore`

建议在 `v1.3` 中扩展以下运行态：

- `previewOverlay?: { recordId; trigger; loading; openedAt }`
- `contextMenu?: { recordId; x; y; actions }`
- `visualMode?: "glass-tech"`

### 5.3 `SystemStore`

- 无需新增持久化字段
- 仍负责权限、平台、窗口可见性等系统态
- 菜单与预览执行粘贴时继续复用系统能力判断结果

### 5.4 组件局部状态

- 预览层滚动位置、图片缩放适合保留在组件局部状态
- 菜单 hover 索引、动画开关适合保留在组件局部状态

---

## 6. 防腐层（Anti-Corruption Layer）

- `src/api/commands.ts` 继续作为前端调用 Tauri 的唯一命令入口
- `ContextMenuActionService` 不能直接拼接底层命令参数，必须复用 API 封装层
- `PreviewContentResolverService` 对详情读取结果做前端友好转换，避免 UI 直接消费后端原始差异字段

---

## 7. 模块与 DDD 概念映射

| DDD 概念 | 推荐前端模块 |
|----------|--------------|
| `PanelInteractionSession` | `src/components/MainPanel/index.tsx`、`src/hooks/useKeyboard.ts` |
| `PreviewOverlaySession` | `src/components/MainPanel/PreviewOverlay.tsx`、`src/hooks/usePreviewOverlay.ts` |
| `ContextMenuSession` | `src/components/MainPanel/CardContextMenu.tsx`、`src/hooks/useCardContextMenu.ts` |
| `PanelVisualStyleService` | `src/components/MainPanel/motion.ts`、`src/index.css`、视觉令牌文件 |
| `ClipboardQueryRepository` | `src/api/commands.ts` |

---

## 8. 与 v1.2 的主要差异

- `v1.2` 主要补齐“鼠标选中 / 双击粘贴 / 图片预览回退 / 可视快捷编号”，`v1.3` 则把重点转向**完整内容确认**与**鼠标菜单操作闭环**
- `v1.2` 的图片预览仍停留在列表卡片层级，`v1.3` 新增独立的聚焦预览会话模型
- `v1.3` 的样式升级仍停留在前端展示层，不引入新的数据库聚合或持久化仓储
