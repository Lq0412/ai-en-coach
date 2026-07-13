# product-killshot

竞品分析 + 产品优化报告：自动理解目标项目、检索头部竞品、双视角分析，输出可执行的 Markdown 优化报告。面向开发者工具 / CLI / 开发者平台类产品。

见 [SKILL.md](SKILL.md)。

## 安装

插件市场（Claude Code）：

```bash
/plugin marketplace add Lq0412/my-skills-lab
/plugin install product-killshot@my-skills-lab
```

或手动复制（Claude Code 用 `.claude`，Cursor 用 `.cursor`）：

```powershell
Copy-Item -Recurse dev-tools\product-killshot $env:USERPROFILE\.claude\skills\product-killshot
```

## 依赖

无额外运行时依赖；需要 agent 具备代码阅读与联网搜索能力。

## 触发示例

- 「帮我做竞品分析，输出产品优化报告」
- 「product-killshot，分析一下这个项目怎么打败竞品」
- 「产品杀手锏 / 功能规划 / 产品改进建议」
- `/product-killshot`

## 典型输出

一份结构化 Markdown 报告，含竞品对比、双视角洞察、优先级排序的优化建议与功能规划。

更多用例见 [examples/README.md](examples/README.md)。
