# code-discipline

写代码时的基本纪律：模块化、简洁可读、禁过度设计、禁兜底/冗余/猜测性代码；不清楚就问。已融入 Ponytail 核心：决策阶梯、删优于加/最短 diff、复杂需求先最小方案、`discipline:` 注释约定。

见 [SKILL.md](SKILL.md)。提交变更时配合 [pr-commit](../pr-commit/README.md)。

## 安装

插件市场（Claude Code）：

```bash
/plugin marketplace add Lq0412/my-skills-lab
/plugin install code-discipline@my-skills-lab
```

或手动复制（Claude Code 用 `.claude`，Cursor 用 `.cursor`）：

```powershell
Copy-Item -Recurse dev-tools\code-discipline $env:USERPROFILE\.claude\skills\code-discipline
```

## 依赖

无额外运行时依赖。建议在 Cursor / Claude Code 中作为全局 skill 安装，与具体项目无关。

## 触发示例

- 「写代码时注意编码纪律，不要兜底和过度设计」
- 「这段代码有没有冗余或猜测性字段？」
- 「重构时保持模块化、单一职责」
- 「不要 silent fallback，失败就明确报错」
- `/code-discipline`

## 典型输出

按场景不同：指出违规代码片段与原因、给出最小改动的重写建议，或在实现前主动追问不确定的字段/业务规则。

更多用例见 [examples/README.md](examples/README.md)。
