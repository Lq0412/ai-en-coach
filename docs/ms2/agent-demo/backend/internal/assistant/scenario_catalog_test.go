package assistant

import (
	"strings"
	"testing"
)

func TestScenarioCatalogRendersAndDerivesKnowledgeTags(t *testing.T) {
	prompt := RenderPlannerScenarioCatalog()
	for _, expected := range []string{
		"ScenarioVariant: go_backend_interview",
		"KnowledgeTags: interview, go_backend",
		"ScenarioVariant: restaurant_ordering",
	} {
		if !strings.Contains(prompt, expected) {
			t.Fatalf("scenario catalog prompt missing %q: %s", expected, prompt)
		}
	}

	spec, ok := FindScenarioSpec("java_backend_interview")
	if !ok {
		t.Fatal("missing java backend scenario")
	}
	if strings.Join(spec.KnowledgeTags, ",") != "interview,java_backend" {
		t.Fatalf("unexpected java tags: %#v", spec.KnowledgeTags)
	}
}

func TestNormalizeScenarioPlanUsesUserMessageOverPlannerVariant(t *testing.T) {
	plan := Plan{
		Intent:          "scenario_practice",
		Scenario:        "interview",
		ScenarioVariant: "java_backend_interview",
		Steps: []PlanStep{
			{ToolName: "scenario.retrieve_knowledge", Arguments: map[string]any{}},
			{ToolName: "preparation.get_confirmed_context", Arguments: map[string]any{"scenario": "PROGRAMMER_INTERVIEW"}},
			{ToolName: "practice.create_plan", Arguments: map[string]any{"role": "Java Backend Engineer"}},
			{ToolName: "practice.start_session", Arguments: map[string]any{}},
			{ToolName: "conversation.generate_next_question", Arguments: map[string]any{}},
		},
	}
	NormalizeScenarioPlan(&plan, "我要 Go 后端面试")
	if plan.ScenarioVariant != "go_backend_interview" ||
		strings.Join(plan.KnowledgeTags, ",") != "interview,go_backend" {
		t.Fatalf("scenario was not normalized from user message: %#v", plan)
	}
	if plan.Steps[0].Arguments["scenario_variant"] != "go_backend_interview" ||
		plan.Steps[2].Arguments["scenario_id"] != "go_backend_interview" {
		t.Fatalf("scenario defaults were not applied to steps: %#v", plan.Steps)
	}
}
