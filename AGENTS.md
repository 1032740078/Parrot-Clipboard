# Repository Guidelines

每当修改代码后,都要更新`docs/{版本号}/版本迭代日志记录.md`文档
每当决策发生改变的时候,都要更新`docs/项目决策记录文档.md`文档
## Project Structure & Module Organization
- `src/`：前端应用（React + TypeScript）。按职责拆分为 `api/`、`components/`、`hooks/`、`stores/`、`types/`。
- `src/__tests__/`：前端测试，按模块分为 `api/`、`components/`、`hooks/`、`stores/`，并包含 `fixtures/` 与 `setup.ts`。
- `src-tauri/src/`：Tauri 后端（Rust），核心模块包括 `clipboard/`、`ipc/`、`paste/`、`platform/`、`window/`、`shortcut/`、`config/`。
- `docs/`：需求、架构、迭代与测试文档；`public/`：静态资源；`dist/`：前端构建产物（不要手动修改）。

## Build, Test, and Development Commands
- `pnpm install --frozen-lockfile`：安装并锁定前端依赖（与 CI 一致）。
- `pnpm dev`：启动前端开发服务器（仅 Web）。
- `pnpm tauri dev`：启动完整桌面应用联调（前端 + Rust）。
- `pnpm run lint` / `pnpm run type-check`：前端静态检查与类型检查。
- `pnpm run test` / `pnpm run test:coverage`：运行 Vitest（含覆盖率）。
- `cargo test --manifest-path src-tauri/Cargo.toml`：运行 Rust 单元测试。
- `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`、`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`：Rust 格式与静态检查。

## Coding Style & Naming Conventions
- 前端统一使用 Prettier + ESLint：2 空格缩进、`semi: true`、双引号、`printWidth: 100`。
- React 组件文件使用 `PascalCase.tsx`（如 `TextCard.tsx`）；Hook 使用 `useXxx.ts`；状态仓库使用 `useXxxStore.ts`。
- 测试文件命名为 `*.test.ts` / `*.test.tsx`，与被测模块保持同领域目录。
- Rust 模块与文件名使用 `snake_case`，新增能力优先放到对应领域模块中，避免在 `main.rs` 堆积逻辑。

## Testing Guidelines
- 前端测试栈：Vitest + Testing Library + `jsdom`，全局初始化见 `src/__tests__/setup.ts`。
- 覆盖率门槛由 `vitest.config.ts` 强制：`lines/branches/functions/statements >= 75%`。
- 后端测试使用 `cargo test`，建议在实现文件内通过 `#[cfg(test)] mod tests` 就近编写。
- 提交前至少执行：`pnpm run lint`、`pnpm run type-check`、`pnpm run test:coverage`、`cargo test --manifest-path src-tauri/Cargo.toml`。

## Commit & Pull Request Guidelines
- 提交信息遵循 Conventional Commits：`type(scope): summary`。示例：`feat(v0.1): 完成后端核心与前端主面板`、`fix(monitor): 提升粘贴板监听稳定性`。
- 常用 `type`：`feat`、`fix`、`docs`、`refactor`、`test`、`chore`；`scope` 建议对应模块（如 `clipboard`、`monitor`、`v0.1`）。
- PR 需包含：变更摘要、动机与影响范围、关联任务/文档、验证命令与结果；涉及 UI 变更请附截图。
- 合并前确保 CI 全绿：`lint-frontend`、`lint-backend`、`test-frontend`、`test-backend`。

## Security & Configuration Tips
- 粘贴板记录可能包含敏感信息；测试数据请使用 `src/__tests__/fixtures/` 中的脱敏样例，不要提交真实隐私内容。
- 变更权限或系统能力时，优先检查 `src-tauri/capabilities/default.json` 与 `src-tauri/tauri.conf.json`，并在 PR 描述中明确风险与回滚方案。
- 依赖升级请同时提交锁文件（`pnpm-lock.yaml`、`src-tauri/Cargo.lock`），避免本地与 CI 环境不一致。
