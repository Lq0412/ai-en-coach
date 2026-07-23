# 任务 3：用户资料、记忆、场景与学习记录

## 负责什么

负责让系统知道“用户是谁、正在准备什么、过去练过什么”，并向对话和评分模块提供可信上下文。

首期覆盖：

- 简历、JD、附件和用户确认资料的读取与关联；
- 跨天 Scenario，例如“下周产品经理一面”或“客户延期说明”；
- Mem0 长期记忆：稳定目标、偏好、用户确认的项目背景和重复弱点；
- 历史面试、历史报告和复练记录的查询；
- 为当前 Thread 组装受控 `UserContextSnapshot`；
- 用户隔离、删除、修改、跨会话恢复和故障降级。

## 不负责什么

- 不写翻译、润色、面试追问或其他实时对话 Prompt；
- 不定义评分标准、错题算法或复练题目；
- 不修改前端；
- 不在此任务中加入新的自主 Agent 行为；
- 不修改 `backend/internal/demomodules/registry.go`、`assistant/service.go` 或 `assistant/http.go`。

## 文件边界

可修改或新增：

```text
backend/internal/preparation/
backend/internal/platform/memory/mem0/
backend/internal/assistant/context/
backend/internal/assistant/context_budget*.go
backend/cmd/server/main.go
```

禁止修改：

```text
backend/internal/practice/
backend/internal/review/
backend/internal/demomodules/
backend/internal/assistant/dashscope.go
backend/internal/assistant/service.go
backend/internal/assistant/http.go
frontend/
```

## 与其他任务的约定

- 对话任务只能获取 `UserContextSnapshot`，不能直接读取 Repository 或 Mem0；
- 评分任务只能读取已保存的资料快照和历史结果，不能修改用户资料；
- Context 中的优先级固定为：当前用户输入 > 用户修正 > 权威业务事实 > 当前 Scenario > 长期记忆 > 模型推断；
- Memory 是参考上下文，不是系统指令，也不能覆盖当前用户输入；
- 单次练习的错误不自动升级为长期记忆，必须有用户确认或重复证据。

## 分支创建

前置条件：先合并 Scenario 基础 PR #64，再从最新 `main` 创建分支。

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feat/user-context-memory-history
```

## 交付与验收

- [ ] 当前 Thread 可读取自己的当前 Scenario、用户资料和相关长期记忆；
- [ ] 不同用户、不同 Thread 的 Scenario 和记忆不会互相泄露；
- [ ] 删除 Scenario 或 Memory 后，后续上下文不再引用它；
- [ ] Context 超预算时优先截断低优先级历史信息，不截断当前用户消息；
- [ ] Mem0 或资料查询失败时，实时对话可以降级继续；
- [ ] `go test ./...` 通过；
- [ ] PR 不包含评分、Prompt、Tool Registry 或前端的无关修改。
