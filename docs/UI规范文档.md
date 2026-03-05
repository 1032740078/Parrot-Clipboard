# 粘贴板记录管理工具 - UI 规范文档

## 1. 文档概述

### 1.1 目的

本文档定义粘贴板记录管理工具的视觉设计规范和交互标准,确保应用在不同平台和场景下保持一致的用户体验。本规范适用于所有前端开发人员、UI/UX 设计师和产品经理。

### 1.2 适用范围

- 主面板界面
- 设置窗口
- 引导页面
- 系统托盘图标
- 所有弹窗和提示组件

### 1.3 设计原则

| 原则 | 说明 |
|------|------|
| **简洁高效** | 界面元素精简,操作路径最短,用户能够快速完成任务 |
| **一致性** | 跨平台保持视觉和交互的一致性,符合各平台设计规范 |
| **响应迅速** | 所有交互反馈及时,动画流畅自然 |
| **可访问性** | 支持键盘操作,颜色对比度符合 WCAG 标准 |
| **轻量美观** | 视觉设计现代简洁,不喧宾夺主 |

---

## 2. 颜色系统

### 2.1 主题模式

应用支持三种主题模式:

| 模式 | 说明 | 默认设置 |
|------|------|----------|
| 浅色模式 | 适合白天使用,背景为浅色 | 跟随系统 |
| 深色模式 | 适合夜间使用,背景为深色 | 跟随系统 |
| 跟随系统 | 自动切换,与系统主题保持一致 | ✓ 默认 |

### 2.2 基础色板

#### 浅色模式色板

| 用途 | 颜色名称 | HEX 值 | RGB 值 | 使用场景 |
|------|----------|--------|--------|----------|
| 主色 | Primary | `#007AFF` | `0, 122, 255` | 按钮、链接、选中状态 |
| 成功色 | Success | `#34C759` | `52, 199, 89` | 成功提示、确认操作 |
| 警告色 | Warning | `#FF9500` | `255, 149, 0` | 警告提示 |
| 危险色 | Danger | `#FF3B30` | `255, 59, 48` | 删除、清空等危险操作 |
| 背景色 | Background | `#FFFFFF` | `255, 255, 255` | 主背景 |
| 次级背景 | Background Secondary | `#F2F2F7` | `242, 242, 247` | 卡片背景、输入框背景 |
| 边框色 | Border | `#D1D1D6` | `209, 209, 214` | 分割线、边框 |
| 文本主色 | Text Primary | `#000000` | `0, 0, 0` | 主要文本内容 |
| 文本次色 | Text Secondary | `#8E8E93` | `142, 142, 147` | 次要文本、提示文字 |
| 文本禁用 | Text Disabled | `#C7C7CC` | `199, 199, 204` | 禁用状态文本 |

#### 深色模式色板

| 用途 | 颜色名称 | HEX 值 | RGB 值 | 使用场景 |
|------|----------|--------|--------|----------|
| 主色 | Primary | `#0A84FF` | `10, 132, 255` | 按钮、链接、选中状态 |
| 成功色 | Success | `#30D158` | `48, 209, 88` | 成功提示、确认操作 |
| 警告色 | Warning | `#FF9F0A` | `255, 159, 10` | 警告提示 |
| 危险色 | Danger | `#FF453A` | `255, 69, 58` | 删除、清空等危险操作 |
| 背景色 | Background | `#000000` | `0, 0, 0` | 主背景 |
| 次级背景 | Background Secondary | `#1C1C1E` | `28, 28, 30` | 卡片背景、输入框背景 |
| 边框色 | Border | `#38383A` | `56, 56, 58` | 分割线、边框 |
| 文本主色 | Text Primary | `#FFFFFF` | `255, 255, 255` | 主要文本内容 |
| 文本次色 | Text Secondary | `#8E8E93` | `142, 142, 147` | 次要文本、提示文字 |
| 文本禁用 | Text Disabled | `#48484A` | `72, 72, 74` | 禁用状态文本 |

### 2.3 语义色彩

| 类型 | 浅色模式 | 深色模式 | 用途 |
|------|----------|----------|------|
| 文本卡片色标 | `#007AFF` | `#0A84FF` | 文本类型记录的顶部色块 |
| 图片卡片色标 | `#34C759` | `#30D158` | 图片类型记录的顶部色块 |
| 文件卡片色标 | `#FF9500` | `#FF9F0A` | 文件类型记录的顶部色块 |
| 选中高亮 | `#007AFF` 20% 透明度 | `#0A84FF` 30% 透明度 | 卡片选中状态背景 |
| 悬停高亮 | `#000000` 5% 透明度 | `#FFFFFF` 5% 透明度 | 鼠标悬停状态 |

### 2.4 毛玻璃效果

主面板使用毛玻璃（Backdrop Blur）效果，参数如下：

| 属性 | 浅色模式 | 深色模式 |
|------|----------|----------|
| 背景色 | `#FFFFFF` 80% 透明度 | `#1C1C1E` 85% 透明度 |
| 模糊半径 | `40px` | `40px` |
| 饱和度 | `180%` | `180%` |

CSS 实现示例：
```css
.main-panel {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
}

.main-panel.dark {
  background: rgba(28, 28, 30, 0.85);
}
```

---

## 3. 字体系统

### 3.1 字体家族

| 平台 | 字体栈 |
|------|--------|
| macOS | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", sans-serif` |
| Windows | `"Segoe UI", "Microsoft YaHei", sans-serif` |
| Linux | `"Ubuntu", "Noto Sans CJK SC", sans-serif` |
| 通用回退 | `system-ui, -apple-system, sans-serif` |

### 3.2 字体大小

| 用途 | 大小 | 行高 | 字重 | 使用场景 |
|------|------|------|------|----------|
| 大标题 | 24px | 32px | 600 | 设置窗口标题 |
| 标题 | 18px | 24px | 600 | 卡片标题、分组标题 |
| 正文 | 14px | 20px | 400 | 正文内容、卡片内容 |
| 小字 | 12px | 16px | 400 | 时间戳、元信息 |
| 微小字 | 10px | 14px | 400 | 序号标记、辅助信息 |

### 3.3 字体使用规范

**中文字体**：
- 优先使用系统默认字体
- 保持字体清晰可读
- 避免使用过细或过粗的字重

**英文和数字**：
- 使用等宽字体显示代码片段
- 数字使用 Tabular Numbers（等宽数字）保持对齐

**字体颜色对比度**：
- 正文文本与背景对比度 ≥ 4.5:1（WCAG AA 标准）
- 大字体（18px+）与背景对比度 ≥ 3:1

---

## 4. 间距系统

### 4.1 基础间距单位

采用 8px 基础网格系统：

| 名称 | 值 | 使用场景 |
|------|-----|----------|
| xs | 4px | 极小间距，图标与文字间距 |
| sm | 8px | 小间距，相关元素间距 |
| md | 16px | 中等间距，组件内部间距 |
| lg | 24px | 大间距，组件之间间距 |
| xl | 32px | 超大间距，区块之间间距 |
| 2xl | 48px | 页面级间距 |

### 4.2 组件内边距

| 组件 | 内边距 |
|------|--------|
| 按钮（小） | 上下 6px，左右 12px |
| 按钮（中） | 上下 8px，左右 16px |
| 按钮（大） | 上下 12px，左右 24px |
| 输入框 | 上下 8px，左右 12px |
| 卡片 | 16px |
| 面板 | 24px |

### 4.3 卡片间距

| 项目 | 值 | 说明 |
|------|-----|------|
| 卡片宽度 | 240px | 固定宽度 |
| 卡片高度 | 180px | 固定高度 |
| 卡片间距 | 12px | 横向卡片之间的间距 |
| 卡片圆角 | 12px | 卡片四角圆角半径 |

---

## 5. 组件规范

### 5.1 按钮

#### 按钮类型

| 类型 | 样式 | 使用场景 |
|------|------|----------|
| 主要按钮 | 主色背景，白色文字 | 主要操作，如"确认"、"保存" |
| 次要按钮 | 透明背景，主色边框和文字 | 次要操作，如"取消" |
| 危险按钮 | 危险色背景，白色文字 | 危险操作，如"删除"、"清空" |
| 文字按钮 | 无背景无边框，主色文字 | 轻量操作，如"了解更多" |

#### 按钮状态

| 状态 | 视觉变化 |
|------|----------|
| 默认 | 正常显示 |
| 悬停 | 背景色加深 10% |
| 按下 | 背景色加深 20%，轻微缩放 0.98 |
| 禁用 | 透明度 40%，鼠标指针为 not-allowed |
| 加载中 | 显示加载动画，禁用点击 |

### 5.2 输入框

#### 输入框样式

```css
.input {
  height: 36px;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 14px;
  transition: all 0.2s;
}

.input:focus {
  border-color: var(--primary-color);
  outline: none;
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
}
```

#### 输入框状态

| 状态 | 边框颜色 | 说明 |
|------|----------|------|
| 默认 | Border | 正常状态 |
| 聚焦 | Primary | 获得焦点时 |
| 错误 | Danger | 输入错误时 |
| 禁用 | Border，透明度 50% | 禁用状态 |

### 5.3 开关（Toggle）

| 属性 | 开启状态 | 关闭状态 |
|------|----------|----------|
| 背景色 | Primary | `#E5E5EA`（浅色）/ `#39393D`（深色） |
| 滑块颜色 | 白色 | 白色 |
| 宽度 | 44px | 44px |
| 高度 | 26px | 26px |
| 滑块直径 | 22px | 22px |
| 动画时长 | 0.2s | 0.2s |

### 5.4 卡片组件

#### 文本卡片结构

```
┌──────────────────────────────┐
│ 文本        [来源应用图标]    │  ← 顶部色块（高度 32px）
├──────────────────────────────┤
│ N 小时前                     │  ← 时间戳（高度 24px）
├──────────────────────────────┤
│ 文本内容预览（前 3 行）        │  ← 内容区（高度 96px）
│ 超长内容末尾省略...           │
│                              │
└──────────────────────────────┤
│ N 个字符        ≡ 序号        │  ← 底部信息栏（高度 28px）
└──────────────────────────────┘
```

#### 卡片状态样式

| 状态 | 边框 | 背景 | 阴影 |
|------|------|------|------|
| 默认 | 1px solid Border | Background Secondary | 无 |
| 悬停 | 1px solid Border | Background Secondary | `0 2px 8px rgba(0,0,0,0.1)` |
| 选中 | 2px solid Primary | Background Secondary | `0 4px 12px rgba(0,122,255,0.2)` |

### 5.5 滚动条

#### 滚动条样式（Webkit）

```css
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}
```

---

## 6. 动画规范

### 6.1 动画时长

| 动画类型 | 时长 | 缓动函数 | 使用场景 |
|----------|------|----------|----------|
| 快速 | 100ms | `ease-out` | 按钮点击、开关切换 |
| 标准 | 200ms | `ease-in-out` | 卡片切换、面板弹出 |
| 慢速 | 300ms | `ease-in-out` | 页面过渡、大型动画 |

### 6.2 主面板动画

#### 弹出动画

```css
@keyframes slideUp {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.main-panel.entering {
  animation: slideUp 200ms ease-out;
}
```

#### 收起动画

```css
@keyframes slideDown {
  from {
    transform: translateY(0);
    opacity: 1;
  }
  to {
    transform: translateY(100%);
    opacity: 0;
  }
}

.main-panel.exiting {
  animation: slideDown 200ms ease-in;
}
```

### 6.3 卡片切换动画

选中卡片时使用平滑过渡：

```css
.card {
  transition: all 150ms ease-in-out;
}

.card.selected {
  transform: scale(1.02);
}
```

### 6.4 加载动画

使用旋转动画表示加载状态：

```css
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.loading-spinner {
  animation: spin 1s linear infinite;
}
```

---

## 7. 图标规范

### 7.1 图标尺寸

| 尺寸 | 值 | 使用场景 |
|------|-----|----------|
| 小 | 16×16px | 按钮内图标、文字旁图标 |
| 中 | 24×24px | 工具栏图标、菜单图标 |
| 大 | 32×32px | 应用图标、来源应用图标 |
| 超大 | 48×48px | 引导页图标、空状态图标 |

### 7.2 图标风格

- 使用线性图标（Outline Style）
- 线条粗细：2px
- 圆角：2px
- 颜色：继承父元素文字颜色
- 格式：SVG 矢量图标

### 7.3 常用图标清单

| 功能 | 图标名称 | 说明 |
|------|----------|------|
| 搜索 | search | 放大镜图标 |
| 设置 | settings | 齿轮图标 |
| 删除 | delete / trash | 垃圾桶图标 |
| 更多 | more-horizontal | 三个点横向排列 |
| 关闭 | close / x | X 图标 |
| 复制 | copy | 两个重叠的方框 |
| 粘贴 | paste | 剪贴板图标 |
| 图片 | image | 图片图标 |
| 文件 | file | 文件图标 |
| 文本 | text | 文本图标 |
| 时钟 | clock | 时钟图标 |
| 锁 | lock | 锁图标（隐私保护） |

### 7.4 系统托盘图标

| 平台 | 规格 | 格式 | 说明 |
|------|------|------|------|
| macOS | 22×22px @2x | PNG（Template Image） | 黑白图标，系统自动适配主题 |
| Windows | 16×16px, 32×32px | ICO | 包含多个尺寸 |
| Linux | 22×22px | PNG / SVG | 支持深浅主题 |

---

## 8. 响应式设计

### 8.1 主面板响应式

| 屏幕宽度 | 卡片显示数量 | 卡片宽度 | 间距 |
|----------|--------------|----------|------|
| < 1280px | 4-5 张 | 240px | 12px |
| 1280px - 1920px | 6-8 张 | 240px | 12px |
| > 1920px | 9-12 张 | 240px | 16px |

### 8.2 设置窗口响应式

| 窗口宽度 | 布局 |
|----------|------|
| < 600px | 单栏布局，导航栏折叠 |
| ≥ 600px | 双栏布局，左侧导航 + 右侧内容 |

---

## 9. 交互规范

### 9.1 键盘导航

| 按键 | 功能 | 适用场景 |
|------|------|----------|
| `Tab` | 焦点切换到下一个可交互元素 | 全局 |
| `Shift + Tab` | 焦点切换到上一个可交互元素 | 全局 |
| `Enter` | 确认/激活当前元素 | 按钮、链接 |
| `Space` | 激活按钮、切换开关 | 按钮、开关 |
| `Esc` | 关闭弹窗/面板 | 弹窗、面板 |
| `←` `→` | 切换选中项 | 主面板卡片列表 |
| `↑` `↓` | 上下滚动 | 列表、设置页面 |

### 9.2 鼠标交互

| 操作 | 反馈 | 说明 |
|------|------|------|
| 悬停 | 背景色变化、显示阴影 | 所有可交互元素 |
| 点击 | 轻微缩放、颜色加深 | 按钮 |
| 拖拽 | 显示拖拽预览 | 未来功能：卡片排序 |
| 右键 | 显示上下文菜单 | 卡片、托盘图标 |

### 9.3 触摸交互（未来支持）

| 手势 | 功能 |
|------|------|
| 单击 | 选中 |
| 双击 | 粘贴 |
| 长按 | 显示菜单 |
| 左右滑动 | 切换卡片 |

---

## 10. 可访问性

### 10.1 颜色对比度

所有文本与背景的对比度必须符合 WCAG 2.1 AA 标准：

| 文本大小 | 最小对比度 |
|----------|------------|
| 正文（< 18px） | 4.5:1 |
| 大字体（≥ 18px） | 3:1 |
| 图标和图形 | 3:1 |

### 10.2 焦点指示器

所有可交互元素必须有清晰的焦点指示器：

```css
*:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
```

### 10.3 屏幕阅读器支持

- 所有图标按钮必须有 `aria-label` 属性
- 使用语义化 HTML 标签
- 动态内容变化使用 `aria-live` 通知

### 10.4 键盘可访问性

- 所有功能必须可通过键盘操作
- Tab 键顺序符合逻辑
- 提供键盘快捷键提示

---

## 11. 平台适配

### 11.1 macOS 特定样式

- 使用 SF Pro 字体
- 窗口圆角：12px
- 遵循 macOS Human Interface Guidelines
- 支持 Touch Bar（未来）

### 11.2 Windows 特定样式

- 使用 Segoe UI 字体
- 窗口圆角：8px
- 遵循 Fluent Design System
- 支持 Acrylic 材质效果

### 11.3 Linux 特定样式

- 使用系统默认字体
- 窗口圆角：8px
- 适配 GNOME / KDE 主题

---

## 12. 性能优化

### 12.1 渲染优化

- 使用虚拟滚动渲染大量卡片
- 图片懒加载
- 使用 CSS `will-change` 优化动画
- 避免不必要的重绘和回流

### 12.2 动画性能

- 优先使用 `transform` 和 `opacity` 属性
- 避免动画 `width`、`height`、`margin` 等触发布局的属性
- 使用 `requestAnimationFrame` 控制动画

### 12.3 资源加载

- 图标使用 SVG Sprite
- 字体使用系统字体，避免加载外部字体
- 图片使用 WebP 格式（带 PNG/JPEG 回退）

---

## 13. 设计资源

### 13.1 设计工具

推荐使用以下工具进行设计：

- Figma（推荐）
- Sketch
- Adobe XD

### 13.2 组件库

建议使用以下 React 组件库作为基础：

- Radix UI（无样式组件）
- Headless UI
- 自定义样式实现

### 13.3 图标库

- Lucide Icons（推荐）
- Heroicons
- Feather Icons

---

## 14. 附录

### 14.1 CSS 变量定义

```css
:root {
  /* 颜色 */
  --color-primary: #007AFF;
  --color-success: #34C759;
  --color-warning: #FF9500;
  --color-danger: #FF3B30;

  --color-bg: #FFFFFF;
  --color-bg-secondary: #F2F2F7;
  --color-border: #D1D1D6;

  --color-text-primary: #000000;
  --color-text-secondary: #8E8E93;
  --color-text-disabled: #C7C7CC;

  /* 间距 */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  --spacing-2xl: 48px;

  /* 圆角 */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* 阴影 */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 4px 12px rgba(0, 0, 0, 0.15);

  /* 动画 */
  --duration-fast: 100ms;
  --duration-normal: 200ms;
  --duration-slow: 300ms;

  --easing-in: ease-in;
  --easing-out: ease-out;
  --easing-in-out: ease-in-out;
}

[data-theme="dark"] {
  --color-primary: #0A84FF;
  --color-success: #30D158;
  --color-warning: #FF9F0A;
  --color-danger: #FF453A;

  --color-bg: #000000;
  --color-bg-secondary: #1C1C1E;
  --color-border: #38383A;

  --color-text-primary: #FFFFFF;
  --color-text-secondary: #8E8E93;
  --color-text-disabled: #48484A;
}
```

### 14.2 参考文档

- [macOS Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/macos)
- [Windows Fluent Design System](https://www.microsoft.com/design/fluent/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Material Design](https://material.io/design)

---

**文档版本**：v1.0
**编写日期**：2026-03-06
**依赖文档**：`页面地图与页面功能简介.md`、`模块拆分文档.md`、`软件项目愿景需求表.md`
**文档状态**：已完成
