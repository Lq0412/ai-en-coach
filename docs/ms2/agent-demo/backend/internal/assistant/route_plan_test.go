package assistant

import (
	"strings"
	"testing"
)

func TestRoutePlanValidatesOralPracticeWithoutIntentCatalog(t *testing.T) {
	if err := ValidatePlanAgainstCatalog(Plan{
		RouteType: "conversation",
		Steps: []PlanStep{{
			ToolName:  "conversation.generate_reply",
			Arguments: map[string]any{},
		}},
	}); err != nil {
		t.Fatal(err)
	}
}

func TestRoutePlanRejectsMissingInterviewTargetRole(t *testing.T) {
	err := ValidatePlanAgainstCatalog(Plan{
		RouteType: "tool_plan",
		Steps: []PlanStep{
			{ToolName: "preparation.get_confirmed_context", Arguments: map[string]any{"scenario": "PROGRAMMER_INTERVIEW"}},
			{ToolName: "practice.create_plan", Arguments: map[string]any{}},
			{ToolName: "practice.start_session", Arguments: map[string]any{}},
			{ToolName: "conversation.generate_next_question", Arguments: map[string]any{}},
		},
	})
	if err == nil || !strings.Contains(err.Error(), `required argument "role"`) {
		t.Fatalf("expected missing role validation error, got %v", err)
	}
}

func TestRoutePlanIgnoresDeprecatedCompatibilityIntent(t *testing.T) {
	err := ValidatePlanAgainstCatalog(Plan{
		Intent:    "deprecated_compatibility_intent",
		RouteType: "conversation",
		Steps: []PlanStep{{
			ToolName:  "conversation.generate_reply",
			Arguments: map[string]any{"reply_policy": "business_meeting_preparation"},
		}},
	})
	if err != nil {
		t.Fatalf("deprecated compatibility intent should not block route validation: %v", err)
	}
}

func TestRoutePlanFillsConversationFallbackStep(t *testing.T) {
	err := ValidatePlanAgainstCatalog(Plan{
		RouteType:  "conversation",
		Confidence: 0.82,
		Reason:     "用户想做商务会面前的口头准备",
	})
	if err != nil {
		t.Fatalf("conversation route without explicit step should validate with fallback step: %v", err)
	}
}

func TestInterviewRoleGuidanceDistinguishesJavaAndGo(t *testing.T) {
	java := interviewRoleGuidance("Java Backend Engineer")
	goRole := interviewRoleGuidance("Go Backend Engineer")
	if !strings.Contains(java, "JVM") || strings.Contains(java, "goroutines") {
		t.Fatalf("unexpected Java guidance: %s", java)
	}
	if !strings.Contains(goRole, "goroutines") || strings.Contains(goRole, "Spring Boot") {
		t.Fatalf("unexpected Go guidance: %s", goRole)
	}
}

func TestNormalizePlanForCatalogCompletesJavaInterviewStartChain(t *testing.T) {
	plan := Plan{
		Intent:          "scenario_practice",
		RouteType:       "tool_plan",
		Scenario:        "interview",
		ScenarioVariant: "java_backend_interview",
		Steps: []PlanStep{
			{ToolName: "scenario.retrieve_knowledge", Arguments: map[string]any{"scenario_variant": "java_backend_interview"}},
			{ToolName: "practice.create_plan", Arguments: map[string]any{"role": "Java Backend Engineer"}},
		},
	}

	NormalizePlanForCatalog(&plan, "java面试吧")

	if !hasPlanStep(plan, "preparation.get_confirmed_context") ||
		!hasPlanStep(plan, "practice.start_session") ||
		!hasPlanStep(plan, "conversation.generate_next_question") {
		t.Fatalf("interview start chain was not completed: %#v", plan.Steps)
	}
	if err := ValidatePlanAgainstCatalog(plan); err != nil {
		t.Fatalf("normalized Java interview plan should validate: %v", err)
	}
}
