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

### 底线

| 频率 | 要求 |
|:-----|:-----|
| **每天至少推送一次** | 不把代码屯在本地 >24 小时 |
| **一个功能每天至少一个 commit** | WIP 也可以提交，标记即可 |

### WIP 提交

没写完也可以提交，格式如下，真正合入前 rebase 成干净 commit：

```
chore(asr): wip - WebSocket 连接建立，识别回调还没接好
```

WIP commit 只在功能分支上存在，**不能出现在 dev 上**。功能分支合入前必须 squash 或 rebase 去掉 WIP。

### 禁止

- 本地堆了 3 天不 push
- 一个 commit 改了 10 个文件且互不相关
- `git push --force` 到 dev/main（除非明确跟 team 同步了）

## 提 PR 前自检

表单抄了一遍？走一遍这个：

- [ ] 只有一个 commit 或 2-3 个有逻辑关联的 commit（不是 15 个 WIP 碎片）
- [ ] dev 合并过来了（rebase 或 merge），当前没有冲突
- [ ] 在本地能跑起来（编译 / 启动不报错）
- [ ] 调试用的 `console.log` / `TODO` 清理掉了
- [ ] 如果 commit 包含 AI 生成代码，提交者自己能讲清每段逻辑
- [ ] 关联的 Issue 号写在 commit body 里

## 团队节奏

| 动作 | 频率 | 谁 |
|:-----|:-----|:---|
| 推送 | 每天至少 1 次 | 所有人 |
| 开 PR | 功能完成立刻开 | 开发者 |
| Review | 24 小时内给反馈 | 指定 reviewer |
| 合入 | Review 通过立刻合 | 开发者自己 |
| 删分支 | 合入后立刻删 | 开发者自己 |
| 清理本地 | 每周 git fetch --prune | 所有人 |

站会与日报格式见 [一些安排与共识](../../../reference/一些安排与共识.md)。

