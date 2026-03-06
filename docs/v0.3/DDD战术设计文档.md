# v0.3 DDD 战术设计文档

## 1. 文档概述

### 1.1 版本范围

`v0.3` 在 `v0.2` 的“历史记录采集 / 存储 / 再次粘贴”核心域之上，新增系统托盘、监听控制、开机自启动、多显示器定位与交互动效相关能力。

本版本的 DDD 重点不是引入新的内容类型，而是把“历史记录域”与“系统集成域”拆清：
- 历史记录继续是核心领域
- 托盘、自启动、窗口定位属于支撑领域 / 基础设施领域
- 前端动效与数字键快选属于应用层交互编排

### 1.2 技术背景

- 前端：React + TypeScript + Zustand + Framer Motion
- 桌面壳：Tauri 2
- 后端：Rust
- 持久化：SQLite + 本地文件系统
- 目标平台：macOS

---

## 2. 核心领域概念

### 2.1 限界上下文（Bounded Context）

| 上下文 | 类型 | 责任 |
|--------|------|------|
| Clipboard History Context | 核心领域 | 采集、去重、查询、粘贴、删除、清空历史 |
| Desktop Session Context | 支撑领域 | 监听状态、自启动状态、托盘状态、运行时控制 |
| Panel Presentation Context | 应用层 | 主面板显隐、多显示器定位、键盘快选、动效编排 |

### 2.2 统一语言（Ubiquitous Language）

| 术语 | 定义 |
|------|------|
| Clipboard Record | 一条可再次粘贴的历史记录 |
| Capture | 从系统粘贴板捕获一次内容变化 |
| Promote | 将已有记录提升为最新使用 |
| Monitoring State | 当前监听状态，`running` 或 `paused` |
| Tray Menu Intent | 托盘菜单触发的一次业务意图 |
| Launch At Login | 登录系统时自动启动应用的能力 |
| Active Display | 当前应承载主面板的目标显示器 |
| Quick Select Slot | 主面板中由数字键 `1-9` 对应的前 9 条可视记录 |
| History Clear | 删除全部历史记录与关联资源的批量操作 |

---

## 3. 领域模型

### 3.1 聚合根（Aggregate Root）

#### `ClipboardHistory`

仍然是 `v0.3` 的核心聚合根，负责：
- 捕获新内容并决定新建 / 复用 / 丢弃
- 提供摘要、详情、删除、清空历史能力
- 粘贴成功后显式置顶记录
- 历史清空时统一删除图片资产与文件明细

**关键不变式**：
- 同类型相同内容只能存在一条有效记录
- 清空历史后不能残留 `image_assets` / `file_items` 孤儿数据
- 粘贴与删除不改变记录类型语义

#### `DesktopSession`

`v0.3` 新增的支撑聚合，用于表达应用运行时会话状态：
- 当前监听状态：运行 / 暂停
- 当前开机自启动状态：开启 / 关闭
- 当前托盘状态：正常 / 暂停 / 初始化失败降级

`DesktopSession` 不直接保存剪贴板数据，只负责描述系统集成的“可控状态”。

### 3.2 实体（Entity）

| 实体 | 所属聚合 | 说明 |
|------|----------|------|
| `ClipboardRecord` | `ClipboardHistory` | 文本 / 图片 / 文件三类记录实体 |
| `ImageAsset` | `ClipboardHistory` | 图片原图与缩略图资源元数据 |
| `FileItem` | `ClipboardHistory` | 文件记录下的路径明细 |
| `SessionFlags` | `DesktopSession` | 当前监听、自启动、托盘状态快照 |

### 3.3 值对象（Value Object）

```rust
pub enum MonitoringState {
    Running,
    Paused,
}

pub struct LaunchAtLogin(pub bool);

pub struct ActiveDisplay {
    pub id: String,
    pub origin_x: f64,
    pub origin_y: f64,
    pub width: f64,
    pub height: f64,
    pub work_area_x: f64,
    pub work_area_y: f64,
    pub work_area_width: f64,
    pub work_area_height: f64,
}

pub struct QuickSelectIndex(pub usize);
```

这些值对象强调：
- `MonitoringState` 只表达状态，不包含控制行为
- `ActiveDisplay` 是窗口定位计算输入，不持久化到数据库
- `QuickSelectIndex` 必须满足 `1 <= n <= 9`

### 3.4 领域事件（Domain Events）

| 事件 | 触发时机 | 消费方 |
|------|----------|--------|
| `RecordCaptured` | 新记录进入历史 | 前端主面板、日志 |
| `RecordPromoted` | 旧记录被复用或再次粘贴 | 前端排序刷新 |
| `RecordDeleted` | 单条删除或保留策略清理 | 前端移除卡片 |
| `HistoryCleared` | 用户确认清空全部历史 | 主面板空状态、托盘 |
| `MonitoringPaused` | 托盘触发暂停监听 | 托盘图标、运行状态查询 |
| `MonitoringResumed` | 恢复监听 | 托盘图标、运行状态查询 |
| `LaunchAtLoginChanged` | 用户切换自启动 | 托盘菜单勾选态、日志 |

### 3.5 领域服务（Domain Services）

```rust
pub trait MonitoringControlService {
    fn get_state(&self) -> MonitoringState;
    fn set_state(&self, target: MonitoringState) -> Result<MonitoringState>;
}

pub trait AutostartService {
    fn status(&self) -> Result<LaunchAtLogin>;
    fn set_enabled(&self, enabled: bool) -> Result<LaunchAtLogin>;
}

pub trait PanelPlacementService {
    fn resolve_active_display(&self) -> Result<ActiveDisplay>;
    fn calculate_panel_frame(&self, display: &ActiveDisplay) -> PanelFrame;
}
```

### 3.6 仓储接口（Repository Interface）

`v0.3` 沿用 `v0.2` 的 `ClipboardRecordRepository`，并新增配置仓储抽象：

```rust
pub trait AppConfigRepository {
    fn load(&self) -> Result<AppConfig>;
    fn save(&self, config: &AppConfig) -> Result<()>;
}
```

说明：
- 历史记录依旧使用 SQLite + 文件系统
- 自启动开关等系统集成偏好仍保存到 `config.json`
- “监听是否暂停”只属于运行期状态，不写入数据库

---

## 4. 聚合交互流程

### 4.1 托盘点击“暂停监听”

```text
Tray Menu
   │ 点击“暂停监听”
   ▼
DesktopSession.set_state(Paused)
   │
   ├── ClipboardMonitorControl.pause()
   ├── TrayIcon refresh(paused)
   └── emit system:monitoring-changed
```

### 4.2 托盘点击“清空历史”

```text
Tray Menu
   │ 点击“清空历史”
   ▼
Confirm Action
   │ 用户确认
   ▼
ClipboardHistory.clear_all()
   │
   ├── delete clipboard_items / image_assets / file_items
   ├── delete images/original/* and images/thumbs/*
   └── emit HistoryCleared
```

### 4.3 打开主面板时选择目标显示器

```text
Global Shortcut / Tray Menu
   ▼
PanelPlacementService.resolve_active_display()
   ▼
calculate_panel_frame(active_display.work_area)
   ▼
WindowManager.show(frame)
```

### 4.4 切换开机自启动

```text
Tray Menu [checkbox]
   ▼
AutostartService.set_enabled(true/false)
   │
   ├── write Launch Agent plist / remove plist
   ├── AppConfigRepository.save(launch_at_login)
   └── emit LaunchAtLoginChanged
```

---

## 5. 前端状态模型映射

### 5.1 Clipboard Store

延续 `v0.2`：
- `records`
- `selectedIndex`
- `hydrate / upsertRecord / removeRecord`

新增关注点：
- 清空历史后通过单次 action 重置为 `[]`
- 数字键快选直接设置 `selectedIndex`

### 5.2 UI Store

新增建议状态：

```typescript
interface UIState {
  isPanelVisible: boolean;
  isClearingHistory: boolean;
  toast?: ToastPayload | null;
}
```

### 5.3 System Store（建议新增）

```typescript
interface SystemState {
  monitoring: boolean;
  launchAtLogin: boolean;
  trayAvailable: boolean;
}
```

---

## 6. 防腐层（Anti-Corruption Layer）

为避免前端直接依赖操作系统概念，`v0.3` 继续通过 IPC 做隔离：
- 前端只感知 `monitoring: boolean`
- 不直接感知 Launch Agent plist 细节
- 不直接感知 macOS `NSScreen` / `work_area` 计算逻辑

这使得未来 `v0.5` 扩展到 Windows / Linux 时，前端契约可以保持稳定。

---

## 7. 模块与 DDD 概念映射

| 模块 | DDD 归属 | 说明 |
|------|----------|------|
| `clipboard/` | `Clipboard History Context` | 采集、去重、查询、清空 |
| `paste/` | `Clipboard History Context` | 再次粘贴、显式置顶 |
| `config/` | `Desktop Session Context` | 自启动等系统偏好持久化 |
| `tray/`（建议新增） | `Desktop Session Context` | 托盘菜单与状态图标 |
| `shortcut/` | 应用层 | 全局入口，触发主面板显示 |
| `window/` | `Panel Presentation Context` | 多显示器定位、显隐 |
| `src/components/MainPanel/` | `Panel Presentation Context` | 卡片 UI、动效与键盘交互 |

`v0.3` 的核心判断标准是：**不要把系统集成状态混入历史数据模型**。历史仍然是历史，会话仍然是会话，窗口表现仍然由应用层负责编排。
