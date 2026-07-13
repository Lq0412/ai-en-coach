# Branch Commit — 示例

## 示例 1：新人问分支怎么取

**用户：** 「开始做 ASR WebSocket 集成，帮我想个分支名」

**期望行为：** 输出 `feat/asr-websocket-integration`，并提醒从 `dev` 切、做完合回 `dev`。

## 示例 2：检查团队 git 状态

**用户：** 「今天周三了，帮我检查一下大家有没有堆代码」

**期望行为：** `git branch -r` 列出所有远程分支 → 检查每个分支 `git log --since="2 days ago"` → 标记超过 24 小时没有新 commit 的分支 → 提醒 push。

## 示例 3：提 PR 前自检

**用户：** 「准备提 PR 了，帮我看一下还有什么没做的」

**期望行为：** 输出自检清单逐条过：commit 数量、是否 rebase dev、能否跑起来、调试代码是否清理、Issue 号是否关联。
