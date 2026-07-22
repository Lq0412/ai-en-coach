# SpeakUp Agent Lab

这是一个独立于 `XE3-ESL` 仓库的 Agent 编排 Demo。Agent、真实 Qwen
Planner、ASR 和 TTS 完整运行在 Go 后端。前端直接采用
`SpeakUp-产品原型-2026-07-17`，保留原型导航、面试创建、练习、历史和报告
交互，并通过桥接脚本调用 Go REST API。

## 项目结构

```text
agent-demo/
├── frontend/                 # 浏览器端应用
│   ├── app/                  # React/Vinext 宿主
│   ├── public/prototype/     # SpeakUp 静态原型与 API 桥接
│   ├── tests/                # 前端构建、渲染和契约测试
│   └── package.json          # 仅包含前端依赖
├── backend/                  # 服务端应用
│   ├── cmd/server/           # Go API 组合根
│   ├── internal/             # Assistant 与业务模块
│   ├── memory/               # 官方 Mem0 OSS sidecar 及测试
│   ├── scripts/              # 后端启动与稳定性测试
│   ├── go.mod
│   └── package.json          # 仅包含 Mem0 Node 依赖
├── .data/                    # 共享运行数据，不提交 Git
├── docs/                     # 交接与设计文档
└── package.json              # npm workspaces 与统一命令入口
```

前后端是两个独立 workspace。日常仍从项目根目录运行命令；需要单独操作时可用
`npm run <command> --workspace frontend` 或 `--workspace backend`。

## 架构

```text
Browser UI
  -> SpeakUp 产品原型
  -> Agent backend bridge
  -> REST
Go AssistantService
  -> DashScopeProvider (qwen3.5-flash)
  -> Mem0 OSS v3 sidecar (mem0ai 3.1.0)
     -> ADD-only extraction + semantic/BM25/entity retrieval
     -> DashScope qwen3.5-flash + text-embedding-v4
     -> local SQLite vector/history stores
  -> AttachmentAnalyzer (image: qwen3.5-flash / PDF: qwen-long file-extract)
  -> ToolRegistry
  -> File-backed ConversationStore
  -> free_conversation / conversation.generate_reply
  -> preparation / practice / conversation / review tools
  -> qwen3-asr-flash-realtime / qwen-audio-3.0-tts-flash
```

Go 后端复用 XE3-ESL assistant scaffold 的命名：

- 模型：`AssistantThread`、`TaskRun`、`ToolCall`、
  `ConfirmationRequest`、`Plan`、`PlanStep`、`ToolResult`
- 服务：`AssistantService.StartTask`、`ResumeTask`、`EndInterview`、`GetThread`
- 端口：`Planner`、`ToolRegistry`、`ConversationStore`
- 命令：`StartTaskCommand`、`ResumeTaskCommand`、`EndInterviewCommand`、
  `GetThreadQuery`

`ConversationStore` 额外增加了 `GetTaskRun`、`SavePlan`、`GetPlan` 和
`AppendMessage`。默认实现会把对话、任务、计划、工具调用和确认状态原子写入
`.data/conversation.json`；面试状态写入 `.data/interview-state.json`；Mem0
向量和历史分别写入 `.data/mem0/vectors.db` 与 `.data/mem0/history.db`。

## 配置

不要把 Key 写进前端或提交到仓库。Demo 根目录已经提供不会被 Git 提交的
`.env.local`：

```bash
export DASHSCOPE_API_KEY="替换成真实 Key"
export DASHSCOPE_WORKSPACE_ID="替换成北京 Workspace ID"
```

`npm run backend` 会自动加载该文件。Key 必须是华北 2（北京）地域的 Key。
`DASHSCOPE_WORKSPACE_ID` 可留空；填写后会自动使用北京地域的 Workspace
专属域名。可选环境变量见 `.env.example`。留空时默认地址为：

```text
https://dashscope.aliyuncs.com/compatible-mode/v1
wss://dashscope.aliyuncs.com/api-ws/v1/realtime
wss://dashscope.aliyuncs.com/api-ws/v1/inference
```

持久化目录可通过 `AGENT_DATA_DIR` 和 `MEM0_DATA_DIR` 修改。`npm run backend`
会把默认目录固定到项目根 `.data`，避免从不同工作目录启动时产生两套数据库。

## 启动

终端 1：

```bash
npm run backend
```

该命令先启动仅监听 `127.0.0.1:8766` 的 Mem0 OSS sidecar，再启动
`http://localhost:8080` 的 Go API，并在退出时一起关闭。缺少 Key 时会拒绝启动。

终端 2：

```bash
npm install
npm run dev
```

前端默认请求 `http://localhost:8080`。如需修改：

```bash
NEXT_PUBLIC_AGENT_API_URL=http://localhost:8080 npm run dev
```

## 已覆盖流程

1. 主界面默认是自由对话；普通消息规划为 `free_conversation`，通过
   `conversation.generate_reply` 调用真实 Qwen 生成回复。
2. 用户明确提出“进入面试场景”时，Planner 切换为
   `start_mock_interview`，`StartTask` 读取确认背景。
3. 在 `practice.create_plan` 前进入 `awaiting_confirmation`。
4. `ResumeTask` 批准后创建 PracticeSession 并生成第一题。
5. 面试不使用固定题库；每次把目标岗位、已问问题和全部有效回答交给模型，
   由模型生成贴合上一轮内容的真实追问。
6. 默认限制为 15 分钟、最多 10 个有效回答；用户明确指定时支持 5–60 分钟、
   3–20 轮。任一条件满足后调用 `review.generate_feedback`。
7. 支持到时自动结束、手动提前结束、拒绝确认、查询真实历史和新建对话；提前
   结束时不会把未回答的当前问题计入有效 Turn，新建对话不会删除历史报告。
8. 浏览器录音转换为 16 kHz 单声道 WAV，上传 Go API 后调用
   `qwen3-asr-flash-realtime`；Go 后端剥离 WAV 头并以 100 ms PCM 分片调用
   国内实时 ASR WebSocket。
9. Assistant 回复和面试问题通过 Go API 调用
   `qwen-audio-3.0-tts-flash` WebSocket；二进制 MP3 音频由服务端代理回浏览器
   播放。
10. 对话框“+”支持 PNG、JPEG、WebP 与 PDF（单文件最大 20 MB、一次最多选择
    4 个）。图片以 Base64 Data URL 交给 `qwen3.5-flash` 理解；PDF 先通过
    OpenAI 兼容 Files API 以 `file-extract` 上传并等待解析，再由 `qwen-long`
    使用 `fileid://...` 理解。解析失败会直接返回错误，不使用模拟或本地兜底。
    图片原文件会以私有权限持久化，并通过 Go 内容接口在待发送区和历史消息中直接
    渲染；刷新页面后仍可查看，点击图片可打开原图。
11. 附件以 `attachment_ids` 随当前 `StartTaskCommand` 进入完整上下文并显示在
    用户消息中。识别为简历时，结构化 `CandidateProfile` 会写入持久存储；即使
    新建对话清空消息，候选人画像仍会注入自由对话、面试追问与反馈。
12. “个人简历”不再使用原型模拟数据。Go 后端提供
    `GET/POST /v1/preparation/resumes`、详情、原始 PDF 下载、结构化内容编辑、
    重命名、启用和
    删除接口；最多保存
    3 份 PDF。上传必须经真实模型确认是简历并解析成功后才入库，最近上传的简历
    自动启用。原始 PDF 以私有权限存入数据目录；切换当前简历会原子更新 Agent
    使用的 `CandidateProfile`，删除会同步清理原文件和解析附件；删除当前简历时
    自动启用最近的剩余简历，所有状态在服务重启后恢复。
13. 简历内容编辑支持姓名、职业标题、摘要、技能和经历。保存只修改结构化档案，
    不改写原始 PDF；编辑当前简历后会立即同步到自由对话、面试追问和反馈上下文。
14. 新建会话前会把当前完整消息上下文归档到文件存储。侧边栏“最近对话”读取真实
    Go API，可打开只读历史并删除；历史会话不会注入当前会话，避免跨会话污染。
    删除历史时会清理不再被其他消息或简历引用的附件原文件。
15. 长期记忆使用官方 Mem0 OSS v3：每个完整 user/assistant 回合走单次
    ADD-only 抽取，召回融合语义、BM25、实体和时间信号。检索结果作为原生
    `system` 消息发送给 Qwen；历史 Assistant 的错误陈述不能覆盖已召回记忆。
    设置 `MEM0_IMPORT_LEGACY=1` 后，启动时会把旧 `.data/memory.sqlite` 中的
    active facts 幂等导入 Mem0；该过程会把文本发送给 DashScope 生成 embedding。
    旧库此后只作为迁移源，不再参与写入或召回。

记忆管理接口也直接使用 Mem0 资源模型，不再暴露旧系统的 fact、candidate、
confidence 或 evidence 概念：

```text
GET    /v1/memories
GET    /v1/memories/{id}
PUT    /v1/memories/{id}
DELETE /v1/memories/{id}
GET    /v1/memories/{id}/history
```

原型中的 Agent 对话、附件理解、简历记忆、确认、面试追问、报告、语音转文字
和回复朗读均使用真实 Go API；独立的面试官配置页面仍保留原型展示数据。

## 测试

```bash
npm run test:all
```

也可以分别验证：

```bash
npm run test:frontend
npm run test:server
npm run test:mem0
```

Go 测试覆盖确认与恢复、动态追问上下文、附件上下文、跨新会话简历记忆、
多简历上限、重命名、启用、删除和重启持久化、
Qwen-Long Files API 协议、时间/轮次结束、提前结束、拒绝分支、幂等、
DashScope Chat HTTP 契约、Mem0 sidecar/Go 适配契约，以及 ASR/TTS WebSocket 契约；前端测试覆盖
构建、服务端渲染、契约命名一致性，以及前端不存在 Planner/ToolRegistry 实现。
