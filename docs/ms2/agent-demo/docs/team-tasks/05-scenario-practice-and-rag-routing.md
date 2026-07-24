# 任务 5：场景练习、RAG Tag 与知识库路由

## 负责什么

负责把“用户想练某个具体场景”稳定路由到可检索知识的场景练习能力。

这一步是在任务 4 的 `Intent Catalog` 基础上继续演进：Planner 不只判断“用户想面试”，还要识别用户想练的是哪个具体场景，例如 Go 后端面试、Java 后端面试、餐厅点餐、租房沟通、商务会议等。

核心目标：

- 把顶层 `Intent` 控制在少量稳定能力内；
- 用 `Scenario` / `ScenarioVariant` 表达具体练习场景；
- 用后端可信的 `KnowledgeTags` 决定是否检索知识库；
- 面试、餐厅、租房等场景共用同一套场景练习链路；
- 避免把 `go_interview`、`java_interview`、`restaurant_ordering` 全部做成顶层 intent；
- 让 Go 面试问 Go，Java 面试问 Java，不再只围绕简历项目泛问。

## 不负责什么

- 不把所有生活英语场景一次性做完；
- 不直接引入复杂多 Agent 框架；
- 不要求首期接外部向量数据库；
- 不重写现有 `practice`、`conversation`、`review` 领域模型；
- 不改变复盘、错题、历史的既有入口；
- 不让 Planner 自由编造知识库 tag 或工具链。

## 核心设计

### 三层路由模型

不要把每个具体场景都平铺成顶层 intent。

推荐结构：

```text
Intent = 用户要做什么
Scenario = 在什么大场景里做
ScenarioVariant = 具体练习场景
KnowledgeTags = 需要检索哪类知识
```

示例：

```json
{
  "Intent": "scenario_practice",
  "Scenario": "interview",
  "ScenarioVariant": "go_backend_interview",
  "KnowledgeTags": ["interview", "go_backend"],
  "Steps": [
    {"ToolName": "scenario.retrieve_knowledge", "Arguments": {"tags": ["interview", "go_backend"]}},
    {"ToolName": "practice.create_plan", "Arguments": {"scenario_id": "go_backend_interview", "role": "Go Backend Engineer", "duration_minutes": 15}},
    {"ToolName": "practice.start_session", "Arguments": {}},
    {"ToolName": "conversation.generate_next_question", "Arguments": {}}
  ],
  "MissingSlots": [],
  "Reason": "User wants a Go backend mock interview."
}
```

### 为什么不做 `go_interview` intent

不推荐：

```text
go_interview
java_interview
frontend_interview
restaurant_ordering
apartment_rental
business_meeting
airport_checkin
```

原因：

- 顶层 intent 会越来越多；
- Planner Prompt 会变长；
- `validatePlan`、状态守卫、UI 映射、统计口径都会膨胀；
- 很难复用“进入场景、检索知识、创建练习、生成下一轮”的共同链路。

推荐：

```text
Intent: scenario_practice
ScenarioVariant: go_backend_interview
KnowledgeTags: 后端从 Scenario Catalog 派生
```

这样既能让 Planner 直接识别“Go 面试”，又不会让 intent 体系失控。

## 顶层 Intent 范围

任务 5 后，建议逐步把场景练习收敛到以下顶层 intent：

```text
free_conversation
oral_free_practice
scenario_practice
submit_scenario_turn
end_scenario_practice
review_latest_practice
view_practice_history
view_saved_mistakes
view_mistake_context
submit_mistake_repractice
```

兼容期可以保留：

```text
start_mock_interview
submit_interview_answer
end_interview
clarify_interview_requirements
```

但后端应能把它们映射到新的场景模型：

```text
start_mock_interview -> scenario_practice + Scenario=interview
submit_interview_answer -> submit_scenario_turn + Scenario=interview
end_interview -> end_scenario_practice + Scenario=interview
```

## Scenario Catalog

新增后端可执行的场景目录。

建议新增：

```text
backend/internal/assistant/scenario_catalog.go
backend/internal/assistant/scenario_catalog_test.go
```

建议结构：

```go
type ScenarioSpec struct {
	ID              string
	Scenario        string
	Title           string
	Description     string
	Examples        []string
	RequiredSlots   []string
	KnowledgeTags   []string
	DefaultArguments map[string]any
	AllowedModes    []string
	Preconditions   []string
}
```

示例：

```go
{
	ID:            "go_backend_interview",
	Scenario:      "interview",
	Title:         "Go 后端面试",
	Description:   "用户想进行 Go/Golang 后端英文模拟面试",
	Examples:      []string{"我要 Go 后端面试", "Practice a Golang backend interview"},
	RequiredSlots: []string{"target_role"},
	KnowledgeTags: []string{"interview", "go_backend"},
	DefaultArguments: map[string]any{
		"role": "Go Backend Engineer",
		"duration_minutes": 15,
		"max_turns": 0,
	},
}
```

```go
{
	ID:            "restaurant_ordering",
	Scenario:      "daily_life",
	Title:         "餐厅点餐",
	Description:   "用户想练习在餐厅点餐、加菜、询问忌口或结账",
	Examples:      []string{"我想练餐厅点餐", "Practice ordering food in English"},
	KnowledgeTags: []string{"daily_english", "restaurant", "ordering_food"},
}
```

```go
{
	ID:            "apartment_rental",
	Scenario:      "life_abroad",
	Title:         "租房沟通",
	Description:   "用户想练习看房、问租金、押金、合同和室友规则",
	Examples:      []string{"练一下租房英语", "Practice apartment viewing"},
	KnowledgeTags: []string{"daily_english", "housing", "rental"},
}
```

## Plan 结构扩展

在任务 4 的 `Plan` 基础上继续扩展：

```go
type Plan struct {
	Intent          string
	Scenario        string
	ScenarioVariant string
	KnowledgeTags   []string
	Steps           []PlanStep
	Confidence      float64
	MissingSlots    []string
	Reason          string
}
```

注意：

- Planner 可以返回 `KnowledgeTags`，但它不是权威；
- 后端必须根据 `ScenarioVariant` 从 `Scenario Catalog` 派生或校验 tags；
- 如果 Planner 返回的 tags 与 catalog 不一致，以 catalog 为准；
- 不允许 Planner 自由创建未知 `ScenarioVariant`。

## 工具链设计

新增内部工具：

```text
scenario.retrieve_knowledge
```

职责：

- 输入 `scenario_variant` 和 `knowledge_tags`；
- 检索岗位、场景、表达方式、常见问题等知识；
- 返回压缩后的场景知识上下文；
- 不创建 PracticeSession；
- 不改变面试进度；
- 可失败降级到内置 fallback。

示例输入：

```json
{
  "scenario_variant": "java_backend_interview",
  "tags": ["interview", "java_backend"],
  "query": "Java 后端英文面试"
}
```

示例输出：

```json
{
  "scenario_variant": "java_backend_interview",
  "knowledge_tags": ["interview", "java_backend"],
  "competency_context": [
    "JVM memory model and garbage collection basics",
    "Java collections and concurrency",
    "Spring Boot REST API design",
    "SQL transaction isolation",
    "Redis caching and MQ idempotency"
  ],
  "question_guidance": "Ask Java/backend-specific questions balanced with resume evidence."
}
```

## 场景练习执行链路

### 面试类

```text
scenario.retrieve_knowledge
preparation.get_confirmed_context
practice.create_plan
practice.start_session
conversation.generate_next_question
```

说明：

- `scenario.retrieve_knowledge` 提供岗位能力和题目方向；
- `preparation.get_confirmed_context` 提供简历、JD、用户背景；
- `conversation.generate_next_question` 同时使用知识库上下文和简历上下文；
- 不能只围绕简历项目问，也不能脱离用户背景乱编经历。

### 生活口语类

餐厅点餐、租房、旅行问路等可以先不创建正式 PracticeSession。

首期可使用：

```text
scenario.retrieve_knowledge
conversation.generate_reply
```

后续如果要完整 session，再升级为：

```text
scenario.retrieve_knowledge
practice.create_plan
practice.start_session
conversation.generate_next_question
```

## 知识库首期方案

首期不要急着接向量库，先做文件型知识库。

建议新增：

```text
backend/internal/scenarioknowledge/
  module.go
  repository.go
  knowledge/
    interview_go_backend.md
    interview_java_backend.md
    interview_frontend.md
    daily_restaurant_ordering.md
    life_apartment_rental.md
```

Markdown 建议格式：

```md
# Go Backend Interview

## Core Competencies
- Goroutines and channels
- Context cancellation
- Interfaces and error handling
- HTTP/RPC service design
- SQL, caching, MQ, observability

## Interview Angles
- Ask about concurrency trade-offs
- Ask about production debugging
- Ask about service reliability

## Useful Expressions
- I would first isolate whether...
- The trade-off is...

## Sample Question Seeds
- How would you prevent goroutine leaks in a service?
- How do you handle request cancellation across downstream calls?
```

检索策略：

```text
ScenarioVariant -> KnowledgeTags -> 本地 Markdown -> 段落抽取 -> 压缩上下文
```

如果有 JD 或用户补充材料，可以把用户消息/JD 作为 query 做轻量关键词匹配。

## 后续 RAG 演进

第二阶段再升级为真正 RAG：

```text
Markdown / curated docs
  -> chunk
  -> embedding
  -> vector store
  -> topK retrieve
  -> optional rerank
  -> compact context
  -> prompt injection
```

工具名不变：

```text
scenario.retrieve_knowledge
```

这样首期文件检索和后续向量检索可以平滑替换。

## Planner Prompt 要求

Planner Prompt 应明确：

- 只能从 `Intent Catalog` 选择顶层 intent；
- 只能从 `Scenario Catalog` 选择 `ScenarioVariant`；
- 用户说 Go 面试时，必须选择 `go_backend_interview`；
- 用户说 Java 面试时，必须选择 `java_backend_interview`；
- 用户说餐厅点餐时，选择 `restaurant_ordering`；
- 用户说租房时，选择 `apartment_rental`；
- 不允许发明 unknown scenario；
- `KnowledgeTags` 可以返回，但只用于解释，最终以后端 catalog 为准。

## 后端校验规则

`validatePlan` 应增加：

```text
1. 检查 Intent 是否存在于 Intent Catalog；
2. 如果 Intent=scenario_practice，检查 ScenarioVariant 是否存在于 Scenario Catalog；
3. 用 Scenario Catalog 覆盖或补齐 KnowledgeTags；
4. 检查 steps 是否匹配该 Intent + Scenario 的允许执行链；
5. 检查每个 tool 是否已注册；
6. 检查 RequiredSlots 是否满足；
7. 检查 scenario.retrieve_knowledge 不会修改 PracticeSession；
8. 不通过则拒绝执行。
```

## 状态守卫

新增或扩展守卫规则：

- `interaction_mode=conversation` 时，不允许把用户闲聊当成 `submit_scenario_turn`；
- `interaction_mode=interview` 且有 `ActiveQuestion` 时，普通输入优先视为当前面试回答；
- 活跃场景中用户明确说结束、停止、stop、end 时，强制 `end_scenario_practice`；
- 没有活跃问题时，不允许 `submit_scenario_turn`；
- `scenario.retrieve_knowledge` 不能改变面试进度；
- 查看历史、错题、复盘不能触发 RAG；
- 生活口语场景首期不能创建面试类 PracticeSession。

## 兼容现有面试能力

为了降低风险，首期可以保留旧 intent：

```text
start_mock_interview
submit_interview_answer
end_interview
clarify_interview_requirements
```

但内部逐步迁移为：

```text
start_mock_interview
  -> scenario_practice
  -> Scenario=interview
  -> ScenarioVariant=go_backend_interview / java_backend_interview / ...
```

也就是说，前端和旧测试可以先不大改，后端先具备新模型。

## 建议实现步骤

### 1. 扩展 Plan

新增字段：

```text
Scenario
ScenarioVariant
KnowledgeTags
```

并保持旧字段兼容。

### 2. 新增 Scenario Catalog

新增：

```text
backend/internal/assistant/scenario_catalog.go
backend/internal/assistant/scenario_catalog_test.go
```

首期至少支持：

```text
go_backend_interview
java_backend_interview
frontend_interview
product_manager_interview
restaurant_ordering
apartment_rental
```

### 3. 新增知识检索模块

新增：

```text
backend/internal/scenarioknowledge/
```

首期做本地 Markdown 检索，不接外部向量库。

### 4. 注册工具

在 `ToolRegistry` 中新增：

```text
scenario.retrieve_knowledge
```

并确保它只返回上下文，不写运行态。

### 5. 改造 Planner Prompt

Prompt 同时渲染：

```text
Intent Catalog
Scenario Catalog
```

要求模型输出 `Intent + ScenarioVariant`。

### 6. 改造计划校验

校验 `ScenarioVariant`、`KnowledgeTags` 和工具链。

后端用 `Scenario Catalog` 覆盖 Planner 返回的 tags。

### 7. 改造问题生成 Prompt

`conversation.generate_next_question` 应拿到：

```text
target_role
candidate_profile
job_description
retrieved_scenario_knowledge
previous_questions
latest_answer
```

并明确要求：

- 题目必须体现具体场景；
- 技术面试要体现岗位技术栈；
- 简历项目只能作为证据，不是唯一提问来源；
- 不编造用户经历。

## 交付与验收

- [ ] 用户说“我要 Go 后端面试”，Plan 中 `ScenarioVariant=go_backend_interview`；
- [ ] 用户说“我要 Java 后端面试”，Plan 中 `ScenarioVariant=java_backend_interview`；
- [ ] Go 面试检索 `go_backend` tag，不检索 `java_backend`；
- [ ] Java 面试检索 `java_backend` tag，不检索 `go_backend`；
- [ ] Go 面试题包含 goroutine、channel、context、服务并发等方向；
- [ ] Java 面试题包含 JVM、Spring Boot、集合并发、事务等方向；
- [ ] 用户说“练餐厅点餐”，Plan 中 `ScenarioVariant=restaurant_ordering`；
- [ ] 用户说“练租房英语”，Plan 中 `ScenarioVariant=apartment_rental`；
- [ ] Planner 不能发明未知 `ScenarioVariant` 或未知 `KnowledgeTags`；
- [ ] RAG 检索失败时 fallback 到本地默认场景知识；
- [ ] 闲聊、自由口语、复盘、历史、错题不会调用 `scenario.retrieve_knowledge`；
- [ ] `scenario.retrieve_knowledge` 不创建 PracticeSession，不改变 ActiveQuestion；
- [ ] `go test ./...` 通过。
