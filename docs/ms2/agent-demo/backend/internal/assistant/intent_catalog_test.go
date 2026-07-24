package assistant

import (
	"strings"
	"testing"
)

func TestIntentCatalogRendersPlannerPromptAndValidatesOralPractice(t *testing.T) {
	prompt := RenderPlannerPromptCatalog()
	for _, expected := range []string{
		"Intent: oral_free_practice",
		"conversation.generate_reply",
		"Intent: start_mock_interview",
	} {
		if !strings.Contains(prompt, expected) {
			t.Fatalf("catalog prompt missing %q: %s", expected, prompt)
		}
	}

	if err := ValidatePlanAgainstCatalog(Plan{
		Intent: "oral_free_practice",
		Steps: []PlanStep{{
			ToolName:  "conversation.generate_reply",
			Arguments: map[string]any{},
		}},
	}); err != nil {
		t.Fatal(err)
	}
}

func TestIntentCatalogRejectsMissingInterviewTargetRole(t *testing.T) {
	err := ValidatePlanAgainstCatalog(Plan{
		Intent: "start_mock_interview",
		Steps: []PlanStep{
			{ToolName: "preparation.get_confirmed_context", Arguments: map[string]any{"scenario": "PROGRAMMER_INTERVIEW"}},
			{ToolName: "practice.create_plan", Arguments: map[string]any{}},
			{ToolName: "practice.start_session", Arguments: map[string]any{}},
			{ToolName: "conversation.generate_next_question", Arguments: map[string]any{}},
		},
	})
	if err == nil || !strings.Contains(err.Error(), "required role") {
		t.Fatalf("expected missing role validation error, got %v", err)
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
