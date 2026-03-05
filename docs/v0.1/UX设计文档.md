# v0.1 UX 设计文档

## 1. 文档概述

### 1.1 版本范围

本文档描述 **v0.1 MVP 版本**的用户体验（UX）设计规范，聚焦于主面板的视觉设计、交互细节和动效规格。

基础视觉规范（颜色系统、字体、间距、图标）继承自《UI 规范文档.md》，本文档补充 v0.1 的具体实现细节和交互微设计。

### 1.2 设计原则（v0.1 强调）

| 原则 | v0.1 体现 |
|------|-----------|
| **最小干扰** | 后台运行无任何 UI，仅快捷键触发才出现界面 |
| **弹出即用** | 面板弹出后默认聚焦最新记录，不需要额外操作即可直接粘贴 |
| **零学习成本** | 核心操作仅需 3 个按键（方向键选择 + Enter 粘贴） |
| **视觉克制** | 界面元素精简，不干扰用户正在进行的工作 |

---

## 2. 主面板视觉设计

### 2.1 整体视觉风格

**设计基调**：macOS 原生感，轻量毛玻璃，与系统 UI 融合。

参考系统组件：macOS Spotlight、Alfred、Raycast 的底部浮层风格。

**核心视觉特征**：
- 毛玻璃半透明背景，可透视底部桌面/应用内容
- 上边缘有微弱投影，暗示层级关系
- 无边框无标题栏，完全沉浸
- 支持跟随系统的浅色/深色主题

### 2.2 主面板背景样式

```css
/* 主面板容器 */
.main-panel {
  /* 布局 */
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 220px;
  z-index: 9999;

  /* 毛玻璃效果 */
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);

  /* 上边缘分隔 */
  border-top: 1px solid rgba(0, 0, 0, 0.06);

  /* 顶部圆角（底部不圆角，紧贴屏幕边缘） */
  border-radius: 12px 12px 0 0;

  /* 顶部投影 */
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.08);
}

/* 深色模式 */
@media (prefers-color-scheme: dark) {
  .main-panel {
    background: rgba(28, 28, 30, 0.88);
    border-top-color: rgba(255, 255, 255, 0.06);
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
  }
}
```

### 2.3 卡片列表容器

```css
.card-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;                    /* 卡片间距 */
  padding: 20px 16px;           /* 列表内边距 */
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;

  /* 隐藏滚动条但保留滚动功能（macOS 风格） */
  scrollbar-width: none;
}

.card-list::-webkit-scrollbar {
  display: none;
}
```

---

## 3. 文本卡片 UX 设计

### 3.1 卡片视觉层次

```
┌──────────────────────────────────────┐
│ ████████████████████████████████████ │  ← 顶部色块（蓝色，文本类型标识）
│  文本                                │  ← 类型标签（左对齐，白色文字）
├──────────────────────────────────────┤
│  6 分钟前                            │  ← 时间戳（灰色，小字）
├──────────────────────────────────────┤
│                                      │
│  文本内容预览，最多显示三行，超长的内容  │  ← 内容区（深色文字）
│  会被截断并显示省略号，让用户快速...   │
│                                      │
└──────────────────────────────────────┤
│  47 个字符                    ≡ 1    │  ← 底部元信息（次级色）
└──────────────────────────────────────┘
```

### 3.2 卡片颜色规范

#### 顶部色块

v0.1 所有卡片均为文本类型，使用蓝色标识：

```css
.card-header {
  height: 28px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  border-radius: 12px 12px 0 0;

  /* 文本类型：蓝色 */
  background: #007AFF;   /* 浅色模式 */
}

@media (prefers-color-scheme: dark) {
  .card-header {
    background: #0A84FF;   /* 深色模式 */
  }
}

.card-header .type-label {
  font-size: 13px;
  font-weight: 600;
  color: #FFFFFF;
}
```

#### 卡片主体

```css
.card {
  width: 240px;
  height: 180px;
  flex-shrink: 0;   /* 防止在 flex 容器中被压缩 */
  border-radius: 12px;
  border: 1.5px solid var(--color-border);
  background: var(--color-bg-secondary);
  cursor: pointer;
  overflow: hidden;

  /* 状态过渡 */
  transition: border-color 150ms ease-in-out,
              background-color 150ms ease-in-out,
              box-shadow 150ms ease-in-out,
              transform 150ms ease-in-out;
}

/* 选中态 */
.card.selected {
  border-color: #007AFF;
  border-width: 2px;
  background: rgba(0, 122, 255, 0.06);
  box-shadow: 0 4px 12px rgba(0, 122, 255, 0.18);
  transform: scale(1.02);
}

/* 悬停态 */
.card:hover:not(.selected) {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.10);
}
```

### 3.3 文本内容区

```css
.card-content {
  padding: 8px 12px;
  flex: 1;

  /* 3 行截断 */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;

  /* 文字样式 */
  font-size: 13px;
  line-height: 18px;
  color: var(--color-text-primary);
  white-space: pre-line;   /* 保留换行符 */
  word-break: break-all;   /* 长单词/URL 自动折行 */
}
```

### 3.4 底部元信息栏

```css
.card-footer {
  height: 28px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--color-border);
}

.card-footer .char-count {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.card-footer .sequence-number {
  font-size: 11px;
  color: var(--color-text-disabled);
  font-family: 'SF Mono', monospace;  /* 等宽字体，对齐数字 */
}
```

---

## 4. 动效设计

### 4.1 面板弹出/收起动画

使用 Framer Motion 实现 AnimatePresence 动效：

```tsx
// components/MainPanel/index.tsx
import { motion, AnimatePresence } from 'framer-motion';

const panelVariants = {
  hidden: {
    y: '100%',       // 从屏幕底部外侧开始
    opacity: 0,
  },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      duration: 0.20,       // 200ms
      ease: [0.25, 0.1, 0.25, 1],  // cubic-bezier ease-out 感觉
    },
  },
  exit: {
    y: '100%',
    opacity: 0,
    transition: {
      duration: 0.18,       // 180ms，收起比弹出略快
      ease: [0.4, 0, 1, 1], // cubic-bezier ease-in
    },
  },
};

export function MainPanel({ isVisible }: { isVisible: boolean }) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="main-panel"
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {/* 内容 */}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

### 4.2 卡片选中切换动效

选中状态变化通过 CSS `transition` 实现，无需 JS 动画库，性能更优：

```css
.card {
  transition:
    border-color 120ms ease-in-out,
    background-color 120ms ease-in-out,
    box-shadow 120ms ease-in-out,
    transform 120ms ease-in-out;
}
```

**选中卡片自动滚入视口**：

```typescript
// 当 selectedIndex 变化时，确保选中卡片在可视区域内
function scrollToSelectedCard(index: number) {
  const card = document.querySelector(`[data-card-index="${index}"]`);
  card?.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest',
    inline: 'center',   // 水平居中
  });
}
```

### 4.3 记录删除动效（v0.1 简化版）

v0.1 使用简单的淡出 + 水平收缩：

```tsx
const cardExitVariants = {
  exit: {
    opacity: 0,
    width: 0,
    marginRight: 0,
    transition: { duration: 0.15 },
  },
};
```

---

## 5. 空状态设计

### 5.1 空状态图标

使用 Lucide Icons 的 `Clipboard` 图标，样式为灰色调，传达「等待中」的中性情感。

```tsx
import { Clipboard } from 'lucide-react';

function EmptyState() {
  return (
    <div className="empty-state">
      <Clipboard
        size={40}
        strokeWidth={1.5}
        color="var(--color-text-disabled)"
      />
      <p className="empty-title">还没有复制记录</p>
      <p className="empty-subtitle">复制任何内容后将自动出现在这里</p>
    </div>
  );
}
```

```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 0;
}

.empty-state > svg {
  margin-bottom: 12px;
}

.empty-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin: 0 0 6px 0;
}

.empty-subtitle {
  font-size: 13px;
  color: var(--color-text-disabled);
  margin: 0;
}
```

---

## 6. 交互反馈设计

### 6.1 操作反馈矩阵

| 操作 | 视觉反馈 | 听觉反馈 | 响应时间 |
|------|----------|----------|----------|
| 快捷键调出面板 | 面板从底部滑入 | 无（系统级静音友好） | < 100ms |
| 方向键切换 | 选中卡片高亮变化 + 平滑滚动 | 无 | < 50ms |
| Enter 粘贴 | 面板立即开始收起动画 | 无 | 面板收起 < 200ms |
| Delete 删除 | 卡片淡出消失，下一条高亮 | 无 | < 150ms |
| Esc 关闭 | 面板滑出收起 | 无 | < 200ms |

v0.1 不使用声音反馈，保持对用户环境的最小干扰。

### 6.2 错误反馈（Toast 通知）

仅在粘贴失败等用户需要感知的错误时出现：

```
┌──────────────────────────────────────┐
│  ⚠  粘贴失败，请重试                  │
└──────────────────────────────────────┘
```

Toast 规格：
- 位置：主面板顶部，居中
- 背景：`rgba(0,0,0,0.75)`（深色，不受主题影响）
- 文字：白色，14px
- 圆角：8px
- 显示时长：3 秒后自动消失
- 动画：淡入（200ms）→ 停留 → 淡出（200ms）

---

## 7. 焦点管理设计

### 7.1 面板弹出时的焦点行为

```typescript
// 面板弹出后立即捕获键盘焦点
useEffect(() => {
  if (isVisible) {
    // 将焦点移至面板容器，确保键盘事件被捕获
    panelRef.current?.focus();
  }
}, [isVisible]);
```

面板容器属性：

```tsx
<div
  ref={panelRef}
  className="main-panel"
  tabIndex={-1}        // 可聚焦但不在 Tab 顺序中
  role="dialog"
  aria-label="粘贴板历史记录"
  aria-modal="true"
>
```

### 7.2 焦点陷阱

v0.1 不实现完整焦点陷阱（Tab 键会移出面板），仅捕获以下键盘事件：

- `←` / `→`：切换选中
- `Enter`：粘贴
- `Delete` / `Backspace`：删除
- `Escape`：关闭

---

## 8. 视觉一致性检查清单

在开发每个 UI 组件时，参照以下清单验证视觉一致性：

### 颜色

- [ ] 所有颜色使用 CSS 变量（`var(--color-*)`），不硬编码 HEX
- [ ] 深色模式下颜色正确切换（通过 `prefers-color-scheme` 或 `data-theme`）
- [ ] 文本与背景对比度 ≥ 4.5:1

### 字体

- [ ] 字体大小使用文档定义的规格（10/12/13/14/16/18/24px）
- [ ] 中文字体为系统默认（`-apple-system, BlinkMacSystemFont`）
- [ ] 数字显示使用 Tabular Numbers（等宽数字）

### 间距

- [ ] 内边距使用 8px 基础网格（4/8/12/16/20/24/32px）
- [ ] 组件间距使用规范值（卡片间距 12px，列表边距 16px）

### 动画

- [ ] 所有动画时长在规范范围内（100/150/200/300ms）
- [ ] 动画只操作 `transform` 和 `opacity`，不触发布局重排
- [ ] 用户偏好设置 `prefers-reduced-motion` 时，关闭或简化动画

```css
@media (prefers-reduced-motion: reduce) {
  .main-panel,
  .card {
    animation: none;
    transition: none;
  }
}
```

---

## 9. macOS 平台特定 UX 规范

### 9.1 系统字体

```css
body {
  font-family: -apple-system, BlinkMacSystemFont,
               'SF Pro Text', 'SF Pro Display', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

### 9.2 窗口圆角

macOS 的标准窗口圆角为 10px，面板顶部圆角使用 12px（略大，与卡片圆角一致）。

### 9.3 vibrancy 效果（若 Tauri 支持）

```rust
// tauri.conf.json
{
  "tauri": {
    "windows": [{
      "vibrancy": "hud-window"  // macOS 毛玻璃 vibrancy 效果
    }]
  }
}
```

若 Tauri v0.1 时期的版本不支持，回退到 CSS `backdrop-filter`。

### 9.4 Retina 屏幕适配

- 所有图标使用 SVG（矢量，任意分辨率清晰）
- 应用图标提供 `@2x` 版本（`128x128@2x.png`）

---

## 10. 可用性测试目标（v0.1 验收）

完成 v0.1 后进行如下可用性测试：

| 测试场景 | 成功标准 |
|----------|----------|
| 新用户第一次使用，无任何引导 | 在 30 秒内完成「调出面板 → 选择记录 → 粘贴」核心流程 |
| 用键盘切换选中 5 条记录 | 无错误操作，切换流畅无卡顿 |
| 主观满意度评分 | 操作流畅感评分 ≥ 4/5 |

---

**文档版本**：v1.0
**编写日期**：2026-03-05
**版本范围**：v0.1 MVP
**文档状态**：已完成
