# Browser Backends — Cursor 版 & Codex 版

本 skill 完整支持两个等价版本，提取目标与输出契约相同，仅浏览器调用方式不同。

## 版本对照

| | Cursor 版 | Codex 版 |
|---|-----------|----------|
| 宿主 | Cursor、Claude Code | Codex CLI |
| 运行时 | Playwright MCP 插件 | `agent-browser` CLI |
| 打开页面 | `browser_navigate` | `agent-browser open <url>` |
| 执行 JS | `browser_evaluate` | `agent-browser eval '<js>'` |
| 视口 | `browser_resize` | agent-browser 视口参数 / eval 内适配 |
| 交互 | `browser_click`、`browser_hover` | agent-browser 等价命令或 eval 触发 |
| 证据脚本 | MCP eval + 可选 `filename` 落盘 | `scripts/extract-browser-evidence.mjs` |

---

## Cursor 版（Playwright MCP）

当 MCP 工具列表中有 `browser_navigate`、`browser_evaluate` 时使用。

### 检测

- 查看已启用的 Playwright MCP 工具（`plugin-playwright-playwright`）
- 无需本地安装 Playwright CLI

### 标准流程

1. `browser_navigate` → 打开目标 URL
2. `browser_resize` → desktop (1440×1400)，再测 mobile (390×844)
3. `browser_wait_for` → 等待关键内容加载
4. 全页滚动（`browser_evaluate` 执行 `window.scrollTo` 或 `browser_press_key` PageDown）
5. `browser_evaluate` → 提取：
   - `document.documentElement` CSS 变量
   - 标题/按钮/卡片/导航的 `getComputedStyle`
   - 代表节点的 `outerHTML`（截断）
   - 可见文案与 CTA
6. `browser_hover` / `browser_click` → 探测 hover、主题切换、展开态
7. **不要**默认调用 `browser_take_screenshot`；仅 DOM 证据不足或用户明确要求时作交叉验证

### Eval 片段参考

```javascript
() => {
  const clean = (v) => (v || "").replace(/\s+/g, " ").trim();
  const styleOf = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    return {
      color: s.color,
      backgroundColor: s.backgroundColor,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      borderRadius: s.borderRadius,
      boxShadow: s.boxShadow,
      padding: s.padding,
    };
  };
  const vars = [...document.documentElement.style].filter((k) => k.startsWith("--"));
  const cssVars = Object.fromEntries(
    vars.map((k) => [k, getComputedStyle(document.documentElement).getPropertyValue(k).trim()])
  );
  return {
    title: document.title,
    cssVars,
    h1: styleOf(document.querySelector("h1")),
    primaryButton: styleOf(document.querySelector('button, a[class*="btn"], [role="button"]')),
  };
}
```

大段证据可写入 `filename` 参数指定的临时文件，避免撑爆上下文。

---

## Codex 版（agent-browser）

Codex 会话或 PATH 上有 `agent-browser` 时使用。这是本 skill 的原始实现路径。

### 检测

```bash
node scripts/check-browser-tooling.mjs
agent-browser --help
```

### 标准流程

1. `agent-browser open <url>`
2. `agent-browser wait`
3. 滚动页面触发懒加载与 sticky 态
4. `agent-browser eval '<js>'` → 提取目标与 Cursor 版相同（CSS 变量、computed style、HTML、文案）
5. 可选：`node scripts/extract-browser-evidence.mjs <url>` 生成 JSON 证据（输出到系统临时目录）

### 安装

若缺失，帮助用户安装或暴露 `agent-browser`，验证 `agent-browser --help` 后继续。

---

## 选用规则

| 条件 | 使用 |
|------|------|
| Playwright MCP 可用（Cursor 会话） | Cursor 版 |
| 仅 `agent-browser` 可用（Codex 会话） | Codex 版 |
| 两者皆无 | 说明缺失项；Cursor 用户启用 Playwright 插件，Codex 用户安装 `agent-browser` |
| 用户明确要求其他 fallback | 按用户指示，但仍优先 DOM 提取 |

**禁止**在未告知用户的情况下静默切换浏览器栈。

## 禁止

- 不要默认用静态 `curl`/HTML 抓取替代浏览器（会漏 hydration、hover、响应式）
- 不要编造无法访问区域的组件或状态
- 不要把中间证据 JSON 留在用户工作区（除非用户要求保留）
