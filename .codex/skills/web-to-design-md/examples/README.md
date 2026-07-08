# web-to-design-md 示例用例

---

## 用例 1：完整提取流程

**用户输入：**

> 用 web-to-design-md 分析 https://stripe.com，生成 DESIGN.md 和预览 HTML。

**期望 agent 行为要点：**

- 检测可用浏览器后端（Playwright MCP 或 agent-browser）
- 用真实 DOM / computed style 提取色板、字体、间距、组件模式
- 输出 Stitch 风格 `DESIGN.md`，并运行 `render-design-preview.mjs` 生成预览 HTML

---

## 用例 2：仅亮色主题

**用户输入：**

> 提取这个网站的亮色主题设计系统就行：https://example.com

**期望 agent 行为要点：**

- 聚焦亮色模式 token，不强行编造暗色变量
- 标注无法从页面获取的项（如无 hover 态样本）
- 预览 HTML 与 DESIGN.md 结构一致
