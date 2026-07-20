# SpeakUp 贡献指南

本仓库使用 GitHub Issue、Milestone、Pull Request 和 Release 管理研发过程。完整规则以 [`reference/GitHub过程管理规范.md`](reference/GitHub过程管理规范.md) 为准，本文件提供日常操作入口。

## 1. 开始工作前

1. 确认工作对应一个 Issue，并关联当前 Milestone。
2. 一个 Issue 只处理一个可独立验收的问题。
3. 从最新 `main` 创建个人任务分支；团队协作时优先在个人 fork 中工作。

分支命名：

```text
feat/<scope>-<description>
fix/<scope>-<description>
docs/<description>
refactor/<scope>-<description>
chore/<description>
```

描述使用英文 kebab-case，例如：

```text
feat/prototype-interview-flow
fix/prototype-history-duplicate
docs/demo-guide
```

## 2. Issue 规则

- 使用仓库提供的提案、功能、修复或调研模板。
- 标题格式：`[类型] 简短描述`，避免“优化一下”“修复问题”等空泛表述。
- 写清背景、范围和可验证的验收标准。
- 产品或架构方向决策使用 Proposal 模板，并走 `proposal` 状态流转。
- 大任务按可独立交付、可独立验证的边界拆分。

## 3. Commit 规则

采用 Conventional Commits：

```text
<type>(<scope>): <subject>
```

常用类型：`feat`、`fix`、`docs`、`style`、`refactor`、`test`、`chore`、`perf`、`build`、`ci`。

示例：

```text
feat(prototype): 补充模拟面试创建链路
fix(prototype): 去除练习记录重复数据
docs: 补充产品演示说明
```

要求：

- 一个 Commit 表达一个完整、可回滚的意图。
- 不提交密钥、`.env`、依赖缓存、调试截图和无关构建产物。
- 提交前检查 diff，确认没有夹带其他人的修改。
- 禁止添加 AI 工具的 `Co-authored-by` 信息。

## 4. Pull Request 规则

- 一个 PR 对应一个 Issue，只解决一个主题。
- PR 标题与 Commit 格式一致。
- 正文必须填写功能描述、实现思路、测试方式和关联 Issue。
- 使用 `Closes #<issue-number>` 关联并在合并后关闭 Issue。
- 原型或界面改动应附关键页面截图或录屏。
- AI 辅助内容需要写明人工检查重点，提交者必须能解释改动逻辑。

## 5. 提交 PR 前检查

- [ ] 已同步最新 `main`，没有冲突
- [ ] 改动范围与 Issue 一致
- [ ] 本地可以启动
- [ ] 自动化测试或必要的手工验证已完成
- [ ] 没有提交缓存、构建产物、临时文件或敏感信息
- [ ] README 或用户文档已同步更新（如适用）
- [ ] PR 中提供了可复现的验证步骤

## 6. Review 与合并

PR 满足以下条件后才能合入：

1. 至少一名 Reviewer Approve。
2. 必要测试、构建和检查通过。
3. 已同步最新目标分支且无冲突。
4. 所有 Review 意见已处理或明确回复。
5. 无与 Issue 无关的修改。

合并后删除个人任务分支。禁止直接向 `main` 推送或 force push。

## 7. 当前项目建议 Scope

| Scope | 适用范围 |
|---|---|
| `prototype` | SpeakUp Web 产品原型 |
| `product` | 产品需求与产品规则 |
| `architecture` | 系统架构和技术方案 |
| `docs` | 团队、演示及使用文档 |
| `process` | GitHub 流程和协作规范 |
| `skills` | `.agents/skills` 工作流能力 |
| `ci` | GitHub Actions 和自动化检查 |
