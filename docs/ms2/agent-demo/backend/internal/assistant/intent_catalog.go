package assistant

import (
	"errors"
	"fmt"
	"slices"
	"strings"
)

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

func IntentCatalog() []IntentSpec {
	return []IntentSpec{
		{
			Intent:            "free_conversation",
			Description:       "用户闲聊、提问、英语问题或技术讨论；默认能力，不进入面试。",
			Examples:          []string{"你好，今天聊什么？", "这个英文句子自然吗？", "Explain goroutines briefly."},
			AllowedModes:      []string{"conversation"},
			Preconditions:     []string{"普通聊天、英语问题和技术讨论默认不能误进面试"},
			AllowedPlanShapes: [][]string{{"conversation.generate_reply"}},
		},
		{
			Intent:            "clarify_interview_requirements",
			Description:       "用户想面试，但缺少目标岗位或职位方向。",
			Examples:          []string{"我想模拟面试", "Can you interview me?"},
			RequiredSlots:     []string{"target_role"},
			AllowedModes:      []string{"conversation"},
			Preconditions:     []string{"不能使用默认岗位代替缺失目标岗位"},
			AllowedPlanShapes: [][]string{{"conversation.generate_reply"}},
		},
		{
			Intent:               "start_mock_interview",
			Description:          "用户明确想开始模拟面试，且已有具体目标岗位。",
			Examples:             []string{"开始一场 Go 后端英文面试", "Interview me for a frontend engineer role."},
			RequiredSlots:        []string{"target_role"},
			RequiresConfirmation: true,
			AllowedModes:         []string{"conversation", "interview"},
			Preconditions:        []string{"已有目标岗位", "启动前需要用户确认创建新的 PracticeSession"},
			AllowedPlanShapes: [][]string{{
				"preparation.get_confirmed_context",
				"practice.create_plan",
				"practice.start_session",
				"conversation.generate_next_question",
			}},
		},
		{
			Intent:        "submit_interview_answer",
			Description:   "面试模式中已有活跃问题时，用户本轮输入是当前题目的回答。",
			Examples:      []string{"I improved the payment service by...", "My answer is..."},
			RequiredSlots: []string{"answer_text"},
			AllowedModes:  []string{"interview"},
			Preconditions: []string{"session_in_progress=true", "ActiveQuestion 非空"},
			AllowedPlanShapes: [][]string{
				{"conversation.submit_turn", "practice.apply_turn_outcome", "conversation.generate_next_question"},
				{"conversation.submit_turn", "practice.apply_turn_outcome", "review.generate_feedback"},
			},
		},
		{
			Intent:            "end_interview",
			Description:       "活跃面试中，用户明确要求结束、停止或退出。",
			Examples:          []string{"结束面试", "stop the interview", "end"},
			AllowedModes:      []string{"interview"},
			Preconditions:     []string{"ActiveQuestion 非空"},
			AllowedPlanShapes: [][]string{{"review.generate_feedback"}},
		},
		{
			Intent:            "oral_free_practice",
			Description:       "用户想随便练口语、日常英语或用英语聊一会儿；不创建正式练习记录。",
			Examples:          []string{"我想随便练练口语", "我们用英语聊一会儿", "I want to practice speaking casually."},
			AllowedModes:      []string{"conversation"},
			Preconditions:     []string{"不能改变面试进度", "不生成正式评分报告"},
			AllowedPlanShapes: [][]string{{"conversation.generate_reply"}},
		},
		{
			Intent:            "review_latest_practice",
			Description:       "用户想复盘最近一次练习或查看反馈。",
			Examples:          []string{"帮我复盘刚才的面试", "review my latest practice"},
			AllowedModes:      []string{"conversation", "interview"},
			AllowedPlanShapes: [][]string{{"review.generate_feedback"}},
		},
		{
			Intent:            "view_practice_history",
			Description:       "用户想查看历史练习或最近面试记录。",
			Examples:          []string{"查看历史", "最近面试记录", "show my practice history"},
			AllowedModes:      []string{"conversation", "interview"},
			Preconditions:     []string{"不创建新的 PracticeSession"},
			AllowedPlanShapes: [][]string{{"review.list_history"}},
		},
		{
			Intent:            "view_saved_mistakes",
			Description:       "用户想查看错题、mistakes 或复练项目列表。",
			Examples:          []string{"看看错题本", "show my mistakes", "最近有哪些复练项"},
			AllowedModes:      []string{"conversation", "interview"},
			Preconditions:     []string{"不创建新的 PracticeSession"},
			AllowedPlanShapes: [][]string{{"review.list_mistakes"}},
		},
		{
			Intent:            "view_mistake_context",
			Description:       "用户给出具体 mistake id，想查看一道错题上下文。",
			Examples:          []string{"打开 saved-mistake-session-q1"},
			RequiredSlots:     []string{"mistake_id"},
			AllowedModes:      []string{"conversation", "interview"},
			AllowedPlanShapes: [][]string{{"review.get_mistake_context"}},
		},
		{
			Intent:            "submit_mistake_repractice",
			Description:       "用户给出具体 mistake id 和新的复练答案。",
			Examples:          []string{"对 mistake-123，我的新答案是..."},
			RequiredSlots:     []string{"mistake_id", "answer_text"},
			AllowedModes:      []string{"conversation", "interview"},
			AllowedPlanShapes: [][]string{{"review.submit_mistake_repractice"}},
		},
	}
}

func FindIntentSpec(intent string) (IntentSpec, bool) {
	intent = strings.TrimSpace(intent)
	for _, spec := range IntentCatalog() {
		if spec.Intent == intent {
			return spec, true
		}
	}
	return IntentSpec{}, false
}

func RegisteredToolNames() map[string]bool {
	names := map[string]bool{}
	for _, spec := range IntentCatalog() {
		for _, shape := range spec.AllowedPlanShapes {
			for _, toolName := range shape {
				names[toolName] = true
			}
		}
	}
	return names
}

func RenderPlannerPromptCatalog() string {
	var builder strings.Builder
	for index, spec := range IntentCatalog() {
		fmt.Fprintf(&builder, "%d. Intent: %s\n", index+1, spec.Intent)
		fmt.Fprintf(&builder, "Description: %s\n", spec.Description)
		if len(spec.Examples) > 0 {
			fmt.Fprintf(&builder, "Examples: %s\n", strings.Join(spec.Examples, " | "))
		}
		if len(spec.RequiredSlots) > 0 {
			fmt.Fprintf(&builder, "RequiredSlots: %s\n", strings.Join(spec.RequiredSlots, ", "))
		}
		if spec.RequiresConfirmation {
			builder.WriteString("RequiresConfirmation: true\n")
		}
		if len(spec.AllowedModes) > 0 {
			fmt.Fprintf(&builder, "AllowedModes: %s\n", strings.Join(spec.AllowedModes, ", "))
		}
		if len(spec.Preconditions) > 0 {
			fmt.Fprintf(&builder, "Preconditions: %s\n", strings.Join(spec.Preconditions, " | "))
		}
		builder.WriteString("AllowedPlanShapes:\n")
		for _, shape := range spec.AllowedPlanShapes {
			fmt.Fprintf(&builder, "- %s\n", strings.Join(shape, " -> "))
		}
		builder.WriteString("\n")
	}
	return strings.TrimSpace(builder.String())
}

func ValidatePlanAgainstCatalog(plan Plan) error {
	if plan.Intent == "" || len(plan.Steps) == 0 {
		return errors.New("planner returned an empty plan")
	}
	spec, ok := FindIntentSpec(plan.Intent)
	if !ok {
		return fmt.Errorf("planner returned unsupported intent %q", plan.Intent)
	}
	allowedTools := RegisteredToolNames()
	for _, step := range plan.Steps {
		if !allowedTools[step.ToolName] {
			return fmt.Errorf("planner returned unregistered tool %q", step.ToolName)
		}
	}
	if !planMatchesAnyShape(plan, spec.AllowedPlanShapes) {
		return fmt.Errorf("planner returned invalid step sequence for %q", plan.Intent)
	}
	if err := validateRequiredSlots(plan, spec); err != nil {
		return err
	}
	return nil
}

func planMatchesAnyShape(plan Plan, shapes [][]string) bool {
	for _, shape := range shapes {
		if len(shape) != len(plan.Steps) {
			continue
		}
		matches := true
		for index := range shape {
			if shape[index] != plan.Steps[index].ToolName {
				matches = false
				break
			}
		}
		if matches {
			return true
		}
	}
	return false
}

func validateRequiredSlots(plan Plan, spec IntentSpec) error {
	missing := map[string]bool{}
	for _, slot := range plan.MissingSlots {
		missing[strings.TrimSpace(slot)] = true
	}
	for _, slot := range spec.RequiredSlots {
		if missing[slot] {
			if plan.Intent == "clarify_interview_requirements" && slot == "target_role" {
				continue
			}
			return fmt.Errorf("planner returned %q with missing required slot %q", plan.Intent, slot)
		}
		switch slot {
		case "target_role":
			if plan.Intent == "clarify_interview_requirements" {
				continue
			}
			if !planHasNonEmptyArgument(plan, "practice.create_plan", "role") {
				return fmt.Errorf("planner returned %q without required role argument", plan.Intent)
			}
		case "answer_text":
			if !planHasNonEmptyArgument(plan, "conversation.submit_turn", "answer_text") &&
				!planHasNonEmptyArgument(plan, "review.submit_mistake_repractice", "answer_text") {
				return fmt.Errorf("planner returned %q without required answer_text argument", plan.Intent)
			}
		case "mistake_id":
			if !planHasNonEmptyArgument(plan, "review.get_mistake_context", "mistake_id") &&
				!planHasNonEmptyArgument(plan, "review.submit_mistake_repractice", "mistake_id") {
				return fmt.Errorf("planner returned %q without required mistake_id argument", plan.Intent)
			}
		}
	}
	return nil
}

func planHasNonEmptyArgument(plan Plan, toolName, argument string) bool {
	for _, step := range plan.Steps {
		value, ok := step.Arguments[argument]
		if step.ToolName == toolName && ok && value != nil && strings.TrimSpace(fmt.Sprint(value)) != "" {
			return true
		}
	}
	return false
}

func IntentAllowsMode(intent, mode string) bool {
	if strings.TrimSpace(mode) == "" {
		return true
	}
	spec, ok := FindIntentSpec(intent)
	return ok && slices.Contains(spec.AllowedModes, strings.ToLower(strings.TrimSpace(mode)))
}
