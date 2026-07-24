package assistant

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestToolCatalogRegistersExpectedReviewOperations(t *testing.T) {
	for _, name := range []string{
		"review.list_mistakes",
		"review.get_mistake_context",
		"review.submit_mistake_repractice",
	} {
		operation, ok := FindOperation(name)
		if !ok {
			t.Fatalf("operation %s is not registered", name)
		}
		if operation.Package != "review" {
			t.Fatalf("operation %s package = %q, want review", name, operation.Package)
		}
	}
}

func TestValidatePlanAgainstToolCatalogRejectsUnknownArgument(t *testing.T) {
	err := ValidatePlanAgainstToolCatalog(Plan{Steps: []PlanStep{{
		ToolName:  "review.get_mistake_context",
		Arguments: map[string]any{"mistake": "Q1"},
	}}})
	if err == nil {
		t.Fatal("expected unsupported argument error")
	}
}

func TestValidatePlanAgainstToolCatalogRejectsMissingRequiredArgument(t *testing.T) {
	err := ValidatePlanAgainstToolCatalog(Plan{Steps: []PlanStep{{
		ToolName:  "review.submit_mistake_repractice",
		Arguments: map[string]any{"question_ref": "Q1"},
	}}})
	if err == nil {
		t.Fatal("expected missing required argument error")
	}
}

func TestValidatePlanAgainstCatalogAcceptsMistakeQuestionRef(t *testing.T) {
	err := ValidatePlanAgainstCatalog(Plan{
		Intent: "view_mistake_context",
		Steps: []PlanStep{{
			ToolName:  "review.get_mistake_context",
			Arguments: map[string]any{"question_ref": "Q1"},
		}},
	})
	if err != nil {
		t.Fatalf("question_ref plan should validate: %v", err)
	}
}

func TestValidatePlanAgainstCatalogAcceptsConversationRoutePolicy(t *testing.T) {
	err := ValidatePlanAgainstCatalog(Plan{
		RouteType: "conversation",
		Steps: []PlanStep{{
			ToolName: "conversation.generate_reply",
			Arguments: map[string]any{
				"reply_policy": "business_meeting_preparation",
			},
		}},
	})
	if err != nil {
		t.Fatalf("conversation route should validate: %v", err)
	}
}

func TestValidatePlanAgainstCatalogRejectsConversationRouteStateChange(t *testing.T) {
	err := ValidatePlanAgainstCatalog(Plan{
		RouteType: "unsupported",
		Steps: []PlanStep{{
			ToolName:  "practice.create_plan",
			Arguments: map[string]any{"role": "Business Meeting"},
		}},
		UnsupportedRequest: &UnsupportedRequest{RequestedCapability: "business_meeting_scenario"},
	})
	if err == nil || !strings.Contains(err.Error(), "non-conversation steps") {
		t.Fatalf("expected unsupported route to reject state changes, got %v", err)
	}
}

func TestValidatePlanAgainstCatalogAcceptsScenarioVariantInToolArguments(t *testing.T) {
	err := ValidatePlanAgainstCatalog(Plan{
		RouteType: "tool_plan",
		Steps: []PlanStep{
			{ToolName: "scenario.retrieve_knowledge", Arguments: map[string]any{"scenario_variant": "go_backend_interview"}},
			{ToolName: "preparation.get_confirmed_context", Arguments: map[string]any{"scenario": "PROGRAMMER_INTERVIEW"}},
			{ToolName: "practice.create_plan", Arguments: map[string]any{"role": "Go Backend Engineer"}},
			{ToolName: "practice.start_session", Arguments: map[string]any{}},
			{ToolName: "conversation.generate_next_question", Arguments: map[string]any{}},
		},
	})
	if err != nil {
		t.Fatalf("route-first supported scenario should validate: %v", err)
	}
}

func TestPlanUnmarshalAcceptsLegacyMissingSlots(t *testing.T) {
	var plan Plan
	err := json.Unmarshal([]byte(`{"RouteType":"clarification","MissingSlots":["target_role"],"Steps":[{"ToolName":"conversation.generate_reply","Arguments":{}}]}`), &plan)
	if err != nil {
		t.Fatalf("legacy missing slots should decode: %v", err)
	}
	if len(plan.MissingSlots) != 1 || plan.MissingSlots[0].Name != "target_role" {
		t.Fatalf("unexpected missing slots: %#v", plan.MissingSlots)
	}
}
