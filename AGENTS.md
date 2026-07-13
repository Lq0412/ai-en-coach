# AGENTS.md

本项目的 Claude Code skills 放在 `.claude/skills/` 下，进入项目目录后自动加载。

## 团队流程 Skills

| Skill | 用途 |
|-------|------|
| [issue-standard](.claude/skills/issue-standard/) | Issue 模板、标签、拆分 |
| [branch-commit](.claude/skills/branch-commit/) | 分支管理、提交频率 |
| [pr-review](.claude/skills/pr-review/) | Review 流程、合入条件 |
| [milestone-manager](.claude/skills/milestone-manager/) | MS 创建、进度跟踪 |
| [release-tag](.claude/skills/release-tag/) | Tag 命名、Release Notes |

## 通用 Skills

| Skill | 用途 |
|-------|------|
| [product-killshot](.claude/skills/product-killshot/) | 竞品分析 + 产品优化报告 |
| [pr-commit](.claude/skills/pr-commit/) | Commit 格式、PR 四段描述 |
| [code-discipline](.claude/skills/code-discipline/) | 编码纪律、禁止项 |
| [ai-design-smell](.claude/skills/ai-design-smell/) | AI 生成设计味识别与修复 |
| [web-to-design-md](.claude/skills/web-to-design-md/) | 竞品网站提取设计系统 |

## 相关工作流

1. **写 Issue** → 用 [issue-standard](.claude/skills/issue-standard/)
2. **写代码** → 用 [code-discipline](.claude/skills/code-discipline/)
3. **提交** → 用 [pr-commit](.claude/skills/pr-commit/) + [branch-commit](.claude/skills/branch-commit/)
4. **提 PR** → 用 [pr-commit](.claude/skills/pr-commit/) + [pr-review](.claude/skills/pr-review/)
5. **做竞品分析** → 用 [product-killshot](.claude/skills/product-killshot/) + [web-to-design-md](.claude/skills/web-to-design-md/)
6. **MS 管理** → 用 [milestone-manager](.claude/skills/milestone-manager/) + [release-tag](.claude/skills/release-tag/)
