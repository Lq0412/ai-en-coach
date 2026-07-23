# 评分、反馈、错题与复练开发方案

## 背景

任务 2 负责用户完成一轮模拟面试或专项练习后的学习闭环，目标是把“练完之后的一段评价”升级为可沉淀、可复练、可追踪的结构化结果。

首期需要覆盖：

- 对回答进行结构、内容完整度、英文表达和场景匹配度评分；
- 生成带原回答证据的结构化反馈，避免泛泛评价；
- 从回答中提取错题、薄弱点和代表句；
- 根据错题和薄弱点生成下一次专项复练目标；
- 保存每次练习结果，并避免重复生成报告或错题；
- 练习结束后让现有主链路继续读取最新反馈。

当前实现位于 `backend/internal/review/module.go`，只返回一个字符串版 `Feedback.Summary`。真实模型反馈由 `assistant.InterviewContentGenerator.GenerateFeedback` 提供，具体 DashScope Prompt 目前写在 `backend/internal/assistant/dashscope.go`。

根据任务边界，本任务不修改 `backend/internal/assistant/dashscope.go`。结构化评分、错题和复练目标应由 `backend/internal/review/` 负责。

首期只做“面试场景完成后生成一份报告，并发送到 SpeakUp 主对话界面”。暂不做逐句点评、逐句 Review 或每句话对应一个反馈项。

## 修改范围

优先修改：

- `backend/internal/review/`
- `backend/internal/demomodules/registry.go`
- `backend/internal/demomodules/*test.go`

必要时可修改：

- `backend/internal/practice/`
- `backend/internal/assistant/service.go`
- `backend/internal/assistant/service_test.go`

禁止修改：

- `backend/internal/preparation/`
- `backend/internal/platform/memory/`
- `backend/internal/assistant/context/`
- `backend/internal/assistant/dashscope.go`
- `backend/internal/assistant/http.go`
- `backend/cmd/server/main.go`
- `frontend/`

## 核心设计

保留 `dashscope.go` 作为“自然语言反馈 summary”的来源，不把结构化评分逻辑放进去。

建议职责划分：

- `assistant.GenerateFeedback`：只提供一段中文总结，可用则调用，不可用则走本地兜底总结；
- `review.Analyze`：负责结构化评分、反馈证据、错题、薄弱点、复练目标；
- `demomodules.Registry`：负责把 Review 模块的领域对象映射成工具输出；
- 现有报告卡：继续读取 `summary` 字段，保证前端不需要改。

这样做的好处是：既满足“评分 Prompt/逻辑由本任务维护”，又不违反禁止修改 `dashscope.go` 的边界。

## 当前记忆架构理解

当前 Demo 里可以把“记忆/状态”分成几层，不是只有一种记忆。

### 1. 当前会话记忆：Thread、Messages、ContextSummary

位置：

- `backend/internal/assistant/store.go`
- `backend/internal/assistant/persistence.go`

这层保存当前主对话线程：

- `AssistantThread`
- `AssistantMessage`
- `TaskRun`
- `Plan`
- `ToolCall`
- `ConfirmationRequest`
- `ContextSummary`

它持久化到 `.data/conversation.json`。

作用：

- 支撑当前主对话界面展示；
- 让 Planner 知道当前处于自由对话、面试需求收集、面试进行中还是已完成；
- 保存任务执行链路和工具调用结果；
- 新建会话时把当前消息归档到历史会话。

这层更像“当前线程上下文 + 可查看历史”，不是全局长期记忆。

### 2. 面试练习状态：PracticeSession、Questions、Answers、Feedback

位置：

- `backend/internal/assistant/mock.go`
- `backend/internal/assistant/model.go`
- `backend/internal/review/module.go`

这层保存面试过程和面试结果：

- 当前 PracticeSession ID；
- 已问问题；
- 用户回答；
- 已完成轮数；
- 练习报告 summary；
- 历史 InterviewSession。

它持久化到 `.data/interview-state.json`。

作用：

- 支撑面试继续追问；
- 支撑历史报告查看；
- 支撑 Review 从已保存的题目和回答中生成报告。

ReviewResult、MistakeItem、RepracticeTarget 首期应该优先沉淀在这一层或 Review 自己的结果结构里。

### 3. 长期全局记忆：Mem0

位置：

- `backend/internal/platform/memory/mem0/`
- `backend/memory/`

Mem0 是跨会话的长期用户记忆，数据在 `.data/mem0/` 下的 SQLite/vector/history 存储中。

当前写入链路大致是：

```text
AssistantService.completeRun
  -> observeMemory
  -> MemoryObserver.Observe
  -> mem0.Client.Observe
  -> Mem0 sidecar
```

当前读取链路大致是：

```text
AssistantService.startTask
  -> ContextBuilder.Build
  -> mem0 recall
  -> 把召回记忆作为上下文交给模型
```

所以 Mem0 更像“跨会话、跨任务的长期全局用户记忆”，比如用户稳定偏好、长期薄弱点、背景事实等。

### Review、历史查询和长期记忆的关系

用户问“我前几天模拟过哪几场面试”“上次技术面试练得怎么样”，本质上不是长期记忆召回，而是结构化练习历史查询。

这类需求优先走 Review 查询工具：

```text
用户在新会话提问历史练习
  -> Planner 识别 view_practice_history 或 review_latest_practice
  -> 调用 review.list_history 或 review.generate_feedback
  -> 从已保存 InterviewSession / ReviewResult 读取记录
  -> 在 SpeakUp 主对话界面回复用户
```

当前项目已经有 `review.list_history` 工具雏形，后续应增强它，让它能跨新会话查询已保存的面试记录，而不是依赖 Mem0 猜测用户练过什么。

Review 结果仍然可以在未来成为长期记忆的候选来源，例如：

- 用户多次在技术面试回答中缺少量化结果；
- 用户确认“我想长期记住这个薄弱点”；
- 多次 Review 都发现同类英文表达问题。

但“列出前几天模拟过哪几场面试”不需要做成长期记忆。原因是：

- 练习历史已经是结构化数据，有 session ID、时间、岗位、轮数和反馈；
- 查询工具能返回完整、可验证的记录，比向量召回更稳定；
- Mem0 适合保存稳定偏好、长期薄弱点、用户背景事实，不适合替代业务表查询。

因此首期原则调整为：

> Review 报告和练习历史由 Review/PracticeSession 保存，并通过 `review.list_history` 查询；Review 模块不直接写 Mem0。只有稳定薄弱点、用户确认事项或多次证据支持的问题，才作为后续长期记忆升级候选。

## 建议数据结构

可以在 `backend/internal/review/module.go` 中新增这些类型；如果文件变大，也可以拆到 `model.go`、`analysis.go`、`repractice.go` 等文件，仍然放在 `backend/internal/review/` 目录下。

```go
type ReviewResult struct {
	ID                string
	SessionID         string
	TargetRole        string
	ScenarioType      string
	CompletedTurns    int
	MaxTurns          int
	EvidenceStatus    string
	RubricID          string
	Scores            ScoreBreakdown
	FeedbackItems     []FeedbackItem
	Mistakes          []MistakeItem
	RepracticeTargets []RepracticeTarget
	Summary           string
	CreatedAt         time.Time
}

type ScoreBreakdown struct {
	Structure     int
	Content       int
	English       int
	ScenarioMatch int
	Overall       int
}

type FeedbackItem struct {
	Type       string
	Message    string
	Evidence   string
	Suggestion string
}

type MistakeItem struct {
	ID               string
	Type             string
	OriginalText     string
	Issue            string
	Suggestion       string
	RepracticeStatus string
}

type RepracticeTarget struct {
	ID               string
	Focus            string
	Reason           string
	Prompt           string
	SourceMistakeIDs []string
	Status           string
}
```

建议枚举值：

- `EvidenceStatus`：`sufficient`、`insufficient`
- `FeedbackItem.Type`：`strength`、`improvement`、`evidence_gap`
- `MistakeItem.Type`：`structure`、`content`、`english_expression`、`scenario_match`、`evidence_gap`
- `RepracticeStatus`：`pending`、`practiced`、`dismissed`
- `RepracticeTarget.Status`：`ready`、`blocked_insufficient_evidence`、`completed`

为了兼容现有调用方，保留原来的 `Feedback` 字段，并增加结构化结果：

```go
type Feedback struct {
	ID             string
	SessionID      string
	TargetRole     string
	CompletedTurns int
	MaxTurns       int
	Summary        string
	Result         ReviewResult
}
```

历史查询可以在现有 `HistoryItem` 基础上增强。首期至少让 `review.list_history` 能回答“我前几天模拟过哪几场面试”：

```go
type HistoryItem struct {
	PracticeSessionID string
	Scenario          string
	CompletedTurns    int
	Status            string
	StartedAt         time.Time
	EndedAt           *time.Time
	Feedback          string
	ReviewID          string
	RepracticeFocus   string
}
```

如果暂时不改持久化结构，也可以先从已有 `assistant.InterviewSession` 投影出这些字段。

## 实现步骤

### 1. 从已保存状态构造复盘输入

`review.Analyze` 只读取当前 Demo 状态中的练习数据：

- `state.CurrentSessionID`
- `state.TargetRole`
- `state.CompletedQuestionCount`
- `state.MaxTurns`
- `state.Questions`
- `answers`
- `state.CandidateProfile`
- `state.Sessions`

Review 模块首期不要直接读写 Mem0。Review 报告、错题和复练目标优先保存为 Review/PracticeSession 结果，并通过 `review.list_history` 查询。

如果未来要把某些 Review 结论升级为长期记忆，建议交给任务 3 处理，例如用户明确确认，或多次 Review 发现同类稳定问题。

### 2. 独立维护评分规则和评分 Prompt

不同练习场景的评分标准不同，例如技术岗面试、雅思口语、商务沟通、日常口语都不能共用一套 Rubric。

建议在 Review 模块内单独建立规则目录：

```text
backend/internal/review/rubrics/
  interview_technical.md
  ielts_speaking.md
  business_communication.md
```

首期只落地 `interview_technical.md`，也就是技术岗面试报告规则。其他文件可以暂不创建，先在文档里保留扩展方向。

如果首期不改大模型 Prompt，可以先把 `interview_technical.md` 当作评分规则文档，由 `review` 模块按规则做确定性结构化分析。后续如果边界允许模型结构化评分，再把同目录内容作为 Review 专属 Prompt/Rubric 输入，而不是去改 `assistant/dashscope.go` 的通用反馈 Prompt。

技术岗面试首期评分维度：

- 结构评分：检查是否有背景、行动、结果、复盘或 STAR 类表达；
- 内容完整度：检查是否有具体任务、技术选择、指标、结果、取舍；
- 英文表达：检查回答长度、是否主要为英文、是否存在明显空泛表达；
- 场景匹配度：检查回答是否回应当前问题、目标岗位或候选人上下文。

评分建议保守一些。证据不足时要明确标记 `EvidenceStatus=insufficient`，不要强行给出专业判断。

### 3. 生成面试报告级反馈，不做逐句点评

首期反馈粒度是“一场面试一份报告”，不是“每一句话一个点评”。

报告至少包含：

- 总体评分；
- 关键亮点；
- 主要问题；
- 原回答证据；
- 下一次复练建议。

`FeedbackItem` 不要求覆盖每一句回答，只需要覆盖最关键的 1 到 3 个问题或亮点。

每条 `FeedbackItem` 建议包含：

- 反馈类型；
- 反馈说明；
- 原回答证据；
- 可执行的改进建议。

例如用户回答太短时，可以把原回答片段作为 `Evidence`，说明“回答缺少行动和结果”，并建议补充 “I did X, which led to Y” 类型表达。

最终报告要通过现有主链路发送到 SpeakUp 主对话界面。当前 `AssistantService` 会在 `review.generate_feedback` 返回 `summary` 和 `practice_session_id` 后生成 `interview_report` 消息，所以首期必须继续返回 `summary`。

### 4. 提取本场面试的错题和薄弱点

每个 `MistakeItem` 至少包含：

- `Type`：问题类型；
- `OriginalText`：原句或代表片段；
- `Issue`：问题说明；
- `Suggestion`：修改建议；
- `RepracticeStatus`：首期默认为 `pending`。

第一版不需要做复杂语法纠错，也不需要逐句点评。可以先围绕结构、内容、英文表达和场景匹配度提取本场面试中 1 到 3 个最重要的问题。

### 5. 生成复练目标

从最重要的错题生成 `RepracticeTarget`：

- `Focus`：本次复练聚焦点；
- `Reason`：为什么要练这个；
- `Prompt`：下一次可直接执行的练习题；
- `SourceMistakeIDs`：关联错题；
- `Status`：证据足够时为 `ready`。

如果没有足够证据，生成一个 `blocked_insufficient_evidence` 的复练目标，提示用户至少完成一个完整英文回答后再复盘。

### 6. 保持 summary 兼容

继续保留现有 `summary` 字段，因为前端报告卡当前依赖它。

处理建议：

- 如果 `s.generator != nil`，继续调用 `GenerateFeedback` 生成自然语言总结；
- 如果模型不可用或返回空内容，用结构化结果生成兜底 summary；
- 不要让 summary 的失败影响已经算出的结构化 Review，除非当前项目约定必须返回模型错误。

### 7. 避免重复报告

同一个练习重复结束或重复调用 `review.generate_feedback` 时，不能重复追加 session。

实现方式：

- 先检查 `state.Sessions` 中是否已有 `state.CurrentSessionID`；
- 如果已有，只更新该 session 的 `Feedback`，不 append；
- 如果没有，再追加一条 completed session；
- `ReviewResult.ID` 可以稳定使用 `review-` + `sessionID`，方便幂等。

### 8. 在 Registry 中暴露结构化结果

修改 `backend/internal/demomodules/registry.go` 的 `review.generate_feedback` 分支。

保留原有字段：

- `feedback_id`
- `practice_session_id`
- `target_role`
- `completed_turns`
- `max_turns`
- `summary`

新增结构化字段：

- `review_result`
- `mistakes`
- `repractice_targets`

这样 Planner 和 Assistant 主链路仍然拿到 summary，后续如果前端要展示错题和复练，也已经有数据。

### 9. 增强历史查询工具

当前 `demomodules.Registry` 已经支持 `review.list_history`，Planner 规则里也有：

```text
View history: Intent view_practice_history, one review.list_history step.
```

本任务需要把这个工具作为“跨新会话查询练习历史”的主要入口。

用户在新会话里问：

- “我前几天模拟过哪几场面试？”
- “最近练过哪些岗位？”
- “上次面试表现怎么样？”

Planner 应该调用 `review.list_history`，由 Review 模块从历史 `InterviewSession` 中返回结构化列表。主对话界面再根据工具结果生成自然语言回复。

首期 `review.list_history` 建议返回：

- 面试 session ID；
- 目标岗位或场景；
- 开始时间；
- 结束时间；
- 完成轮数；
- 是否有报告；
- 报告摘要；
- 下一次复练方向。

如果用户问的是“帮我 review 最近一次面试”，再调用 `review.generate_feedback` 或读取最新已有 ReviewResult。

## 测试计划

建议新增 `backend/internal/review` 单元测试：

- 完成一次练习后能生成 `ReviewResult` 和评分；
- 至少一条反馈包含原回答证据；
- 错题包含类型、原句、问题说明、改进建议和 `pending` 状态；
- 没有回答时返回 `EvidenceStatus=insufficient`，不编造细节；
- 同一个 session 重复 `Analyze` 不会追加重复 session；
- 可以根据错题生成下一次复练目标。
- 新会话中可以通过 `review.list_history` 查询历史面试记录。
- Review 不直接写 Mem0。
- 技术岗面试使用 `interview_technical` Rubric。

建议新增或扩展 `backend/internal/demomodules` 测试：

- `review.generate_feedback` 输出兼容旧字段；
- `review.generate_feedback` 输出新增结构化字段；
- `review.list_history` 输出历史面试列表和报告摘要；
- 工具输出不暴露内部 Prompt。

可选扩展 `backend/internal/assistant/service_test.go`：

- 用户说“帮我 review 刚刚的面试”时，最终能执行 `review.generate_feedback`；
- 用户说“我前几天模拟过哪几场面试”时，最终能执行 `review.list_history`；
- 练习结束后仍能生成现有 `interview_report` 消息。
- 复盘报告出现在 SpeakUp 主对话界面，而不是只存在内部工具结果中。

验证命令：

```bash
cd backend
go test ./...
```

## 验收清单

- [ ] 一次完成的练习能产生结构化评分；
- [ ] 至少一条反馈带原回答证据；
- [ ] 错题有类型、原句、问题说明、改进建议和复练状态；
- [ ] 同一练习重复结束不会产生重复报告或重复错题；
- [ ] 证据不足时明确标注 `insufficient`，不编造专业结论；
- [ ] 可以从错题和薄弱点生成下一次可执行的复练目标；
- [ ] 新会话中可以通过 `review.list_history` 查询历史面试记录；
- [ ] Review 模块不直接写 Mem0；
- [ ] 技术岗面试评分规则由 Review 模块内的独立 Rubric 维护；
- [ ] 首期只输出整场面试报告，不做逐句点评；
- [ ] 现有报告卡仍然能通过 `summary` 正常展示；
- [ ] `go test ./...` 通过；
- [ ] PR 不包含 Prompt、Scenario、Memory、前端或 `main.go` 的无关修改。

## 需要和组里确认的点

如果后续希望让大模型直接返回结构化 JSON Review，需要先调整任务边界。那通常会涉及：

- `assistant.InterviewContentGenerator`
- `assistant.InterviewFeedbackInput`
- `backend/internal/assistant/dashscope.go`
- DashScope JSON 契约相关测试

在边界没有调整前，本任务不要改 `dashscope.go`。先把结构化复盘能力放在 `backend/internal/review/` 内部完成，把 DashScope 反馈当成 summary 来源即可。
