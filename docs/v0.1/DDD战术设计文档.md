# v0.1 DDD 战术设计文档

## 1. 文档概述

### 1.1 版本范围

本文档描述 **v0.1 MVP 版本**的领域驱动设计（DDD）战术层面实现，包括领域模型、聚合根、值对象、领域事件、领域服务及仓储接口定义。

v0.1 功能范围：文本粘贴板监听 + 快捷键调出面板 + 横向卡片展示 + 键盘操作（切换/粘贴/删除/关闭）+ 内存存储 + macOS 单平台。

### 1.2 技术栈背景

- 后端：Rust（Tauri 2.0）
- 存储：内存存储（v0.1 不持久化，重启清空）
- 前端：React 18 + Zustand

---

## 2. 核心领域概念

### 2.1 限界上下文（Bounded Context）

v0.1 涉及以下两个限界上下文：

```
┌──────────────────────────────────────┐   ┌────────────────────────────────────┐
│   粘贴板监听上下文                     │   │   面板交互上下文                     │
│   (Clipboard Monitoring Context)     │   │   (Panel Interaction Context)       │
│                                      │   │                                    │
│   - 监听系统粘贴板变化                │   │   - 历史记录展示                    │
│   - 捕获纯文本内容                    │   │   - 卡片选中状态管理                 │
│   - 维护内存记录列表                  │   │   - 粘贴 / 删除 / 关闭操作           │
└──────────────────────────────────────┘   └────────────────────────────────────┘
              │ Domain Event: ClipboardTextCaptured                ▲
              └────────────────────────────────────────────────────┘
```

---

## 3. 领域模型

### 3.1 聚合根（Aggregate Root）

#### ClipboardHistory（粘贴板历史聚合根）

粘贴板历史是 v0.1 的核心聚合，负责管理内存中的历史记录列表。

```rust
/// 粘贴板历史聚合根
/// 职责：维护最多 MAX_RECORDS 条文本记录的有序列表（按时间倒序）
pub struct ClipboardHistory {
    /// 记录列表，索引 0 为最新记录
    records: Vec<ClipboardRecord>,
    /// 当前列表最大容量（v0.1 固定为 20）
    max_records: usize,
}

impl ClipboardHistory {
    pub const DEFAULT_MAX_RECORDS: usize = 20;

    /// 添加新记录。若内容与最新记录相同则去重跳过。
    /// 超出上限时自动移除最旧记录。
    /// 返回领域事件列表。
    pub fn add_record(&mut self, text: String, captured_at: i64) -> Vec<ClipboardDomainEvent>;

    /// 删除指定 ID 的记录。
    /// 返回被删除记录的 ID（用于生成事件），若不存在返回 None。
    pub fn remove_record(&mut self, id: RecordId) -> Option<RecordId>;

    /// 获取所有记录的只读视图（按时间倒序，索引 0 最新）
    pub fn records(&self) -> &[ClipboardRecord];

    /// 获取当前记录总数
    pub fn count(&self) -> usize;

    /// 检查是否为空
    pub fn is_empty(&self) -> bool;
}
```

**不变式（Invariants）**：

1. `records.len()` 始终 ≤ `max_records`
2. `records` 按 `captured_at` 降序排列（索引 0 为最新）
3. 相邻两条记录的 `text_content` 不相同（去重）
4. 每条记录的 `id` 在列表内唯一

---

### 3.2 实体（Entity）

#### ClipboardRecord（粘贴板记录实体）

```rust
/// 粘贴板记录实体
/// 通过 RecordId 唯一标识，生命周期由 ClipboardHistory 聚合管理
#[derive(Debug, Clone)]
pub struct ClipboardRecord {
    /// 记录唯一标识符
    pub id: RecordId,
    /// 纯文本内容
    pub text_content: String,
    /// 内容类型（v0.1 仅支持 Text）
    pub content_type: ContentType,
    /// 捕获时间戳（Unix 毫秒）
    pub captured_at: i64,
}

impl ClipboardRecord {
    /// 创建新的文本记录
    pub fn new_text(id: RecordId, text: String, captured_at: i64) -> Self;

    /// 获取用于展示的截断预览文本（最多前 100 个字符）
    pub fn preview_text(&self, max_chars: usize) -> &str;

    /// 获取字符数
    pub fn char_count(&self) -> usize;
}
```

---

### 3.3 值对象（Value Object）

#### RecordId（记录 ID）

```rust
/// 记录唯一标识符（值对象，不可变）
/// v0.1 使用自增整数，无持久化需求
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct RecordId(u64);

impl RecordId {
    pub fn new(value: u64) -> Self;
    pub fn value(&self) -> u64;
}
```

#### ContentType（内容类型）

```rust
/// 粘贴板内容类型（值对象）
/// v0.1 仅支持 Text
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ContentType {
    Text,
    // Image 和 Files 在 v0.2 引入
}
```

#### PasteMode（粘贴模式）

```rust
/// 粘贴模式（值对象）
/// v0.1 仅支持 Original（原格式）
/// PlainText 在 v0.2 引入
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PasteMode {
    Original,
}
```

---

### 3.4 领域事件（Domain Events）

v0.1 涉及以下领域事件，用于聚合根与外部系统之间的解耦通信。

```rust
/// 粘贴板领域事件枚举
#[derive(Debug, Clone)]
pub enum ClipboardDomainEvent {
    /// 新的文本记录被成功添加到历史列表
    RecordAdded {
        record: ClipboardRecord,
    },
    /// 记录因列表超限被自动移除（最旧记录）
    RecordEvicted {
        id: RecordId,
    },
    /// 用户主动删除了一条记录
    RecordRemoved {
        id: RecordId,
    },
}
```

**事件流向**：

```
ClipboardHistory（聚合根）
    │ 产生 ClipboardDomainEvent
    ▼
ClipboardMonitorService（领域服务）
    │ 转换并推送
    ▼
IPC 层（M13）
    │ emit Tauri Event
    ▼
前端 M12 状态管理（Zustand store）
    │ 更新 records 列表
    ▼
M05 主面板 UI 重渲染
```

---

### 3.5 领域服务（Domain Services）

#### ClipboardMonitorService（粘贴板监听领域服务）

该服务跨越平台层与领域层，不属于任何单一实体，因此设计为领域服务。

```rust
/// 粘贴板监听领域服务
/// 职责：轮询 macOS 粘贴板变化，驱动 ClipboardHistory 聚合更新
pub struct ClipboardMonitorService {
    history: Arc<RwLock<ClipboardHistory>>,
    platform: Arc<dyn PlatformClipboard>,
    event_emitter: Arc<dyn DomainEventEmitter>,
    is_running: AtomicBool,
    is_paused: AtomicBool,
    last_change_count: AtomicU64,
}

impl ClipboardMonitorService {
    /// 启动后台轮询线程（200ms 间隔）
    pub async fn start(&self) -> Result<()>;

    /// 停止轮询线程
    pub fn stop(&self);

    /// 暂停监听（粘贴操作期间调用，防止自我触发）
    pub fn pause(&self);

    /// 恢复监听
    pub fn resume(&self);

    /// 是否正在运行
    pub fn is_running(&self) -> bool;
}
```

#### PasteService（粘贴领域服务）

```rust
/// 粘贴执行领域服务
/// 职责：执行粘贴操作的完整流程（暂停监听 → 写粘贴板 → 隐藏窗口 → 模拟按键 → 恢复监听）
pub struct PasteService {
    history: Arc<RwLock<ClipboardHistory>>,
    monitor: Arc<ClipboardMonitorService>,
    platform_clipboard: Arc<dyn PlatformClipboard>,
    platform_key_sim: Arc<dyn PlatformKeySimulator>,
    window_manager: Arc<dyn WindowManager>,
}

impl PasteService {
    /// 执行粘贴操作
    /// - record_id: 要粘贴的记录 ID
    /// - mode: 粘贴模式（v0.1 仅 Original）
    pub async fn paste(&self, record_id: RecordId, mode: PasteMode) -> Result<()>;
}
```

---

### 3.6 仓储接口（Repository Interface）

v0.1 使用内存存储，不持久化到磁盘，仓储定义内存实现。

```rust
/// 粘贴板记录仓储接口（v0.1 内存实现）
pub trait ClipboardRecordRepository: Send + Sync {
    /// 获取最近 N 条记录（按时间倒序）
    fn get_recent(&self, limit: usize) -> Vec<ClipboardRecord>;

    /// 根据 ID 获取单条记录
    fn get_by_id(&self, id: RecordId) -> Option<ClipboardRecord>;

    /// 删除指定 ID 的记录
    fn delete(&self, id: RecordId) -> bool;

    /// 获取当前记录总数
    fn count(&self) -> usize;
}

/// 内存仓储实现（v0.1 专用）
/// 底层持有 ClipboardHistory 聚合的读取权
pub struct InMemoryClipboardRepository {
    history: Arc<RwLock<ClipboardHistory>>,
}
```

---

## 4. 聚合交互流程

### 4.1 复制文本 → 新增记录

```
macOS 粘贴板变化（change_count 变化）
    │
    ▼
ClipboardMonitorService::poll()
    │ 读取纯文本内容
    ▼
PlatformClipboard::read_text()  →  返回 Option<String>
    │
    ├── None（非文本内容）→ 跳过
    │
    └── Some(text)
            │
            ▼
        ClipboardHistory::add_record(text, now_ms())
            │ 执行不变式检查（去重、数量上限）
            │ 返回 Vec<ClipboardDomainEvent>
            │
            ├── RecordAdded  → IPC emit "clipboard:new-record"
            └── RecordEvicted（可选）→ IPC emit "clipboard:record-deleted"
```

### 4.2 用户按 Enter → 粘贴

```
M05 捕获键盘 Enter 事件
    │ 读取当前 selectedIndex
    ▼
M12::pasteRecord(id, PasteMode::Original)
    │
    ▼
M13::invoke("paste_record", {id, mode})
    │
    ▼
PasteService::paste(record_id, mode)
    ├── ClipboardMonitorService::pause()
    ├── InMemoryRepository::get_by_id(id)  →  ClipboardRecord
    ├── PlatformClipboard::write_text(text)
    ├── WindowManager::hide()
    ├── PlatformKeySimulator::simulate_paste()
    └── ClipboardMonitorService::resume()
```

### 4.3 用户按 Delete → 删除记录

```
M05 捕获键盘 Delete 事件
    │
    ▼
M12::deleteRecord(id)
    │
    ▼
M13::invoke("delete_record", {id})
    │
    ▼
ClipboardHistory::remove_record(id)
    │ 返回 Some(RecordId)
    │
    ▼
ClipboardDomainEvent::RecordRemoved
    │
    ▼
IPC emit "clipboard:record-deleted"
    │
    ▼
M12 更新 records 列表，调整 selectedIndex
```

---

## 5. 数据模型（内存结构）

### 5.1 ClipboardHistory 内部状态

```
ClipboardHistory {
    records: [
        ClipboardRecord { id: 20, text: "最新内容", captured_at: 1709123456789 },
        ClipboardRecord { id: 19, text: "次新内容", captured_at: 1709123400000 },
        ...（最多 20 条）
        ClipboardRecord { id: 1,  text: "最旧内容", captured_at: 1709120000000 },
    ],
    max_records: 20,
}
```

### 5.2 前端 Zustand State

```typescript
// useClipboardStore 状态结构
interface ClipboardState {
  records: ClipboardRecord[];   // 与后端聚合同步的记录列表
  selectedIndex: number;        // 当前选中卡片索引（0 = 最左/最新）
  isLoading: boolean;           // 初始加载状态
}

// ClipboardRecord 前端类型（对应后端序列化格式）
interface ClipboardRecord {
  id: number;
  content_type: 'text';
  text_content: string;
  captured_at: number;          // Unix 毫秒时间戳
}
```

---

## 6. 防腐层（Anti-Corruption Layer）

平台抽象层（M14）充当防腐层，隔离 macOS 系统 API 与领域模型：

```rust
/// 平台粘贴板接口（防腐层 trait）
pub trait PlatformClipboard: Send + Sync {
    /// 读取当前系统粘贴板的纯文本内容
    fn read_text(&self) -> Result<Option<String>>;

    /// 将纯文本写入系统粘贴板
    fn write_text(&self, text: &str) -> Result<()>;

    /// 获取粘贴板变化计数（macOS NSPasteboard.changeCount）
    fn change_count(&self) -> u64;
}

/// 按键模拟接口（防腐层 trait）
pub trait PlatformKeySimulator: Send + Sync {
    /// 模拟 Cmd+V 粘贴快捷键
    fn simulate_paste(&self) -> Result<()>;
}
```

---

## 7. 模块与 DDD 概念映射

| DDD 概念 | v0.1 实现 | 代码位置 |
|----------|-----------|----------|
| 聚合根 | `ClipboardHistory` | `src-tauri/src/clipboard/history.rs` |
| 实体 | `ClipboardRecord` | `src-tauri/src/clipboard/record.rs` |
| 值对象 | `RecordId`, `ContentType`, `PasteMode` | `src-tauri/src/clipboard/types.rs` |
| 领域事件 | `ClipboardDomainEvent` | `src-tauri/src/clipboard/events.rs` |
| 领域服务 | `ClipboardMonitorService` | `src-tauri/src/clipboard/monitor.rs` |
| 领域服务 | `PasteService` | `src-tauri/src/paste/mod.rs` |
| 仓储接口 | `ClipboardRecordRepository` | `src-tauri/src/clipboard/repository.rs` |
| 仓储实现 | `InMemoryClipboardRepository` | `src-tauri/src/clipboard/repository.rs` |
| 防腐层 | `PlatformClipboard`, `PlatformKeySimulator` | `src-tauri/src/platform/mod.rs` |

---

**文档版本**：v1.0
**编写日期**：2026-03-05
**版本范围**：v0.1 MVP
**文档状态**：已完成
