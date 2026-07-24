package assistant

import "testing"

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
