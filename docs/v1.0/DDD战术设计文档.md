# v1.0 DDD 战术设计文档

## 1. 文档概述

### 1.1 版本范围

本文档描述 `v1.0 Release` 当前版本的战术设计，重点覆盖以下新增主题：

- 启动阶段的数据库迁移与损坏恢复
- `macOS` 权限引导与平台能力兜底
- 关于页、日志诊断、更新检查
- 主面板性能优化与图片缓存治理
- 孤立图片文件扫描与清理

### 1.2 技术背景

- 前端：`React + TypeScript + Zustand`
- 桌面壳：`Tauri 2`
- 后端：`Rust`
- 存储：`SQLite + config.json + 图片文件目录 + 本地日志目录`
- 既有能力：`v0.5` 已完成三平台主流程、设置中心、快捷键、黑名单与能力降级

---

## 2. 核心领域概念

### 2.1 限界上下文（Bounded Context）

| 上下文 | 说明 | 当前版本关注点 |
|--------|------|----------------|
| `ClipboardContext` | 管理剪贴板记录采集、查询、粘贴、删除、清空 | 长列表性能、图片缓存、清空一致性 |
| `SettingsContext` | 管理主题、快捷键、容量策略、黑名单等偏好配置 | 延续 `v0.5` 结构，不新增复杂配置模型 |
| `DesktopRuntimeContext` | 管理窗口、托盘、快捷键、权限状态、平台能力 | `macOS` 权限引导、降级可用性 |
| `ReleaseOpsContext` | 管理版本信息、日志、更新检查、数据库迁移、资产清理 | `v1.0` 新增重点 |

### 2.2 统一语言（Ubiquitous Language）

| 术语 | 定义 |
|------|------|
| `ClipboardRecord` | 一条历史记录，可能是文本、图片或文件集合 |
| `RuntimeStatus` | 运行期状态快照，包括监听状态、托盘可用性、面板显隐等 |
| `PlatformCapabilities` | 当前平台 / 会话可用能力矩阵 |
| `PermissionStatus` | 当前需要的系统权限状态，如 `granted / missing / unsupported` |
| `SchemaVersion` | `SQLite` 当前结构版本，通过 `PRAGMA user_version` 表达 |
| `MigrationPlan` | 从旧版本迁移到当前结构所需执行的有序脚本集合 |
| `RecoveryRebuild` | 数据库损坏后先备份、再重建的恢复过程 |
| `DiagnosticsSnapshot` | 关于页 / 诊断页展示的版本、路径、日志、迁移、清理摘要 |
| `UpdateCheckResult` | 手动检查更新后的结果快照 |
| `OrphanAsset` | 磁盘中存在但数据库已无引用的图片原图或缩略图 |
| `ImageOriginalCache` | 为再次粘贴原图而保留的有限容量缓存 |

---

## 3. 领域模型

### 3.1 聚合根（Aggregate Root）

#### `ClipboardHistory`

负责维护历史记录生命周期，是 `ClipboardContext` 的核心聚合。

**职责**：
- 接收采集结果并完成去重、提升、删除、清空
- 维护文本、图片、文件三类记录的统一读取视图
- 在长列表场景下提供按时间倒序的稳定分页 / 限流读取语义
- 与 `ImageOriginalCache`、保留策略、文件清理边界协同

#### `SettingsProfile`

负责维护用户偏好配置，是 `SettingsContext` 的聚合根。

**职责**：
- 承载 `general / history / shortcut / privacy`
- 约束配置写入合法性
- 为 `ClipboardHistory`、`DesktopSession`、`ReleaseHealth` 提供策略输入

#### `DesktopSession`

负责管理桌面运行态，是 `DesktopRuntimeContext` 的聚合根。

**职责**：
- 维护主面板、托盘、设置窗口与关于页的运行协调
- 维护权限状态、平台能力、监听状态和快捷键状态
- 在权限不足或能力降级时提供可解释的用户引导

#### `ReleaseHealth`

负责管理发布质量相关运行数据，是 `ReleaseOpsContext` 的聚合根。

**职责**：
- 暴露应用版本、平台版本、数据库版本、日志目录
- 管理更新检查结果与最近一次检查时间
- 管理数据库迁移、恢复、孤立文件清理摘要
- 为“关于页面 / 诊断入口”提供读模型

### 3.2 实体（Entity）

| 实体 | 所属聚合 | 说明 |
|------|----------|------|
| `ClipboardRecord` | `ClipboardHistory` | 历史记录实体，主键为 `RecordId` |
| `BlacklistRule` | `SettingsProfile` | 隐私黑名单规则实体 |
| `PermissionGuideSession` | `DesktopSession` | 一次权限引导流程的状态实体 |
| `UpdateRelease` | `ReleaseHealth` | 一次更新检查返回的版本信息实体 |
| `MigrationExecution` | `ReleaseHealth` | 一次数据库迁移执行记录 |
| `CleanupExecution` | `ReleaseHealth` | 一次孤立资源清理执行记录 |

### 3.3 值对象（Value Object）

| 值对象 | 说明 |
|--------|------|
| `RecordId` | 历史记录标识 |
| `ContentType` | `text / image / files` |
| `PasteMode` | `original / plain_text` |
| `ToggleShortcut` | 规范化后的调出主面板快捷键 |
| `ThemeMode` | `light / dark / system` |
| `PermissionState` | `granted / missing / checking / unsupported` |
| `CapabilityState` | `supported / degraded / unsupported` |
| `SchemaVersion` | 当前数据库版本 |
| `LogDirectory` | 本地日志目录路径 |
| `UpdateChannel` | 更新检查所属渠道，如 `stable` |
| `UpdateCheckResult` | 更新检查结果：`available / latest / failed` |

### 3.4 领域事件（Domain Events）

| 事件 | 说明 |
|------|------|
| `RecordCaptured` | 新记录进入历史 |
| `RecordPromoted` | 已有记录再次被置顶 |
| `RecordDeleted` | 记录被用户删除或保留策略淘汰 |
| `HistoryCleared` | 所有历史与资源被清空 |
| `SettingsUpdated` | 设置快照变更 |
| `ShortcutRebound` | 全局快捷键重注册成功 |
| `PermissionGuideRequested` | 请求展示权限引导 |
| `PermissionStatusChanged` | 系统权限状态变化 |
| `SchemaMigrated` | 数据库迁移成功完成 |
| `DatabaseRecovered` | 数据库损坏后已备份并重建 |
| `UpdateCheckCompleted` | 更新检查已返回结果 |
| `OrphanAssetsCleaned` | 孤立图片资源清理完成 |

### 3.5 领域服务（Domain Services）

| 领域服务 | 说明 |
|----------|------|
| `ClipboardCaptureService` | 采集剪贴板、做去重、转交仓储 |
| `PasteService` | 将记录重新写回系统剪贴板并执行粘贴 |
| `SettingsValidationService` | 校验设置和黑名单规则 |
| `PermissionGuideService` | 检测权限状态、生成引导步骤、处理重试 |
| `UpdateService` | 访问发布信息并生成更新检查结果 |
| `MigrationService` | 读取当前 `SchemaVersion` 并执行增量迁移 |
| `DiagnosticsService` | 汇总日志目录、版本信息、恢复摘要 |
| `ImageCleanupService` | 扫描孤立图片文件并执行安全清理 |
| `ImageCacheService` | 负责原图 `LRU` 缓存装载与淘汰 |

### 3.6 仓储接口（Repository Interface）

| 仓储 | 说明 |
|------|------|
| `ClipboardRepository` | 面向 `SQLite` 与运行态读写历史记录 |
| `ConfigRepository` | 读写 `config.json` |
| `RuntimeRepository` | 管理运行中窗口、状态与事件广播 |
| `DiagnosticsRepository` | 提供日志目录、版本信息、清理记录等读模型 |
| `ReleaseRepository` | 访问更新源或版本清单 |

---

## 4. 聚合交互流程

### 4.1 启动时数据库迁移与恢复

1. `DesktopSession` 启动应用。
2. `MigrationService` 读取 `SchemaVersion`。
3. 若数据库损坏，则触发 `RecoveryRebuild`：备份原库及 sidecar，再重建空库。
4. 若 `SchemaVersion < CURRENT_SCHEMA_VERSION`，按序执行 `MigrationPlan`。
5. 成功后发布 `SchemaMigrated` 或 `DatabaseRecovered` 事件。
6. `ReleaseHealth` 刷新诊断快照，供关于页读取。

### 4.2 macOS 权限引导

1. `DesktopSession` 查询 `PermissionState`。
2. 若权限缺失，发布 `PermissionGuideRequested`。
3. 前端展示引导弹窗，说明用途、路径和重试方式。
4. 用户授权后触发重新检测。
5. 若通过，发布 `PermissionStatusChanged(granted)` 并恢复相关按钮状态。

### 4.3 关于页手动检查更新

1. 用户在关于页点击“检查更新”。
2. `UpdateService` 调用更新源并生成 `UpdateCheckResult`。
3. 结果写入 `ReleaseHealth`。
4. 前端根据 `available / latest / failed` 渲染不同反馈。
5. 若存在新版本，提供下载或打开发布页入口。

### 4.4 主面板长列表浏览

1. 前端请求最近记录摘要。
2. `ClipboardRepository` 只返回渲染所需摘要。
3. 视图层使用虚拟滚动只渲染可见区卡片。
4. 当用户选中图片记录并发起粘贴时，`ImageCacheService` 决定是否命中原图缓存。
5. 粘贴完成后更新 `last_used_at` 并触发 `RecordPromoted`。

### 4.5 周期性孤立图片清理

1. `ImageCleanupService` 读取图片目录与数据库引用清单。
2. 对比得到 `OrphanAsset` 集合。
3. 删除孤立原图和缩略图。
4. 发布 `OrphanAssetsCleaned` 事件并写入日志。
5. `ReleaseHealth` 更新最近一次清理统计。

---

## 5. 前端状态模型映射

### 5.1 `ClipboardStore`

- 保存记录摘要列表、当前选中记录、更新与删除动作
- 支撑虚拟滚动视图所需的稳定键与列表排序

### 5.2 `UIStore`

- 管理主面板显隐、确认弹窗、Toast、清空历史弹窗
- 承接更新结果提示、诊断提醒等轻量 UI 状态

### 5.3 `SystemStore`

- 管理 `monitoring / launch_at_login / panel_visible / tray_available`
- 承接 `PlatformCapabilities` 与权限相关只读状态

### 5.4 `SettingsStore`

- 保存 `SettingsSnapshot`
- 为主题同步、容量设置、快捷键设置、隐私页提供统一快照

### 5.5 `DiagnosticsStore`（v1.0 新增推荐）

- 管理关于页与诊断页需要的 `ReleaseHealth` 读模型
- 保存最近一次更新检查结果、日志目录、迁移与清理摘要
- 只承载读模型，不写业务配置

---

## 6. 防腐层（Anti-Corruption Layer）

- 前端只通过 `src/api/` 暴露的命令与事件接口访问后端，不直接感知平台差异。
- 平台差异统一封装在 `platform/`、`shortcut/`、`window/`、`autostart/` 与权限检测服务中。
- 更新检查适配器需要隔离第三方发布源响应格式，向领域层统一输出 `UpdateCheckResult`。
- 日志系统向前端暴露目录、状态与错误，不泄露底层日志框架细节。

---

## 7. 模块与 DDD 概念映射

| 代码模块 | DDD 角色 | v1.0 说明 |
|----------|----------|-----------|
| `clipboard/` | `ClipboardContext` 领域层 + 应用层 | 继续承载采集、查询、记录提升与清理 |
| `settings/` + `config/` | `SettingsContext` 聚合与校验 | 延续 `v0.5` 配置模型 |
| `platform/` + `shortcut/` + `window/` + `tray/` | `DesktopRuntimeContext` 基础设施层 | 增加权限状态检测与页面入口协同 |
| `persistence/` | `ReleaseOpsContext` + `ClipboardContext` 基础设施层 | 增加迁移、恢复、孤立文件扫描 |
| `logging.rs` | `ReleaseOpsContext` 基础设施层 | 统一落地本地日志与 panic 捕获 |
| `ipc/` | 应用服务层 | 聚合命令、事件与 DTO 转换 |

---

## 8. 与 v0.5 的主要差异

- `v0.5` 的重点是“跨平台 + 设置中心 + 隐私规则”，`v1.0` 的重点转为“发布质量 + 性能 + 诊断可维护性”。
- `v1.0` 不新增新的核心业务聚合，而是在 `ReleaseOpsContext` 中补齐迁移、日志、更新检查与清理能力。
- `v1.0` 保持 `SettingsProfile` 边界稳定，不为权限引导、更新检查额外扩展重型配置模型。
- `v1.0` 的页面新增遵循“少而清晰”的原则：新增关于页与权限引导，不引入新的业务工作台。
