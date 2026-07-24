package assistant

import (
	"fmt"
	"strings"
)

type ScenarioSpec struct {
	ID               string
	Scenario         string
	Title            string
	Description      string
	Examples         []string
	RequiredSlots    []string
	KnowledgeTags    []string
	DefaultArguments map[string]any
	AllowedModes     []string
	Preconditions    []string
}

func ScenarioCatalog() []ScenarioSpec {
	return []ScenarioSpec{
		{
			ID:            "go_backend_interview",
			Scenario:      "interview",
			Title:         "Go 后端面试",
			Description:   "用户想进行 Go/Golang 后端英文模拟面试。",
			Examples:      []string{"我要 Go 后端面试", "Practice a Golang backend interview"},
			RequiredSlots: []string{"target_role"},
			KnowledgeTags: []string{"interview", "go_backend"},
			DefaultArguments: map[string]any{
				"role": "Go Backend Engineer", "max_turns": DefaultInterviewMaxTurns,
				"duration_minutes": DefaultInterviewDurationMinutes,
			},
			AllowedModes:  []string{"conversation", "interview"},
			Preconditions: []string{"启动前需要用户确认创建新的 PracticeSession"},
		},
		{
			ID:            "java_backend_interview",
			Scenario:      "interview",
			Title:         "Java 后端面试",
			Description:   "用户想进行 Java 后端英文模拟面试。",
			Examples:      []string{"我要 Java 后端面试", "Practice a Java backend interview"},
			RequiredSlots: []string{"target_role"},
			KnowledgeTags: []string{"interview", "java_backend"},
			DefaultArguments: map[string]any{
				"role": "Java Backend Engineer", "max_turns": DefaultInterviewMaxTurns,
				"duration_minutes": DefaultInterviewDurationMinutes,
			},
			AllowedModes:  []string{"conversation", "interview"},
			Preconditions: []string{"启动前需要用户确认创建新的 PracticeSession"},
		},
		{
			ID:            "frontend_interview",
			Scenario:      "interview",
			Title:         "前端面试",
			Description:   "用户想进行前端英文模拟面试。",
			Examples:      []string{"我要前端面试", "Practice a frontend interview"},
			RequiredSlots: []string{"target_role"},
			KnowledgeTags: []string{"interview", "frontend"},
			DefaultArguments: map[string]any{
				"role": "Frontend Engineer", "max_turns": DefaultInterviewMaxTurns,
				"duration_minutes": DefaultInterviewDurationMinutes,
			},
			AllowedModes: []string{"conversation", "interview"},
		},
		{
			ID:            "product_manager_interview",
			Scenario:      "interview",
			Title:         "产品经理面试",
			Description:   "用户想进行产品经理英文模拟面试。",
			Examples:      []string{"我要产品经理面试", "Practice a product manager interview"},
			RequiredSlots: []string{"target_role"},
			KnowledgeTags: []string{"interview", "product_manager"},
			DefaultArguments: map[string]any{
				"role": "Product Manager", "max_turns": DefaultInterviewMaxTurns,
				"duration_minutes": DefaultInterviewDurationMinutes,
			},
			AllowedModes: []string{"conversation", "interview"},
		},
		{
			ID:            "restaurant_ordering",
			Scenario:      "daily_life",
			Title:         "餐厅点餐",
			Description:   "用户想练习在餐厅点餐、加菜、询问忌口或结账。",
			Examples:      []string{"我想练餐厅点餐", "Practice ordering food in English"},
			KnowledgeTags: []string{"daily_english", "restaurant", "ordering_food"},
			AllowedModes:  []string{"conversation"},
			Preconditions: []string{"首期不创建面试类 PracticeSession"},
		},
		{
			ID:            "apartment_rental",
			Scenario:      "life_abroad",
			Title:         "租房沟通",
			Description:   "用户想练习看房、问租金、押金、合同和室友规则。",
			Examples:      []string{"练一下租房英语", "Practice apartment viewing"},
			KnowledgeTags: []string{"daily_english", "housing", "rental"},
			AllowedModes:  []string{"conversation"},
			Preconditions: []string{"首期不创建面试类 PracticeSession"},
		},
	}
}

func FindScenarioSpec(id string) (ScenarioSpec, bool) {
	id = strings.TrimSpace(id)
	for _, spec := range ScenarioCatalog() {
		if spec.ID == id {
			return spec, true
		}
	}
	return ScenarioSpec{}, false
}

func RenderPlannerScenarioCatalog() string {
	var builder strings.Builder
	for index, spec := range ScenarioCatalog() {
		fmt.Fprintf(&builder, "%d. ScenarioVariant: %s\n", index+1, spec.ID)
		fmt.Fprintf(&builder, "Scenario: %s\n", spec.Scenario)
		fmt.Fprintf(&builder, "Title: %s\n", spec.Title)
		fmt.Fprintf(&builder, "Description: %s\n", spec.Description)
		if len(spec.Examples) > 0 {
			fmt.Fprintf(&builder, "Examples: %s\n", strings.Join(spec.Examples, " | "))
		}
		if len(spec.RequiredSlots) > 0 {
			fmt.Fprintf(&builder, "RequiredSlots: %s\n", strings.Join(spec.RequiredSlots, ", "))
		}
		fmt.Fprintf(&builder, "KnowledgeTags: %s\n", strings.Join(spec.KnowledgeTags, ", "))
		if len(spec.Preconditions) > 0 {
			fmt.Fprintf(&builder, "Preconditions: %s\n", strings.Join(spec.Preconditions, " | "))
		}
		builder.WriteString("\n")
	}
	return strings.TrimSpace(builder.String())
}

func ScenarioVariantFromRole(role string) string {
	normalized := strings.ToLower(strings.TrimSpace(role))
	switch {
	case strings.Contains(normalized, "go") || strings.Contains(normalized, "golang"):
		return "go_backend_interview"
	case strings.Contains(normalized, "java"):
		return "java_backend_interview"
	case strings.Contains(normalized, "frontend") || strings.Contains(normalized, "front-end"):
		return "frontend_interview"
	case strings.Contains(normalized, "product manager"):
		return "product_manager_interview"
	default:
		return ""
	}
}

func ScenarioVariantFromMessage(message string) string {
	role := detectTargetRole(message)
	if variant := ScenarioVariantFromRole(role); variant != "" {
		return variant
	}
	text := strings.ToLower(strings.TrimSpace(message))
	switch {
	case strings.Contains(text, "餐厅") || strings.Contains(text, "点餐") || strings.Contains(text, "ordering food"):
		return "restaurant_ordering"
	case strings.Contains(text, "租房") || strings.Contains(text, "看房") || strings.Contains(text, "apartment") || strings.Contains(text, "rental"):
		return "apartment_rental"
	default:
		return ""
	}
}

func NormalizeScenarioPlan(plan *Plan, userMessage string) {
	if plan == nil {
		return
	}
	if plan.Intent == "start_mock_interview" {
		role := targetRoleFromPlan(*plan)
		if explicitRole := detectTargetRole(userMessage); explicitRole != "" {
			role = explicitRole
		}
		if variant := ScenarioVariantFromRole(role); variant != "" {
			plan.Scenario = "interview"
			plan.ScenarioVariant = variant
		}
	}
	if plan.Intent == "scenario_practice" {
		if explicitVariant := ScenarioVariantFromMessage(userMessage); explicitVariant != "" {
			plan.ScenarioVariant = explicitVariant
		}
		if strings.TrimSpace(plan.ScenarioVariant) == "" {
			plan.ScenarioVariant = ScenarioVariantFromMessage(userMessage)
		}
	}
	spec, ok := FindScenarioSpec(plan.ScenarioVariant)
	if !ok {
		return
	}
	plan.Scenario = spec.Scenario
	plan.KnowledgeTags = append([]string(nil), spec.KnowledgeTags...)
	ensureScenarioInterviewPreparationStep(plan, spec)
	applyScenarioStepDefaults(plan, spec)
}

func ensureScenarioInterviewPreparationStep(plan *Plan, spec ScenarioSpec) {
	if spec.Scenario != "interview" || hasPlanStep(*plan, "preparation.get_confirmed_context") {
		return
	}
	insertAt := 0
	for index, step := range plan.Steps {
		if step.ToolName == "scenario.retrieve_knowledge" {
			insertAt = index + 1
			break
		}
	}
	step := PlanStep{ToolName: "preparation.get_confirmed_context", Arguments: map[string]any{}}
	plan.Steps = append(plan.Steps, PlanStep{})
	copy(plan.Steps[insertAt+1:], plan.Steps[insertAt:])
	plan.Steps[insertAt] = step
}

func hasPlanStep(plan Plan, toolName string) bool {
	for _, step := range plan.Steps {
		if step.ToolName == toolName {
			return true
		}
	}
	return false
}

func applyScenarioStepDefaults(plan *Plan, spec ScenarioSpec) {
	for index := range plan.Steps {
		step := &plan.Steps[index]
		if step.Arguments == nil {
			step.Arguments = map[string]any{}
		}
		switch step.ToolName {
		case "scenario.retrieve_knowledge":
			step.Arguments["scenario_variant"] = spec.ID
			step.Arguments["tags"] = append([]string(nil), spec.KnowledgeTags...)
		case "preparation.get_confirmed_context":
			if spec.Scenario == "interview" {
				step.Arguments["scenario"] = "PROGRAMMER_INTERVIEW"
				if role, ok := spec.DefaultArguments["role"]; ok {
					step.Arguments["target_role"] = role
				}
			}
		case "practice.create_plan":
			step.Arguments["scenario_id"] = spec.ID
			for key, value := range spec.DefaultArguments {
				if _, ok := step.Arguments[key]; !ok || strings.TrimSpace(fmt.Sprint(step.Arguments[key])) == "" {
					step.Arguments[key] = value
				}
			}
		}
	}
}
