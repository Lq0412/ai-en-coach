package preparation

import (
	"context"
	"testing"
	"time"

	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant"
)

type confirmedContextStub struct{ value ConfirmedContext }

func (s confirmedContextStub) GetConfirmedContext(context.Context, string) (ConfirmedContext, error) {
	return s.value, nil
}

type interviewHistoryStub struct {
	items []assistant.InterviewSessionSummary
}

func (s interviewHistoryStub) ListInterviewSessions() []assistant.InterviewSessionSummary {
	return s.items
}

func TestContextSourcesExposeOnlyConfirmedAndCurrentData(t *testing.T) {
	profile, err := NewProfileContextSource(confirmedContextStub{value: ConfirmedContext{
		BackgroundSnapshotID: "profile-1", CandidateName: "Li Ming", TargetRole: "Product Manager", Confirmed: true, Skills: []string{"Go"},
	}}).Profile(context.Background(), "user-1")
	if err != nil || !profile.Confirmed || profile.TargetRole != "Product Manager" {
		t.Fatalf("profile = %#v, err=%v", profile, err)
	}

	repository := NewMemoryScenarioRepository()
	service := NewScenarioService(repository)
	created, err := service.Create(context.Background(), CreateScenarioCommand{
		ActorUserID: "user-1", RequestID: "request-1", SourceThreadID: "thread-1", CreatedFromMessageID: "message-1",
		Type: ScenarioTypeInterview, Title: "PM interview", Goal: "Prepare", Facts: []FactCandidate{{Key: "round", Value: "First", Source: FactSourceUserStatement, SourceRef: "message-1"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	current, err := NewCurrentScenarioContextSource(service).Current(context.Background(), "user-1", "thread-1")
	if err != nil || current.ID != created.Scenario.ID || len(current.Facts) != 1 {
		t.Fatalf("scenario = %#v, err=%v", current, err)
	}
}

func TestLearningHistoryContextSourceSkipsActiveSessions(t *testing.T) {
	started := time.Date(2026, 7, 23, 9, 0, 0, 0, time.UTC)
	source := NewLearningHistoryContextSource(interviewHistoryStub{items: []assistant.InterviewSessionSummary{
		{ID: "active", Status: "in_progress", TargetRole: "Java"},
		{ID: "done", Status: "completed", TargetRole: "Product Manager", CompletedTurns: 3, StartedAt: started, HasFeedback: true},
	}})
	items, err := source.Recent(context.Background(), "user-1", 3)
	if err != nil || len(items) != 1 || items[0].SourceRef != "done" {
		t.Fatalf("items = %#v, err=%v", items, err)
	}
}
