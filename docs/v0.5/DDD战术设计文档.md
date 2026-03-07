# v0.5 DDD 战术设计文档

## 1. 文档概述

### 1.1 版本范围

本文档定义 **v0.5 Beta 版本** 的 DDD 战术设计。

`v0.5` 在 `v0.3` 已有的 `Clipboard History Context`、`Desktop Session Context` 与 `Panel Presentation Context` 之上，新增“设置中心”与“三平台能力探测”两条主线，但仍不引入搜索、收藏、云同步等更大范围的业务对象。

### 1.2 技术背景

- 前端：`React + TypeScript + Zustand + Tailwind CSS`
- 桌面框架：`Tauri 2`
- 后端：`Rust`
- 历史数据：`SQLite`
- 偏好与规则：`config.json`（版本化配置）
- 系统能力：由 `platform/` 提供平台适配与能力探测

---

## 2. 核心领域概念

### 2.1 限界上下文（Bounded Context）

| 上下文 | 类型 | 责任 |
|--------|------|------|
| Clipboard History Context | 核心领域 | 采集、去重、查询、粘贴、删除、清空历史 |
| Settings Center Context | 核心领域 | 设置快照、配置校验、黑名单规则、主题与快捷键偏好 |
| Desktop Session Context | 支撑领域 | 监听状态、自启动状态、托盘状态、设置同步广播 |
| Platform Capability Context | 支撑领域 | 平台能力探测、平台默认快捷键、X11 / Wayland 降级判定 |
| Presentation Context | 应用层 | 主面板、设置窗口、确认弹窗与反馈编排 |

### 2.2 统一语言（Ubiquitous Language）

| 术语 | 定义 |
|------|------|
| Settings Snapshot | 当前完整配置快照，用于设置窗口首屏回显 |
| General Settings | 通用设置，含主题、语言、自启动 |
| History Policy | 记录保留与存储策略 |
| Shortcut Profile | 调出主面板的快捷键配置 |
| Blacklist Rule | 一条“哪些应用不被记录”的规则 |
| Platform Capability | 当前平台某项系统能力的支持状态 |
| Capability Degradation | 当前环境可运行但部分能力不可用的状态 |
| Settings Sync | 设置窗口、托盘与主面板在配置变更后的同步过程 |

---

## 3. 领域模型

### 3.1 聚合根（Aggregate Root）

#### `ClipboardHistory`

继续作为剪贴板历史的唯一聚合根，负责：

- 接收来自监听器的采集结果
- 执行内容去重与置顶
- 维护文本 / 图片 / 文件三类保留策略
- 对外提供摘要与详情查询

#### `SettingsProfile`

`v0.5` 新增的核心聚合根，负责：

- 承载 `GeneralSettings`、`HistoryPolicy`、`ShortcutProfile`、`PrivacyPolicy`
- 对设置值做边界校验
- 保存黑名单规则集合
- 触发“配置已更新”领域事件

#### `DesktopSession`

负责运行态状态，不承担设置持久化：

- 当前监听状态
- 主面板显隐状态
- 当前平台能力快照
- 当前自启动实际状态与托盘状态

### 3.2 实体（Entity）

| 实体 | 所属聚合 | 说明 |
|------|----------|------|
| `ClipboardRecord` | `ClipboardHistory` | 文本 / 图片 / 文件历史记录 |
| `ImageAsset` | `ClipboardHistory` | 图片原图与缩略图资源元数据 |
| `FileItem` | `ClipboardHistory` | 文件记录内的文件 / 目录条目 |
| `BlacklistRule` | `SettingsProfile` | 黑名单规则实体，带稳定 `id` |
| `SessionFlags` | `DesktopSession` | 当前监听、自启动、托盘、窗口状态 |

### 3.3 值对象（Value Object）

| 值对象 | 说明 |
|--------|------|
| `ThemeMode` | `light` / `dark` / `system` |
| `HistoryLimit` | 某一内容类型的保留上限 |
| `StorageQuota` | 图片资源总存储上限（MB） |
| `ShortcutChord` | 一组被标准化后的快捷键组合 |
| `AppIdentifier` | 平台相关的应用标识，如 Bundle ID / 进程名 / WM_CLASS |
| `CapabilityState` | `supported` / `degraded` / `unsupported` |
| `PlatformKind` | `macos` / `windows` / `linux` |
| `DegradationReason` | 能力降级说明，如 `wayland_global_shortcut_unavailable` |

### 3.4 领域事件（Domain Events）

| 事件 | 触发时机 | 消费方 |
|------|----------|--------|
| `SettingsLoaded` | 设置窗口首次读取配置 | 设置页首屏 |
| `SettingsUpdated` | 任一设置组保存成功 | 托盘、主面板、设置窗口 |
| `ShortcutUpdated` | 全局快捷键成功重注册 | 托盘、日志 |
| `ShortcutRejected` | 快捷键冲突或平台不支持 | 设置窗口 |
| `BlacklistRuleCreated` | 新增黑名单规则 | 设置窗口 |
| `BlacklistRuleUpdated` | 修改黑名单规则 | 设置窗口 |
| `BlacklistRuleDeleted` | 删除黑名单规则 | 设置窗口 |
| `CaptureSkippedByBlacklist` | 黑名单命中后跳过入库 | 日志、调试监控 |
| `CapabilitiesResolved` | 平台能力探测完成 | 设置窗口、运行态查询 |

### 3.5 领域服务（Domain Services）

| 服务 | 职责 |
|------|------|
| `SettingsValidationService` | 校验上限、主题、黑名单规则合法性 |
| `ShortcutConflictChecker` | 检查快捷键格式、保留键、系统冲突与平台注册结果 |
| `BlacklistMatcher` | 将当前活动应用与黑名单规则做匹配 |
| `PlatformCapabilityResolver` | 识别当前平台、会话类型与支持矩阵 |
| `ThemeResolver` | 将 `system` 主题映射为当前实际主题 |
| `SettingsSyncCoordinator` | 将配置变更传播给托盘、主面板与运行态 |

### 3.6 仓储接口（Repository Interface）

| 仓储 | 说明 |
|------|------|
| `ClipboardRepository` | 继续承载历史记录持久化与查询 |
| `SettingsRepository` | 负责读取 / 迁移 / 保存 `config.json` |
| `AutostartRepository` | 平台自启动配置读写（plist / Registry / `.desktop`） |
| `CapabilitySnapshotRepository` | 仅运行时内存快照，不落盘 |

---

## 4. 聚合交互流程

### 4.1 打开设置窗口

1. Presentation 层触发 `show_settings_window`
2. `SettingsApplicationService` 读取 `SettingsProfile`
3. `PlatformCapabilityResolver` 生成当前平台能力快照
4. 设置窗口首屏渲染 `Settings Snapshot + Platform Capabilities`

### 4.2 修改快捷键并保存

1. 前端录制新的 `ShortcutChord`
2. `ShortcutConflictChecker` 先做格式与冲突校验
3. 校验通过后 `SettingsProfile` 更新 `ShortcutProfile`
4. `SettingsRepository` 持久化
5. `DesktopSession` 重新注册全局快捷键
6. 发布 `ShortcutUpdated` 与 `SettingsUpdated`

### 4.3 新增黑名单规则

1. 设置窗口提交 `app_name + app_identifier + platform + match_type`
2. `SettingsValidationService` 校验必填字段与重复规则
3. `SettingsProfile` 创建 `BlacklistRule`
4. `SettingsRepository` 写回 `config.json`
5. 发布 `BlacklistRuleCreated` 与 `SettingsUpdated`

### 4.4 监听阶段命中黑名单

1. `ClipboardMonitor` 获取当前活动应用标识
2. `BlacklistMatcher` 在 `SettingsProfile.privacy.blacklist_rules` 中匹配
3. 命中时直接丢弃本次采集，不进入 `ClipboardHistory`
4. 发布 `CaptureSkippedByBlacklist`

### 4.5 读取平台能力并做降级提示

1. `PlatformCapabilityResolver` 根据 `platform + desktop_session` 计算支持矩阵
2. `DesktopSession` 保留能力快照
3. Presentation 层把 `degraded` / `unsupported` 转为提示条或禁用态说明

---

## 5. 前端状态模型映射

### 5.1 `ClipboardStore`

继续负责：

- 历史记录摘要列表
- 当前选中记录
- 删除、粘贴、清空历史后的局部刷新

### 5.2 `UIStore`

继续负责：

- 主面板是否可见
- Toast、确认弹窗、当前焦点位置
- 当前活动窗口的轻量 UI 状态

### 5.3 `SystemStore`

继续负责：

- `monitoring`
- `launch_at_login`
- `panel_visible`
- `tray_available`

### 5.4 `SettingsStore`（新增）

建议新增：

- `settingsSnapshot`
- `platformCapabilities`
- `isDirty`
- `isSaving`
- `lastValidationError`

这样可以把“已保存配置”和“表单临时编辑态”分离，避免设置窗口关闭时污染全局运行态。

---

## 6. 防腐层（Anti-Corruption Layer）

`v0.5` 推荐新增两层防腐：

- **平台防腐层**：封装 `Windows API`、`X11`、`Wayland`、`Launch Agent`、`Registry`、`XDG autostart`
- **设置防腐层**：将前端表单对象转换为后端稳定的 `SettingsSnapshot` 与分组更新命令

这样可以避免：

- UI 直接依赖平台细节
- 平台差异直接泄露到领域层
- 同一配置项在前后端使用不同命名造成漂移

---

## 7. 模块与 DDD 概念映射

| 模块 | DDD 归属 | 说明 |
|------|----------|------|
| `clipboard/` | `Clipboard History Context` | 采集、去重、查询、淘汰 |
| `paste/` | `Clipboard History Context` | 再次粘贴与显式置顶 |
| `settings/`（建议新增） | `Settings Center Context` | 配置模型、校验、迁移、黑名单规则 |
| `config/` | `Settings Center Context` | `config.json` 读写与版本迁移 |
| `platform/` | `Platform Capability Context` | 平台能力探测与 API 封装 |
| `shortcut/` | `Desktop Session Context` | 快捷键注册、重注册、冲突检测接入 |
| `autostart/` | `Desktop Session Context` | 三平台自启动落地 |
| `tray/` | `Desktop Session Context` | 托盘菜单与状态同步 |
| `window/` | `Presentation Context` | 主面板 / 设置窗口的显隐与激活 |
| `src/components/Settings/` | `Presentation Context` | 设置页分组 UI 与表单交互 |

---

## 8. 与 v0.3 的主要差异

| 项目 | v0.3 | v0.5 |
|------|------|------|
| 核心新增聚合 | 无 | 新增 `SettingsProfile` |
| 配置表达 | 扁平字段 | 分组化、版本化配置 |
| 黑名单 | 无 | 作为 `SettingsProfile` 的实体集合 |
| 平台能力 | 以 macOS 为主 | 三平台能力矩阵 + Wayland 降级 |
| 前端状态 | `ClipboardStore` + `UIStore` + `SystemStore` | 新增 `SettingsStore` |

`v0.5` 的核心不是再扩展新业务对象，而是把“系统能力 + 用户偏好”升级为稳定的一等模型。
