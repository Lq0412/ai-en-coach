# 任务 7：去 Intent 枚举的工具优先路由改造

## 背景

当前 Agent 路由链路大致是：

```text
用户输入
  -> Planner 选择 IntentCatalog 里的 intent
  -> 后端按 intent 校验固定 AllowedPlanShapes
  -> ToolRegistry 执行工具
```

这个方案在 Demo 阶段能收敛模型行为，但问题也很明显：`IntentCatalog` 把用户意图变成了一个封闭枚举池。用户表达一旦不在池里，Planner 往往会把它硬塞进最接近的 intent，或者发明一个 catalog 外的场景变体，最后触发后端校验失败。

典型例子：

```text
用户：我明天要见美国客户，帮我练习一下
Planner: scenario_practice + business_meeting
后端：planner returned unsupported scenario_variant "business_meeting"
```

产品期望不是报错，而是：

- 用户只是想口头准备或轻量练习时，AI 直接对话帮他准备；
- 用户明确要求创建正式商务会面场景模拟时，AI 再说明当前没有这个正式工具，但可以先口头陪练；
- 如果用户表达同时可能匹配多个能力，AI 应该反问用户想要哪一种。

因此后续目标是移除“意图枚举作为第一层路由”的设计，改为工具优先路由。

## 负责什么

负责把 Planner 从 `IntentCatalog first` 改为 `OperationCatalog first`：

```text
用户输入
  -> 读取上下文和运行状态
  -> AI 判断用户想完成什么
  -> 匹配 Tool Package / Operation
  -> 参数足够且唯一匹配：返回 tool steps
  -> 参数不足：返回 clarification
  -> 多个工具都可能：返回 ambiguity question
  -> 没有正式工具支持：走 conversation.generate_reply 做解释或口头帮助
```

核心原则：

- 不再要求用户意图必须属于某个后端枚举；
- 普通闲聊、口头准备、轻量 role-play 也统一视为 `conversation.generate_reply` 这个工具能力；
- `OperationCatalog` 和工具 schema 是能力边界；
- `ScenarioCatalog` 只表示当前支持哪些正式结构化场景，不表示用户只能聊这些场景；
- 后端校验重点从“intent 是否存在”转为“工具是否注册、参数是否合法、状态是否允许、风险是否需要确认”。

## 不负责什么

- 不一次性重写所有业务模块；
- 不删除 `ToolRegistry.Execute`；
- 不把所有后端接口开放成无约束调用；
- 不取消创建 PracticeSession、启动正式练习等用户可见状态变化的确认机制；
- 不让模型直接绕过 `ScenarioCatalog` 创建未支持的正式场景；
- 不要求首期实现 MCP Server 或外部 Agent 框架；
- 不要求前端同时大改页面结构。

## 新路由结果

Planner 输出不再以 `Intent` 为核心，而是以 route 类型、工具步骤、缺槽、歧义和不支持能力为核心。

建议结构：

```go
type Plan struct {
	RouteType          string
	Steps              []PlanStep
	MissingSlots       []MissingSlot
	Ambiguity          *Ambiguity
	UnsupportedRequest *UnsupportedRequest
	Confidence         float64
	Reason             string

	// 迁移期保留，后续删除。
	Intent string
}

type MissingSlot struct {
	Name     string
	Question string
}

type Ambiguity struct {
	Candidates []string
	Question   string
}

type UnsupportedRequest struct {
	RequestedCapability string
	ClosestPackage      string
	Message             string
}
```

`RouteType` 建议先支持：

```text
tool_plan
clarification
ambiguous
unsupported
conversation
```

其中 `conversation` 可以理解为普通 `tool_plan` 的语义简写，实际仍调用：

```text
conversation.generate_reply
```

## Planner 输出示例

### 1. 普通商务准备，不创建正式场景

用户：

```text
我明天要见美国客户，帮我练习一下
```

期望输出：

```json
{
  "RouteType": "conversation",
  "Steps": [
    {
      "ToolName": "conversation.generate_reply",
      "Arguments": {
        "reply_policy": "business_meeting_preparation"
      }
    }
  ],
  "MissingSlots": [],
  "Ambiguity": null,
  "UnsupportedRequest": null,
  "Confidence": 0.82,
  "Reason": "用户想为真实商务沟通做口语准备，但没有明确要求创建正式结构化场景"
}
```

### 2. 明确要求创建未支持的正式场景

用户：

```text
请创建一个生意会面的正式场景模拟
```

期望输出：

```json
{
  "RouteType": "unsupported",
  "Steps": [
    {
      "ToolName": "conversation.generate_reply",
      "Arguments": {
        "reply_policy": "unsupported_formal_scenario"
      }
    }
  ],
  "UnsupportedRequest": {
    "RequestedCapability": "business_meeting_scenario",
    "ClosestPackage": "scenario",
    "Message": "当前 ScenarioCatalog 暂无商务会面正式场景"
  },
  "Confidence": 0.86,
  "Reason": "用户要求创建正式场景，但后端没有对应 ScenarioVariant"
}
```

### 3. 信息不足，需要反问

用户：

```text
我想做一次英文面试
```

期望输出：

```json
{
  "RouteType": "clarification",
  "Steps": [
    {
      "ToolName": "conversation.generate_reply",
      "Arguments": {
        "reply_policy": "ask_missing_slots"
      }
    }
  ],
  "MissingSlots": [
    {
      "Name": "target_role",
      "Question": "你想练 Go 后端、Java 后端、前端，还是其他岗位的英文面试？"
    }
  ],
  "Reason": "用户想开始面试练习，但目标岗位不足以创建正式 PracticeSession"
}
```

### 4. 多个工具都可能，需要消歧

用户：

```text
帮我练一下上次那个回答
```

可能含义：

- 查看最近错题上下文；
- 提交一次错题复练；
- 复盘最近练习；
- 普通口头练习。

期望输出：

```json
{
  "RouteType": "ambiguous",
  "Steps": [
    {
      "ToolName": "conversation.generate_reply",
      "Arguments": {
        "reply_policy": "ask_user_to_choose"
      }
    }
  ],
  "Ambiguity": {
    "Candidates": [
      "review.get_mistake_context",
      "review.submit_mistake_repractice",
      "review.generate_feedback",
      "conversation.generate_reply"
    ],
    "Question": "你是想复盘最近一次练习，打开某道错题继续练，还是直接让我陪你口头练一版？"
  },
  "Reason": "用户引用不明确，多个 review/conversation 能力都可能匹配"
}
```

## 后端校验职责

删除 Intent 枚举后，后端仍然必须严格校验 Plan。

校验重点改为：

- `RouteType` 是否受支持；
- 每个 `ToolName` 是否存在于 `OperationCatalog`；
- 每个参数是否存在于 operation schema；
- required 参数是否齐全；
- enum 参数是否取值合法；
- 工具序列是否满足安全规则；
- 当前运行状态是否允许执行；
- 风险等级是否需要用户确认；
- unsupported / ambiguous / clarification 是否只允许调用 `conversation.generate_reply`。

示例规则：

```text
conversation.submit_turn
  只允许 interaction_mode=interview 且 ActiveQuestion 非空时调用。

practice.create_plan
  必须有 role / duration_minutes 等必要参数，并且执行前需要 confirmation。

scenario.retrieve_knowledge
  scenario_variant 必须来自 ScenarioCatalog。

conversation.generate_reply
  允许作为默认 fallback，但不能伪称已经创建正式练习或写入练习记录。
```

## 状态守卫仍然前置

删除 `IntentCatalog` 不代表删除状态机。状态守卫必须保留，并且应前置于工具执行。

必须覆盖：

- `interaction_mode=interview` 且存在 `ActiveQuestion` 时，用户输入默认是当前题目的回答；
- `interaction_mode=conversation` 时，不能误消耗活跃面试的 turn；
- 用户明确停止面试时，走结束/反馈能力，不继续追问；
- live mode 的 conversation 消息不能被 planner 拉去创建 PracticeSession；
- 创建正式练习、启动 session、写入练习记录等状态变化必须经过确认或明确 UI 信号。

建议拆出：

```go
type StateGuard struct {}

func (g StateGuard) Apply(plan Plan, state RuntimeSnapshot, command StartTaskCommand) Plan
```

## 迁移步骤

### 1. 先新增 Route Plan 结构

保留旧字段，新增新字段：

```go
type Plan struct {
	Intent string // deprecated

	RouteType          string
	Steps              []PlanStep
	MissingSlots       []MissingSlot
	Ambiguity          *Ambiguity
	UnsupportedRequest *UnsupportedRequest
	Confidence         float64
	Reason             string
}
```

首期仍可从旧 intent 派生 `RouteType`，保证现有测试不崩。

### 2. 改造 Planner Prompt

Prompt 不再要求：

```text
You may only choose an Intent from the Intent Catalog
```

改为：

```text
You are a tool router.
Choose operations from the Operation Catalog.
If no operation supports the user's formal request, return unsupported and use conversation.generate_reply.
If several operations match, ask a clarifying question.
If required arguments are missing, ask for the missing slots.
Never invent tools, parameters, scenario variants, or backend IDs.
```

Prompt 输入应包含：

- Operational state；
- Interaction mode；
- Tool Package Catalog；
- Operation Catalog；
- Scenario Catalog；
- 最近消息上下文；
- 最终用户消息。

### 3. 改造 Plan Validator

把当前：

```go
FindIntentSpec(plan.Intent)
planMatchesAnyShape(plan, spec.AllowedPlanShapes)
validateRequiredSlots(plan, spec)
```

逐步替换为：

```go
ValidateRouteType(plan)
ValidateOperationsAgainstCatalog(plan)
ValidateArgumentsAgainstSchema(plan)
ValidateRequiredArguments(plan)
ValidateScenarioArguments(plan)
ValidateStateSafety(plan, state, command)
ValidateRiskConfirmation(plan)
```

### 4. Service 执行按 RouteType 分支

建议执行逻辑：

```text
clarification
  -> conversation.generate_reply
  -> 不执行状态变化工具

ambiguous
  -> conversation.generate_reply
  -> 不执行状态变化工具

unsupported
  -> conversation.generate_reply
  -> 不执行状态变化工具

tool_plan / conversation
  -> 按 validated steps 执行
```

### 5. 再删除 IntentCatalog

等以下内容完成后再删除：

- Planner 不再依赖 `RenderPlannerPromptCatalog`；
- Validator 不再依赖 `FindIntentSpec`；
- `TaskRun.Intent` 的展示和统计迁移到 `RouteType` 或 `PrimaryTool`；
- 旧测试迁移到 route/tool 维度；
- 前端不再硬依赖 intent 字符串。

## 验收标准

必须通过以下行为：

### 商务准备

输入：

```text
我明天要见美国客户，帮我练习一下
```

期望：

- 不报错；
- 不创建 PracticeSession；
- 不调用 `scenario.retrieve_knowledge`；
- 调用 `conversation.generate_reply`；
- 回复直接帮助用户准备开场、表达、可练习问题，邀请用户说一版英文。

### 正式未支持场景

输入：

```text
请创建一个生意会面的正式场景模拟
```

期望：

- 不报错；
- 不创建 PracticeSession；
- 不调用未支持 scenario；
- 调用 `conversation.generate_reply`；
- 回复说明当前还没有正式商务会面场景工具，但可以先口头准备或轻量 role-play。

### 缺岗位的面试请求

输入：

```text
我想做一次英文面试
```

期望：

- 不创建 PracticeSession；
- 不使用默认岗位；
- 反问目标岗位或职位方向。

### 支持的正式场景

输入：

```text
开始一场 Go 后端英文面试
```

期望：

- 匹配 `scenario.retrieve_knowledge`；
- `scenario_variant=go_backend_interview`；
- 获取准备上下文；
- 创建练习计划前要求确认；
- 用户确认后启动 PracticeSession。

### 活跃面试中的回答

条件：

```text
interaction_mode=interview
ActiveQuestion 非空
```

输入：

```text
I improved the latency by caching profile data.
```

期望：

- 调用 `conversation.submit_turn`；
- 不走普通闲聊；
- 根据限制继续生成下一题或生成反馈。

### conversation 模式不消耗面试 turn

条件：

```text
interaction_mode=conversation
ActiveQuestion 非空
```

输入：

```text
这个问题我想先问问你怎么回答
```

期望：

- 不调用 `conversation.submit_turn`；
- 不增加 CompletedQuestionCount；
- 调用 `conversation.generate_reply`。

## 风险

- Planner 自由度变大后，必须靠 Operation schema 和后端 validator 收紧边界；
- `Intent` 被前端、历史记录或测试使用时，需要迁移展示字段；
- `TaskRun` 统计从 intent 迁到 route/tool 后，需要兼容旧数据；
- 缺槽和歧义回复不能变成另一个硬编码 intent，否则会把旧问题换个名字带回来；
- `conversation.generate_reply` 作为 fallback 时，要明确禁止伪造工具执行结果。

## 推荐落地顺序

1. 新增 `RouteType`、`MissingSlot`、`Ambiguity`、`UnsupportedRequest` 字段；
2. 保留旧 `Intent`，但标记 deprecated；
3. 改 planner prompt，让模型以 OperationCatalog 为主；
4. 新增 route/tool validator，与旧 intent validator 并行；
5. 把商务准备、未支持正式场景、缺岗位面试、歧义错题引用四类测试迁到新结构；
6. Service 逐步改用 `RouteType` 分支；
7. 前端和历史展示从 `Intent` 迁到 `RouteType` / `PrimaryTool`；
8. 删除 `IntentCatalog` 和 `AllowedPlanShapes`。
