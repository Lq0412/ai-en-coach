---
name: branch-commit
description: >
  团队分支管理与提交频率规范。Use when 讨论分支策略、提交频率、
  分支命名、WIP 提交、或提到 pre-push、推送规范。
---

# 分支与提交规范

团队级的**分支管理**和**提交节奏**约定。通用 commit 格式和 PR 模板见 [pr-commit](../pr-commit/SKILL.md)，本文不重复。

## 与 pr-commit 的分工

| pr-commit 管什么 | 本文管什么 |
|:-----------------|:-----------|
| commit message 格式（type/scope/subject） | 什么时候 commit、多频繁 |
| 分支命名规则（feat/xxx） | 分支生命周期（什么时候创建、什么时候删） |
| PR 四段描述 | 提 PR 前的自检清单 |
| 拆分建议 | 团队节奏：每人每天至少一次推送 |

遇到 format 问题 → [pr-commit](../pr-commit/SKILL.md)。遇到流程/节奏问题 → 本文。

## 分支管理

### 默认分支

```
main          ← 可发布版本
  └─ dev      ← 日常开发集成
       ├─ feat/xxx      ← 功能
       ├─ fix/xxx       ← 修复
       ├─ refactor/xxx  ← 重构
       ├─ docs/xxx      ← 文档
       └─ chore/xxx     ← 构建/配置
```

- `main` — 每个 Milestone 结束时从 `dev` 合并，打 tag
- `dev` — 所有 PR 合入到这里，功能分支也从这里切
- 功能分支一合入就**删掉**

### 规则

- 分支名用英文 kebab-case：`feat/asr-websocket-integration`
- **一个分支 = 一个 Issue**。禁止一个分支同时修两个 Issue
- 开始写代码前先 rebase `dev`，确认没有冲突
- 合并到 `dev` 后立刻删分支

### 分支生命周期

```
切分支 → 开发 → 提 PR → review → 合并 → 删分支
  ↑                                        ↓
  从最新 dev 切出                     回到最新 dev
```

## 提交频率

### 提交时机

| 场景 | AI 行为 |
|:-----|:-----|
| 功能点完成 | 立即提交，不要等下一个功能点 |
| 编码告一段落 | 提醒用户推送当前分支 |
| 还没写完 | WIP 提交：`chore(scope): wip - <当前进度>` |

WIP commit 只在功能分支上使用，合入前 squash 或 rebase 去掉。

### 禁止

- 一个 commit 改了 10 个文件且互不相关
- `git push --force` 到 dev/main（除非明确通知了团队）

## 提 PR 前自检

表单抄了一遍？走一遍这个：

- [ ] 只有一个 commit 或 2-3 个有逻辑关联的 commit（不是 15 个 WIP 碎片）
- [ ] dev 合并过来了（rebase 或 merge），当前没有冲突
- [ ] 在本地能跑起来（编译 / 启动不报错）
- [ ] 调试用的 `console.log` / `TODO` 清理掉了
- [ ] 如果 commit 包含 AI 生成代码，确认自己能讲清每段逻辑
- [ ] 关联的 Issue 号写在 commit body 里

## AI 触发时机

| 场景 | AI 行为 |
|:-----|:-----|
| 用户说"提 PR" | 检查分支粒度、生成 PR 描述、用 `gh pr create` 创建 |
| 用户说"合入" | 确认检查项通过后执行合并，随后删分支 |
| 检测到未推送提交 | 提醒用户推送 |
| 合入后 | 立即删除功能分支 |


