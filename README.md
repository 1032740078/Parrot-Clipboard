# 鹦鹉剪贴板 Parrot Clipboard

一款面向 macOS 的剪贴板历史管理工具，聚焦“记录、检索、预览、回粘”四个核心环节，帮助你把文本、图片与文件复制历史沉淀为可再次利用的工作流资产。

鹦鹉剪贴板基于 `Tauri v2 + React 19 + TypeScript + Rust` 构建，采用本地优先（local-first）架构：监听、索引、缩略图生成、历史存储与粘贴执行均在本机完成，当前重点支持 macOS 场景。

## 项目定位

- 面向高频复制粘贴的知识工作者、开发者、设计师与内容运营人员
- 提供比系统原生剪贴板更长周期、更可检索的历史记录能力
- 强调键盘优先、快速唤起、快速定位、快速回粘的桌面效率体验
- 以本地 SQLite 和本地图像缓存为基础，不依赖云端服务即可运行

## 核心特性

- 支持三类底层载荷采集：文本、图片、文件/目录
- 支持七类语义分类：`text`、`image`、`files`、`link`、`video`、`audio`、`document`
- 支持主面板快速检索、分类筛选、横向卡片浏览与键盘导航
- 支持回车粘贴记录，`Shift + Enter` 以纯文本模式粘贴
- 支持图片记录缩略图、独立预览窗口、代码文本高亮预览
- 支持来源应用名称与来源应用图标展示，帮助识别复制来源
- 支持历史持久化、容量限制、孤儿图片清理与去重策略
- 支持设置、快捷键校验、黑名单规则、权限引导、关于窗口与更新检查

## 当前状态

- 当前仓库以 `v1.4` 为最新文档版本基线
- 当前产品正式名称为：`鹦鹉剪贴板` / `Parrot Clipboard`
- 当前核心体验优先保障 macOS；代码中已预留 Windows / Linux 平台抽象，但仍以 macOS 为主
- 面向用户可见的产品名称、窗口标题、打包名称与开源仓库元信息已统一为“鹦鹉剪贴板 / Parrot Clipboard”

## 功能预览

### 1. 记录采集

- 自动监听用户复制行为，写入本地历史记录
- 对文本、图片、文件分别建立适配的存储与展示结构
- 基于 `content_hash` 与运行时仓储策略避免无意义重复堆积

### 2. 历史浏览

- 面板在桌面场景中快速显示，适合键盘驱动的连续操作
- 使用横向卡片展示文本摘要、图片缩略图、文件信息与来源应用
- 支持选中态、删除、预览、快速定位首条记录等高频操作

### 3. 搜索与分类

- 按关键词搜索记录内容、来源应用与语义类型
- 按分类筛选文本、图片、文件、链接、视频、音频、文稿等类型
- 将底层 `payload_type` 与上层 `content_type` 分离，兼顾存储语义与展示语义

### 4. 粘贴执行

- 支持将选中记录重新写回系统剪贴板并触发粘贴
- 支持纯文本粘贴，尽量去除富文本样式，仅保留可读文本结构
- 在图片纯文本粘贴场景下，支持通过 OCR 提取文本后再执行粘贴

### 5. 工程化与稳定性

- 前端使用 React + Zustand 管理状态，后端使用 Rust 组织核心域逻辑
- 使用 SQLite 持久化历史记录，配合图片缓存与清理机制
- 提供前端单元测试、覆盖率校验、Rust 单测、格式检查与 lint 流程

## 技术栈

| 层级 | 技术选型 |
| --- | --- |
| 桌面容器 | Tauri v2 |
| 前端 | React 19、TypeScript、Vite、Zustand、Tailwind CSS |
| 后端 | Rust |
| 数据存储 | SQLite |
| 测试 | Vitest、Testing Library、Playwright、Cargo Test |
| 代码高亮 | highlight.js、CodeMirror |
| 图像能力 | 本地缩略图处理、OCR 识别 |

## 项目结构

```text
.
├── src/                     # React 前端
│   ├── api/                 # Tauri IPC 封装与适配器
│   ├── components/          # 主面板、预览、关于、权限引导等组件
│   ├── hooks/               # 事件订阅、键盘交互、预览等 Hook
│   ├── stores/              # Zustand 状态仓库
│   └── types/               # 前端类型定义
├── src-tauri/src/           # Rust 后端
│   ├── clipboard/           # 监听、查询、仓储与领域类型
│   ├── ipc/                 # Tauri commands / events
│   ├── paste/               # 回粘服务
│   ├── persistence/         # SQLite 与迁移
│   ├── image/               # 图片存储与清理
│   ├── ocr/                 # OCR 能力
│   ├── platform/            # 平台抽象
│   ├── shortcut/            # 全局快捷键
│   └── window/              # 多窗口管理
├── docs/                    # 需求、设计、版本与决策文档
└── e2e/                     # 端到端测试
```

## 开发环境要求

建议使用以下环境进行本地开发：

- macOS 13 或更高版本
- Node.js 20+
- pnpm 9+
- Rust stable
- Xcode Command Line Tools
- 如需 Tauri 桌面联调，请确保系统具备对应的桌面构建依赖

## 快速开始

### 1. 安装依赖

```bash
pnpm install
cargo fetch --manifest-path src-tauri/Cargo.toml
```

### 2. 启动前端开发模式

```bash
pnpm dev
```

### 3. 启动桌面联调模式

```bash
pnpm tauri:dev
```

### 4. 运行质量检查

```bash
pnpm run lint
pnpm run type-check
pnpm run test
pnpm run test:coverage
cargo test --manifest-path src-tauri/Cargo.toml
```

## 常用命令

```bash
# 前端开发（仅 Web）
pnpm dev

# 完整桌面应用联调（前端 + Rust）
pnpm tauri:dev

# 前端检查
pnpm run lint
pnpm run type-check

# 前端测试（含覆盖率）
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

提交前建议至少通过以下检查：

```bash
pnpm run lint
pnpm run type-check
pnpm run test:coverage
cargo test --manifest-path src-tauri/Cargo.toml
```

## 架构说明

### 前端

- `src/api` 负责封装 `invoke()` 调用与事件订阅，屏蔽前后端契约细节
- `src/stores` 使用 Zustand 维护记录、界面、系统状态与设置快照
- `src/components/MainPanel` 是主交互入口，承担记录列表、筛选、搜索与预览体验

### 后端

- `clipboard` 模块负责监听、查询、仓储与记录领域模型
- `persistence` 模块负责 SQLite 连接、schema 迁移与行映射
- `paste` 模块负责回写剪贴板、模拟粘贴与纯文本粘贴链路
- `platform` 模块负责平台能力封装，当前以 macOS 能力实现为主

### IPC 契约约定

- Tauri command 入参统一使用 `camelCase`
- 事件 payload、Rust 领域对象与数据库字段继续保持 `snake_case`
- 前端 API 适配层承担命名风格转换，减少上层组件耦合

## 文档索引

如果你想快速理解这个项目，建议优先阅读以下文档：

- `docs/项目决策记录文档.md`
- `docs/技术架构选型文档.md`
- `docs/模块拆分文档.md`
- `docs/v1.4/用户故事文档.md`
- `docs/v1.4/DDD战术设计文档.md`
- `docs/v1.4/API契约文档.md`
- `docs/v1.4/自动化测试文档.md`
- `docs/v1.4/版本迭代日志记录.md`

## Roadmap

欢迎围绕以下方向继续演进：

- 统一产品品牌命名、窗口标题与打包元信息
- 完善设置窗口体验与更多隐私控制项
- 优化搜索、预览和大体量历史记录下的渲染性能
- 推进 Windows / Linux 平台能力落地与差异化适配
- 补充更完善的发布流程、签名、公证与安装分发文档

## 参与贡献

欢迎通过 Issue、Discussion、Pull Request 参与项目建设。

协作入口：

- 提交流程说明见 `CONTRIBUTING.md`
- 安全问题披露流程见 `SECURITY.md`
- 提交 Issue 可直接使用 `.github/ISSUE_TEMPLATE/` 下的模板

建议的协作方式：

1. 先阅读 `docs/项目决策记录文档.md` 与对应版本文档，了解当前约束
2. 提交改动前先执行 lint、type-check、前端测试与 Rust 测试
3. 新增功能时尽量同步补充测试与相关文档
4. 如果涉及架构或契约调整，请同步更新决策记录与版本迭代日志

## 开源许可证

本项目使用 `0BSD`（BSD Zero Clause License）许可证发布。

这意味着你可以在几乎不受限制的前提下：

- 使用本项目代码进行个人或商业用途
- 修改、复制、分发、二次开发与再发布
- 将其集成进闭源系统、内部系统或付费产品

详细条款请见根目录 `/LICENSE`。

## 已知说明

- 当前已采用 `0BSD` 许可证，允许个人、团队、商业项目与闭源产品自由使用、修改、分发与再发布
- 当前默认面向 macOS 使用场景设计，其他平台仍处于能力预留或逐步完善阶段
- `com.robin.clipboard` 等内部标识暂未随品牌同步改名，以避免影响现有数据目录、权限识别与升级路径
- 较早期的历史设计文档仍保留旧名称，当前运行中的产品可见名称已统一为“鹦鹉剪贴板”

## 致谢

感谢所有为需求梳理、架构设计、测试补齐与体验打磨投入精力的贡献者。

如果这个项目对你有帮助，欢迎关注、试用并提出改进建议。
