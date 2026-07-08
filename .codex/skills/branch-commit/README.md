# Branch Commit

团队分支管理与提交频率规范。与 [pr-commit](../../dev-tools/pr-commit/) 互补——pr-commit 管格式，这个管节奏。

## 安装

```bash
ln -s /path/to/my-skills-lab/project-method/branch-commit ~/.claude/skills/branch-commit
```

## 前置

- 本仓库已安装 [pr-commit](../../dev-tools/pr-commit/)（管 commit format 和 PR 四段描述）

## 触发示例

| 用户说 | 作用 |
|--------|------|
| 「分支策略怎么定」 | 输出 main → dev → feat/xxx 结构 |
| 「这周大家都在堆代码没 push」 | 检查每个人的分支状态，提示推送 |
| 「提 PR 前需要检查什么」 | 输出自检清单 |
| 「分支名应该怎么取名」 | 输出 feat/fix/refactor 等前缀规则 |
