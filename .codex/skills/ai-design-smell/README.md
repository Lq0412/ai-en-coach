# ai-design-smell

一眼识别 AI 生成 UI 的「丑设计味」，并给出可直接套用的修复方向。生成或评审界面前对照执行。

核心理念：**现代简约 —— 清晰层级 + 左对齐 + 留白足，单主色无渐变，拒绝模板化科技元素。**

见 [SKILL.md](SKILL.md)。

## 安装

插件市场（Claude Code）：

```bash
/plugin marketplace add Lq0412/my-skills-lab
/plugin install ai-design-smell@my-skills-lab
```

或手动复制（Claude Code 用 `.claude`，Cursor 用 `.cursor`）：

```powershell
Copy-Item -Recurse dev-tools\ai-design-smell $env:USERPROFILE\.claude\skills\ai-design-smell
```

## 依赖

无额外运行时依赖。适用于 Web UI、组件库、落地页、截图评审等前端设计场景。

## 触发示例

- 「帮我看看这个页面有没有 AI 设计味」
- 「这个界面太模板化了，按现代简约改一下」
- 「生成一个落地页，别有 AI 味 / slop UI」
- 「设计避坑 / 现代简约 / 卡片套娃 / 蓝紫渐变」
- `/ai-design-smell`

## 典型输出

**评审模式**：五大特征逐条体检（命中项含证据 + 修复建议）+ 总评。  
**生成模式**：按修复模板约束产出的界面代码或改写方案，附定稿前自检清单。

更多用例见 [examples/README.md](examples/README.md)。
