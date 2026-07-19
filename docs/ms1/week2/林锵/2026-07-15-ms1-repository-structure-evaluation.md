# SpeakUp MS1 仓库结构评估与空骨架设计

> 状态：评审草案
> 日期：2026-07-15
> 上游架构决策：[#15 SpeakUp MS1 系统架构与技术选型](https://github.com/1024XEngineer/XE3-ESL/issues/15)
> 产品输入：[#10](https://github.com/1024XEngineer/XE3-ESL/issues/10)、[#11](https://github.com/1024XEngineer/XE3-ESL/issues/11)、[#12](https://github.com/1024XEngineer/XE3-ESL/issues/12)、[#14](https://github.com/1024XEngineer/XE3-ESL/issues/14)

## 1. 结论

SpeakUp 适合使用一个包含 Flutter 正式客户端、Go 模块化单体、Web Mock Demo、接口契约、端到端测试和工程文档的 monorepo。

推荐采用“顶层按可运行程序拆分、程序内部按业务能力拆分”的结构：

- 顶层直接使用 `mobile/`、`server/`、`web-demo/`、`api/`、`e2e/`，当前不增加 `apps/`、`services/`、`packages/` 等中间层。
- Go 后端使用官方推荐的 `cmd/` + `internal/`，保持一个可部署进程，不拆微服务。
- Flutter 使用 feature-first 的轻量 MVVM；View、ViewModel、Repository、Service 只在真实需要时创建。
- `InterviewPlan`、`Interviewer`、`InterviewSession` 和 `Turn` 先归入同一个 `interview` 业务模块，不按数据库实体机械拆包。
- `TurnAnalysis` 和 `Feedback` 保持独立，因为它们具有独立状态、版本、失败和重试边界。
- REST 和 WebSocket 契约放在语言无关的 `api/` 中；Dart 与 Go 各自拥有运行时类型，不维护第三套共享业务实现。
- MS1 只实现可编译、可串联的 Mock 空骨架，不接入真实认证、PostgreSQL、文件上传、ASR、对话模型或 TTS。

这份设计是 #15 的落地细化，不建立新的平行架构权威来源。通过评审后，应从 #15 拆出独立实现 Issue，由空骨架 PR 关联并合入主仓。

## 2. 评估目标

本次评估回答四个问题：

1. 正式 Flutter 客户端、Go 后端和现有 Web Demo 是否放在同一仓库。
2. 顶层目录采用直接拆分还是 `apps/`、`services/`、`packages/` 多层 monorepo。
3. Go 和 Flutter 内部应该按技术层还是按业务能力组织。
4. MS1 空骨架应建立哪些真实边界，哪些内容必须推迟。

本次评估不重新选择 Flutter、Go、PostgreSQL、REST、WebSocket 或 AI 供应商。这些内容由 #15 和技术裁定负责。

## 3. 输入与证据

### 3.1 项目内规范

- [`reference/架构设计规范.md`](../../../../reference/架构设计规范.md)：MS1 架构的主要载体是入库的空骨架代码；接口为真，实现可为桩，项目必须可编译和串联。
- [`reference/02-product-first.md`](../../../../reference/02-product-first.md)：PRD、系统架构、协议/数据设计和实现应保持决策层次。
- [`reference/03-ai-dev-guidelines.md`](../../../../reference/03-ai-dev-guidelines.md)：最少代码、目标驱动验证、不提前建设推测性抽象。
- [`reference/04-multi-client-design.md`](../../../../reference/04-multi-client-design.md)：客户端通过统一协议接入核心系统，不建立平行业务逻辑。
- [`reference/05-task-centric.md`](../../../../reference/05-task-centric.md)：面试应建模为可恢复的任务状态，而不是只有聊天消息列表。
- [`reference/06-engineering-closure.md`](../../../../reference/06-engineering-closure.md)：主链路需要可复现 Demo、自动验证和 CI 证据。

其中 Agent Loop、Tools、Skills、MCP、SubAgent、JSON-RPC 和多模型自动故障转移属于被分析项目的特定场景，不直接迁移到 SpeakUp。

### 3.2 外部项目与官方指南

调研日期为 2026-07-15，参考以下仍在维护的项目和官方文档：

| 来源 | 可观察结构 | 对 SpeakUp 的启示 |
|---|---|---|
| [Ente](https://github.com/ente/ente) | 顶层直接拆分 `mobile/`、`server/`、`web/`、`infra/`、`architecture/` | Flutter + Go monorepo 不必先套 `apps/` / `services/` |
| [Ente server](https://github.com/ente/ente/tree/main/server) | Go 服务包含 `cmd/`、`internal/`、`migrations/`、配置和运行文档 | 可运行入口、内部实现和迁移脚本分开 |
| [Immich](https://github.com/immich-app/immich) | `mobile/`、`server/`、`web/`、`open-api/`、`e2e/`、`deployment/` | 多端仓库中单独维护契约和端到端验证 |
| [Immich OpenAPI](https://github.com/immich-app/immich/tree/main/open-api) | OpenAPI 规格和客户端生成配置独立 | Flutter 与后端围绕一份语言无关契约协作 |
| [PocketBase](https://github.com/pocketbase/pocketbase) | 单一 Go 产品仍保持 `cmd/`、核心、API、迁移和测试边界 | 单体不等于所有代码堆在一个包，也不需要微服务 |
| [Go 官方模块布局](https://go.dev/doc/modules/layout) | Server 项目推荐 `cmd/` + `internal/` | 内部业务包不应成为外部承诺的 Go API |
| [Flutter 官方架构指南](https://docs.flutter.dev/app-architecture/guide) | UI/Data 两层，View、ViewModel、Repository、Service；Domain 可选 | 先采用轻量 MVVM，只在复杂逻辑出现时增加 UseCase |

Grafana、AppFlowy 等大型项目证明了 monorepo 和模块化可以长期演进，但其目录规模和基础设施复杂度明显超过五人、两个月项目，不作为 MS1 模板直接复制。

## 4. 方案比较

### 4.1 方案 A：多仓库

```text
speakeup-mobile
speakeup-server
speakeup-web-demo
speakeup-api
```

优点：

- 每个仓库构建环境单纯。
- 权限、Release 和部署可以独立管理。

问题：

- 当前团队规模小，产品模型和协议仍在快速收口。
- 一个主链路变更需要跨多个仓库同步 Issue、PR 和版本。
- MS1 很难用一个 PR 证明客户端、后端和 Mock 已完成串联。

结论：不采用。等出现独立发布团队、权限隔离或明显不同的发布节奏时再重新评估。

### 4.2 方案 B：`apps/` + `services/` + `packages/`

```text
apps/
  mobile/
  web-demo/
services/
  api/
packages/
  contracts/
```

优点：

- 适合存在多个应用、多个服务和多个共享包的大型 monorepo。
- 顶层类别明确。

问题：

- 当前只有一个正式客户端、一个后端进程和一个临时 Web Demo。
- `packages/` 容易在没有真实复用需求时产生空抽象。
- Dart 和 Go 无法直接共享运行时代码，`contracts` 实际只是协议规格。

结论：暂不采用。未来出现第二个正式客户端、第二个后端服务或真实共享包后再增加中间层。

### 4.3 方案 C：顶层直接按可运行程序拆分

```text
mobile/
server/
web-demo/
api/
e2e/
docs/
```

优点：

- 新成员打开仓库即可识别所有可运行程序和公共契约。
- 与当前系统规模匹配，路径短，构建命令直观。
- 未来仍可平滑演进到 `apps/` 或拆仓，不影响内部业务设计。

问题：

- 顶层目录未来可能增加，需要在新增程序时重新判断分类。

结论：采用。当前的可理解性比未来可能需要的分类层更重要。

## 5. 推荐仓库结构

```text
XE3-ESL/
├── mobile/                         # Flutter 正式客户端
│   ├── lib/
│   │   ├── app/                    # 启动、路由、主题、依赖组装
│   │   ├── features/
│   │   │   ├── context/            # 岗位和确认背景
│   │   │   ├── interview/          # Plan、Interviewer、Session、Turn
│   │   │   ├── feedback/           # 报告和同题重答
│   │   │   ├── history/
│   │   │   └── profile/
│   │   ├── data/
│   │   │   ├── repositories/       # 客户端数据事实来源
│   │   │   └── services/           # REST、WS、录音和播放
│   │   └── main.dart
│   └── test/
│
├── server/                         # Go/Gin 模块化单体
│   ├── cmd/
│   │   └── api/
│   │       └── main.go
│   ├── internal/
│   │   ├── identity/
│   │   ├── context/                # Resume、手动背景、确认快照
│   │   ├── interview/              # Plan、Interviewer、Session、Turn
│   │   ├── analysis/               # TurnAnalysis
│   │   ├── feedback/               # FeedbackItem、RetryAttempt
│   │   ├── history/
│   │   ├── delivery/
│   │   │   ├── http/
│   │   │   └── websocket/
│   │   └── platform/
│   │       ├── postgres/
│   │       ├── filestorage/
│   │       └── providers/
│   │           ├── mock/
│   │           └── qwen/
│   ├── migrations/
│   └── go.mod
│
├── api/                            # 语言无关的前后端契约
│   ├── openapi.yaml
│   └── websocket-events.yaml
│
├── web-demo/                       # 当前 Web Mock，非正式客户端
├── e2e/                            # 离线 Mock 主链路验证
├── docs/
│   ├── product/
│   ├── architecture/
│   └── decisions/
├── deploy/                         # MS2 起按真实需要增加
├── .github/workflows/
├── Makefile
├── AGENTS.md
└── README.md
```

目录树表示目标边界，不要求 MS1 为每个目录生成无意义占位文件。只有当一个目录承载真实类型、接口、桩实现或验证时才创建。

## 6. 后端拆分规则

### 6.1 模块按业务能力，不按数据库实体

以下对象共同组成面试生命周期，先放入 `interview`：

```text
InterviewPlan
  -> Interviewer
     -> InterviewSession
        -> Turn
```

它们共享关键不变量和状态推进规则。若按实体拆成四个顶层包，会产生大量跨包调用和循环依赖风险。

### 6.2 独立失败边界单独建模块

`TurnAnalysis` 与 `Feedback` 不属于保存 Turn 的同一事务结果：

```text
Turn: completed
TurnAnalysis: failed
Feedback: pending
```

分析和反馈失败时，用户不应重新回答。因此 `analysis` 与 `feedback` 拥有独立状态和重试入口。

### 6.3 接口由使用方定义

不建立全局 `ports/` 目录。业务模块在自身附近定义所需的最小接口，例如：

```go
// internal/interview/repository.go
type Repository interface {
    SaveSession(ctx context.Context, session Session) error
    FindSession(ctx context.Context, id SessionID) (Session, error)
}
```

`internal/platform/postgres` 提供实现，业务模块不依赖 PostgreSQL、厂商 SDK 或本地目录。

### 6.4 依赖方向

```text
delivery
  -> identity / context / interview / analysis / feedback / history
       -> module-owned interfaces
            <- platform implementations
```

禁止：

- 业务模块导入 `delivery`。
- 业务模块直接导入厂商 SDK。
- Flutter 直接连接 AI 供应商。
- 将厂商原始事件透传给客户端。
- 为未来微服务预建消息总线、服务发现或分布式事务。

## 7. Flutter 拆分规则

### 7.1 Feature-first，功能内部使用轻量 MVVM

页面、ViewModel 和该功能特有的 UI 状态放在同一 feature 中。跨功能的数据事实来源放在 Repository，外部通信和平台能力放在 Service。

```text
features/interview/
  interview_view.dart
  interview_view_model.dart
  interview_ui_state.dart
```

### 7.2 Domain/UseCase 是可选层

MS1 不为每个按钮创建 UseCase。只有出现以下情况时才引入：

- 一个操作需要组合多个 Repository。
- 相同业务流程被多个 ViewModel 复用。
- ViewModel 已承担难以测试的复杂状态推进。

### 7.3 客户端不拥有服务端业务不变量

Flutter 可以校验表单和维护页面状态，但以下规则必须由 Go 后端拥有：

- 一个计划包含 1–4 位面试官。
- 一个 Session 只属于一位面试官。
- 一场完整 Session 固定四个有效 Turn。
- 原回答、反馈和复练只追加。
- 分析失败不改变已完成 Turn。

## 8. API 与 WebSocket 契约

`api/` 只保存语言无关的边界定义：

- `openapi.yaml`：身份上下文、背景、计划、面试官、历史和报告等普通资源。
- `websocket-events.yaml`：Session 建连、回答音频、状态、下一问、错误和恢复事件。

Go 和 Dart 类型可以从规格生成，也可以在 MS1 手写后通过契约测试校验。MS1 不需要先建设通用代码生成平台。

接口应表达业务语义，不表达厂商语义。例如使用 `turn.analysis_failed`，不使用某个 ASR 厂商的原始错误事件名。

## 9. MS1 空骨架范围

### 9.1 必须完成

1. Flutter 应用能够启动并进入固定演示身份。
2. Go/Gin 服务能够启动，并提供健康检查。
3. 核心领域类型和状态定义为真实代码。
4. REST 和 WebSocket 的最小契约存在且命名一致。
5. Mock Provider 与未来真实 Provider 依赖同一业务接口。
6. 串联以下离线 Mock 主链路：

```text
固定演示身份
  -> 确认预置/手动背景
  -> 创建计划并展示面试官
  -> 选择一位面试官
  -> 完成固定四问
  -> 查看证据反馈
  -> 完成一次同题重答
```

7. Go 构建和测试通过，Flutter analyze/test 通过。
8. 一条端到端测试证明主链路不依赖真实外部供应商。
9. README 能让新成员独立启动 Mock 主链路。

### 9.2 明确不做

- 真实注册登录。
- 真实 PDF 上传和解析。
- 真实 PostgreSQL 读写；MS1 只定义 Repository 边界，可使用内存实现。
- 真实文件存储。
- 真实 ASR、对话模型和 TTS。
- 连续全双工语音、自动打断和弱网恢复。
- 自定义角色、RAG、支付、会员和复杂任务队列。
- 多服务拆分、自动故障转移或通用 Provider 路由平台。

## 10. 风险与控制

| 风险 | 控制方式 |
|---|---|
| 目录先行但主链路未串联 | 验收以可运行 Mock 和 e2e 为准，不以目录数量为准 |
| 一个实体一个 package 导致依赖碎片化 | 先按业务能力聚合，出现独立变化和失败边界后再拆 |
| Flutter 与 Go 类型逐渐不一致 | 一份 OpenAPI/WS 契约加契约测试 |
| Web Demo 被当成正式客户端 | 目录命名为 `web-demo`，README 明确 Flutter 是正式客户端 |
| `platform` 反向污染业务 | 依赖检查和 Review 禁止业务包导入具体实现 |
| 过早引入代码生成和工作区工具 | MS1 只加入能够直接证明构建或串联的工具 |
| 当前本地文档与主仓代码脱节 | 空骨架必须通过关联 Issue 的主仓 PR 合入 |

## 11. 是否创建主仓 Issue

### 11.1 决策

需要创建主仓 Issue，但 Issue 类型应是“架构主干空骨架实现任务”，不是新的仓库结构 Proposal，也不是单纯文档上传任务。

原因：

- #15 已经负责系统架构决策，重复创建 Proposal 会形成两套评审入口。
- 远端 MS1 明确要求空骨架代码入库、可编译和可串联，目前主仓仍缺少该实现任务。
- 仓库结构、核心接口、Mock 串联、构建和 e2e 共同构成一个可验收的 MS1 架构交付。
- 实现 PR 需要有独立 Issue 承载范围和验收，不能直接挂在文档 Proposal 上。

### 11.2 创建时机

1. #15 完成架构评审并接受。
2. 将本文件的结论作为 #15 评论或关联文档提交评审。
3. 创建空骨架实现 Issue，关联 #15 和 MS1。
4. 通过一个范围受控的 PR 合入主仓。

若 #15 只剩目录命名等非方向性意见，可以并行起草 Issue；但在 #15 接受前不应把有争议的模块边界写死进主分支。

## 12. 建议 Issue 草案

### 标题

```text
[功能] 搭建 MS1 可串联项目空骨架
```

### 正文

```markdown
## 背景

#15 已确定 Flutter 正式客户端、Go + Gin 模块化单体、PostgreSQL、FileStorage、REST + WebSocket 和窄能力 Provider 的系统边界。MS1 要求将架构落实为可编译、可串联、实现可为 Mock 的空骨架，目前主仓尚无正式项目代码。

## 要做的事

- 建立 `mobile/`、`server/`、`api/`、`web-demo/`、`e2e/` 的最小仓库结构。
- 在 Go 中定义 Identity、Context、Interview、Analysis、Feedback 和 History 的核心类型与模块接口。
- 建立 REST 与 WebSocket 的最小业务契约，不透传厂商事件。
- 提供内存 Repository 和 Mock Provider，关闭外部服务时仍可运行。
- 串联“固定身份 → 确认背景 → 选择面试官 → 四问 → 证据反馈 → 同题重答”。
- 增加构建、测试、端到端验证和本地启动说明。

## 明确不做

- 不接入真实认证、PDF 解析、PostgreSQL、FileStorage、ASR、LLM 或 TTS。
- 不实现连续实时语音、自定义角色、RAG、支付或微服务。
- 不为未进入当前主链路的能力提前建立通用框架。

## 验收标准

1. Flutter 应用和 Go 服务均可独立启动。
2. Go 构建及测试通过，Flutter analyze/test 通过。
3. 核心领域类型、模块接口、REST 契约和 WebSocket 事件命名一致。
4. 一条离线 e2e 测试完整跑通 MS1 Mock 主链路。
5. 关闭所有外部供应商配置后，Demo 仍可重复运行。
6. README 说明目录职责、依赖方向、启动步骤和 Mock 边界。
7. PR 只包含空骨架及其直接验证，不夹带真实供应商集成或产品扩展。

## 关联

- 依赖：#15
- 产品输入：#10、#11、#12、#14
- 数据设计：#17
- Milestone：MS1：战略决策
```

建议沿用主仓已有标签：`sub-task`、`P0`。技术域标签应以实际负责人和主仓现有做法决定；若一个 Issue 同时覆盖 Flutter 和 Go，可不强行标为单一“前端”或“后端”。

## 13. 后续拆分触发条件

本 Issue 只完成 MS1 空骨架。以下工作应在后续分别创建 Issue：

- PostgreSQL Repository 与迁移落地。
- REST 完整资源契约。
- WebSocket 语音协议与恢复语义。
- Flutter 录音、播放和真机格式验证。
- 真实 ASR、回答后转录、对话模型和 TTS 接入。
- 反馈证据校验和质量评测。
- 真实账户、PDF 解析和受保护文件删除。

每个后续 Issue 应保持单一技术域和可独立验收，避免把 MS2 的真实集成重新合并成一个大任务。
