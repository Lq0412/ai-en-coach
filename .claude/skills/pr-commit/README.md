# pr-commit

通用 Git Commit 与 Pull Request 规范：对齐项目历史、Conventional Commits 格式、分支命名、PR 四段描述、变更拆分与 Agent 安全规则。

源自马可文化 (Mark) 项目实践，已泛化为任意仓库可用。

见 [SKILL.md](SKILL.md)。多端 monorepo 示例见 [examples.md](examples.md)。编码质量见 [code-discipline](../code-discipline/README.md)。

## 安装

插件市场（Claude Code）：

```bash
/plugin marketplace add Lq0412/my-skills-lab
/plugin install pr-commit@my-skills-lab
```

或手动复制（Claude Code 用 `.claude`，Cursor 用 `.cursor`）：

```powershell
Copy-Item -Recurse dev-tools\pr-commit $env:USERPROFILE\.claude\skills\pr-commit
```

## 依赖

- 目标仓库已初始化 Git
- 开 PR 时需要 `gh` CLI（GitHub）或项目文档中的等效方式

## 触发示例

- 「按规范写 commit message」
- 「帮我开 PR，补全测试方式」
- 「这次改动要不要拆成多个 PR？」
- 「提交规范 / PR 规范 / 写 commit / 开 PR」
- `/pr-commit`

## 典型输出

符合项目历史的 `type(scope): subject` commit message；或含「功能描述 / 实现思路 / 测试方式 / 相关 Issue」四段的 PR 描述与拆分建议。

更多用例见 [examples/README.md](examples/README.md)。
