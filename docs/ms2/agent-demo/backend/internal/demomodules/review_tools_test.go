package demomodules

import (
	"context"
	"testing"

	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant"
)

func TestReviewToolReturnsStructuredFields(t *testing.T) {
	ctx := context.Background()
	state := assistant.NewDemoState()
	registry := NewRegistry(state, &answerCoachCaptureGenerator{})
	executeReviewFlow(t, ctx, registry)

	result, err := registry.Execute(ctx, assistant.ToolInvocation{
		ToolName:  "review.generate_feedback",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatal(err)
	}
	output := result.Output
	if output["summary"] == "" || output["practice_session_id"] == "" {
		t.Fatalf("missing compatibility fields: %#v", output)
	}
	if _, ok := output["review_result"].(map[string]any); !ok {
		t.Fatalf("missing review_result: %#v", output)
	}
	if mistakes, ok := output["mistakes"].([]map[string]any); !ok || len(mistakes) == 0 ||
		mistakes[0]["original_text"] == "" || mistakes[0]["repractice_status"] != "pending" {
		t.Fatalf("missing mistakes: %#v", output["mistakes"])
	}
	if targets, ok := output["repractice_targets"].([]map[string]any); !ok || len(targets) == 0 ||
		targets[0]["focus"] == "" {
		t.Fatalf("missing repractice targets: %#v", output["repractice_targets"])
	}
}

func TestReviewHistoryToolReturnsPracticeRecords(t *testing.T) {
	ctx := context.Background()
	state := assistant.NewDemoState()
	registry := NewRegistry(state, &answerCoachCaptureGenerator{})
	executeReviewFlow(t, ctx, registry)
	if _, err := registry.Execute(ctx, assistant.ToolInvocation{ToolName: "review.generate_feedback", Arguments: map[string]any{}}); err != nil {
		t.Fatal(err)
	}

	result, err := registry.Execute(ctx, assistant.ToolInvocation{
		ToolName:  "review.list_history",
		Arguments: map[string]any{"limit": 3},
	})
	if err != nil {
		t.Fatal(err)
	}
	items, ok := result.Output["items"].([]map[string]any)
	if !ok || len(items) != 1 {
		t.Fatalf("unexpected history output: %#v", result.Output)
	}
	item := items[0]
	if item["practice_session_id"] == "" || item["scenario"] != "Go Backend Engineer" ||
		item["has_feedback"] != true || item["repractice_focus"] == "" {
		t.Fatalf("history item missing review data: %#v", item)
	}
}

func TestReviewMistakeToolsSaveListAndRepractice(t *testing.T) {
	ctx := context.Background()
	state := assistant.NewDemoState()
	registry := NewRegistry(state, &answerCoachCaptureGenerator{})
	executeReviewFlow(t, ctx, registry)
	if _, err := registry.Execute(ctx, assistant.ToolInvocation{ToolName: "review.generate_feedback", Arguments: map[string]any{}}); err != nil {
		t.Fatal(err)
	}
	sessionID := state.State().Sessions[0].ID

	saved, err := registry.Execute(ctx, assistant.ToolInvocation{
		ToolName: "review.save_mistake",
		Arguments: map[string]any{
			"practice_session_id": sessionID,
			"question_index":      0,
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	card, ok := saved.Output["card"].(map[string]any)
	if !ok || card["mistake_id"] == "" || card["question_text"] == "" {
		t.Fatalf("missing saved mistake card: %#v", saved.Output)
	}

	listed, err := registry.Execute(ctx, assistant.ToolInvocation{
		ToolName:  "review.list_mistakes",
		Arguments: map[string]any{"limit": 3},
	})
	if err != nil {
		t.Fatal(err)
	}
	items, ok := listed.Output["items"].([]map[string]any)
	if !ok || len(items) != 1 || items[0]["mistake_id"] != card["mistake_id"] {
		t.Fatalf("unexpected mistake list: %#v", listed.Output)
	}

	repractice, err := registry.Execute(ctx, assistant.ToolInvocation{
		ToolName: "review.submit_mistake_repractice",
		Arguments: map[string]any{
			"mistake_id":  card["mistake_id"],
			"answer_text": "In that Go API project, I measured latency, changed the worker design, and improved request time by 20 percent.",
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if repractice.Output["summary"] == "" {
		t.Fatalf("missing repractice summary: %#v", repractice.Output)
	}
}

func executeReviewFlow(t *testing.T, ctx context.Context, registry *Registry) {
	t.Helper()
	execute := func(tool string, arguments map[string]any) {
		t.Helper()
		if _, err := registry.Execute(ctx, assistant.ToolInvocation{ToolName: tool, Arguments: arguments}); err != nil {
			t.Fatalf("execute %s: %v", tool, err)
		}
	}
	execute("practice.create_plan", map[string]any{"role": "Go Backend Engineer", "max_turns": 3, "duration_minutes": 5})
	execute("practice.start_session", map[string]any{})
	execute("conversation.generate_next_question", map[string]any{})
	execute("conversation.submit_turn", map[string]any{
		"answer_text":      "I built APIs in Go and improved latency by 20%.",
		"interaction_mode": "TEXT",
	})
	execute("practice.apply_turn_outcome", map[string]any{"answer_validity": "VALID"})
}
