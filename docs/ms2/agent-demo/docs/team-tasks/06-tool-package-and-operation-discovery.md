# 任务 6：工具包与接口发现机制改造

## 负责什么

负责把当前 `Intent Catalog -> 固定工具链` 的 Agent 编排方式，升级为更接近 `hduhelp-neo` 的工具包、接口清单和 Schema 发现机制。

当前问题是：系统把很多用户表达都压到少量 intent 和固定 plan shape 上，导致 Planner 容易把自然语言里的局部引用误当成后端实体 ID。例如用户说“我要回答错题中的 Q1”，模型把 `Q1` 直接作为 `review.get_mistake_context` 的 `mistake_id`，最终报错：

```text
execute review.get_mistake_context: review: saved mistake "Q1" not found
```

这说明现有方案把“用户意图枚举”做得太重，把“工具参数契约”和“可发现能力”做得太轻。后续应学习 `hduhelp-neo` 的思路：先让 Agent 看到业务域和工具包，再按需发现接口和 Schema，最后构造结构化调用。

首期覆盖：

- 新增 `ToolPackage Catalog`，按业务域组织工具，例如 `conversation`、`practice`、`review`、`preparation`、`scenario`；
- 新增 `Operation Catalog`，描述每个工具接口的名称、用途、参数、风险、返回摘要和示例；
- 支持按工具包列出 operation，按 operation 获取完整 schema；
- Planner Prompt 从“枚举所有 intent”改为“先选择工具包与 operation，再生成 tool invocation”；
- 保留后端白名单校验，禁止模型发明工具、发明参数或绕过确认；
- 先修复错题 Q1/Q3 这类 UI 引用到真实 `mistake_id` 的解析问题；
- 让现有面试、复盘、历史、错题能力继续可用。

## 不负责什么

- 不引入新的外部 Agent 框架；
- 不把所有业务接口直接暴露为无校验 HTTP 代理；
- 不删除现有 `ToolRegistry.Execute` 执行入口；
- 不重写 `conversation`、`practice`、`review`、`preparation` 的领域模型；
- 不要求首期实现完整 MCP Server；
- 不改造前端整体页面结构；
- 不取消高风险操作确认机制。

## 参考思路

`hduhelp-neo` 的有效点不是简单做了很多命令，而是把能力拆成了几层：

```text
agent-context
  -> capabilities --domain <name>
  -> commands list --domain <name> --search <keyword>
  -> schema <operation-or-command>
  -> execute operation
```

对应代码参考：

- `/Users/apple/Documents/project/hduhelp/hduhelp-neo/cmd/hduhelp-cli/manifest.json`
- `/Users/apple/Documents/project/hduhelp/hduhelp-neo/internal/cli/manifest/manifest.go`
- `/Users/apple/Documents/project/hduhelp/hduhelp-neo/cmd/hduhelp-cli/discovery.go`
- `/Users/apple/Documents/project/hduhelp/hduhelp-neo/cmd/hduhelp-cli/operations.go`
- `/Users/apple/Documents/project/hduhelp/hduhelp-neo/internal/cli/skillbundle/skills/hduhelp-shared/SKILL.md`

可以借鉴但不照搬 CLI 形态。`agent-demo` 是后端内置 Agent，可以直接提供 Go 内部的 catalog 和 schema，不一定需要真实 shell 命令。

## 核心概念

### Tool Package

工具包是按业务域组织的一组能力。它回答“这里有什么类型的工具”。

示例：

```text
review
  用于练习历史、反馈报告、错题、复练。

practice
  用于创建练习计划、启动 Session、记录练习进度。

conversation
  用于生成自由对话回复、面试下一题、提交当前回答。
```

建议结构：

```go
type ToolPackageSpec struct {
	Name        string
	Description string
	Operations  []string
}
```

### Operation

Operation 是可执行工具接口。它回答“这个工具怎么调用”。

建议结构：

```go
type OperationSpec struct {
	Name        string
	Package     string
	Summary     string
	Description string
	Parameters  []OperationParameter
	Required    []string
	Risk        string
	Examples    []OperationExample
}

type OperationParameter struct {
	Name        string
	Type        string
	Description string
	Required    bool
	Enum        []string
}
```

其中 `Name` 继续使用现有工具名，例如：

```text
review.list_mistakes
review.get_mistake_context
review.submit_mistake_repractice
practice.create_plan
conversation.generate_next_question
conversation.submit_turn
```

### Schema Discovery

Schema Discovery 是给 Planner 和调试界面看的能力发现接口。

首期可以先做 Go 内部函数：

```go
func ToolPackages() []ToolPackageSpec
func OperationsForPackage(name string) []OperationSpec
func FindOperation(name string) (OperationSpec, bool)
func RenderPlannerToolPackages() string
func RenderOperationSchema(name string) string
```

后续再视需要开放 HTTP：

```text
GET /agent/tools/packages
GET /agent/tools/packages/{package}/operations
GET /agent/tools/operations/{operation}
```

## 首期工具包范围

### review

必须包含：

```text
review.list_history
review.generate_feedback
review.list_mistakes
review.get_mistake_context
review.submit_mistake_repractice
```

其中 `review.get_mistake_context` 需要扩展参数语义：

```text
mistake_id: 后端真实错题 ID，例如 saved-mistake-session-xxx-q1
question_ref: 用户可见引用，例如 Q1、Q3、第 1 题
session_id: 可选，用于在多场练习里消歧
```

规则：

- 如果有 `mistake_id`，优先按真实 ID 查询；
- 如果没有 `mistake_id` 但有 `question_ref`，从当前可见错题列表或最近错题中解析；
- 如果匹配多个，返回需要用户确认或选择；
- 如果完全找不到，返回可读错误，并附带当前可用错题引用。

### conversation

必须包含：

```text
conversation.generate_reply
conversation.generate_next_question
conversation.submit_turn
```

注意：

- `conversation.submit_turn` 只允许在 `interaction_mode=interview` 且存在 `ActiveQuestion` 时使用；
- 自由对话不能误调用 `submit_turn`；
- 面试中用户明确停止时，不能继续生成下一题。

### practice

必须包含：

```text
practice.create_plan
practice.start_session
practice.apply_turn_outcome
```

注意：

- `practice.create_plan` 是用户可见状态变更，仍需确认；
- `max_turns=0` 表示不固定题数；
- 不能因为普通聊天创建新的 PracticeSession。

### preparation

必须包含：

```text
preparation.get_confirmed_context
```

后续可扩展为简历、JD、附件管理接口。

### scenario

必须包含：

```text
scenario.retrieve_knowledge
```

后续可以把 Scenario Catalog 也纳入 operation schema。

## 建议实现步骤

### 1. 新增工具包目录

新增：

```text
backend/internal/assistant/tool_catalog.go
backend/internal/assistant/tool_catalog_test.go
```

首期先用手写 catalog，不做自动代码生成。

要求：

- 每个现有 `Registry.Execute` 支持的工具，都必须在 Operation Catalog 中登记；
- 每个 operation 都必须属于一个 package；
- 测试保证 catalog 中的工具名和 `demomodules.Registry` 支持的工具名一致；
- 测试保证 operation 参数名和当前执行层读取的参数名一致。

### 2. 调整 Planner Prompt

修改：

```text
backend/internal/assistant/dashscope.go
```

从“只看 Intent Catalog”调整为：

```text
你是 SpeakUp 的工具规划器。
先根据用户请求和运行状态选择一个 Tool Package。
再从该 Package 的 Operation Schema 中选择一个或多个 operation。
只能调用后端提供的 operation。
参数必须符合 schema。
```

首期为了降低改造风险，可以保留 `Intent` 字段，但让它退化为调试标签：

```json
{
  "Intent": "answer_saved_mistake",
  "Steps": [
    {
      "ToolName": "review.get_mistake_context",
      "Arguments": {
        "question_ref": "Q1"
      }
    }
  ]
}
```

也就是说，后端校验以 operation schema 为主，不再要求每个自然意图都预先出现在 `IntentCatalog`。

### 3. 改造 Plan 校验

现有 `ValidatePlanAgainstCatalog` 仍可保留，但新增基于 operation 的校验：

```go
func ValidatePlanAgainstToolCatalog(plan Plan) error
```

校验规则：

- 每个 `ToolName` 必须存在于 Operation Catalog；
- 参数名必须在 operation schema 中声明；
- 必填参数必须存在；
- 风险等级为 `user_visible_change` 或更高时，必须走确认流程；
- 特定 operation 的运行状态约束由 State Guard 校验。

过渡期可同时运行两套校验：

```text
先校验工具存在和参数合法；
对于旧 intent，继续校验 plan shape；
对于新工具包模式，允许非枚举 intent，但不允许非法工具。
```

### 4. 修复错题引用解析

修改：

```text
backend/internal/demomodules/registry.go
backend/internal/review/
backend/internal/assistant/service_test.go
backend/internal/demomodules/review_tools_test.go
```

建议新增解析函数：

```go
func ResolveMistakeReference(state RuntimeSnapshot, ref MistakeReference) (SavedMistake, error)
```

输入：

```go
type MistakeReference struct {
	MistakeID   string
	QuestionRef string
	SessionID   string
}
```

支持：

```text
Q1
q1
第1题
第一题
AI Application Developer · Q1
saved-mistake-xxx-q1
```

验收场景：

- 用户看到错题列表后说“我要回答 Q1”，系统能定位到 Q1 对应错题；
- 用户说“打开 Q3”，系统能展示 Q3 上下文；
- 用户直接传真实 `mistake_id` 仍可用；
- 多个 session 都有 Q1 时，系统不瞎选，提示用户选择；
- 找不到时返回当前可用的错题引用列表。

### 5. 引入工具发现响应

为了便于调试和前端展示，建议新增只读接口：

```text
GET /agent/tools/packages
GET /agent/tools/operations?package=review
GET /agent/tools/operations/review.get_mistake_context
```

返回内容参考 `hduhelp-cli capabilities/schema`，但精简为 Agent Demo 所需字段。

这一步不是模型调用的必要条件，但有助于前端、测试和团队理解当前 Agent 到底看到了哪些工具。

### 6. 调整前端上下文传递

首期不改页面结构，但建议在用户点击错题卡片或处于错题列表页时，向后端补充可见实体上下文：

```json
{
  "visible_entities": [
    {
      "type": "saved_mistake",
      "label": "Q1",
      "id": "saved-mistake-session-xxx-q1",
      "title": "Given your experience..."
    }
  ]
}
```

如果短期不想扩展请求结构，也可以后端从 `DemoState.SavedMistakes` 中按最近列表解析 `Q1`。但长期更推荐显式传 visible entities，避免用户界面看到的 Q1 和后端最近列表不一致。

## 文件边界

可修改或新增：

```text
backend/internal/assistant/tool_catalog.go
backend/internal/assistant/tool_catalog_test.go
backend/internal/assistant/intent_catalog.go
backend/internal/assistant/dashscope.go
backend/internal/assistant/service.go
backend/internal/assistant/service_test.go
backend/internal/assistant/http.go
backend/internal/demomodules/registry.go
backend/internal/demomodules/*test.go
backend/internal/review/
frontend/public/prototype/assets/agent-backend-bridge.js
```

尽量不修改：

```text
backend/internal/platform/memory/
backend/internal/assistant/context/
backend/internal/preparation/scenario_repository.go
backend/cmd/server/main.go
```

除非需要注册只读工具发现 HTTP 路由。

## 与现有任务的关系

- 任务 2 继续负责 Review 领域能力本身；
- 任务 4 的 `Intent Catalog` 不删除，但改成过渡期路由辅助，不再承载全部工具编排；
- 任务 5 的 Scenario Catalog 可以后续用同样方式纳入 Tool Package；
- 本任务重点解决 Agent 能力发现、operation schema、参数校验和 UI 引用解析。

## 交付与验收

- [ ] 后端有 `ToolPackage Catalog` 和 `Operation Catalog`；
- [ ] 所有 `Registry.Execute` 支持的工具都能在 Operation Catalog 中找到；
- [ ] Planner Prompt 使用工具包和 operation schema，而不是只依赖固定 intent 枚举；
- [ ] 非法工具名、非法参数名、缺少必填参数会在执行前被拒绝；
- [ ] 用户说“我要回答错题中的 Q1”不会再把 `Q1` 当真实 `mistake_id`；
- [ ] `review.get_mistake_context` 支持 `mistake_id` 和 `question_ref` 两种定位方式；
- [ ] 多个 Q1 候选时能要求用户确认，不自动误选；
- [ ] 工具发现接口或内部函数可输出 review 包的 operation schema；
- [ ] 现有开始面试、提交面试回答、结束面试、查看历史、查看错题流程不回归；
- [ ] `go test ./...` 通过；
- [ ] PR 中说明与 `hduhelp-neo` 的借鉴点，以及没有照搬 CLI 形态的原因。

## 推荐分支

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feat/tool-package-operation-discovery
```
