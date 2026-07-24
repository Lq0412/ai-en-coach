# 错题本、复练与对话卡片改造方案

## 背景

当前 Review 模块已经能在 `review.generate_feedback` 中产出结构化 `MistakeItem` 和 `RepracticeTarget`，但这类错题更接近“系统自动识别的薄弱点”。用户真正需要的首期错题功能更简单：

> 用户在面试报告中手动把某一道题加入错题本，之后可以在错题入口查看、回到原面试上下文，并针对这道题重新练习。

因此本方案把首期错题定义为“用户收藏的待复练题目”，不是完全依赖 AI 自动判错。

另外，当前用户询问“帮我查一下我最近面试过哪些面试”时，Agent 调用了 `review.list_history`，但最终只发送普通文本：

```text
最近的模拟面试：
1. AI Application Developer（10 个有效回答）
2. AI Application Developer（1 个有效回答）
```

这说明后端已经有结构化历史数据，但 Assistant 消息层没有把它包装成可点击卡片。错题查询也会遇到同样问题，所以本次一起补齐“工具结果 -> 对话卡片 -> 前端跳转”的链路。

## 调整后的任务范围

本任务新增覆盖：

- 报告页每道题旁边提供“加入错题 / 已加入”按钮；
- 错题页展示用户加入过的所有错题；
- 从错题进入原面试详情页，展示该场面试所有题目和回答；
- 点击被标记的题目进入同题复练；
- 复练完成后生成针对该题的新 Review 点评；
- Agent 可以调用工具查询最近错题，并在对话框发送可点击错题卡片；
- Agent 查询最近面试历史时，也发送可点击面试历史卡片。

前端首期只做轻接入，后续视觉与交互细节可以由前端同学继续打磨。

## 产品闭环

### 1. 从 Review 报告加入错题

报告页展示真实问答记录时，每个 `Q/A` 区块增加一个小按钮：

- 未加入：`加入错题`
- 已加入：`已加入`
- 再点一次可取消，或首期只允许加入不取消

按钮保存的信息以题目为粒度，而不是整场报告为粒度。

### 2. 错题列表

导航栏增加“错题”入口。进入后展示所有已加入错题，推荐按最近加入时间倒序。

每张卡片展示：

- 面试岗位；
- 题号，例如 `Q3`；
- 问题摘要；
- 原回答摘要；
- 当前状态：`待复练` / `已复练`；
- 最近复练点评摘要，如果有。

### 3. 错题详情与上下文

点击某条错题后进入“错题详情页”。这个页面不是只展示单题，而是展示这场面试的所有问题与回答。

原因：

- 面试回答强依赖上下文；
- 用户需要知道前后问题是什么；
- 同一道题复练时可以更自然地回忆当时场景。

详情页中被加入错题的那一道需要高亮，并提供“重新练习这一题”按钮。

### 4. 同题复练与点评

点击“重新练习这一题”后，复用原问题作为 prompt：

```text
Please answer this interview question again:
<original question>
```

用户提交新回答后，Review 模块生成一次单题点评，重点比较：

- 是否更直接回答问题；
- 是否补充了结构、行动或结果；
- 英文表达是否更完整；
- 和原回答相比有没有改善。

首期可以先不做真实语音链路，使用文本提交也能完成闭环。

## 后端数据结构

建议新增 `SavedMistake`，表示用户手动加入的错题。

```go
type SavedMistake struct {
	ID                 string
	SessionID          string
	QuestionIndex      int
	TargetRole         string
	QuestionText       string
	OriginalAnswer     string
	SourceReviewID     string
	Status             string
	LatestRepracticeID string
	CreatedAt          time.Time
	UpdatedAt          time.Time
}
```

建议新增 `MistakeRepracticeResult`：

```go
type MistakeRepracticeResult struct {
	ID             string
	MistakeID      string
	SessionID      string
	QuestionIndex  int
	QuestionText   string
	OriginalAnswer string
	NewAnswer      string
	Feedback       FeedbackItem
	Summary        string
	CreatedAt      time.Time
}
```

建议状态枚举：

- `SavedMistake.Status`: `pending`、`practiced`、`dismissed`
- `MistakeRepracticeResult.Feedback.Type`: `improvement`、`still_weak`、`evidence_gap`

## 持久化位置

首期建议仍然沉淀在 Demo 的面试状态层，也就是 `.data/interview-state.json` 对应的 runtime state。

需要在 `assistant.MockDomainState` / `assistant.RuntimeSnapshot` 里增加：

```go
SavedMistakes      []SavedMistake
RepracticeResults []MistakeRepracticeResult
```

原因：

- 错题来自具体面试 session；
- 查询错题需要和 `InterviewSession` 的问题、回答关联；
- 这不是 Mem0 长期记忆，不应写入向量记忆；
- 当前 Demo 已经把面试历史保存在同一层。

## Review 工具设计

在 `backend/internal/review/` 增加以下 use case：

### `review.save_mistake`

入参：

```json
{
  "practice_session_id": "session-xxx",
  "question_index": 2
}
```

行为：

- 查找指定 `InterviewSession`；
- 读取 `Questions[question_index]` 和 `Answers[question_index]`；
- 如果同一 `session_id + question_index` 已存在，则返回已有记录，避免重复错题；
- 保存 `SavedMistake`；
- 返回可渲染卡片所需字段。

### `review.list_mistakes`

入参：

```json
{
  "limit": 3,
  "status": "pending"
}
```

行为：

- 按 `CreatedAt` 倒序返回最近错题；
- 支持状态筛选；
- 每条结果带 `session_id` 和 `question_index`，供前端跳转。

### `review.get_mistake_context`

入参：

```json
{
  "mistake_id": "mistake-xxx"
}
```

行为：

- 返回错题本身；
- 返回所属面试 session 的所有 `questions` 和 `answers`；
- 标记当前错题对应的 `question_index`。

### `review.submit_mistake_repractice`

入参：

```json
{
  "mistake_id": "mistake-xxx",
  "answer_text": "new answer..."
}
```

行为：

- 读取原题、原回答、新回答；
- 生成单题复练点评；
- 保存 `MistakeRepracticeResult`；
- 将 `SavedMistake.Status` 更新为 `practiced`；
- 返回点评摘要和卡片字段。

## Agent 可调用工具

需要让 Planner 能识别这些用户意图：

```text
帮我看看最近几道错题
我有哪些错题
最近待复练的题有哪些
查看面试历史
帮我查一下最近面试过哪些面试
```

建议新增 intent：

- `view_saved_mistakes` -> `review.list_mistakes`
- `view_mistake_context` -> `review.get_mistake_context`
- `submit_mistake_repractice` -> `review.submit_mistake_repractice`

同时保留：

- `view_practice_history` -> `review.list_history`

如果使用 `MockPlanner`，在 `backend/internal/assistant/mock.go` 增加关键词识别：

- 包含 `错题` / `mistake` / `复练` 时优先走 `review.list_mistakes`
- 包含 `历史` / `记录` / `最近面试` 时走 `review.list_history`

如果使用 DashScope Planner，还需要更新：

- `backend/internal/assistant/dashscope.go` 的 planner prompt；
- `validatePlan` 的 allowed tool；
- `expected` intent shape。

这一步属于“让 AI 真正能调用错题查询工具”的必要改动。如果仍按旧任务边界不改 `dashscope.go`，真实模型模式下可能无法规划新工具。

## 对话卡片消息设计

不要让大模型自己生成 Markdown 卡片。应该由后端根据工具结果追加结构化 `AssistantMessage`，前端按 `kind` 渲染。

当前已有：

```go
Kind: "interview_report"
Report: *InterviewReportCard
```

建议新增：

```go
type AssistantMessage struct {
	ID          string
	Role        string
	Content     string
	Kind        string
	Report      *InterviewReportCard
	History     *InterviewHistoryCardList
	Mistakes    *MistakeCardList
	Attachments []AttachmentReference
	CreatedAt   time.Time
}
```

### 面试历史卡片

```go
type InterviewHistoryCardList struct {
	Items []InterviewHistoryCard `json:"items"`
}

type InterviewHistoryCard struct {
	SessionID      string    `json:"sessionId"`
	TargetRole     string    `json:"targetRole"`
	Interviewer     string    `json:"interviewer"`
	CompletedTurns int       `json:"completedTurns"`
	MaxTurns       int       `json:"maxTurns"`
	Status         string    `json:"status"`
	StartedAt      time.Time `json:"startedAt"`
	EndedAt        *time.Time `json:"endedAt,omitempty"`
	Summary        string    `json:"summary"`
}
```

消息：

```go
Kind: "interview_history_cards"
Content: "最近的模拟面试"
History: &InterviewHistoryCardList{Items: ...}
```

前端点击卡片：

```html
data-real-action="report"
data-session-id="<sessionId>"
```

这样用户问“最近面试过哪些面试”时，聊天框里直接出现可点击卡片，而不是纯文本列表。

### 错题卡片

```go
type MistakeCardList struct {
	Items []MistakeCard `json:"items"`
}

type MistakeCard struct {
	MistakeID       string    `json:"mistakeId"`
	SessionID       string    `json:"sessionId"`
	QuestionIndex   int       `json:"questionIndex"`
	TargetRole      string    `json:"targetRole"`
	QuestionText    string    `json:"questionText"`
	OriginalAnswer  string    `json:"originalAnswer"`
	Status          string    `json:"status"`
	CreatedAt       time.Time `json:"createdAt"`
	LatestSummary   string    `json:"latestSummary,omitempty"`
}
```

消息：

```go
Kind: "mistake_cards"
Content: "最近的错题"
Mistakes: &MistakeCardList{Items: ...}
```

前端点击卡片：

```html
data-real-action="open-mistake"
data-mistake-id="<mistakeId>"
```

## AssistantService 追加卡片的策略

当前 `completeRun` 只对 `submit_interview_answer` / `end_interview` 生成 `interview_report` 卡片，其它 intent 会走 `composeResponse` 生成普通文本。

需要增加类似策略：

```text
run.Intent == "view_practice_history"
  -> 从 review.list_history 结果生成 interview_history_cards 消息

run.Intent == "view_saved_mistakes"
  -> 从 review.list_mistakes 结果生成 mistake_cards 消息
```

这样 `composeResponse` 仍可作为 fallback，但卡片类结果优先走结构化消息。

## 前端轻接入点

首期前端只需要改 `frontend/public/prototype/assets/agent-backend-bridge.js`：

### 1. 扩展 `messageHTML`

新增两个分支：

```js
if (message.kind === "interview_history_cards" && message.history) {
  return renderInterviewHistoryMessageCards(message.history.items);
}

if (message.kind === "mistake_cards" && message.mistakes) {
  return renderMistakeMessageCards(message.mistakes.items);
}
```

历史卡片复用现有 `history-card interview` 样式，点击走已有 `report/openInterviewHistory` 流程。

错题卡片可以先复用现有 `mistake-recent-row` 或简单新增 `real-mistake-card` 样式，点击后进入错题详情页。

### 2. 报告页每题加按钮

在 `realReportView()` 的 `questions.map(...)` 中为每个 `article` 加按钮：

```html
<button
  data-real-action="save-review-mistake"
  data-session-id="<session.id>"
  data-question-index="<index>"
>
  加入错题
</button>
```

点击后调用后端 `review.save_mistake` 对应的 API 或桥接 action。

### 3. 新增错题路由

建议最小新增：

- `mistakes`：错题列表；
- `mistake-detail`：展示原面试上下文；
- `mistake-practice`：单题复练；
- `mistake-complete`：复练点评。

如果当前原型已有 `mistakes` / `mistake-practice` / `mistake-complete` 模拟页面，可以优先把数据源从 mock local state 换成后端 `SavedMistake`。

### 4. 导航入口

Drawer 或底部入口增加“错题”按钮：

```html
data-real-action="open-mistakes"
```

行为：

- 拉取 `review.list_mistakes`；
- 渲染错题列表；
- 没有错题时展示空态。

## API 接入方式

项目目前前端主要通过 assistant runtime 和 snapshot 工作。首期有两种实现方式：

### 方案 A：工具驱动

前端点击“加入错题”时，发送一条内部 tool run 请求，让后端执行 `review.save_mistake`。

优点：

- 和 Agent 可调用工具统一；
- 工具调用会留下记录；
- 后续 AI/用户入口一致。

缺点：

- 前端点击一个按钮也要走 task/run 流程，交互可能稍重。

### 方案 B：专用 HTTP API

在 assistant HTTP 层或 review HTTP 层新增轻量接口：

```text
POST /v1/review/mistakes
GET  /v1/review/mistakes
GET  /v1/review/mistakes/{id}
POST /v1/review/mistakes/{id}/repractice
```

优点：

- 前端按钮实现直接；
- 页面加载更清楚；
- 不依赖用户发一条聊天消息。

缺点：

- 需要新增 HTTP handler；
- 当前任务原边界禁止改 `backend/cmd/server/main.go`，如果没有可扩展 router，会碰边界。

推荐首期采用方案 A。等前端正式化后，再评估是否补专用 HTTP。

## 和现有自动 MistakeItem 的关系

保留 `ReviewResult.Mistakes`，但不要把它等同于用户错题本。

建议命名区分：

- `MistakeItem`：系统从 Review 中分析出的薄弱点；
- `SavedMistake`：用户手动加入错题本的题目；
- `MistakeCard`：用于对话框和错题页展示的 read model。

未来可以在 Review 报告里同时展示：

- AI 建议复练点；
- 每道题的“加入错题”按钮。

用户点击后才进入 `SavedMistakes`。

## 验收标准

- 用户能在报告页把某道题加入错题；
- 同一场面试同一道题重复点击不会产生重复错题；
- 用户能从导航栏进入错题页，看到真实保存的错题；
- 点击错题能看到原面试所有题目和回答，当前错题高亮；
- 用户能对该题提交一次复练回答，并收到单题点评；
- 用户问“帮我看看最近几道错题”，Agent 调用 `review.list_mistakes`；
- 对话框中返回可点击错题卡片，点击进入对应错题详情；
- 用户问“帮我查一下最近面试过哪些面试”，对话框中返回可点击面试历史卡片；
- `go test ./...` 通过；
- 前端渲染测试覆盖新增 message kind，避免退化成纯文本。

## 建议 PR 拆分

### PR 1：后端错题模型与工具

- 新增 `SavedMistake` / `MistakeRepracticeResult`；
- 新增 `review.save_mistake`、`review.list_mistakes`、`review.get_mistake_context`、`review.submit_mistake_repractice`；
- Registry 输出结构化字段；
- 单元测试覆盖保存、去重、查询、复练点评。

### PR 2：Assistant 对话卡片

- 新增 `AssistantMessage` 的 history/mistake card payload；
- `view_practice_history` 返回 `interview_history_cards`；
- `view_saved_mistakes` 返回 `mistake_cards`；
- 更新 `MockPlanner`；
- 如启用 DashScope Planner，更新 planner prompt 和 validatePlan。

### PR 3：前端轻接入

- 报告页每题加“加入错题”按钮；
- 导航栏加错题入口；
- 对话框支持 `interview_history_cards` 和 `mistake_cards`；
- 错题详情页复用面试历史数据展示上下文；
- 单题复练页先支持文本提交。
