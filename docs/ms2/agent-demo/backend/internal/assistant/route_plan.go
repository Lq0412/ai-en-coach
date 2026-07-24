package assistant

import (
	"errors"
	"fmt"
	"strings"
)

type UnsupportedScenarioVariantError struct {
	Variant string
}

func (e UnsupportedScenarioVariantError) Error() string {
	return fmt.Sprintf("planner returned unsupported scenario_variant %q", e.Variant)
}

func ValidatePlanAgainstCatalog(plan Plan) error {
	NormalizeRoutePlan(&plan)
	if len(plan.Steps) == 0 {
		return errors.New("planner returned an empty plan")
	}
	if err := ValidateRouteType(plan); err != nil {
		return err
	}
	if err := ValidatePlanAgainstToolCatalog(plan); err != nil {
		return err
	}
	if err := validateRoutePlanShape(plan); err != nil {
		return err
	}
	if err := validateScenarioArguments(plan); err != nil {
		return err
	}
	if err := validateStateChangingToolShape(plan); err != nil {
		return err
	}
	return nil
}

func NormalizePlanForCatalog(plan *Plan, userMessage string) {
	if plan == nil {
		return
	}
	NormalizeRoutePlan(plan)
	NormalizeScenarioPlan(plan, userMessage)
	ensureInterviewStartToolChain(plan)
	NormalizeRoutePlan(plan)
}

func NormalizeRoutePlan(plan *Plan) {
	if plan == nil {
		return
	}
	plan.RouteType = strings.ToLower(strings.TrimSpace(plan.RouteType))
	if plan.Intent == "deprecated_compatibility_intent" {
		plan.Intent = ""
	}
	if plan.RouteType == "" {
		plan.RouteType = routeTypeFromLegacyIntent(plan.Intent)
	}
	ensureRouteFallbackStep(plan)
	for index := range plan.Steps {
		if plan.Steps[index].Arguments == nil {
			plan.Steps[index].Arguments = map[string]any{}
		}
	}
	normalizeScenarioStepArguments(plan)
	if strings.TrimSpace(plan.Intent) == "" {
		plan.Intent = intentFromRouteSteps(*plan)
	}
}

func ensureRouteFallbackStep(plan *Plan) {
	if plan == nil || len(plan.Steps) > 0 {
		return
	}
	switch plan.RouteType {
	case "conversation", "clarification", "ambiguous", "unsupported":
		plan.Steps = []PlanStep{{
			ToolName:  "conversation.generate_reply",
			Arguments: map[string]any{},
		}}
	}
}

func routeTypeFromLegacyIntent(intent string) string {
	switch strings.TrimSpace(intent) {
	case "clarify_interview_requirements":
		return "clarification"
	case "free_conversation", "oral_free_practice":
		return "conversation"
	default:
		return "tool_plan"
	}
}

func intentFromRouteSteps(plan Plan) string {
	if len(plan.Steps) == 1 && plan.Steps[0].ToolName == "conversation.generate_reply" {
		switch plan.RouteType {
		case "clarification":
			return "clarify_interview_requirements"
		case "conversation":
			if isOralPracticePolicy(plan.Steps[0].Arguments["reply_policy"]) {
				return "oral_free_practice"
			}
			return "free_conversation"
		default:
			return "free_conversation"
		}
	}
	if hasPlanStep(plan, "conversation.submit_turn") {
		return "submit_interview_answer"
	}
	if hasPlanStep(plan, "scenario.retrieve_knowledge") {
		return "scenario_practice"
	}
	if hasPlanStep(plan, "practice.create_plan") {
		return "start_mock_interview"
	}
	if hasPlanStep(plan, "review.list_history") {
		return "view_practice_history"
	}
	if hasPlanStep(plan, "review.list_mistakes") {
		return "view_saved_mistakes"
	}
	if hasPlanStep(plan, "review.get_mistake_context") {
		return "view_mistake_context"
	}
	if hasPlanStep(plan, "review.submit_mistake_repractice") {
		return "submit_mistake_repractice"
	}
	if hasPlanStep(plan, "review.generate_feedback") {
		return "review_latest_practice"
	}
	return ""
}

func isOralPracticePolicy(value any) bool {
	policy := strings.ToLower(strings.TrimSpace(fmt.Sprint(value)))
	return strings.Contains(policy, "oral") || strings.Contains(policy, "speaking")
}

func ValidateRouteType(plan Plan) error {
	switch plan.RouteType {
	case "tool_plan", "clarification", "ambiguous", "unsupported", "conversation":
		return nil
	default:
		return fmt.Errorf("planner returned unsupported route_type %q", plan.RouteType)
	}
}

func validateRoutePlanShape(plan Plan) error {
	switch plan.RouteType {
	case "clarification":
		if len(plan.MissingSlots) == 0 {
			return errors.New("planner returned clarification without missing slots")
		}
		return validateConversationOnlyRoute(plan)
	case "ambiguous":
		if plan.Ambiguity == nil || len(plan.Ambiguity.Candidates) == 0 || strings.TrimSpace(plan.Ambiguity.Question) == "" {
			return errors.New("planner returned ambiguous route without ambiguity candidates and question")
		}
		for _, candidate := range plan.Ambiguity.Candidates {
			if _, ok := FindOperation(candidate); !ok {
				return fmt.Errorf("planner returned ambiguity candidate for unregistered operation %q", candidate)
			}
		}
		return validateConversationOnlyRoute(plan)
	case "unsupported":
		if plan.UnsupportedRequest == nil || strings.TrimSpace(plan.UnsupportedRequest.RequestedCapability) == "" {
			return errors.New("planner returned unsupported route without unsupported request")
		}
		return validateConversationOnlyRoute(plan)
	case "conversation":
		return validateConversationOnlyRoute(plan)
	default:
		return nil
	}
}

func validateConversationOnlyRoute(plan Plan) error {
	if len(plan.Steps) != 1 || plan.Steps[0].ToolName != "conversation.generate_reply" {
		return fmt.Errorf("planner returned %s route with non-conversation steps", plan.RouteType)
	}
	return nil
}

func validateScenarioArguments(plan Plan) error {
	for _, step := range plan.Steps {
		if step.ToolName != "scenario.retrieve_knowledge" {
			continue
		}
		variant := strings.TrimSpace(fmt.Sprint(step.Arguments["scenario_variant"]))
		if variant == "" {
			variant = strings.TrimSpace(plan.ScenarioVariant)
		}
		spec, ok := FindScenarioSpec(variant)
		if !ok {
			return UnsupportedScenarioVariantError{Variant: variant}
		}
		if strings.TrimSpace(plan.Scenario) != "" && strings.TrimSpace(plan.Scenario) != spec.Scenario {
			return fmt.Errorf("planner returned scenario %q for variant %q, want %q", plan.Scenario, spec.ID, spec.Scenario)
		}
	}
	return nil
}

func validateStateChangingToolShape(plan Plan) error {
	if plan.RouteType != "tool_plan" {
		return nil
	}
	if hasPlanStep(plan, "practice.start_session") && !hasPlanStep(plan, "practice.create_plan") {
		return errors.New("planner returned practice.start_session without practice.create_plan")
	}
	if hasPlanStep(plan, "practice.create_plan") && !hasPlanStep(plan, "practice.start_session") {
		return errors.New("planner returned practice.create_plan without practice.start_session")
	}
	if hasPlanStep(plan, "practice.create_plan") && !hasPlanStep(plan, "conversation.generate_next_question") {
		return errors.New("planner returned practice.create_plan without next question generation")
	}
	if hasPlanStep(plan, "practice.apply_turn_outcome") && !hasPlanStep(plan, "conversation.submit_turn") {
		return errors.New("planner returned turn outcome without submit_turn")
	}
	return nil
}

func ensureInterviewStartToolChain(plan *Plan) {
	if plan == nil || plan.RouteType != "tool_plan" || !hasPlanStep(*plan, "practice.create_plan") {
		return
	}
	createIndex := firstPlanStepIndex(*plan, "practice.create_plan")
	if createIndex < 0 {
		return
	}
	if !hasPlanStep(*plan, "practice.start_session") {
		insertPlanStepAfter(plan, createIndex, PlanStep{ToolName: "practice.start_session", Arguments: map[string]any{}})
	}
	startIndex := firstPlanStepIndex(*plan, "practice.start_session")
	if startIndex < 0 {
		startIndex = createIndex
	}
	if !hasPlanStep(*plan, "conversation.generate_next_question") {
		insertPlanStepAfter(plan, startIndex, PlanStep{ToolName: "conversation.generate_next_question", Arguments: map[string]any{}})
	}
}

func firstPlanStepIndex(plan Plan, toolName string) int {
	for index, step := range plan.Steps {
		if step.ToolName == toolName {
			return index
		}
	}
	return -1
}

func insertPlanStepAfter(plan *Plan, index int, step PlanStep) {
	if plan == nil {
		return
	}
	if step.Arguments == nil {
		step.Arguments = map[string]any{}
	}
	insertAt := index + 1
	if insertAt < 0 {
		insertAt = 0
	}
	if insertAt > len(plan.Steps) {
		insertAt = len(plan.Steps)
	}
	plan.Steps = append(plan.Steps, PlanStep{})
	copy(plan.Steps[insertAt+1:], plan.Steps[insertAt:])
	plan.Steps[insertAt] = step
}

func normalizeScenarioStepArguments(plan *Plan) {
	if plan == nil {
		return
	}
	for index := range plan.Steps {
		step := &plan.Steps[index]
		if step.ToolName != "scenario.retrieve_knowledge" {
			continue
		}
		if strings.TrimSpace(fmt.Sprint(step.Arguments["scenario_variant"])) == "" && strings.TrimSpace(plan.ScenarioVariant) != "" {
			step.Arguments["scenario_variant"] = strings.TrimSpace(plan.ScenarioVariant)
		}
	}
}
