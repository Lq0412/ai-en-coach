# 任务 1：AI 对话、翻译与场景 Prompt

## 负责什么

负责 SpeakUp 的实时对话体验。用户输入一句话后，系统应能根据当前场景完成翻译、润色、改写、表达建议或英文追问。

首期覆盖：

- 中英翻译、英文润色、口语化改写；
- 面试、客户沟通、会议发言、汇报四类场景的系统 Prompt；
- 根据当前用户输入和上下文决定直接回答、给示例或继续追问；
- 面试场景中的动态追问，避免固定题库；
- 使用简历、JD、当前 Scenario 提供的上下文生成更贴合的回答。

## 不负责什么

- 不做评分、反馈报告、错题或复练；
- 不写长期记忆、简历、Scenario 或历史记录；
- 不增加新的 HTTP 路由；
- 不修改前端；
- 不修改 `main.go`、`assistant/service.go` 或 `assistant/http.go`。

## 文件边界

可修改或新增：

```text
backend/internal/assistant/dashscope.go
backend/internal/assistant/dashscope_test.go
backend/internal/assistant/prompts/
backend/internal/conversation/
```

禁止修改：

```text
backend/internal/preparation/
backend/internal/practice/
backend/internal/review/
backend/internal/platform/memory/
backend/internal/demomodules/registry.go
backend/internal/assistant/service.go
backend/internal/assistant/http.go
backend/cmd/server/main.go
frontend/
```

## 与其他任务的约定

- 只读取由“用户资料、记忆与学习记录”任务提供的上下文，不直接读取其 Repository；
- Prompt 只描述如何生成回答或追问，不能定义评分标准；
- 需要练习或评分时，只返回明确的下一步建议，不直接创建 Review 或 PracticeSession；
- 当前用户输入优先于历史记忆、Scenario 摘要和模型推断。

## 分支创建

前置条件：先合并 Scenario 基础 PR #64，再从最新 `main` 创建分支。

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feat/ai-dialogue-prompts
```

若 PR #64 尚未合并，不要从旧 `main` 开发；等待合并后再开始，避免三个分支各自复制 Scenario 契约。

## 交付与验收

- [ ] 四类场景各有独立、可读的 Prompt，不散落在 HTTP Handler 中；
- [ ] 翻译、润色、表达建议和场景追问有固定测试样例；
- [ ] 普通翻译请求不会被强制导向面试或练习；
- [ ] Prompt 不编造用户经历，不把知识库内容说成用户做过的事；
- [ ] `go test ./...` 通过；
- [ ] PR 只包含上述目录中的文件，并附 3 至 5 个输入/输出示例。
