# v0.2 DDD 战术设计文档

## 1. 文档概述

### 1.1 版本范围

本文档定义 **v0.2 Alpha 版本** 的领域模型与战术设计，仅覆盖以下能力：
- 文本、图片、文件/目录三种内容的采集、去重、持久化与再次粘贴
- SQLite + 本地文件系统组合存储
- 主面板读取摘要数据、按需加载详情数据
- 纯文本粘贴与自动清理策略

### 1.2 技术背景

- 前端：React + TypeScript + Zustand
- 后端：Rust + Tauri 2
- 持久化：SQLite
- 文件资源：应用数据目录下的图片原图与缩略图目录

---

## 2. 核心领域概念

### 2.1 限界上下文（Bounded Context）

| 上下文 | 类型 | 职责 |
|--------|------|------|
| Clipboard Capture Context | 核心域 | 监听系统粘贴板，识别内容类型，生成领域命令 |
| Clipboard History Context | 核心域 | 管理记录生命周期、去重、置顶、淘汰与查询 |
| Paste Execution Context | 支撑域 | 将记录恢复为系统粘贴板内容并执行粘贴 |
| Asset Management Context | 支撑域 | 图片原图/缩略图落盘、清理与状态维护 |
| Panel Query Context | 支撑域 | 面向前端输出卡片摘要与详情 DTO |

### 2.2 统一语言（Ubiquitous Language）

| 术语 | 定义 |
|------|------|
| Clipboard Record | 一条可被再次粘贴的历史记录 |
| Record Summary | 用于主面板卡片渲染的轻量摘要 |
| Record Detail | 用于粘贴与详情读取的完整记录 |
| Content Hash | 用于跨会话去重的内容哈希 |
| Retention Policy | 按内容类型保留上限并自动清理最旧记录的规则 |
| Thumbnail State | 图片缩略图状态：`pending` / `ready` / `failed` |

---

## 3. 领域模型

### 3.1 聚合根（Aggregate Root）

#### ClipboardHistory（粘贴板历史聚合根）

`ClipboardHistory` 负责定义“什么内容可以进入历史”“重复内容如何复用”“何时执行淘汰与资源回收”。

```rust
pub struct ClipboardHistory {
    retention_policy: RetentionPolicy,
}

impl ClipboardHistory {
    pub fn capture(&self, candidate: CaptureCandidate) -> CaptureDecision;

    pub fn mark_pasted(
        &self,
        record: ClipboardRecord,
        pasted_at: i64,
    ) -> ClipboardRecord;

    pub fn remove(&self, record: ClipboardRecord) -> RemovalPlan;
}
```

**聚合不变式**：
1. `(content_type, content_hash)` 在有效历史中唯一
2. `text` 记录必须存在 `text_content`
3. `image` 记录必须存在图片资源元数据
4. `files` 记录必须至少包含 1 条文件项
5. 超出类型上限时必须移除同类型最旧记录
6. `plain_text` 粘贴模式仅允许 `text` 记录使用

### 3.2 实体（Entity）

#### ClipboardRecord（粘贴板记录实体）

```rust
pub struct ClipboardRecord {
    pub id: RecordId,
    pub content_type: ContentType,
    pub content_hash: ContentHash,
    pub text_content: Option<String>,
    pub rich_content: Option<String>,
    pub preview_text: String,
    pub source_app: Option<String>,
    pub created_at: i64,
    pub last_used_at: i64,
    pub body: RecordBody,
}

pub enum RecordBody {
    Text(TextPayload),
    Image(ImagePayload),
    Files(FilePayload),
}
```

**实体职责**：
- 持有统一元数据与类型专属负载
- 生成卡片摘要所需的预览信息
- 在被再次粘贴时刷新 `last_used_at`

### 3.3 值对象（Value Object）

#### RecordId

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct RecordId(i64);
```

#### ContentType

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContentType {
    Text,
    Image,
    Files,
}
```

#### PasteMode

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PasteMode {
    Original,
    PlainText,
}
```

#### ContentHash

```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ContentHash(String);
```

**哈希规则**：
- 文本：基于原始文本 UTF-8 字节计算 SHA-256
- 图片：基于原图字节计算 SHA-256
- 文件：基于规范化绝对路径列表（保持顺序）计算 SHA-256

#### RetentionPolicy

```rust
pub struct RetentionPolicy {
    pub max_text_records: usize,
    pub max_image_records: usize,
    pub max_file_records: usize,
}
```

默认值：文本 `200`、图片 `50`、文件 `100`。

### 3.4 领域事件（Domain Events）

```rust
pub enum ClipboardDomainEvent {
    RecordCaptured { record_id: RecordId, content_type: ContentType },
    RecordPromoted { record_id: RecordId },
    RecordDeleted { record_id: RecordId },
    RecordsPruned { record_ids: Vec<RecordId>, content_type: ContentType },
    ThumbnailReady { record_id: RecordId },
}
```

**事件用途**：
- 推送前端卡片更新
- 触发图片缩略图异步生成后的刷新
- 触发图片孤立资源清理

### 3.5 领域服务（Domain Services）

#### ClipboardCaptureService

职责：
- 从平台层读取最新粘贴板内容
- 构造 `CaptureCandidate`
- 调用聚合根做去重与保留策略判断
- 持久化记录并发布领域事件

#### PasteService

职责：
- 根据 `RecordId` 读取完整记录详情
- 按 `PasteMode` 生成系统粘贴板写入内容
- 调用平台适配层执行实际粘贴
- 粘贴成功后显式置顶对应记录

#### ThumbnailService

职责：
- 接收原图路径并异步生成缩略图
- 更新 `thumbnail_state`
- 成功后发送 `ThumbnailReady`

#### RetentionService

职责：
- 按类型检查记录总量
- 生成需要淘汰的记录列表
- 驱动数据库删除与资源文件清理

### 3.6 仓储接口（Repository Interface）

```rust
pub trait ClipboardRecordRepository {
    fn find_recent_summaries(&self, limit: usize) -> Result<Vec<RecordSummary>>;
    fn find_detail(&self, id: RecordId) -> Result<Option<ClipboardRecord>>;
    fn find_by_hash(
        &self,
        content_type: ContentType,
        hash: &ContentHash,
    ) -> Result<Option<ClipboardRecord>>;
    fn upsert(&self, record: PersistableRecord) -> Result<ClipboardRecord>;
    fn promote(&self, id: RecordId, last_used_at: i64) -> Result<ClipboardRecord>;
    fn delete(&self, id: RecordId) -> Result<()>;
    fn prune_exceeded(&self, policy: &RetentionPolicy) -> Result<Vec<ClipboardRecord>>;
}
```

```rust
pub trait AssetStorage {
    fn save_original_image(&self, bytes: &[u8], hash: &ContentHash) -> Result<String>;
    fn save_thumbnail(&self, original_path: &str, hash: &ContentHash) -> Result<String>;
    fn remove_image_assets(&self, original_path: &str, thumbnail_path: Option<&str>) -> Result<()>;
}
```

---

## 4. 聚合交互流程

### 4.1 复制内容 → 进入历史

```
PlatformClipboard
    │ 读取系统内容
    ▼
ClipboardCaptureService
    │ 识别类型 + 计算 ContentHash
    ▼
ClipboardHistory.capture()
    │ 判断新建 / 复用 / 丢弃
    ▼
ClipboardRecordRepository.upsert()/promote()
    │
    ├── image → AssetStorage 保存原图并异步生成缩略图
    └── files → 保存文件项明细
    ▼
emit clipboard:new-record / clipboard:record-updated
```

### 4.2 用户按 Enter → 再次粘贴

```
前端选中卡片
    ▼
IPC paste_record(id, mode)
    ▼
PasteService.find_detail(id)
    ▼
根据 content_type 组装系统粘贴板内容
    ▼
PlatformPaste 执行 Cmd+V
    ▼
Repository.promote(id)
    ▼
返回最新 RecordSummary 给前端
```

### 4.3 超出上限 → 自动清理

```
新记录持久化完成
    ▼
RetentionService 按类型统计数量
    ▼
选出同类型最旧记录
    ▼
事务删除数据库记录
    ▼
如为图片，再删除原图与缩略图
    ▼
emit clipboard:record-deleted / RecordsPruned
```

---

## 5. 前端状态模型映射

### 5.1 Clipboard Store

```typescript
interface ClipboardState {
  records: ClipboardRecordSummary[];
  selectedIndex: number;
  isHydrating: boolean;
  actions: {
    hydrate(records: ClipboardRecordSummary[]): void;
    upsertRecord(record: ClipboardRecordSummary): void;
    removeRecord(id: number): void;
    markThumbnailReady(id: number, thumbnailPath: string): void;
    selectNext(): void;
    selectPrev(): void;
  };
}
```

### 5.2 UI Store

```typescript
interface UIState {
  isPanelVisible: boolean;
  toast?: { level: "info" | "error"; message: string };
}
```

---

## 6. 防腐层（Anti-Corruption Layer）

| 外部系统 | 防腐策略 |
|----------|----------|
| macOS 粘贴板原生类型 | 统一映射为 `CaptureCandidate` |
| SQLite 行数据 | 统一转换为 `ClipboardRecord` 与 `RecordSummary` |
| 前端 DTO | 与领域实体分离，避免直接暴露数据库字段 |
| 图片文件系统路径 | 通过 `AssetStorage` 抽象，领域层不直接拼路径 |

---

## 7. 模块与 DDD 概念映射

| 模块 | DDD 角色 | 说明 |
|------|-----------|------|
| `clipboard/` | 聚合 + 领域服务 | 历史规则、去重、事件 |
| `persistence/` | 仓储实现 | SQLite 读写、事务、迁移 |
| `image/` | 资源存储实现 | 原图与缩略图文件管理 |
| `paste/` | 领域服务实现 | 多类型粘贴、纯文本降级 |
| `ipc/` | 应用服务层 | Command/Event 暴露 |
| `platform/` | 基础设施层 | 粘贴板读取、按键模拟 |
