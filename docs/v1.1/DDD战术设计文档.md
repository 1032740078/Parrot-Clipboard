# v1.1 DDD 战术设计文档

## 1. 文档概述

### 1.1 版本范围

本文档仅覆盖 `v1.1` 当前版本涉及的桌面交互增强，不重复展开 `v1.0` 已稳定的迁移恢复、权限引导、关于页、更新检查与图片治理设计。

### 1.2 技术背景

- 前端仍采用 `React + Zustand + Tauri IPC`
- 后端仍采用 `Rust + Tauri + 原生窗口桥接`
- `v1.1` 的核心变化集中在 **窗口显隐**、**键盘手势**、**选中项可见性** 三条运行时链路
- 当前版本不改动持久化模型，重点治理“运行态状态错位”和“桌面窗口体验不自然”问题

---

## 2. 核心领域概念

### 2.1 限界上下文（Bounded Context）

| 上下文 | 职责 | 本版变化 |
|--------|------|----------|
| `Clipboard History` | 管理历史记录读取、置顶、删除、粘贴 | 复用既有模型，不新增实体 |
| `Panel Interaction` | 管理主面板显隐、选中、可见区域同步 | `v1.1` 核心上下文 |
| `Desktop Window` | 管理原生窗口层级、目标显示器和面板 frame | `v1.1` 核心上下文 |
| `Permission Guard` | 粘贴前权限校验与降级提示 | 复用既有模型，补充快贴路径 |

### 2.2 统一语言（Ubiquitous Language）

| 术语 | 定义 |
|------|------|
| `Panel Session` | 一次主面板从显示到隐藏的完整交互会话 |
| `Focus Lost` | 主面板失去前台焦点的运行态事件 |
| `Auto Hide` | 由失焦触发的自动隐藏行为 |
| `Display Frame` | 物理显示器完整可用矩形，允许覆盖 `Dock` |
| `Visible Range` | 当前卡片列表视口内真实可见的记录区间 |
| `Quick Paste Gesture` | `Command + 1~9` 触发的直接粘贴动作 |
| `Ensure Visible` | 在选中项变化后调整滚动位置，保证选中卡片可见 |

---

## 3. 领域模型

### 3.1 聚合根（Aggregate Root）

#### `ClipboardHistory`

职责：

- 提供按最近使用时间排序的历史记录视图
- 根据 `record_id` 执行粘贴并在成功后置顶
- 对删除、历史为空、越界序号做一致性约束

聚合不变式：

- 同一时刻只能粘贴存在的记录
- 快速粘贴的序号映射必须基于当前可见顺序计算
- 粘贴成功后记录顺序更新仍由既有历史聚合负责

#### `PanelSession`

职责：

- 维护主面板的可见状态、隐藏原因、当前选中项
- 在失焦时触发自动隐藏
- 在选中项变化时驱动 `Ensure Visible`

聚合不变式：

- 原生窗口显隐状态是最终真相来源
- `selectedIndex` 必须与当前记录集长度保持一致
- 当 `PanelSession` 结束时，前端与后端都必须收敛到“不可见”状态

#### `DesktopOverlay`

职责：

- 解析目标显示器
- 计算主面板在物理屏幕坐标系中的 frame
- 负责让面板覆盖 `Dock` 而不是规避 `Dock`

聚合不变式：

- 面板高度固定回归设计值 `220px`，仅在显示器高度不足时做极限夹取
- 面板底边锚定物理屏幕底部，不再锚定 `visibleFrame / work_area`
- `Dock` 位置变化不会改变“覆盖而非避让”的策略

### 3.2 实体（Entity）

| 实体 | 所属聚合 | 说明 |
|------|----------|------|
| `ClipboardRecord` | `ClipboardHistory` | 历史记录实体，沿用既有 `id / type / meta` |
| `SelectionCursor` | `PanelSession` | 当前选中索引与记录引用 |
| `ViewportState` | `PanelSession` | 当前 `scrollLeft / viewportWidth / contentWidth` |
| `DisplayTarget` | `DesktopOverlay` | 当前目标显示器与其物理 frame |

### 3.3 值对象（Value Object）

| 值对象 | 说明 |
|--------|------|
| `PanelVisibilityReason` | `toggle_shortcut / focus_lost / escape / paste_completed / quick_paste / external_hide` |
| `QuickPasteGesture` | 修饰键 + 数字位的组合手势 |
| `PanelFrame` | 面板最终 `x / y / width / height` |
| `VisibleCardRange` | 当前可见的起止索引 |

### 3.4 领域事件（Domain Events）

| 事件 | 触发时机 | 说明 |
|------|----------|------|
| `PanelShown` | 全局快捷键呼出主面板 | 启动一次新的 `Panel Session` |
| `PanelFocusLost` | 面板失去前台焦点 | 进入自动隐藏判定 |
| `PanelAutoHidden` | 自动隐藏完成 | 同步前后端状态 |
| `QuickPasteTriggered` | 用户按下 `Command + 数字` | 直接进入粘贴链路 |
| `SelectionVisibilityAdjusted` | 选中项超出视口并完成滚动 | 保证 UI 与认知一致 |

### 3.5 领域服务（Domain Services）

| 服务 | 职责 |
|------|------|
| `PanelVisibilityService` | 统一处理显示、失焦隐藏、显隐状态广播 |
| `DisplayFrameResolver` | 在 `macOS` 下解析当前目标屏幕的物理 frame |
| `QuickPasteService` | 解析 `Command + 数字` 并复用既有粘贴能力 |
| `SelectionViewportService` | 计算目标卡片是否可见以及需要滚动到哪里 |

### 3.6 仓储接口（Repository Interface）

| 接口 | 说明 | 本版变化 |
|------|------|----------|
| `ClipboardRepository` | 读取摘要、详情、置顶、删除 | 无接口变化 |
| `RuntimeStatusRepository` | 保存当前运行态（监听、面板显隐） | 可补充面板隐藏原因的内存态 |
| `SettingsRepository` | 设置项读取与保存 | 本版不新增字段 |

---

## 4. 聚合交互流程

### 4.1 主面板失焦自动隐藏

1. `PanelShown` 触发，`PanelSession` 进入激活态
2. 原生窗口监听到 `focus_lost / blur`
3. `PanelVisibilityService` 触发隐藏，并记录原因为 `focus_lost`
4. 后端广播面板已隐藏事件，前端同步 `isPanelVisible = false`
5. 焦点归还到用户原本的工作应用

### 4.2 覆盖 Dock 的面板定位

1. `DisplayFrameResolver` 识别当前目标显示器
2. 读取目标显示器的 **物理 frame**，不再使用 `visibleFrame / work_area`
3. 以 `height = 220px` 计算主面板 frame，并锚定到物理屏幕底部
4. 原生窗口层级维持高于 `Dock` 的置顶策略

### 4.3 `Command + 数字` 快速粘贴

1. `QuickPasteService` 解析组合键
2. 若数字位落在当前记录范围内，则按当前顺序解析出目标 `record_id`
3. 复用既有 `paste_record` 链路执行粘贴
4. 成功后发出 `PanelAutoHidden(reason=quick_paste)`，并由历史聚合执行置顶

### 4.4 左右切换时自动滚动

1. `selectedIndex` 改变
2. `SelectionViewportService` 计算目标卡片是否超出视口
3. 若超出，则计算最小滚动距离并执行一次滚动修正
4. 渲染层只负责表现，不负责修改选中规则

---

## 5. 前端状态模型映射

### 5.1 `ClipboardStore`

- 保持 `records` 与 `selectedIndex` 作为主状态
- `Command + 数字` 与 `1~9` 共享同一套“当前顺序 → 目标记录”映射
- 不新增持久化字段

### 5.2 `UIStore`

- 继续承担面板可见性、弹窗与提示态
- 不再把浏览器窗口 `focus` 当作“应自动显示主面板”的信号
- 自动隐藏后的 `isPanelVisible` 应由显隐同步事件收敛

### 5.3 `SystemStore`

- `panelVisible` 继续保存运行态主面板是否可见
- 可选记录 `lastHiddenReason` 作为调试辅助，但不要求持久化

### 5.4 视口状态

- `scrollLeft / viewportWidth / contentWidth` 仍建议保留在 `CardList` 组件局部状态中
- `Ensure Visible` 属于 UI 运行态，不进入全局配置或数据库

---

## 6. 防腐层（Anti-Corruption Layer）

- 原生窗口失焦、显示器 frame、`Dock` 覆盖层级等差异，都封装在 `src-tauri/src/window/` 内部
- 前端只消费“主面板已显示 / 已隐藏 / 隐藏原因”这类稳定语义，不直接感知 `Cocoa` 细节
- `Command + 数字` 的平台差异在前端键盘层处理；当前版本只对 `macOS` 启用

---

## 7. 模块与 DDD 概念映射

| DDD 概念 | 前端模块 | 后端模块 |
|----------|----------|----------|
| `PanelSession` | `src/App.tsx`、`src/stores/useUIStore.ts`、`src/components/MainPanel/index.tsx` | `src-tauri/src/window/mod.rs`、`src-tauri/src/state.rs` |
| `QuickPasteService` | `src/hooks/useKeyboard.ts` | 复用 `src-tauri/src/paste/mod.rs` |
| `SelectionViewportService` | `src/components/MainPanel/CardList.tsx` | 无需后端参与 |
| `DesktopOverlay` | 无 | `src-tauri/src/window/mod.rs`、`src-tauri/src/window/position.rs` |

---

## 8. 与 v1.0 的主要差异

- `v1.0` 把主面板性能和发布稳定性作为重点；`v1.1` 切回高频交互细节优化
- `v1.0` 采用 `visibleFrame / work_area` 避让 `Dock`；`v1.1` 改为覆盖 `Dock`
- `v1.0` 的数字键语义是“快选”；`v1.1` 在此基础上新增 `Command + 数字` 的“一步直贴”
- `v1.0` 已具备“选中项变化后同步滚动”的局部实现；`v1.1` 要把它升级为版本级显式约束，覆盖小列表与虚拟列表全部路径
