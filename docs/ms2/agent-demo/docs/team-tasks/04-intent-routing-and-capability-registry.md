# 任务 4：AI 意图路由与能力注册表

## 负责什么

负责把用户的一句话稳定路由到正确能力：闲聊时陪聊，想面试时进入面试流程，想随便练口语时进入口语陪练，想复盘、看历史或看错题时调用对应 Review 能力。

首期目标不是做复杂多 Agent，而是把现有 `Planner -> Plan -> ToolRegistry` 链路整理成可扩展的意图路由系统。

首期覆盖：

- 建立 `Intent Catalog`，把系统支持的能力集中登记；
- 让 Planner 只能从能力目录中选择 intent，不能发明工具或随意组合工具；
- 用同一份能力目录生成模型规划 Prompt，并用于后端校验；
- 把现有 `validatePlan` 从硬编码 map 演进为基于能力目录校验；
- 抽出状态守卫，避免活跃面试中的闲聊被误当作面试回答；
- 新增轻量版 `oral_free_practice`，用户想随便练口语时使用口语陪练回复风格；
- 保持现有面试、复盘、历史、错题能力可用。

## 不负责什么

- 不直接删除现有测试基础设施或本地测试辅助代码；
- 不以新增假数据、假 Planner 或假业务状态作为产品方案；
- 不实现完整雅思口语、商务英语、发音评分或正式口语 Session；
- 不重写 `practice`、`review`、`preparation` 的领域模型；
- 不修改前端页面结构；
- 不引入新的外部模型服务或新的 Agent 框架。

## 核心概念

### Intent Catalog

能力注册表是一张后端可执行的功能菜单。每个能力都要写清楚：

- `Intent`：能力名称，例如 `free_conversation`、`start_mock_interview`；
- `Description`：什么时候使用这个能力；
- `Examples`：用户可能怎么说；
- `RequiredSlots`：需要哪些信息，例如面试需要 `target_role`；
- `AllowedPlanShapes`：允许调用哪些工具，以及调用顺序；
- `RequiresConfirmation`：是否需要用户确认；
- `AllowedModes`：允许在哪些 UI 模式下触发；
- `Preconditions`：需要满足什么运行状态。

示例：

```text
Intent: start_mock_interview
Description: 用户明确想开始模拟面试，并且已有目标岗位
RequiredSlots: target_role
RequiresConfirmation: true
AllowedPlanShapes:
  - preparation.get_confirmed_context
  - practice.create_plan
  - practice.start_session
  - conversation.generate_next_question
```

### 意图树与能力注册表的关系

意图树只作为产品分类参考：

```text
对话
练习
  口语练习
  面试练习
复盘
资料准备
```

真正执行时使用能力注册表：

```text
用户消息
  -> Planner 选择 Intent
  -> 后端按 Intent Catalog 校验
  -> State Guard 处理运行状态兜底
  -> ToolRegistry 执行工具
```

## 首期 Intent 范围

必须支持：

```text
free_conversation
clarify_interview_requirements
start_mock_interview
submit_interview_answer
end_interview
oral_free_practice
review_latest_practice
view_practice_history
view_saved_mistakes
```

可保留已有支持：

```text
view_mistake_context
submit_mistake_repractice
```

暂不实现：

```text
topic_speaking_practice
ielts_speaking_practice
business_english_practice
pronunciation_assessment
```

## 建议实现步骤

### 1. 新增能力目录

新增：

```text
backend/internal/assistant/intent_catalog.go
backend/internal/assistant/intent_catalog_test.go
```

建议结构：

```go
type IntentSpec struct {
	Intent               string
	Description          string
	Examples             []string
	RequiredSlots        []string
	AllowedPlanShapes    [][]string
	RequiresConfirmation bool
	AllowedModes         []string
	Preconditions        []string
}
```

能力目录必须成为唯一来源：

- Planner Prompt 从它渲染；
- `validatePlan` 从它校验；
- 新增能力时优先改它，而不是在多个文件里复制规则。

### 2. 扩展 Plan 结构

在不破坏现有链路的前提下扩展：

```go
type Plan struct {
	Intent       string
	Steps        []PlanStep
	Confidence   float64
	MissingSlots []string
	Reason       string
}
```

`Confidence` 和 `Reason` 首期只用于调试，不参与核心分支。

`MissingSlots` 用于表达缺信息，例如用户只说“我想面试”，但没有目标岗位。

### 3. 改造 Planner Prompt

`DashScopeProvider.Plan` 不再手写一大段固定 allowed plans，而是：

```text
system prompt =
  你是 SpeakUp 的意图路由器
  只能从以下 Intent Catalog 选择
  每个 intent 的用途、示例、缺失字段处理和工具序列如下
```

然后由代码把 `Intent Catalog` 渲染进去。

必须保留约束：

- 只返回 JSON；
- 不能编造工具；
- 工具顺序必须和能力目录一致；
- UI `interaction_mode` 是强信号；
- 普通聊天、英语问题和技术讨论默认不能误进面试。

### 4. 改造计划校验

现有 `validatePlan` 应改为：

```text
1. 检查 intent 是否存在于 Intent Catalog；
2. 检查每个 tool 是否是已注册工具；
3. 检查 steps 是否匹配该 intent 的 AllowedPlanShapes；
4. 检查必填参数是否存在或进入 clarify intent；
5. 不通过则返回错误，不执行工具。
```

### 5. 抽出状态守卫

在 `assistant/service.go` 中把现有状态兜底整理为独立函数：

```go
func (s *Service) enforceStateGuards(plan Plan, command StartTaskCommand, state RuntimeSnapshot) Plan
```

首期守卫规则：

- `interaction_mode=conversation` 时，不允许 `submit_interview_answer`；
- `interaction_mode=interview` 且有 `ActiveQuestion` 时，用户普通输入优先视为面试回答；
- 活跃面试中用户明确说结束、停止、stop、end 时，强制 `end_interview`；
- 没有活跃问题时，不允许 `submit_interview_answer`；
- 用户想面试但缺目标岗位时，强制 `clarify_interview_requirements`；
- `oral_free_practice` 不能改变面试进度；
- 查看历史、错题、复盘不应创建新的 PracticeSession。

### 6. 新增轻量口语陪练能力

首期 `oral_free_practice` 不新建正式 Session，先复用：

```text
conversation.generate_reply
```

但传入不同上下文：

```text
你正在进行自由口语陪练：
- 英文为主，中文辅助；
- 回复短一点，适合开口练；
- 多追问，让用户继续说；
- 用户表达明显错误时，先自然回应，再给一个简短 correction；
- 不进入面试流程；
- 不生成正式评分报告。
```

用户示例：

```text
我想随便练练口语
我们用英语聊一会儿
陪我练一下日常英语
I want to practice speaking casually
```

### 7. 保留现有测试辅助，但不作为产品方案

当前测试中可能仍依赖本地辅助实现来避免真实模型调用。首期不要直接删除这类代码，避免测试不稳定或需要真实 API Key。

但本任务的产品方案不新增假 Planner 或假业务数据。新增行为应优先通过真实能力目录、真实 Planner Prompt、真实状态守卫和确定性单元测试覆盖。

## 文件边界

可修改或新增：

```text
backend/internal/assistant/intent_catalog.go
backend/internal/assistant/intent_catalog_test.go
backend/internal/assistant/model.go
backend/internal/assistant/dashscope.go
backend/internal/assistant/dashscope_test.go
backend/internal/assistant/service.go
backend/internal/assistant/service_test.go
backend/internal/conversation/
```

尽量不修改：

```text
backend/internal/preparation/
backend/internal/practice/
backend/internal/review/
backend/internal/platform/memory/
backend/internal/assistant/http.go
backend/cmd/server/main.go
frontend/
```

如必须修改 `demomodules/registry.go`，只允许新增真实工具映射或补齐现有工具参数适配，不允许把意图判断逻辑塞进 Registry。

## 与其他任务的约定

- 对话 Prompt 由任务 1 维护，本任务只负责路由和能力目录；
- 评分、错题和复练由任务 2 维护，本任务只把用户请求路由到对应能力；
- 用户资料、Scenario、Mem0 和历史上下文由任务 3 提供，本任务只读取上下文摘要；
- ToolRegistry 只执行工具，不判断用户意图；
- State Guard 可以覆盖模型错误规划，但不能编造业务结果；
- 新能力必须先登记到 Intent Catalog，再允许 Planner 使用。

## 交付与验收

- [ ] 普通闲聊稳定路由到 `free_conversation`；
- [ ] “我想随便练口语”稳定路由到 `oral_free_practice`；
- [ ] “我想面试”但没有岗位时路由到 `clarify_interview_requirements`；
- [ ] “我想练 Go 后端面试”路由到 `start_mock_interview`；
- [ ] 活跃面试中，`conversation` 模式发消息不会计入面试 Turn；
- [ ] 活跃面试中，`interview` 模式发消息会走 `submit_interview_answer`；
- [ ] 活跃面试中明确结束会走 `end_interview`；
- [ ] “看看历史记录”路由到 `view_practice_history`；
- [ ] “看看错题”路由到 `view_saved_mistakes`；
- [ ] Planner 返回不存在工具时被拒绝；
- [ ] Planner 返回 intent 和工具序列不匹配时被拒绝；
- [ ] `oral_free_practice` 不创建 PracticeSession、不改变面试状态；
- [ ] `go test ./...` 通过。

## 建议分支

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feat/intent-routing-capability-registry
```
