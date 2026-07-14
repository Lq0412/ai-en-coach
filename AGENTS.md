# AGENTS.md

本项目只使用 Codex skills，唯一来源为 `.agents/skills/`。

## Skills

| Skill | 用途 |
|---|---|
| `issue-standard` | 创建、拆分和管理 GitHub Issue |
| `branch-commit` | 分支生命周期与提交节奏 |
| `pr-commit` | Commit 格式与 PR 创建 |
| `pr-review` | Review 流程与合入条件 |
| `milestone-manager` | Milestone 创建与进度跟踪 |
| `release-tag` | Tag 与 Release |
| `code-discipline` | 明确要求代码质量约束或重构审查时使用 |
| `product-killshot` | 竞品分析与产品优化报告 |
| `ai-design-smell` | Web UI 设计味审查与修复 |
| `web-to-design-md` | 从指定网站提取设计系统 |

## 使用原则

- 仅加载与当前任务直接相关的 skill，不因工作流相邻而自动组合。
- 提交格式使用 `pr-commit`；只有涉及分支生命周期或提交节奏时才加载 `branch-commit`。
- PR 创建使用 `pr-commit`；只有执行 Review 或判断合入条件时才加载 `pr-review`。
- 竞品产品分析使用 `product-killshot`；只有需要从具体网站提取设计规则时才加载 `web-to-design-md`。
- Milestone 管理使用 `milestone-manager`；只有实际发版时才加载 `release-tag`。
