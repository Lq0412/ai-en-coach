---
name: web-to-design-md
description: >
  Use when given website URLs and asked to analyze site design, reverse-engineer UI,
  extract look and feel, write DESIGN.md or design.md, create a style guide, or capture
  UI rules for AI-assisted implementation. Also triggers on web-to-design-md,
  网站设计提取, 设计规范, 逆向设计, style guide, or website-to-design.
metadata:
  version: "1.0.0"
  requires:
    - "node>=18"
    - "Playwright MCP (Cursor) or agent-browser CLI (Codex)"
  compatibility:
    - "cursor"
    - "claude-code"
    - "codex"
---

# Web to DESIGN.md

将真实网站提炼为可复用的 `design.md` / `DESIGN.md`，并生成 HTML 预览板。

目标不是克隆页面，而是让另一个 Agent **仅凭文档**即可复现相同的设计语言、内容调性与交互气质。

## 浏览器运行时（双版本，自动选用）

| 版本 | 宿主 | 工具 |
|------|------|------|
| **Cursor 版** | Cursor / Claude Code + Playwright 插件 | Playwright MCP（`browser_navigate`、`browser_evaluate` 等） |
| **Codex 版** | Codex CLI | `agent-browser`（`open`、`wait`、`eval`） |

启动时检测当前环境可用工具，**有哪个用哪个**；两者皆有时：Cursor 会话走 Playwright MCP，Codex 会话走 `agent-browser`。不要跨版本混用同一轮提取。

详细步骤见 [references/browser-backends.md](references/browser-backends.md)。

**不要**默认用截图或静态 HTML 抓取替代浏览器内证据。截图仅作 DOM 不足或用户明确要求时的交叉验证。

## 工作方式

- **证据优先**：DOM、computed style、CSS 变量、样式表规则、交互态 diff 为主证据
- **观察 vs 推断**：直接观测写事实；判断性规则标注「推断」
- **合成而非 dump**：把 CSS 翻译成设计语言，不写无意义数值堆砌
- **默认双产出**：`DESIGN.md` + 同目录 `DESIGN-preview.html`（用户明确只要 markdown 时可省略 HTML）

## Preflight

1. 规范化目标 URL（可多页）
2. 选择浏览器后端（见上；可运行 `node scripts/check-browser-tooling.mjs`）
3. 默认输出 `DESIGN.md`，预览 `DESIGN-preview.html`（或 `design.md` / `design-preview.html` 若用户指定）
4. 多 URL 时各页独立检查；仅视觉语言一致时才合成一套系统

## 必做提取（摘要）

完整清单见 [references/website-reading-checklist.md](references/website-reading-checklist.md)。

### 1. 划定范围

- 页面类型（营销 / 产品 / 仪表盘 / 文档 / 电商……）
- 自上而下重要区块；不可访问处如实标注，不编造

### 2. 基线采集

- 先 desktop，布局变化大时再 tablet / mobile（`browser_resize` 或 agent-browser 视口）
- **先滚完全页**再写，避免漏掉懒加载、sticky、渐进披露
- 用 `browser_evaluate` / `agent-browser eval` 提取：HTML 结构、CSS 变量、computed style、文案、样式表规则

### 3. 设计系统

- 色彩及语义角色；亮/暗主题（若有切换须分别记录）
- 字体层级、间距节奏、圆角、边框、阴影、图层
- 图标/插图/动效风格；密度与留白哲学

### 4. 组件与状态

导航、Hero、按钮、卡片、表单、页脚等重复模式；记录 default / hover / active / focus / sticky / expanded 等可见状态。

### 5. 交互行为

滚动、悬停、点击、主题切换引起的变化；动画节奏（克制 / 利落 / 电影感……）。

### 6. 内容与品牌调性

标题风格、CTA 措辞、信任信号、句式密度——好的 DESIGN.md 同时指导视觉与文案。

## 输出契约

按 [assets/DESIGN.template.md](assets/DESIGN.template.md) 结构撰写，通常包含：

1. Visual Theme & Atmosphere
2. Color Palette & Roles（含 Theme Modes）
3. Typography Rules
4. Component Stylings
5. Layout Principles
6. Depth & Elevation
7. Do's and Don'ts
8. Responsive Behavior
9. Agent Prompt Guide（含 2–4 条可粘贴的组件 prompt 示例）

可选附录：Interaction Patterns、Content & Messaging、Observed Pages、Evidence Notes。

### HTML 预览

```bash
node scripts/render-design-preview.mjs DESIGN.md
# 或指定输出路径
node scripts/render-design-preview.mjs design.md design-preview.html
```

使用 [assets/design-preview-shell.template.html](assets/design-preview-shell.template.html) 作为稳定壳；左侧展示 token 与规则，一侧保留 markdown 原文。

## 合成规则

**好：**

- 「主操作按钮为冷色电蓝 `#3B82F6`，落在深炭灰表面。」
- 「卡片偏编辑感：软边框、大内边距、极轻阴影分隔。」

**差：**

- 「按钮背景是 rgb(59,130,246)。」
- 「有一些间距和圆角。」

- 语义命名优于原始 token 名
- 色彩附 hex；间距/圆角/阴影写成可执行的尺度描述
- 站点有两套视觉模式时分别说明出现场景

## 质量门槛（收尾前自检）

- 另一 Agent 能否仅凭本文复现站点气质？
- 主色是否绑定功能角色？
- 字体层级是否足够具体？
- 主要组件是否覆盖关键状态？
- 响应式变化是否记录？
- 文案调性是否捕获？
- 是否避免编造不可见页面/状态？
- Agent Prompt Guide 是否有 2–4 条可用示例？

任一否 → 回到浏览器补采后再定稿。

## 默认交付

1. 用浏览器提取证据
2. 写入 `DESIGN.md`
3. 生成同级 `*-preview.html`
4. 回复中说明：最大设计特征、文件路径、证据缺口
5. **保持工作区整洁**：中间 JSON 放系统临时目录；除非用户要求，不留下 `evidence.md`、`notes.md` 等

## 边缘情况

| 情况 | 处理 |
|------|------|
| 多页同产品 | 先提炼共性，页级差异单独记 |
| 登录墙 / 部分不可见 | 只写能看到的；明确缺失 |
| 复杂 App | 侧重导航、密度、表格/面板、筛选、空态 |
| 无浏览器工具 | 说明缺什么；请用户启用 Playwright MCP 或安装 agent-browser；不静默降级 |

## 语言

输出语言跟用户对话语言（中文用户 → 中文 DESIGN.md，技术术语可保留英文）。
