package review

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant"
)

func TestAnalyzeGeneratesStructuredReview(t *testing.T) {
	state := assistant.NewDemoState()
	seedActiveSession(t, state, []string{
		"Tell me about a backend project.",
	}, []string{
		"In my last project, I designed a Go API for payment reconciliation. First, I compared latency and maintainability, then I implemented async workers and reduced processing time by 30%. The result was more stable daily reporting.",
	})

	feedback, err := NewService(state, nil).Analyze(context.Background(), AnalyzeCommand{})
	if err != nil {
		t.Fatal(err)
	}
	if feedback.Summary == "" || feedback.Result.ID == "" {
		t.Fatalf("missing feedback result: %#v", feedback)
	}
	if feedback.Result.EvidenceStatus != EvidenceSufficient {
		t.Fatalf("evidence status = %q", feedback.Result.EvidenceStatus)
	}
	if feedback.Result.RubricID != RubricTechnicalInterview || feedback.Result.ScenarioType != ScenarioTechnicalInterview {
		t.Fatalf("unexpected rubric metadata: %#v", feedback.Result)
	}
	if feedback.Result.Scores.Overall == 0 {
		t.Fatalf("missing score breakdown: %#v", feedback.Result.Scores)
	}
	if len(feedback.Result.FeedbackItems) == 0 || feedback.Result.FeedbackItems[0].Evidence == "" {
		t.Fatalf("missing evidence-backed feedback: %#v", feedback.Result.FeedbackItems)
	}
	if len(feedback.Result.Mistakes) == 0 {
		t.Fatalf("missing mistakes: %#v", feedback.Result)
	}
	mistake := feedback.Result.Mistakes[0]
	if mistake.Type == "" || mistake.OriginalText == "" || mistake.Issue == "" ||
		mistake.Suggestion == "" || mistake.RepracticeStatus != "pending" {
		t.Fatalf("incomplete mistake: %#v", mistake)
	}
	if len(feedback.Result.RepracticeTargets) == 0 || feedback.Result.RepracticeTargets[0].Status != "ready" {
		t.Fatalf("missing repractice target: %#v", feedback.Result.RepracticeTargets)
	}

	snapshot := state.State()
	if snapshot.ActiveQuestion != "" || len(snapshot.Sessions) != 1 {
		t.Fatalf("session was not completed exactly once: %#v", snapshot)
	}
	if snapshot.Sessions[0].Feedback == "" {
		t.Fatalf("completed session did not save feedback: %#v", snapshot.Sessions[0])
	}
}

func TestAnalyzeMarksInsufficientEvidence(t *testing.T) {
	state := assistant.NewDemoState()
	seedActiveSession(t, state, []string{"Tell me about yourself."}, nil)

	feedback, err := NewService(state, nil).Analyze(context.Background(), AnalyzeCommand{})
	if err != nil {
		t.Fatal(err)
	}
	if feedback.Result.EvidenceStatus != EvidenceInsufficient {
		t.Fatalf("evidence status = %q", feedback.Result.EvidenceStatus)
	}
	if !strings.Contains(feedback.Summary, "依据不足") {
		t.Fatalf("summary should explain insufficient evidence: %q", feedback.Summary)
	}
	if feedback.Result.Mistakes[0].Type != "evidence_gap" ||
		feedback.Result.RepracticeTargets[0].Status != "blocked_insufficient_evidence" {
		t.Fatalf("unexpected insufficient review: %#v", feedback.Result)
	}
}

func TestAnalyzeWithoutAnySessionKeepsSessionIDEmpty(t *testing.T) {
	feedback, err := NewService(assistant.NewDemoState(), nil).Analyze(context.Background(), AnalyzeCommand{})
	if err != nil {
		t.Fatal(err)
	}
	if feedback.SessionID != "" {
		t.Fatalf("session id = %q, want empty", feedback.SessionID)
	}
	if feedback.Result.ID != "review-unavailable" || feedback.Result.EvidenceStatus != EvidenceInsufficient {
		t.Fatalf("unexpected empty review result: %#v", feedback.Result)
	}
}

func TestAnalyzeIsIdempotentForCompletedSession(t *testing.T) {
	state := assistant.NewDemoState()
	seedActiveSession(t, state, []string{"How do you make tradeoffs?"}, []string{
		"I compare user impact, delivery risk, and maintenance cost, then explain the trade-off to stakeholders.",
	})
	service := NewService(state, nil)
	if _, err := service.Analyze(context.Background(), AnalyzeCommand{}); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Analyze(context.Background(), AnalyzeCommand{}); err != nil {
		t.Fatal(err)
	}
	if got := len(state.State().Sessions); got != 1 {
		t.Fatalf("sessions = %d, want 1", got)
	}
}

func TestListHistoryProjectsReviewMetadata(t *testing.T) {
	state := assistant.NewDemoState()
	seedCompletedSession(t, state, "session-1", "Go Backend Engineer", "Feedback 1", []string{
		"I built a worker system but did not mention the result.",
	})
	seedCompletedSession(t, state, "session-2", "Product Manager", "Feedback 2", []string{
		"I prioritized retention after reviewing cohort data and improved activation by 12%.",
	})

	items, err := NewService(state, nil).ListHistory(context.Background(), HistoryQuery{Limit: 1})
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("items = %d, want 1", len(items))
	}
	item := items[0]
	if item.PracticeSessionID != "session-2" || !item.HasFeedback ||
		item.ReviewID == "" || item.RepracticeFocus == "" || item.EndedAt == nil {
		t.Fatalf("history item missing metadata: %#v", item)
	}
}

func seedActiveSession(t *testing.T, state *assistant.DemoState, questions, answers []string) {
	t.Helper()
	_, err := state.Transact(func(snapshot *assistant.RuntimeSnapshot, savedAnswers *[]string) (assistant.ToolResult, error) {
		startedAt := time.Now().UTC().Add(-time.Minute)
		*snapshot = assistant.RuntimeSnapshot{
			CurrentSessionID:       "session-review-test",
			ActiveQuestion:         "active question",
			CompletedQuestionCount: len(answers),
			TargetRole:             "Go Backend Engineer",
			Interviewer:            "Senior Hiring Manager",
			MaxTurns:               3,
			DurationMinutes:        10,
			StartedAt:              startedAt,
			Deadline:               startedAt.Add(10 * time.Minute),
			Questions:              append([]string(nil), questions...),
		}
		*savedAnswers = append([]string(nil), answers...)
		return assistant.ToolResult{}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func seedCompletedSession(t *testing.T, state *assistant.DemoState, id, role, feedback string, answers []string) {
	t.Helper()
	_, err := state.Transact(func(snapshot *assistant.RuntimeSnapshot, _ *[]string) (assistant.ToolResult, error) {
		startedAt := time.Now().UTC().Add(-2 * time.Hour)
		endedAt := startedAt.Add(10 * time.Minute)
		snapshot.Sessions = append(snapshot.Sessions, assistant.InterviewSession{
			ID: id, TargetRole: role, Interviewer: "Senior Hiring Manager",
			Status: "completed", MaxTurns: 3, DurationMinutes: 10,
			CompletedTurns: len(answers), StartedAt: startedAt, EndedAt: &endedAt,
			Questions: []string{"Tell me about a project."},
			Answers:   append([]string(nil), answers...), Feedback: feedback,
		})
		return assistant.ToolResult{}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
