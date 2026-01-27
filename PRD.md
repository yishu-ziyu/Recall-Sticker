# 产品需求文档 (PRD): Recall Sticker

| 属性           | 内容                            |
| -------------- | ------------------------------- |
| **项目名称**   | Recall Sticker (网页记忆遮挡贴) |
| **版本号**     | v1.0.0 (MVP)                    |
| **状态**       | **开发中 (进行中)**             |
| **文档负责人** | 奕枢 / 子羽                     |

## 1. 产品概述 (Overview)

**核心价值**：通过“原地遮挡（In-Situ Masking）”和“主动回想（Active Recall）”机制，帮助用户在浏览网页时即时进行记忆强化。
**交付形态**：Chrome 浏览器扩展（Manifest V3），配合 Side Panel 侧边栏使用。

## 2. 核心功能逻辑 (Functional Logic)

### F1. 贴纸创建 (Sticker Creation)

- **[P0] 触发条件**：
  - 用户选中文本且字符数 > 0。
  - **限制**：当前 MVP 版本仅支持**单一样式块**内的文本选择。
  - **异常处理**：若用户跨越了 DOM 节点（例如跨了两个 `<p>` 标签）进行选择，系统将弹出 Toast 提示“⚠️ 仅支持在同一段落内创建贴纸”，明确告知用户不支持跨节点。

- **[P0] 样式应用**：
  - 在选区外包裹 `span.recall-sticker-hidden`。
  - 应用模糊滤镜 `filter: blur(4px)` 和透明文字 `color: transparent`。

- **[P1] 数据构造**：
  - 保存对象需包含：`text` (内容), `prefix` (前100字符，用于精确定位), `suffix` (后100字符，用于精确定位), `timestamp`，`context` (用于Anki导出)。

### F2. 贴纸交互 (Interaction)

- **[P0] 状态切换**：
  - 点击贴纸：在 `hidden` (模糊) 和 `revealed` (下划线/可见) 之间切换。
  - 键盘操作：`Enter` 或 `Space` 键触发展开/隐藏（需确保 `span` 有 `tabindex="0"`）。

- **[P1] 偷看模式 (Peek Mode)**：
  - 按住 `Alt/Option` 键：全局添加 `body.recall-peek-active` 类，所有贴纸透明度降为 0.2，允许快速浏览内容。

- **[P1] 删除**：
  - 右键点击贴纸 -> 弹出原生确认框 `confirm` -> 确认后移除 DOM 并清理 Storage。

### F3. 持久化与恢复 (Persistence & Restore)

- **[P0] 存储结构**：
  - Key: `window.location.origin + window.location.pathname`（忽略 query 参数）。

- **[P0] 页面加载恢复**：
  - 触发时机：`window.load` 后延迟 1000ms 执行（后续需优化为 MutationObserver）。
  - **定位逻辑**：利用 Prefix 和 Suffix 校验上下文，确保定位唯一性。即使页面上有重复单词，也能精准还原到创建时的位置。

### F4. 侧边栏与导航 (Side Panel)

- **[P1] 列表渲染**：
  - 按时间倒序展示所有贴纸。
  - 展示来源域名 (Hostname) 和上下文预览。

- **[P0] 点击跳转**：
  - 利用 Chrome Text Fragments 协议构造 URL：`#:~:text=[prefix-,]textStart[,textEnd][,-suffix]`。
  - 交互：点击卡片 -> 新开标签页或跳转到已有标签页并滚动到目标位置。

### F5. 智能导出 (Anki Export)

- **[P2] 挖空上下文抓取**：
  - 系统向前后寻找最近的标点符号（`.!?。！？`）截取完整句子。
  - 输出格式：`PreText {{c1::StickerText}} PostText`。
  - 标签生成：`RecallSticker` + `PageTitle`。

## 3. 已修复缺陷 (Fixed Gaps)

### Gap 1: 定位算法失效风险 (Critical) - FIXED

- **状态**: 已修复
- **方案**: 重写 `findRangeByContext`，引入 `prefix` 和 `suffix` 严格校验，确保在重复文本中能唯一匹配。

### Gap 2: 跨节点崩溃风险 (Major) - FIXED

- **状态**: 已修复
- **方案**: 在 `handleCreateSticker` 捕获异常，并通过 `showToast` 提供明确的 UI 错误提示。

### Gap 3: 动态页面加载问题 (Minor) - PENDING

- **状态**: 待优化
- **方案**: 计划引入 `MutationObserver` 替代硬编码 `setTimeout`。
