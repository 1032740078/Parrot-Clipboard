# GitHub 开源发布资料

本文档用于统一仓库主页简介、Topics 与首个 Release 文案，便于后续在 GitHub 页面、发布说明与社区传播中直接复用。

## 仓库简介（推荐）

`macOS 剪贴板历史管理工具，基于 Tauri v2 + React + Rust，支持文本、图片、文件记录、搜索、预览与回粘。`

## GitHub Topics（推荐）

建议 Topics：

- `tauri`
- `react`
- `typescript`
- `rust`
- `clipboard-manager`
- `clipboard-history`
- `macos`
- `sqlite`
- `desktop-app`
- `productivity`

## 首个 Release 标题（建议）

`Parrot Clipboard v1.0.0`

## 首个 Release 文案（建议稿）

```markdown
# Parrot Clipboard v1.0.0

首个公开版本发布。

鹦鹉剪贴板（Parrot Clipboard）是一款面向 macOS 的剪贴板历史管理工具，聚焦“记录、检索、预览、回粘”四个核心环节，帮助你把高频复制内容沉淀为可重复利用的本地工作流资产。

## 本版本包含

- 文本、图片、文件/目录三类剪贴板记录采集
- 本地历史持久化、去重策略与容量清理
- 主面板横向卡片浏览、搜索与类型筛选
- 回车粘贴与 `Shift + Enter` 纯文本粘贴
- 图片缩略图、独立预览窗口与代码高亮预览
- 来源应用名称与图标展示
- 设置、快捷键校验、黑名单规则、权限引导、关于窗口与更新检查

## 技术栈

- Tauri v2
- React 19
- TypeScript
- Rust
- SQLite

## 开发说明

当前仓库以 macOS 体验为优先目标，Windows / Linux 能力仍在持续完善。

如果你想参与贡献，欢迎阅读仓库中的 `README.md`、`CONTRIBUTING.md` 与 `SECURITY.md`，也欢迎通过 Issue、Discussion 和 Pull Request 参与建设。

## License

本项目采用 `0BSD` 许可证发布。
```

## 备注

- 当前应用运行版本仍以 `package.json` / `src-tauri/Cargo.toml` 中的 `1.0.0` 为准，因此首个公开 Release 建议沿用 `v1.0.0`。
- 项目内部需求与设计文档的最新演进基线为 `docs/v1.4`，其含义是内部迭代版本，并不直接等同于 GitHub Release 版本号。
