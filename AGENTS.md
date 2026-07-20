# AGENTS.md

本项目只使用 Codex skills，唯一来源为 `.agents/skills/`。

## 仓库角色与默认目标

### 团队共享开发仓

- 仓库：`Lq0412/ai-en-coach`
- GitHub：https://github.com/Lq0412/ai-en-coach
- Git：https://github.com/Lq0412/ai-en-coach.git
- 用途：项目日常工作的第一现场。代码、文档、方案、Issue 草稿、分支协作、代码 Pull Request、Tag 和 Release 均优先在这里完成和验证。

### 实训营主仓

- 仓库：`1024XEngineer/XE3-ESL`
- GitHub：https://github.com/1024XEngineer/XE3-ESL
- Git：https://github.com/1024XEngineer/XE3-ESL.git
- 用途：实训营正式 Issue、Milestone、阶段任务、过程记录和验收关联。该仓库是受控同步目标，不是日常工作的默认写入仓库。

### 默认操作规则

- 所有新增、修改、评审和验证工作默认先在团队共享开发仓 `Lq0412/ai-en-coach` 完成。
- 可以随时只读查询实训营主仓，用于了解已有 Issue、Milestone、标签、模板、分支和当前进度；只读查询不等于获得写入授权。
- 向实训营主仓写入前，必须同时满足：
  1. 待同步内容已在共享开发仓完成并验证无误；
  2. 已检查实训营主仓的当前状态和既有规范，确认内容、编号、范围、标签、Milestone 与已有工作不冲突；
  3. 已向用户说明准备写入的内容、目标位置和关联关系；
  4. 已获得用户对本次主仓写入的明确同意。
- 未满足上述条件时，只能准备 Issue 正文、同步清单或变更草稿，不得创建、更新、关闭实训营主仓中的 Issue、Milestone、PR、Tag、Release 或其他内容。
- 正式 Issue 和 Milestone 最终应落在实训营主仓；共享开发仓可保存草稿和实现 PR，但不要重复创建同一份正式任务。
- 共享开发仓中的实现 PR 应关联实训营主仓中的对应正式 Issue。
- 执行 GitHub 操作时必须显式指定目标仓库，不得仅根据当前目录的 `origin` 推断操作对象。
- 如果任务同时涉及两个仓库，先说明各项操作分别落在哪个仓库；不要混淆两个仓库的 Issue、Milestone 或 PR 状态。

## 文档归档与创建者

- 实训营从 `2026-07-06` 开始，按周一至周日划分周次：Week1 为 7 月 6 日至 12 日，Week2 为 7 月 13 日至 19 日，后续依此顺延。
- 个人日报、会议记录、调研、分析、方案草稿、待办和复盘，默认按里程碑与周次保存到 `docs/ms{M}/week{N}/{作者姓名}/`，其中每个 Milestone 覆盖连续两周。
- 作者身份只能来自用户明确说明、个人级 Codex 指令或任务上下文，不在团队共享规则中硬编码成员姓名。
- 只有用户明确说明是“团队公共文档”“统一规范”或指定公共路径时，才保存到对应 `docs/ms{M}/week{N}/` 根目录、`docs/`、`reference/` 或其他公共目录。
- 创建文档前先检查同周次、同作者的既有目录和命名方式，优先沿用已有结构。
- 如果作者身份或文档归属无法判断，先询问保存位置，不擅自放入公共目录或其他成员目录。

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
