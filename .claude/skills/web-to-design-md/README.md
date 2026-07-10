# web-to-design-md

从线上网站提取可复用的 `DESIGN.md` 设计系统文档 + HTML 预览板。

支持 **Cursor 版**（Playwright MCP）与 **Codex 版**（`agent-browser` CLI），按当前环境自动选用，两套流程等价。

用于 XEngineer 项目的竞品分析时，本 skill 只负责 browser-first 证据提取与设计系统总结；若结论进入产品 Proposal，应再按 `reference/产品设计规范.md` 转成“现有做法及其不足 / 关键决策与依据 / 明确不做”的取舍表达。

## 能力

- 用真实浏览器读取 DOM、computed style、CSS 变量、交互态（非截图优先）
- 输出 Stitch 风格 `DESIGN.md`
- 用 `render-design-preview.mjs` 生成可视化预览 HTML
- 支持亮/暗主题分别记录

## 两个版本

| 版本 | 宿主 | 浏览器工具 | 典型命令 |
|------|------|------------|----------|
| **Cursor 版** | Cursor / Claude Code（Playwright 插件） | Playwright MCP | `browser_navigate`、`browser_evaluate` |
| **Codex 版** | Codex CLI | `agent-browser` | `agent-browser open`、`agent-browser eval` |

Agent 启动时检测当前可用工具，有哪个用哪个；两者皆有时优先 Playwright MCP（Cursor 会话），Codex 会话则用 `agent-browser`。

详见 [references/browser-backends.md](references/browser-backends.md)。

## 安装

### 插件市场（Claude Code / Cursor）

```bash
/plugin marketplace add Lq0412/my-skills-lab
/plugin install web-to-design-md@my-skills-lab
```

### 手动安装

**Cursor：**

```powershell
Copy-Item -Recurse dev-tools\web-to-design-md $env:USERPROFILE\.cursor\skills\web-to-design-md
```

**Codex：**

```bash
cp -r dev-tools/web-to-design-md ~/.codex/skills/web-to-design-md
```

或使用 Codex skill 安装器：

```bash
python3 ~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py \
  --repo Lq0412/my-skills-lab --path dev-tools/web-to-design-md
```

安装后重启对应客户端以发现新 skill。

## 依赖

- Node.js ≥ 18（运行 `scripts/render-design-preview.mjs`）
- **Cursor 版**：Playwright MCP 插件已启用
- **Codex 版**：`agent-browser` 在 PATH 上

## 运行前检查

在提取网站设计或渲染预览前：

```bash
# 1. Node 版本
node --version            # 需 ≥ 18

# 2. 浏览器后端检测（在 skill 目录下）
node scripts/check-browser-tooling.mjs

# 3. 预览脚本可执行
node scripts/render-design-preview.mjs --help
```

`check-browser-tooling.mjs` 会报告 Playwright MCP 与 `agent-browser` 哪个可用；至少一种可用即可开始。Cursor 会话优先 Playwright MCP，Codex 会话用 `agent-browser`。

## 用法

```
用 web-to-design-md 分析 https://example.com，生成 DESIGN.md 和预览 HTML。
```

## 目录

```
web-to-design-md/
├── SKILL.md
├── agents/          # Codex 注册清单（openai.yaml）
├── assets/          # DESIGN 模板 + HTML 预览壳
├── references/      # 检查清单、浏览器后端说明
└── scripts/         # 工具检测、证据提取、预览渲染
```

更多用例见 [examples/README.md](examples/README.md)。
