---
title: SpeakUp 长期 Agent 总体架构与运行机制设计
date: 2026-07-22
author: 覃迦迎
status: 架构讨论稿
scope: 长期 Agent、场景、上下文、记忆、练习与 Review
---

# SpeakUp 长期 Agent 总体架构与运行机制设计

> 本文承接《SpeakUp 长期 Agent 方向与移动端原型改造讨论纪要》，将产品定位落到可分阶段实现、可测试和可回放的系统设计。
>
> 当前定位：**SpeakUp 是一个记得用户的、异步语音优先的职业英语联系人。用户把现实中说不清的事直接发给它；必要时，它再把真实沟通转化为短排练、面试或复盘。**

## 1. 核心结论

SpeakUp 首版不搭建无边界的通用自主 Agent，也不把 Preparation、Practice、Conversation 和 Review 拆成多个自由协作 Agent。

整体采用：

```text
一个长期 Conversational Agent
+ 一个受控 Agent Runtime
+ 一个场景与上下文系统
+ 分层、可见、可撤销的记忆
+ 后续接入的 Practice Runtime
+ 异步 Review Worker
```

职责边界如下：

- **主 Agent**：理解用户意图、组织表达、选择工具、解释结果；
- **Agent Runtime**：控制上下文、循环预算、工具权限、并发和中断；
- **Domain Service**：管理场景、材料、练习、Review、记忆等权威状态；
- **Context Builder**：稳定装配当前场景、会话状态和相关信息；
- **模型可以提出动作，但不能直接读写数据库或绕过权限。**

当前阶段首先验证：

```text
创建真实场景
→ 找回已有场景
→ 搜索场景相关信息
→ 将可信结果放入上下文
→ Agent 基于上下文继续帮助用户
```

Practice、Review、提醒和外部连接在这条主链稳定后再逐步接入。

## 2. 产品主循环与设计边界

### 2.1 产品主循环

SpeakUp 的长期价值不是“模型调用了多少工具”，而是能否把现实任务、练习和真实结果连接起来：

```text
现实事件进入对话
→ Agent 先帮助用户把英语说清楚
→ 必要时制定准备重点
→ 用户同意后进入短练习或模拟
→ 练习结果回到原话题
→ 跟进现实使用结果
→ 更新事项与有证据的学习记忆
→ 下一次更准确地帮助用户
```

### 2.2 首版需要解决

1. 连续多段语音不抢答、不漏段、不乱序；
2. 用户跨天回来时可以恢复同一真实事项；
3. Agent 能创建场景，并避免重复创建；
4. Agent 能搜索简历、JD、历史对话、Review 和长期记忆中的相关信息；
5. Context Builder 能把有限、可信、带来源的信息装入模型上下文；
6. 普通翻译、润色和表达组织可以直接完成，不被强制导向练习；
7. 每次模型运行和工具调用可追踪、可重试、可回放；
8. 用户可以查看和删除长期记忆及练习记录。

### 2.3 首版明确不做

- 多个长期人格或角色广场；
- 通用网页操作、Shell 和浏览器自动化；
- 第三方 Tool / Plugin 市场；
- Agent 自由扫描用户全部数据；
- 多个面试官 Agent 无约束互相对话；
- 把完整聊天记录直接当作长期记忆；
- 依赖向量相似度决定权威事实；
- 让模型生成数据库语句、前端路由或可信 `userId`；
- 在场景与上下文主链未稳定前加入复杂主动通知。

## 3. 用户如何使用 SpeakUp

### 3.1 用户面对的是一个长期联系人

用户不需要先选择“模拟面试”“场景练习”或“错题复习”，而是直接告诉 SpeakUp 正在发生的事：

- “我下周有英文产品经理面试，不知道怎么准备。”
- “客户刚问我为什么延期，我没有解释清楚。”
- “明天会上我要反对这个方案，但不想说得太强硬。”
- “这段英文消息帮我改自然一点，我马上要发。”
- “上次系统设计面试里，我哪里一直没讲清楚？”

产品体验保持为四个自然动作：

```text
告诉 SpeakUp 一件真实的事
→ 得到现在可以使用的表达
→ 需要时练一遍
→ 事情结束后复盘并继续进步
```

### 3.2 首次使用通过真实需求逐步建档

首版不要求用户先完成长问卷。Agent 只采集当前下一步真正需要的信息，并优先从用户已上传的材料中获取，避免重复询问。

例如：

```text
用户：我下周有英文产品经理面试。

SpeakUp：可以。你可以把 JD 或简历发给我；如果现在不方便，
先告诉我面试轮次和你最担心的部分也可以。

用户：是一面，最怕项目经历追问。

SpeakUp：明白。我先按产品经理一面建立准备事项，
重点放在项目深挖。你发来 JD 后，我再帮你校准优先级。
```

在这个过程中，岗位、轮次、时间和担忧进入当前面试场景；只有跨场景仍然稳定的信息才进入主 Agent 长期记忆。

### 3.3 面试准备的完整旅程

#### 阶段一：创建面试场景

用户可以一句话或连续多段语音说明面试信息。Expression Aggregator 等用户表达完整后，Agent 创建一个 `Interview Scenario`：

```text
场景：跨境支付公司产品经理面试
时间：下周三
阶段：准备中
材料：简历、JD
担忧：项目深挖、表达不够简洁
```

场景是跨天业务对象，不是长期记忆，也不是一次练习 Session。

#### 阶段二：结合材料制定准备重点

用户可以上传简历、JD、面试安排、自我介绍或过去的练习报告。系统先解析并关联材料，再检索与当前场景有关的片段。

Agent 给出轻量、可调整的准备建议：

```text
这次建议优先准备：
1. 90 秒英文自我介绍；
2. 跨境支付项目中的个人贡献；
3. 项目延期或意见冲突的行为题；
4. 为什么选择这家公司。
```

这一能力首版实现为 **Preparation Planning Capability**，由材料检索、Context Builder、结构化模型输出和业务校验组成；**不单独创建 Preparation Agent，也不急于抽成 Skill**。当多个场景已经形成稳定、可独立评测的规划策略后，再考虑把策略层版本化为 Skill。

#### 阶段三：在原对话中逐项打磨

用户可以直接在原对话中：

- 讲一遍自我介绍，让 Agent 压缩结构；
- 用中文描述项目经历，再整理成自然英文；
- 补齐项目背景、个人行动和结果；
- 比较不同表达的语气；
- 只练一句开场或一个难讲清楚的概念。

普通表达帮助由模型直接完成，不需要工具。

#### 阶段四：确认后进入专项练习

只有实际开口、连续追问或压力模拟能带来额外价值时，Agent 才展示 Practice 预览。用户确认后进入专用 Practice Runtime。

Practice Runtime 冻结本场目标、角色、难度和用户背景快照，并保存问题、回答、音频、转写和时间点。它是专项运行时，不是第二个长期人格。

#### 阶段五：练习后回到原话题

练习完成后，Review Worker 在后台基于已保存证据生成结构化 Finding。Review 保存后，将少量关键结论返回原 `AssistantThread`，用户可以继续回听、复练或修改准备重点。

单次练习的问题只保存在本次 Review，不立即写成长期弱点。只有多次证据支持或用户明确要求记住时，才晋升为长期学习记忆。

#### 阶段六：连接真实结果

真实面试结束后，用户可以回到同一场景复盘实际问题和回答。系统对比准备内容、练习表现与现实结果，更新当前事项和下一步，而不是重新创建一个孤立任务。

### 3.4 其他职业英语场景

同一结构也适用于：

- 客户沟通与困难解释；
- 英文会议、反对意见和发言准备；
- 邮件、即时消息与高风险回复；
- 汇报、演示和公开表达；
- 入职、自我介绍和跨国团队协作。

所有场景共享同一个主循环、Agent Runtime、场景系统和记忆系统，只在 Practice Persona、评分维度和材料类型上有所差异。

## 4. 角色与核心业务对象

### 4.1 长期 Conversational Agent

用户始终面对同一个 SpeakUp。它负责：

- 接收文字或异步语音；
- 理解当前场景和用户真正要解决的问题；
- 直接完成翻译、润色、表达组织和轻量纠正；
- 创建或找回场景；
- 在需要证据时搜索场景上下文；
- 在合适时提出练习或复盘建议；
- 解释工具结果；
- 提出记忆候选，但不直接把推断写成长期事实。

它不负责直接访问数据库、管理 Practice 完成条件、低延迟语音调度或自主发送外部消息。

### 4.2 Practice Runtime

Practice Runtime 负责一场短排练、模拟面试或场景练习：

- 冻结本场配置和用户背景快照；
- 控制提问、追问、计时、暂停和结束；
- 管理 ASR、LLM、TTS 与 Turn 证据；
- 保证会话可恢复和重试；
- 完成后返回结构化结果。

HR、客户、业务负责人等只是 Session 的 Persona 配置，不拥有独立长期记忆和业务权限。

### 4.3 Review Worker

Review Worker 是后台分析者，不拥有业务状态。它只读取已持久化的 Practice 证据并生成结构化 Finding。

`ReviewJob` 状态、重试次数、报告版本、证据引用和完成状态都由业务服务和数据库管理。这样即使模型超时、Worker 重启或任务重试，报告也不会丢失或重复失控。

### 4.4 四个不能混用的 ID

| 对象 | 含义 | 权威所有者 |
|---|---|---|
| `AssistantThread` | 用户看到的一条长期话题对话 | Conversation Service |
| `AgentRun` | Agent 处理一次完整表达的运行过程 | Run Manager |
| `Scenario / RealityMatter` | 一件跨天真实任务 | Scenario Service |
| `PracticeSession` | 一次短练习或模拟 | Practice Service |

一条 Thread 可以包含多个 Run；一个 Scenario 可以关联多条 Thread 和多次 Practice。它们不能共用一个 `sessionId`。

## 5. 总体架构

![[docs/ms2/week3/覃迦迎/attachments/2026-07-22-speakup-long-term-agent-architecture.png]]

### 5.1 架构分层

| 层 | 核心组件 | 主要职责 |
|---|---|---|
| 客户端与接入层 | SpeakUp App、Conversation Gateway | 消息、音频、SSE / WebSocket、页面状态 |
| 输入处理层 | Message Ingest、ASR、Expression Aggregator、Thread Queue | 语音转写、多段聚合、排序、中断和排队 |
| Agent Runtime | Run Manager、Context Builder、Bounded Agent Loop、LLM Port | 上下文装配、模型循环、预算和生命周期 |
| 工具治理层 | Tool Policy、Tool Registry | 动态白名单、Schema、权限、幂等和审计 |
| 领域服务层 | Scenario、Context Search、Practice、Review、Memory | 管理权威业务对象和专项能力 |
| 数据与基础设施层 | Business DB、Object Storage、Search Index、Event / Trace | 业务持久化、证据、检索、观测和回放 |

### 5.2 关键边界

- ASR、TTS、语音聚合和默认 Context Builder 属于系统管线，不由模型自由选择；
- Tool 只调用 Domain Service，不直接访问数据库；
- 搜索索引只帮助找到候选，不能作为权威事实库；
- 当前用户明确输入和结构化业务事实优先于摘要、向量结果和模型推断；
- Practice 使用独立运行 lane，不阻塞普通对话；
- Review 使用后台队列，不占用对话 Run。

## 6. 消息处理与有界 Agent Loop

### 6.1 Expression Aggregator

每段语音先形成 `AudioSegment`：

```text
segmentId
threadId
clientSequence
recordingStartedAt / endedAt
uploadStatus
transcriptionStatus
transcript
asrConfidence
```

只有满足以下条件才聚合为一个 `Expression`：

1. 当前没有正在录音的片段；
2. 已收到片段上传完成；
3. ASR 完成或明确进入可降级状态；
4. `clientSequence` 连续并已重排；
5. 安静窗口结束；
6. 语义完整性判断可以回复，或达到最大等待时间。

建议首版将参数配置化：普通安静窗口 1.2—2.0 秒；语义不完整时可延长到 4—6 秒。用户再次录音时应立即停止尚未播放的 TTS。

### 6.2 队列语义

| 当前状态 | 新输入 | 策略 |
|---|---|---|
| 无运行中的 AgentRun | 完整 Expression | 创建新 Run |
| 尚未执行写工具 | 用户补充同一件事 | `steer`，合入下一次推理 |
| 尚未发送有效内容 | 用户明显纠正前文 | `interrupt`，中止旧 Run |
| 已执行不可撤销事务 | 用户补充 | `followup`，事务结束后处理 |
| 短时间连续多段输入 | 同一话题 | `collect`，合并为后续 Run |

中断 AgentRun 不等于回滚已经成功的业务事务，因此写工具必须幂等。

### 6.3 单次 AgentRun

每次 Run 执行：

1. 验证用户、`threadId` 和 `expressionId`，创建 `runId`；
2. Context Builder 装配当前 Expression、会话记忆、当前场景和相关长期记忆；
3. Tool Policy 根据意图和权限暴露本轮工具；
4. 模型直接回复或产生结构化 Tool Call；
5. Runtime 完成 Schema、权限、风险和幂等校验；
6. Tool Result 保存后进入下一次上下文；
7. 模型生成最终回复，保存 Run 和消息。

首版预算：

```text
max_model_iterations = 3
max_tool_batches = 2
max_tool_calls_per_run = 4
max_write_tool_calls_per_run = 1
run_timeout = 30s
```

达到预算、等待用户确认、工具要求补充信息、依赖不可用、用户中断或安全策略拒绝时立即停止，并向用户说明当前结果。

### 6.4 并发原则

- 同一 `AssistantThread` 同一时刻只有一个可写 Run；
- 不同用户、不同 Thread 可以并行；
- 多个只读查询可以并行，写工具默认串行；
- 先创建场景再搜索上下文时必须串行，因为搜索依赖 `scenarioId`；
- Practice Runtime 与 Review Worker 使用独立 lane。

## 7. 场景采集与上下文组织

### 7.1 场景对象

```text
Scenario / RealityMatter
  id
  userId
  type                      # interview | meeting | client | presentation | other
  title
  goal
  status                    # active | waiting_result | completed | archived
  participants[]
  scheduledAt / deadline
  structuredFacts
  materialIds[]
  sourceThreadIds[]
  createdFromExpressionId
  createdAt / updatedAt
```

场景保存一件真实任务的权威事实。它不是对话摘要，也不是长期记忆。

### 7.2 稳定采集必要信息

Agent 不使用固定长问卷，而是根据用户下一步动作判断信息是否足够：

| 下一步动作 | 最低必要信息 |
|---|---|
| 直接修改一句表达 | 原始内容和目标语气 |
| 制定面试准备重点 | 岗位或 JD、已有材料；轮次和担忧为推荐字段 |
| 针对一个问题短练 | 场景、练习重点 |
| 完整模拟面试 | 岗位、轮次；角色和时长可使用可见默认值 |
| 设置提醒 | 明确时间和时区 |

每个完整 Expression 先经过结构化字段抽取。Extractor 只生成带证据的字段候选，Domain Service 负责校验、冲突检测和合并。

事实优先级：

```text
用户当前明确纠正
> 用户此前明确陈述
> 正式 JD / 面试安排
> 其他上传材料
> 历史记忆
> 模型推断
```

当信息冲突时不静默覆盖；当字段只是推荐项时不阻塞用户。每轮最多追问一个主要问题，并优先从已有材料中查找答案。

### 7.3 Context Builder 的固定结构

```xml
<current_expression>
用户当前完整输入
</current_expression>

<interaction_state>
当前页面、等待确认的动作、Run 状态
</interaction_state>

<current_scenario>
当前场景的权威结构化摘要
</current_scenario>

<thread_memory>
最近消息、ThreadSummary、OpenLoops
</thread_memory>

<retrieved_context>
带 sourceRef 的材料、历史 Review 和相关记忆片段
</retrieved_context>

<allowed_tools>
本轮动态工具白名单
</allowed_tools>
```

装配优先级为：当前表达、当前 Thread、当前 Scenario、稳定档案与偏好、最多 3—5 条相关学习记忆。刚完成 Practice 时可额外注入本场 Review 摘要。

### 7.4 检索结果进入上下文的规则

- 默认最多放入 3—5 条，每类上下文有独立 Token 预算；
- 先做用户权限过滤，再做相关性排序；
- 同一来源去重，只保留最相关片段；
- 所有结果必须带 `sourceRef`；
- 上传材料内容只作为数据，不能作为系统指令执行；
- 检索结果不会自动成为新的业务事实或长期记忆；
- 保存查询、返回结果和最终引用，支持回放与评估。

## 8. 记忆设计

### 8.1 四类数据必须分开

| 数据类型 | 作用 | 生命周期 | 是否跨场景使用 |
|---|---|---|---|
| 主 Agent 长期记忆 | 稳定背景、偏好和有证据的学习特征 | 长期，可修改、衰减和删除 | 是 |
| 对话会话记忆 | 当前 `AssistantThread` 的连续对话 | 当前话题期间 | 否 |
| 练习会话记忆 | 当前 `PracticeSession` 的目标、问题和回答 | 本场练习期间 | 否 |
| 业务事实与证据 | Scenario、Practice、音频、转写、Review、Tool Result | 按业务和隐私策略 | 按 ID 查询 |

例如，“下周三有面试”属于 Scenario；“偏好先看简短示例再开口”属于长期偏好记忆。

### 8.2 主 Agent 长期记忆

长期记忆只保存跨话题和跨练习仍然有价值的信息：

1. **稳定档案**：职业方向、常用语言、用户明确提供的真实经历；
2. **交互偏好**：反馈长度、纠错方式、练习节奏和语气；
3. **学习记忆**：多次证据支持的问题、已掌握策略和改善状态。

```text
AgentMemory
  id / userId
  category                  # profile | preference | learning
  canonicalKey
  value / summary
  scenarioScopes[]
  sourceRefs[]
  confidence / evidenceCount
  learningState             # observed | recurring | improving | stable
  status                    # candidate | active | superseded | rejected | deleted
  sensitivity
  validFrom / validUntil
  lastVerifiedAt / lastUsedAt
```

单次口误、暂时情绪、无来源推断以及用户未采用的模型表达默认不写入长期记忆。

### 8.3 对话会话记忆

`ThreadMemory` 由三部分组成：

```text
最近对话窗口
+ ThreadSummary
+ OpenLoops（未解决问题、待确认动作、待跟进结果）
```

摘要只能压缩对话，不能覆盖 Scenario、Practice 状态或用户明确确认的事实。

### 8.4 练习会话记忆

`PracticeSessionMemory` 保存本场所需的临时状态：

```text
practiceSessionId
sourceThreadId / scenarioId
frozenUserContext
目标、角色、难度和时长
已问问题、当前 Turn、Turn 摘要
临时观察
暂停与恢复状态
```

“这一题回答过长”只是本场观察，不能立即变成“用户总是回答过长”的长期结论。

### 8.5 练习结束后的分层存储

| 产物 | 存储位置 | 用途 |
|---|---|---|
| 音频、转写、每轮问答和时间点 | `PracticeEvidence` | 回放、复核和重新 Review |
| 本场配置、状态和背景快照 | `PracticeSession` | 恢复和追踪 |
| 带证据的表现结论 | `ReviewFinding` | 本次反馈 |
| 简短结果摘要 | 原 `AssistantThread` | 回到原话题继续交流 |
| 可跨场景复用的结论 | `AgentMemoryCandidate` | 等待晋升为长期记忆 |
| 当前事项进度和下一步 | Scenario / PreparationPlan | 更新业务状态 |

晋升规则：

- 单次表现只留在 Review；
- 同一 `canonicalKey` 在不同练习中重复出现且有独立证据后，才可激活为长期学习记忆；
- 用户明确要求记住时可直接创建候选，但仍需来源和敏感度检查；
- 后续改善通过 `learningState` 更新，不删除历史证据；
- 证据过时后降低召回权重，不用旧记忆永久定义用户。

### 8.6 用户控制

用户至少可以：

- 分别查看长期记忆和单次练习记录；
- 查看每条学习记忆的证据来源；
- 修改、否认或删除错误记忆；
- 关闭某类长期记忆；
- 删除某次 Practice / Review；
- 删除相关音频、转写、索引和派生摘要。

删除原始证据后，如果剩余证据不足，依赖它的 Review 和长期记忆必须同步失效或降级。

## 9. 首版工具设计

### 9.1 只开放三个核心工具

| 工具 | 作用 | 典型触发 |
|---|---|---|
| `scenario.create.v1` | 创建新的真实任务场景 | 用户首次提出明确的面试、会议或客户沟通任务 |
| `scenario.search.v1` | 找回已有场景 | 用户说“上次面试”“Alex 那件事”，当前上下文无法唯一确定 |
| `context.search.v1` | 搜索场景相关材料、历史对话、Review 和长期记忆 | 回答需要证据，默认上下文不足 |

当前 Scenario 已唯一确定时，Context Builder 默认装入场景摘要，不再调用 `scenario.search.v1`。普通表达帮助不调用工具。

### 9.2 `scenario.create.v1`

模型提供 `type`、`title`、`goal` 和已知字段；`userId`、`threadId`、`expressionId`、`requestId` 由服务端注入。

创建前必须完成：

1. 相似场景查重；
2. 同一 `requestId` 幂等；
3. 唯一已有场景直接返回 `existing`；
4. 多个相似候选返回 `needs_user_input`；
5. 保存当前 Expression 作为来源。

允许的结果状态：

```text
created | existing | needs_user_input | rejected
```

场景创建属于低风险、可撤销写操作，不需要额外确认弹窗，但必须对用户可见并支持撤销。

### 9.3 `scenario.search.v1`

只搜索当前用户拥有的场景，返回最多三个候选的 ID、标题、时间、状态和摘要。唯一高置信候选可以继续；多个相近候选必须让用户确认，不能自行选择。

### 9.4 `context.search.v1`

首版使用统一检索入口，避免为简历、JD、历史对话、Review 和长期记忆分别暴露多个模型工具。

输入：

```json
{
  "scenarioId": "scenario_123",
  "query": "支付项目与跨团队协作有关的经历和历史反馈",
  "sources": ["materials", "reviews", "thread_history", "long_term_memory"],
  "limit": 5
}
```

输出中的每一项包含：

```text
sourceType
sourceRef
标题
相关内容片段
relevance
```

搜索顺序为当前场景事实、直接关联材料、相关 Thread / Review、相关长期记忆。

### 9.5 共同约束

- Tool 只调用 Domain Service；
- 所有读取校验用户对 Scenario 和来源对象的所有权；
- 写调用带 `requestId`、版本号和审计记录；
- Tool Result 使用稳定 JSON；
- 依赖不可用时明确降级，不伪造搜索结果；
- 每次调用关联 `runId + toolCallId + requestId + scenarioId`；
- 不可用工具不向模型暴露 Schema。

## 10. Practice 与 Review 的后续接入

### 10.1 Practice 创建

P1 增加 `practice.preview` 和 `practice.start`：

- Preview 只生成目标、角色、重点和时长，不创建 Session；
- Start 只有在用户明确接受预览后才创建 PracticeSession；
- 同一请求幂等，重试不能创建第二个 Session；
- Practice 完成由业务状态机触发，不暴露为通用模型工具。

### 10.2 Review Worker

Practice 完成后：

1. 创建 `ReviewJob`；
2. Worker 读取已持久化证据；
3. 生成带 `evidenceRefs` 的结构化 Finding；
4. Schema 和证据校验；
5. 保存版本化 Review；
6. 发送 `review.completed`；
7. 在原 Thread 展示结果卡片；
8. Memory Consolidator 生成长期记忆候选。

Review Worker 只负责分析，不负责管理 Job 状态和重试策略。

## 11. 主动跟进

首版不采用自由 Heartbeat。主动行为只能来自明确的 Scenario 和用户授权的 Commitment。

可选机制：

- **跨天续接**：用户重新打开 App 时，根据 active Scenario 恢复上下文；
- **事件触发**：Practice 或 Review 完成后回到原 Thread；
- **定时提醒**：未来用户明确确认后创建 Reminder。

事项完成、用户拒绝、相关数据删除或提醒取消后，Commitment 必须同步失效。

## 12. 安全、可靠性与观测

### 12.1 信任边界

模型输出是不可信建议。执行顺序固定为：

```text
Tool Call Schema
→ 服务端身份注入
→ 资源所有权检查
→ Tool Allowlist
→ 风险与确认
→ 幂等检查
→ Domain Service
→ 审计事件
```

### 12.2 最小事件链

```text
message.received
transcription.completed / failed
expression.aggregated
agent.run.accepted / started / ended / failed / aborted
agent.tool.started / ended / failed / rejected
scenario.created / resolved / archived
context.search.completed / failed
practice.session.created / completed
review.job.created / completed / failed
memory.candidate.created / activated / superseded / deleted
reply.sent / failed
```

### 12.3 必须观测的指标

- 音频上传、ASR 和 Expression 聚合延迟；
- 最后一段语音到首个有效回复的时间；
- 场景创建、重复创建和错误创建率；
- 场景找回准确率；
- `context.search` 的相关性、来源覆盖和越权率；
- 每个 Run 的迭代数、工具数、Token 和成本；
- Practice → Review → 原话题返回成功率；
- 记忆候选激活、修改、删除和冲突率；
- 整条链路能否通过 `runId` 回放。

## 13. 验证策略

### 13.1 工具路由四分类

| 结果 | 含义 |
|---|---|
| True Positive | 应调用且正确调用 |
| False Positive | 不应调用却调用 |
| False Negative | 应调用却未调用 |
| True Negative | 正确直接回答或澄清 |

示例：

| 用户表达 | 期望行为 |
|---|---|
| “帮我把这句话说得委婉一点” | 直接回答 |
| “我下周有英文产品经理面试” | `scenario.create.v1` |
| “继续准备上次系统设计面试” | 当前场景不明确时调用 `scenario.search.v1` |
| “结合我上传的 JD 告诉我先准备什么” | `context.search.v1` |
| “我可能之后会面试” | 不创建场景，正常交流或澄清 |

### 13.2 五层测试

1. **Schema**：缺字段、非法枚举和模型提交 `userId` 被拒绝；
2. **Availability**：依赖不可用时工具不暴露或明确降级；
3. **Routing Eval**：每个工具包含正例、近邻反例和歧义例；
4. **Policy / Idempotency**：越权读取被拒绝，相同请求不重复创建；
5. **E2E Replay**：覆盖多段语音、跨天恢复、打断、工具超时和模型重试。

P0 建议门槛：

- 模糊意图导致的错误场景创建率 ≤ 2%；
- 相同 `requestId` 重复创建率 = 0；
- 越权数据返回率 = 0；
- 检索结果 `sourceRef` 覆盖率 = 100%；
- 只读工具触发准确率 ≥ 90%；
- 100% Tool Call 可关联到 Run 和 Scenario。

### 13.3 上线顺序

```text
离线固定用例
→ CI 回归集
→ Shadow Mode
→ 内部用户只读搜索
→ 小流量开放可撤销的场景创建
→ 根据误触发和检索质量扩大
```

Prompt、模型和 Tool Schema 都必须带版本号，以便按版本回放问题。

## 14. 分阶段落地

### P0：场景创建—信息检索—上下文回答

1. `AssistantThread / Expression / AgentRun / ToolCall`；
2. Scenario 数据模型和当前场景关联；
3. 多段语音 Aggregator 和有界 Agent Loop；
4. `scenario.create.v1` 的查重、幂等和审计；
5. `scenario.search.v1` 的跨天找回；
6. 简历、JD 和纯文本材料的最小解析、切片与场景关联；
7. `context.search.v1` 统一检索；
8. Context Builder 装入场景摘要和带来源的结果；
9. Routing Eval、Retrieval Eval 和 E2E Replay。

### P1：练习与复盘闭环

1. `practice.preview / start` 和 Practice Runtime；
2. Review Worker 与报告返回原话题；
3. Scenario、Practice、Review 的来源关联；
4. Memory Candidate、证据合并和用户控制；
5. 跑通“准备 → 短练习 → Review → 更新场景上下文”。

### P2：外部信息源与主动能力

1. 受控公司 / 岗位网络检索；
2. 日历读取和会议前准备；
3. Commitment / Reminder；
4. 外部消息 Channel；
5. 多角色分析或 Multi-agent PoC；
6. 间隔复习和长期学习计划。

## 15. P0 纵向验收场景

```text
Day 1
用户连续发三段语音，说明下周有英文产品经理面试
→ 系统只形成一个完整 Expression
→ 创建唯一 Interview Scenario
→ 用户上传简历和 JD
→ 搜索岗位要求与相关项目经历
→ Agent 给出带来源的准备重点

Day 2
用户说“继续准备上次的面试”
→ 找回正确 Scenario
→ 恢复场景摘要、未完成重点和相关材料
→ 不重复询问已经知道的信息

Day 5
用户问“我的支付项目适合回答哪条 JD 要求？”
→ 同时检索简历项目与 JD 片段
→ 结果按权限、相关性和来源过滤
→ Agent 基于 sourceRef 回答，不编造材料中不存在的信息
```

验收重点：唯一创建、模糊意图不误创建、跨天正确找回、搜索不越权、结果有来源、上下文不超预算、整条链路可回放。

## 16. 仍需确认的产品决策

1. P0 是否只要求用户重新打开 App 后自然续接，暂不包含系统通知；
2. 首个纵向场景是否确定为“英文面试准备”；
3. 种子用户最常提供的是简历、JD 还是口述信息；
4. 用户档案类长期记忆是否全部要求确认；
5. P1 优先验证短练习还是完整模拟面试；
6. 14 天实验主要观察“场景恢复率”“材料检索价值”还是“练习转化率”。

这些选择影响 P0 的产品范围和指标，但不改变本文的架构边界。

## 参考资料

### SpeakUp 项目材料

- [SpeakUp 长期 Agent 方向与移动端原型改造讨论纪要](../林锵/2026-07-19-SpeakUp长期Agent方向与移动端原型改造讨论纪要.md)
- [SpeakUp 功能与 OpenClaw 机制借鉴映射报告](./2026-07-20-SpeakUp功能与OpenClaw机制借鉴映射报告.md)
- [SpeakUp Agent 化产品架构总结](../张思成/2026-07-20-SpeakUp-Agent化产品架构总结.md)

### OpenClaw 官方资料

- [OpenClaw Agent Loop](https://docs.openclaw.ai/concepts/agent-loop)
- [OpenClaw Command Queue](https://docs.openclaw.ai/concepts/queue)
- [OpenClaw Memory](https://docs.openclaw.ai/concepts/memory)
- [OpenClaw Tools](https://docs.openclaw.ai/tools)
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)

### Hermes Agent 官方资料

- [Hermes Agent Architecture](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/architecture.md)
- [Hermes Agent Loop](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/agent-loop.md)
- [Hermes Tools Runtime](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/tools-runtime.md)
- [Hermes Memory Provider](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/memory-provider-plugin.md)
- [Hermes Agent GitHub](https://github.com/NousResearch/hermes-agent)
