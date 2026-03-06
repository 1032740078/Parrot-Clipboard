# v0.3 BDD 自动化验收文档

## 1. 文档概述

### 1.1 版本范围

本文档定义 **v0.3 Feature Complete 版本** 的 BDD 自动化验收范围，围绕以下新增能力建立场景：
- 系统托盘常驻与运行控制
- 开机自启动管理
- 主面板数字键快选、删除与显隐动画
- 多显示器定位
- 清空历史与状态一致性

### 1.2 BDD 编写规范

- 使用 `Given / When / Then` 描述用户视角行为
- 每个场景只验证一个主结果
- 对涉及文件系统的场景，统一使用临时目录或 `/mock/` 路径
- 对涉及托盘的场景，使用 Tauri Tray Mock，不依赖真实系统托盘

---

## 2. Feature：系统托盘与监听控制（Tray & Monitoring）

### 场景 BDD-01-01：通过托盘显示或隐藏主面板

```gherkin
Given 应用已经启动并初始化系统托盘
And 主面板当前处于隐藏状态
When 用户点击托盘菜单“显示主面板”
Then 主面板显示在当前活动显示器底部
And 托盘菜单文案切换为“隐藏主面板”
```

### 场景 BDD-01-02：暂停监听后新复制内容不会入库

```gherkin
Given 应用已经启动且当前监听状态为运行中
And 历史记录中已有 5 条记录
When 用户点击托盘菜单“暂停监听”
And 用户复制一段新的文本内容
Then 历史记录总数仍然为 5 条
And 运行状态接口返回 monitoring=false
```

### 场景 BDD-01-03：恢复监听后新的复制内容重新入库

```gherkin
Given 应用已经处于暂停监听状态
When 用户点击托盘菜单“恢复监听”
And 用户复制一段新的文本内容
Then 历史记录新增 1 条文本记录
And 托盘图标恢复为正常态
```

### 场景 BDD-01-04：确认后清空全部历史记录

```gherkin
Given 历史中存在文本、图片、文件三种记录
And 图片原图与缩略图文件均已存在
When 用户点击托盘菜单“清空历史”
And 用户在确认弹窗中点击“确认清空”
Then 主面板进入空状态
And clipboard_items、image_assets、file_items 三张表均为空
And 对应图片资源文件被删除
```

### 场景 BDD-01-05：取消清空历史不会产生副作用

```gherkin
Given 历史中已有 8 条记录
When 用户点击托盘菜单“清空历史”
And 用户在确认弹窗中点击“取消”
Then 历史记录总数保持为 8 条
And 图片资源文件保持不变
```

---

## 3. Feature：开机自启动（Launch At Login）

### 场景 BDD-02-01：开启自启动时写入 Launch Agent

```gherkin
Given 应用首次启动且 launch_at_login=false
When 用户在托盘菜单中勾选“开机自启动”
Then 配置文件中的 launch_at_login 被更新为 true
And 临时 LaunchAgents 目录下生成合法 plist 文件
```

### 场景 BDD-02-02：关闭自启动时删除 Launch Agent

```gherkin
Given 当前 launch_at_login=true
And Launch Agent plist 文件已存在
When 用户取消勾选“开机自启动”
Then 配置文件中的 launch_at_login 被更新为 false
And Launch Agent plist 文件被删除
```

---

## 4. Feature：主面板交互增强（Panel Interaction）

### 场景 BDD-03-01：数字键 1-9 快速选择记录

```gherkin
Given 主面板已经打开
And 当前共有 12 条记录
When 用户按下数字键“3”
Then 第 3 条记录成为当前选中项
And 随后按下 Enter 时执行的是第 3 条记录的粘贴
```

### 场景 BDD-03-02：删除记录后焦点自动落到下一条可用记录

```gherkin
Given 主面板已经打开
And 当前选中第 4 条记录
When 用户按下 Delete
Then 第 4 条记录从列表中移除
And 新的第 4 条记录成为当前选中项
And 页面不会出现“无选中项且有数据”的中间异常状态
```

### 场景 BDD-03-03：主面板显示到当前活动显示器底部

```gherkin
Given 用户连接了两个显示器
And 当前鼠标与活动应用位于右侧显示器
When 用户通过快捷键打开主面板
Then 主面板显示在右侧显示器的 work_area 底部
And 不会跨越到左侧显示器
```

---

## 5. Feature：状态一致性与降级（Consistency & Fallback）

### 场景 BDD-04-01：监听暂停时托盘图标与运行状态保持一致

```gherkin
Given 应用已启动且监听处于运行中
When 用户从托盘暂停监听
Then 托盘图标切换为暂停态
And 运行状态接口返回 monitoring=false
And 再次打开主面板时可见“监听已暂停”的弱提示
```

### 场景 BDD-04-02：托盘初始化失败时应用仍可使用快捷键

```gherkin
Given 系统托盘初始化失败
When 用户按下全局快捷键 Shift+Command+V
Then 主面板仍可正常打开
And 应用记录一条 tray 初始化失败日志
```

---

## 6. 非功能需求验收场景（Performance / Reliability）

### 场景 BDD-NFR-01：读取运行状态不阻塞主面板首屏

```gherkin
Given 应用已启动并存在 100 条历史摘要
When 用户第一次打开主面板
Then 历史摘要在 200ms 内开始可见
And 托盘状态读取不会阻塞主面板首屏渲染
```

### 场景 BDD-NFR-02：清空历史后的再次复制恢复正常

```gherkin
Given 用户刚刚完成一次“清空历史”操作
When 用户再次复制一段文本
Then 新记录可以正常进入空历史列表
And 不会出现数据库锁死或监听器失效
```

### 场景 BDD-NFR-03：减少动态效果场景下降级不影响操作

```gherkin
Given 系统开启 prefers-reduced-motion
When 用户打开主面板并执行选择、删除、粘贴
Then 所有操作仍然可完成
And 动效被降级为弱动画或无动画
```

---

## 7. 验收通过标准（DoD）

- 托盘、监听、自启动、数字键、多显示器、清空历史至少各有 1 条 BDD 场景
- 所有 P0 场景均可自动化执行，不依赖真实系统托盘或真实 `~/Library/LaunchAgents`
- 任一场景失败时，能够从日志中定位到对应 IPC、配置或文件系统环节
