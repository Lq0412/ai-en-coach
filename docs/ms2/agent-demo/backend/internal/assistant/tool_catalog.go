package assistant

import (
	"fmt"
	"sort"
	"strings"
)

type ToolPackageSpec struct {
	Name        string
	Description string
	Operations  []string
}

type OperationSpec struct {
	Name        string
	Package     string
	Summary     string
	Description string
	Parameters  []OperationParameter
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

type OperationExample struct {
	Description string
	Arguments   map[string]any
}

func ToolPackages() []ToolPackageSpec {
	return []ToolPackageSpec{
		{
			Name:        "scenario",
			Description: "场景知识检索与场景变体选择。",
			Operations:  []string{"scenario.retrieve_knowledge"},
		},
		{
			Name:        "preparation",
			Description: "读取已确认的候选人背景、简历和目标场景上下文。",
			Operations:  []string{"preparation.get_confirmed_context"},
		},
		{
			Name:        "practice",
			Description: "创建练习计划、启动练习 Session、记录每轮练习结果。",
			Operations:  []string{"practice.create_plan", "practice.start_session", "practice.apply_turn_outcome"},
		},
		{
			Name:        "conversation",
			Description: "生成自由对话回复、面试下一题，或提交当前面试回答。",
			Operations:  []string{"conversation.generate_reply", "conversation.generate_next_question", "conversation.submit_turn"},
		},
		{
			Name:        "review",
			Description: "练习复盘、历史记录、错题列表、错题上下文和错题复练。",
			Operations: []string{
				"review.generate_feedback",
				"review.list_history",
				"review.save_mistake",
				"review.list_mistakes",
				"review.get_mistake_context",
				"review.submit_mistake_repractice",
			},
		},
	}
}

func OperationCatalog() []OperationSpec {
	return []OperationSpec{
		{
			Name: "scenario.retrieve_knowledge", Package: "scenario",
			Summary:     "检索场景练习知识",
			Description: "按 ScenarioVariant 获取后端维护的场景知识和追问指导。",
			Parameters: []OperationParameter{
				{Name: "scenario_variant", Type: "string", Description: "场景变体 ID，例如 go_backend_interview", Required: true},
				{Name: "tags", Type: "array<string>", Description: "知识标签，由后端 Scenario Catalog 归一化"},
			},
			Risk: "read",
		},
		{
			Name: "preparation.get_confirmed_context", Package: "preparation",
			Summary:     "读取确认过的候选人背景",
			Description: "获取用于练习计划和面试题生成的候选人、简历和目标岗位上下文。",
			Parameters: []OperationParameter{
				{Name: "scenario", Type: "string", Description: "场景名称，例如 PROGRAMMER_INTERVIEW", Required: true},
				{Name: "target_role", Type: "string", Description: "目标岗位，例如 Java Backend Engineer"},
			},
			Risk: "read",
		},
		{
			Name: "practice.create_plan", Package: "practice",
			Summary:     "创建练习计划",
			Description: "根据目标岗位、题数和时长创建 PracticePlan。该操作会产生用户可见状态变更，启动前需要确认。",
			Parameters: []OperationParameter{
				{Name: "role", Type: "string", Description: "目标岗位，例如 Go Backend Engineer", Required: true},
				{Name: "max_turns", Type: "integer", Description: "最大有效回答数；0 表示不固定题数"},
				{Name: "duration_minutes", Type: "integer", Description: "练习时长，默认 15 分钟"},
				{Name: "scenario_id", Type: "string", Description: "后端场景变体 ID，例如 java_backend_interview"},
			},
			Risk: "user_visible_change",
		},
		{
			Name: "practice.start_session", Package: "practice",
			Summary:     "启动练习 Session",
			Description: "基于已创建的练习计划启动新的 PracticeSession。",
			Risk:        "user_visible_change",
		},
		{
			Name: "practice.apply_turn_outcome", Package: "practice",
			Summary:     "记录本轮回答结果",
			Description: "记录本轮回答是否有效，并推动练习进度。",
			Parameters:  []OperationParameter{{Name: "answer_validity", Type: "string", Description: "回答有效性", Enum: []string{"VALID", "INVALID"}}},
			Risk:        "write",
		},
		{
			Name: "conversation.generate_next_question", Package: "conversation",
			Summary:     "生成下一道面试题",
			Description: "根据岗位、候选人背景、场景知识和上一轮回答生成一个动态追问。",
			Risk:        "read",
		},
		{
			Name: "conversation.generate_reply", Package: "conversation",
			Summary:     "生成自由对话回复",
			Description: "用于闲聊、英语解释、口语陪练和非正式场景练习，不创建 PracticeSession。",
			Parameters: []OperationParameter{
				{Name: "user_message", Type: "string", Description: "用户本轮消息"},
				{Name: "context_summary", Type: "string", Description: "线程或场景上下文摘要"},
				{Name: "conversation_messages", Type: "array<object>", Description: "完整有序对话上下文"},
				{Name: "reply_policy", Type: "string", Description: "回复策略，例如 ask_missing_slots、ask_user_to_choose、unsupported_formal_scenario、business_meeting_preparation"},
			},
			Risk: "read",
		},
		{
			Name: "conversation.submit_turn", Package: "conversation",
			Summary:     "提交当前面试回答",
			Description: "仅在面试模式且存在 ActiveQuestion 时，把用户输入记录为当前问题的回答。",
			Parameters: []OperationParameter{
				{Name: "answer_text", Type: "string", Description: "用户回答文本", Required: true},
				{Name: "interaction_mode", Type: "string", Description: "交互模式", Required: true, Enum: []string{"TEXT", "VOICE"}},
			},
			Risk: "write",
		},
		{
			Name: "review.generate_feedback", Package: "review",
			Summary:     "生成练习反馈",
			Description: "复盘当前或最近练习，生成评分、反馈、错题和复练目标。",
			Parameters:  []OperationParameter{{Name: "reason", Type: "string", Description: "复盘原因，例如 user_requested_stop"}},
			Risk:        "read",
		},
		{
			Name: "review.list_history", Package: "review",
			Summary:     "查看练习历史",
			Description: "列出最近练习记录和反馈摘要。",
			Parameters:  []OperationParameter{{Name: "limit", Type: "integer", Description: "返回数量上限"}},
			Risk:        "read",
		},
		{
			Name: "review.save_mistake", Package: "review",
			Summary:     "保存一道错题",
			Description: "把指定练习 Session 的某个问题保存到错题本。",
			Parameters: []OperationParameter{
				{Name: "practice_session_id", Type: "string", Description: "练习 Session ID"},
				{Name: "question_index", Type: "integer", Description: "0-based 问题序号"},
			},
			Risk: "write",
		},
		{
			Name: "review.list_mistakes", Package: "review",
			Summary:     "查看错题列表",
			Description: "列出最近保存的错题卡片。返回卡片中包含真实 mistake_id 和用户可见 Q 编号。",
			Parameters: []OperationParameter{
				{Name: "limit", Type: "integer", Description: "返回数量上限"},
				{Name: "status", Type: "string", Description: "错题状态过滤，例如 pending 或 practiced"},
			},
			Risk: "read",
		},
		{
			Name: "review.get_mistake_context", Package: "review",
			Summary:     "查看某道错题上下文",
			Description: "按真实 mistake_id 或用户可见 question_ref 获取错题、原 Session、题目、原回答和复练记录。用户说 Q1/Q3 时应使用 question_ref，不要把 Q1 当 mistake_id。",
			Parameters: []OperationParameter{
				{Name: "mistake_id", Type: "string", Description: "后端真实错题 ID，例如 saved-mistake-session-xxx-q1"},
				{Name: "question_ref", Type: "string", Description: "用户可见错题引用，例如 Q1、Q3、第1题"},
				{Name: "session_id", Type: "string", Description: "可选练习 Session ID，用于多个 Q1 消歧"},
			},
			Risk: "read",
			Examples: []OperationExample{{
				Description: "用户说“我要回答错题中的 Q1”",
				Arguments:   map[string]any{"question_ref": "Q1"},
			}},
		},
		{
			Name: "review.submit_mistake_repractice", Package: "review",
			Summary:     "提交错题复练答案",
			Description: "按真实 mistake_id 或用户可见 question_ref 提交新的复练回答，并返回点评。用户说 Q1 时应使用 question_ref。",
			Parameters: []OperationParameter{
				{Name: "mistake_id", Type: "string", Description: "后端真实错题 ID"},
				{Name: "question_ref", Type: "string", Description: "用户可见错题引用，例如 Q1、Q3、第1题"},
				{Name: "session_id", Type: "string", Description: "可选练习 Session ID，用于消歧"},
				{Name: "answer_text", Type: "string", Description: "用户新的复练回答", Required: true},
			},
			Risk: "write",
		},
	}
}

func FindOperation(name string) (OperationSpec, bool) {
	name = strings.TrimSpace(name)
	for _, operation := range OperationCatalog() {
		if operation.Name == name {
			return operation, true
		}
	}
	return OperationSpec{}, false
}

func OperationsForPackage(name string) []OperationSpec {
	name = strings.TrimSpace(name)
	operations := make([]OperationSpec, 0)
	for _, operation := range OperationCatalog() {
		if operation.Package == name {
			operations = append(operations, operation)
		}
	}
	return operations
}

func RegisteredOperationNames() map[string]bool {
	names := map[string]bool{}
	for _, operation := range OperationCatalog() {
		names[operation.Name] = true
	}
	return names
}

func ValidatePlanAgainstToolCatalog(plan Plan) error {
	if len(plan.Steps) == 0 {
		return fmt.Errorf("planner returned no tool steps")
	}
	for _, step := range plan.Steps {
		operation, ok := FindOperation(step.ToolName)
		if !ok {
			return fmt.Errorf("planner returned unregistered operation %q", step.ToolName)
		}
		allowedParameters := map[string]bool{}
		for _, parameter := range operation.Parameters {
			allowedParameters[parameter.Name] = true
		}
		for name := range step.Arguments {
			if !allowedParameters[name] {
				return fmt.Errorf("planner returned unsupported argument %q for %s", name, step.ToolName)
			}
		}
		for _, parameter := range operation.Parameters {
			if parameter.Required && !planStepHasNonEmptyArgument(step, parameter.Name) {
				return fmt.Errorf("planner returned %s without required argument %q", step.ToolName, parameter.Name)
			}
		}
		for _, parameter := range operation.Parameters {
			if len(parameter.Enum) == 0 || !planStepHasNonEmptyArgument(step, parameter.Name) {
				continue
			}
			value := strings.TrimSpace(fmt.Sprint(step.Arguments[parameter.Name]))
			valid := false
			for _, allowed := range parameter.Enum {
				if value == allowed {
					valid = true
					break
				}
			}
			if !valid {
				return fmt.Errorf("planner returned unsupported value %q for %s.%s", value, step.ToolName, parameter.Name)
			}
		}
	}
	return nil
}

func planStepHasNonEmptyArgument(step PlanStep, name string) bool {
	value, ok := step.Arguments[name]
	return ok && value != nil && strings.TrimSpace(fmt.Sprint(value)) != ""
}

func RenderPlannerToolCatalog() string {
	var builder strings.Builder
	packages := ToolPackages()
	for _, pkg := range packages {
		fmt.Fprintf(&builder, "Package: %s\nDescription: %s\nOperations:\n", pkg.Name, pkg.Description)
		for _, operationName := range pkg.Operations {
			operation, ok := FindOperation(operationName)
			if !ok {
				continue
			}
			fmt.Fprintf(&builder, "- %s: %s", operation.Name, operation.Summary)
			if len(operation.Parameters) > 0 {
				names := make([]string, 0, len(operation.Parameters))
				for _, parameter := range operation.Parameters {
					label := parameter.Name
					if parameter.Required {
						label += " required"
					}
					names = append(names, label)
				}
				sort.Strings(names)
				fmt.Fprintf(&builder, " | args: %s", strings.Join(names, ", "))
			}
			if operation.Risk != "" {
				fmt.Fprintf(&builder, " | risk: %s", operation.Risk)
			}
			builder.WriteString("\n")
			if strings.TrimSpace(operation.Description) != "" {
				fmt.Fprintf(&builder, "  %s\n", operation.Description)
			}
			for _, example := range operation.Examples {
				fmt.Fprintf(&builder, "  Example: %s -> %v\n", example.Description, example.Arguments)
			}
		}
		builder.WriteString("\n")
	}
	return strings.TrimSpace(builder.String())
}
