# SpeakUp Agent Demo 交接说明

## 项目定位

这是一个独立于 `XE3-ESL` 主仓的可运行 Agent 编排 Demo，用来验证英语面试陪练中的 Agent、模型调用、会话状态、简历上下文和语音能力。它沿用了主仓 Assistant/Conversation 的命名和边界，但没有修改或依赖主仓的运行时服务。

当前实现由两部分组成：

```text
浏览器
  -> Vinext 页面与产品原型 iframe
  -> agent-backend-bridge.js
  -> Go REST / SSE / WebSocket API
  -> AssistantService
  -> ToolRegistry adapter
  -> Preparation / Practice / Conversation / Review public services
  -> DashScopeProvider + FileConversationStore
```

## 当前已完成能力

- 自由对话：真实 Qwen 生成回复，支持流式显示与自动/手动朗读。
- 模拟面试：Planner 识别意图，读取背景后进入确认，确认后创建会话并生成第一题。
- 面试追问：每轮基于目标岗位、既往题目、有效回答和候选人档案生成下一题；达到轮次或时间限制后生成反馈。
- 面试控制：支持确认、拒绝、提前结束、自动结束、历史查看和历史删除。
- 附件：支持 PNG、JPEG、WebP、PDF；图片由多模态模型理解，PDF 使用 DashScope Files API 的 `file-extract` 流程。
- 简历：PDF 上传、真实性识别、结构化档案解析、重命名、启用、删除及档案编辑；最多保留 3 份。
- 语音：浏览器录音转换为 16 kHz 单声道 WAV，后端调用实时 ASR；回复使用 TTS WebSocket 生成 MP3 并播放。
- 会话和面试记录：当前会话、归档会话、任务、计划、确认、工具调用、面试状态和附件元数据均可恢复。
- 用户上下文：统一装配已确认档案、当前 Scenario、近期学习记录和 Mem0 召回；单个来源失败不会阻塞对话。
- UI：保留产品原型交互，并由桥接层替换为真实 API 数据；桌面显示常驻侧边栏，手机画布保留左上菜单抽屉和右上新建会话按钮。

## 技术组成

| 层 | 技术 | 主要位置 |
| --- | --- | --- |
| 前端宿主 | React 19、Next 16、Vinext、Vite | `frontend/app/` |
| 产品界面 | 静态 HTML 原型、CSS、原型脚本 | `frontend/public/prototype/` |
| 真实前端桥接 | Fetch、ReadableStream、MediaRecorder、WebSocket | `frontend/public/prototype/assets/agent-backend-bridge.js` |
| 后端 | Go 1.23、标准 `net/http`、Gorilla WebSocket | `backend/` |
| 模型 | DashScope / Qwen | `backend/internal/assistant/dashscope.go` |
| 长期记忆 | Mem0 OSS Node sidecar | `backend/memory/` |
| 用户上下文装配 | Go 中立 Reader/Aggregator | `backend/internal/usercontext/` |
| 本地持久化 | 原子 JSON 文件写入 | `backend/internal/assistant/persistence.go` |

## 后端结构与职责

`backend/internal/assistant/` 是后端核心。

- `model.go`：线程、任务、确认、计划、工具调用、附件、简历和面试会话模型。
- `ports.go`：Planner、ToolRegistry、ConversationStore、内容生成、ASR、TTS，以及 Demo 运行时读取/附件/重置 Port。
- `service.go`：`StartTask`、`ResumeTask`、`EndInterview`、`GetThread`；只依赖上述 Port，包含幂等键、确认状态机、上下文控制和工具执行顺序。
- `dashscope.go`：Qwen Planner/聊天/问题/反馈/附件分析、Files API、ASR 和 TTS 的具体实现。
- `mock.go`：包含 Demo Planner 和 `DemoState` 本地状态/持久化适配器；`DemoState` 不识别工具名，也不实现 `ToolRegistry`，仅通过原子 `Transact` 边界为四个模块保存状态。
- `store.go`、`persistence.go`：内存模型加文件加载/原子落盘。
- `http.go`：HTTP 路由、SSE 流和 CORS。

四个业务模块与组合根位于：

- `backend/internal/preparation/`：`ScenarioReader` 和 `ManagementService`，负责候选人背景快照以及 HTTP 层的档案、附件和简历管理入口。
- `backend/internal/preparation/scenario*.go`：Scenario 聚合、事实来源优先级、乐观锁、应用服务和独立文件 Repository；场景按用户隔离，并持久化当前 Thread 的场景关联和创建请求幂等记录。
- `backend/internal/preparation/context_sources.go`：把已确认档案、当前 Scenario 和面试历史适配到统一用户上下文 Port。
- `backend/internal/usercontext/`：只读聚合边界，不依赖 Assistant、Preparation 或 Mem0 的具体模型；统一返回 `Profile`、`Scenario`、`Memories` 和 `LearningSignals`。
- `backend/internal/platform/memory/mem0/context_source.go`：把 Mem0 检索结果适配到统一用户上下文 Port。
- `backend/internal/assistant/context/`：把统一快照转换为模型 `system` 消息，并负责去重、字段限长、历史压缩和 token 兜底。
- `backend/internal/practice/`：`PlanService`、`SessionService`、`ApplyTurnOutcome`，负责练习计划、Session 和 Turn Outcome。
- `backend/internal/conversation/`：`QuestionService`、`ReplyService`、`TurnService`，负责提问、自由回复和 Turn 提交。
- `backend/internal/review/`：`AnalyzeUseCase`、`HistoryQueryUseCase`，负责反馈分析与练习历史投影。
- `backend/internal/demomodules/registry.go`：唯一的 ToolRegistry 适配器，按工具前缀路由至四个模块。

启动组合位于 `backend/cmd/server/main.go`：`DemoState` 注入四个模块，`AssistantService` 只持有 `ToolRegistry` 与窄读取 Port；HTTP 管理接口通过 `preparation.ManagementService` 访问 Preparation 管理入口。
原先集中在旧 Registry 的工具业务 `switch` 已删除；Assistant 工具参数/结果映射只在 Registry 适配器中完成，模块公开接口不依赖 `ToolInvocation` 或 `ToolResult`。

## 与 XE3-ESL 主仓契约的校对结果

当前主仓分支和已读取的 PR 契约表明：

- Conversation 的正式边界还包括 `PracticeSessionReader`、`TurnOutcomeApplier`、Question/Turn/Audio/Processing Repository，以及 `ConversationService` 的 Query/Command 方法；Demo 目前只实现了文本面试链路所需的 Question/Reply/Turn 子集。
- Practice 的正式骨架包括具名 `CreatePracticePlanCommand`、`CreatePracticeSessionCommand`、`ApplyTurnOutcomeCommand`、`PracticeSessionSnapshot` 和 `PreparationReader`；Demo 已实现计划、场次和推进 Port，但仍使用 Demo 聚合状态，未实现完整快照/Repository 契约。
- Preparation 的正式骨架拥有 Scenario、Role、Resume、Background 四类实体/快照和对应 Repository；Demo 的简历/附件 HTTP 管理仍由 `DemoState` 提供，尚未迁移为独立 Repository 适配器。
- Review 的正式骨架包括 `AnalyzeTurn`、`RetryRequest`、`HistoryRecord`、`TurnReviewSourceReader` 及对应 Repository；Demo 当前实现的是反馈生成和历史投影的最小可运行子集。

因此，Demo 已与主仓的依赖方向和核心 Port 风格一致，但不是主仓完整领域契约的逐字段实现；以上未实现部分是明确的范围差异。

## Agent 状态流

### 自由对话

```text
StartTask
  -> Planner.Plan (free_conversation)
  -> conversation.generate_reply
  -> AppendMessage
  -> TaskRun completed
```

当 UI 明确以 `interaction_mode=conversation` 提交消息时，活跃面试不会把该消息当作回答计入 Turn。

### 模拟面试

```text
StartTask
  -> Planner.Plan (start_mock_interview)
  -> preparation.get_confirmed_context
  -> awaiting_confirmation
  -> ResumeTask
  -> practice.create_plan
  -> practice.start_session
  -> conversation.generate_next_question
```

面试回答按下列顺序处理：

```text
conversation.submit_turn
  -> practice.apply_turn_outcome
  -> conversation.generate_next_question | review.generate_feedback
```

`TaskRun`、`Plan`、`ConfirmationRequest`、`ToolCall` 和用户/助手消息都会持久化。`StartTask` 要求 Idempotency Key，重复提交同一 Actor 与 Key 会返回原任务。

## 上下文与数据边界

- 上下文上限是 10,000 token，使用中英文混合的确定性保守估算；超过上限会拒绝本次任务，不调用模型。
- 附件会作为 `attachment_ids` 进入当前任务上下文；历史会话不注入当前会话。
- 每次构建上下文时按“已确认 `CandidateProfile` -> 当前 Thread 的 `Scenario` -> 最近学习记录 -> Mem0 召回”装配只读参考信息；Mem0 和学习记录各最多 3 条。
- Profile、Scenario、Mem0 或历史读取失败都会降级为空，不阻塞当前对话；未确认档案不会注入。
- 冲突处理以当前用户消息为最高依据；Scenario 内部结构化事实按 `user_correction > user_statement > official_document > uploaded_material > long_term_memory > model_inference` 合并。
- 达到预算阈值后先压缩或删除旧对话，尽量保留档案、当前 Scenario、学习记录、Mem0 和最新消息；最终兜底始终优先保住当前用户消息。
- 默认数据目录是项目根 `.data/`，可通过 `AGENT_DATA_DIR` 覆盖。
- `conversation.json` 保存对话、任务、计划、确认与消息；`interview-state.json` 保存面试、附件、简历与档案状态。
- `scenarios.json` 独立保存跨天 Scenario、来源 Thread、材料关联、带来源的结构化事实、创建请求幂等记录和当前场景关联。
- JSON 落盘使用临时文件加重命名，目录权限为 `0700`、文件权限为 `0600`。
- HTTP 服务是本地 Demo 形态：固定 Actor `demo-user`，没有登录、鉴权或多进程协调。

## 模型与环境变量

配置模板在 `.env.example`，运行时使用不入库的 `.env.local`。

| 变量 | 作用 | 默认值 |
| --- | --- | --- |
| `DASHSCOPE_API_KEY` | 必填，北京地域 DashScope Key | 无 |
| `DASHSCOPE_WORKSPACE_ID` | 可选，北京 Workspace 专属域名 | 空 |
| `DASHSCOPE_CHAT_MODEL` | Planner、聊天、问题、反馈、图片理解 | `qwen3.5-flash` |
| `DASHSCOPE_DOCUMENT_MODEL` | PDF 文件理解 | `qwen-long` |
| `DASHSCOPE_ASR_MODEL` | 实时语音识别 | `qwen3-asr-flash-realtime` |
| `DASHSCOPE_TTS_MODEL` | 文本转语音 | `qwen-audio-3.0-tts-flash` |
| `DASHSCOPE_TTS_VOICE` | TTS 发音人 | `longanlingxi` |
| `AGENT_DATA_DIR` | 本地数据位置 | 项目根 `.data` |
| `AGENT_DEMO_ADDR` | Go 服务监听地址 | `:8080` |

默认使用北京地域的 DashScope HTTP 和 WebSocket 地址；填写 `DASHSCOPE_WORKSPACE_ID` 后改用 Workspace 专属域名。

## 主要 HTTP 接口

| 领域 | 接口 |
| --- | --- |
| 健康检查 | `GET /health` |
| 线程与任务 | `GET /v1/assistant/threads/{thread_id}`、`POST /tasks`、`POST /tasks/stream`、`POST /task-runs/{task_run_id}/resume`、`POST /reject` |
| 面试 | `POST /threads/{thread_id}/interview/end/stream`、`GET /v1/practice/sessions`、`GET/DELETE /v1/practice/sessions/{session_id}` |
| 会话归档 | `GET /v1/assistant/conversations`、`GET/DELETE /v1/assistant/conversations/{conversation_id}` |
| 附件 | `POST /v1/assistant/attachments`、`GET /content`、`DELETE` |
| 简历 | `GET/POST /v1/preparation/resumes`、详情、原 PDF、重命名、档案更新、启用、删除 |
| Scenario | `POST/GET /v1/scenarios`、`GET/PATCH/DELETE /v1/scenarios/{scenario_id}`、`GET /v1/scenarios/current`、`PUT /v1/assistant/threads/{thread_id}/scenario` |
| 语音 | `POST /v1/audio/transcriptions`、`GET /v1/audio/transcriptions/stream`、`POST /v1/audio/speech` |

Assistant 路由位于 `backend/internal/assistant/http.go`；Scenario 路由位于
`backend/internal/preparation/scenario_http.go`，均由 `backend/cmd/server/main.go`
注册。创建 Scenario 要求 `Idempotency-Key`；更新要求 `action` 和
`expected_version`，删除请求体同样要求 `expected_version`。删除会原子清理幂等映射
和所有 Thread 当前关联；乐观锁或同权威事实冲突返回 `409`。

## 前端实现要点

- `frontend/app/page.tsx` 只负责承载原型 iframe。
- `frontend/public/prototype/pages/prototype.html` 组合原型脚本、样式、桌面侧边栏和手机画布。
- `agent-backend-bridge.js` 覆盖原型的 `views` 和 `bottomNav`，将原型的模拟行为连接到 Go API。
- `panel-extension.js` 提供原型的菜单抽屉和页面路由；`SPEAKUP_REAL_AGENT_BRIDGE` 标记确保真实 Agent 在 `ready/thinking/listening/speaking` 状态仍显示左上菜单与右上新建按钮。
- `agent-backend-bridge.css` 将真实对话线程放在顶部导航下方，避免内容与菜单/新建按钮重叠。

## 本地运行与验证

环境要求：Node.js `>=22.13.0`、Go `>=1.22`。

```bash
npm install
npm run backend
npm run dev
```

前端默认地址为 `http://localhost:3000`，后端默认地址为 `http://localhost:8080`。

```bash
npm run test:all
```

该命令会执行 Go 测试、前端生产构建和渲染/桥接/契约测试。当前交接版本已通过全部测试。

## 打包说明

交接 ZIP 包含源码、`package-lock.json`、`go.sum`、`.env.example`、测试和本文件；不包含：

- `.env.local` 与任何密钥；
- 项目根 `.data/` 中的对话、简历、附件和本地状态；
- `node_modules/`、`dist/`、`build/`、`.vinext/`、`.wrangler/` 等可再生目录；
- `.git/` 和 `.DS_Store`。
