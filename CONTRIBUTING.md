# 贡献指南

感谢你关注 `鹦鹉剪贴板（Parrot Clipboard）`。

本文档用于帮助贡献者快速了解项目约束、提交流程与最低质量要求。

## 开始之前

在提交代码前，建议先阅读以下内容：

- `README.md`
- `docs/项目决策记录文档.md`
- `docs/v1.4/版本迭代日志记录.md`
- 与当前改动直接相关的版本文档、模块文档或 API 契约文档

## 本地环境

建议环境：

- macOS 13+
- Node.js 20+
- pnpm 9+
- Rust stable
- Xcode Command Line Tools

安装依赖：

```bash
pnpm install
cargo fetch --manifest-path src-tauri/Cargo.toml
```

## 开发命令

```bash
# 前端开发
pnpm dev

# 桌面联调
pnpm tauri:dev

# 静态检查
pnpm run lint
pnpm run type-check

# 前端测试
pnpm run test
pnpm run test:coverage

# Rust 测试
cargo test --manifest-path src-tauri/Cargo.toml
```

## 提交流程

1. 先通过 Issue 或 Discussion 对齐问题背景与方案边界
2. 从 `main` 拉取最新代码后再开始开发
3. 改动尽量聚焦单一主题，避免把不相关修复混在同一个提交里
4. 完成后自查文档、测试与命名一致性

## 文档更新要求

本项目对文档同步有明确要求：

- 每次修改代码后，需要同步更新 `docs/{版本号}/版本迭代日志记录.md`
- 每次决策发生改变时，需要同步更新 `docs/项目决策记录文档.md`
- 涉及 API、页面结构、数据模型或交互方案变化时，请同步更新对应文档

## 代码规范

### 前端

- React + TypeScript
- 2 空格缩进
- 双引号
- `semi: true`
- 组件使用 `PascalCase.tsx`
- Hook 使用 `useXxx.ts`
- Store 使用 `useXxxStore.ts`

### 后端

- Rust 使用 `snake_case`
- 新能力优先放入对应领域模块，不在 `main.rs` 堆积逻辑

## 测试与质量门槛

提交前至少执行：

```bash
pnpm run lint
pnpm run type-check
pnpm run test:coverage
cargo test --manifest-path src-tauri/Cargo.toml
```

如果你的改动影响发布流程或安装包构建，建议额外执行：

```bash
pnpm run release:check
```

## Pull Request 建议

请在 PR 描述中尽量写清：

- 背景与目标
- 关键改动点
- 风险与回滚方式
- 已执行的验证命令
- 是否同步更新了版本日志和决策记录

## 提交信息规范

提交信息使用 Conventional Commits，例如：

```text
feat(clipboard): 支持文件类型筛选
fix(panel): 修复主面板焦点丢失
docs(open-source): 补充贡献指南与安全说明
```
