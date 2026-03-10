
每当修改代码后,都要更新`docs/{版本号}/版本迭代日志记录.md`文档
每当决策发生改变的时候,都要更新`docs/项目决策记录文档.md`文档

## 项目概述

macOS 剪贴板历史管理工具，基于 **Tauri v2 + React 19 + TypeScript** 构建的桌面应用。后端使用 Rust，前端使用 React + Zustand + Tailwind CSS。

## 常用命令

```bash
# 前端开发（仅 Web）
pnpm dev

# 完整桌面应用联调（前端 + Rust）
pnpm tauri:dev

# 前端检查
pnpm run lint
pnpm run type-check

# 前端测试（含覆盖率，门槛 75%）
pnpm run test
pnpm run test:coverage

# 运行单个前端测试文件
pnpm run test -- src/__tests__/stores/useClipboardStore.test.ts

# Rust 测试
cargo test --manifest-path src-tauri/Cargo.toml

# Rust 格式检查
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings

# 本地构建（macOS，无签名）
pnpm run release:build:local
```

提交前必须通过：`pnpm run lint` + `pnpm run type-check` + `pnpm run test:coverage` + `cargo test`

## 架构概览

### 前端 (`src/`)

```
api/          # Tauri IPC 封装（commands.ts invoke 调用，events.ts 事件订阅）
components/   # React 组件（MainPanel 为核心面板）
hooks/        # 自定义 Hook（useClipboardEvents, useKeyboard, recordPaste）
stores/       # Zustand 状态仓库（4 个 store，见下方）
types/        # 前端类型定义（clipboard.ts 扩展 api/types.ts）
```

**Zustand Stores：**
- `useClipboardStore` — 记录列表、选中索引、加载状态，含 `hydrate/upsertRecord/removeRecord` 等操作
- `useUIStore` — 面板可见性、搜索词、类型筛选、上下文菜单、预览覆盖层
- `useSystemStore` — 监听状态、运行时状态
- `useSettingsStore` — 设置快照

### 后端 (`src-tauri/src/`)

```
clipboard/    # 核心领域：monitor（轮询监听）、runtime_repository（CRUD）、query（查询）、types（枚举）
ipc/          # commands.rs（所有 Tauri invoke 命令）、events.rs（向前端 emit 事件）
paste/        # 粘贴服务（写回剪贴板 + 模拟按键）
platform/     # 平台抽象（clipboard、key_simulator、active_app_detector）
persistence/  # SQLite 连接管理 + migrations（当前 schema v3）
image/        # 图片存储与孤儿清理
ocr/          # 图片文字识别
window/       # 多窗口管理（main、settings、preview、about、permission_guide）
config/       # 配置持久化（ConfigStore）
shortcut/     # 全局快捷键注册
state.rs      # AppState（所有服务的 Arc 引用，注入 Tauri managed state）
```

### IPC 契约

前端通过 `invoke()` 调用 Rust 命令，类型定义在 `src/api/types.ts`，适配器在 `src/api/recordAdapters.ts`。

**主要 Tauri 事件（Rust → 前端）：**
| 事件名 | 含义 |
|--------|------|
| `clipboard:new-record` | 新剪贴板记录 |
| `clipboard:record-updated` | 记录更新（如缩略图就绪） |
| `clipboard:record-deleted` | 记录删除 |
| `clipboard:history-cleared` | 历史清空 |
| `system:panel-visibility-changed` | 主面板显隐 |
| `system:monitoring-changed` | 监听状态变更 |
| `system:settings-updated` | 设置更新 |

### 数据库（SQLite，schema v3）

- `clipboard_items` — 主记录表（text/image/files，含 content_hash 去重）
- `image_assets` — 图片元数据与缩略图路径（1:1 关联 clipboard_items）
- `file_items` — 文件列表（1:N 关联 clipboard_items）

`ContentType`（语义分类）与 `PayloadType`（存储类型）是两个不同概念：PayloadType 只有 text/image/files，ContentType 还包含 link/video/audio/document（由内容分析推断）。

## 编码规范

- **前端**：Prettier + ESLint，2 空格缩进，`semi: true`，双引号，`printWidth: 100`
- **组件**：`PascalCase.tsx`；Hook：`useXxx.ts`；Store：`useXxxStore.ts`；测试：`*.test.ts(x)`
- **Rust**：`snake_case`，新能力放对应领域模块，不在 `main.rs` 堆积逻辑
- **Tauri mock**：测试中 `@tauri-apps/api/*` 由 `src/__mocks__/` 下的 mock 替代（vitest.config.ts 配置别名）

## 文档维护规则

- 修改代码后更新 `docs/{版本号}/版本迭代日志记录.md`
- 决策变更时更新 `docs/项目决策记录文档.md`
- 提交信息遵循 Conventional Commits：`type(scope): summary`（如 `feat(clipboard): 支持文件类型筛选`）
