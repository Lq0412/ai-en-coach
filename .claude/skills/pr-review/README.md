# PR Review

团队 PR Review 流程与合入规范。与 [pr-commit](../../dev-tools/pr-commit/) 互补——pr-commit 管 PR 怎么写，这个管 PR 怎么审。

## 安装

```bash
ln -s /path/to/my-skills-lab/project-method/pr-review ~/.claude/skills/pr-review
```

## 前置

- 本仓库已安装 [pr-commit](../../dev-tools/pr-commit/) 和 [code-discipline](../../dev-tools/code-discipline/)

## 触发示例

| 用户说 | 作用 |
|--------|------|
| 「帮我 review 这个 PR」 | 按检查项逐条审，输出 Review 意见 |
| 「这个 PR 能合了吗」 | 对照合入条件检查，输出还缺什么 |
| 「Review 流程怎么走」 | 输出 PR → Review → 修改 → 再 Review → 合入 全流程 |
| 「这段 AI 生成的代码要怎么看」 | 追加 AI 代码专项检查 |
