package usercontext

import (
	"context"
	"errors"
	"testing"
	"time"
)

type profileStub struct {
	profile Profile
	err     error
}

func (s profileStub) Profile(context.Context, string) (Profile, error) { return s.profile, s.err }

type scenarioStub struct {
	scenario Scenario
	err      error
}

func (s scenarioStub) Current(context.Context, string, string) (Scenario, error) {
	return s.scenario, s.err
}

type memoryStub struct {
	items []Memory
	err   error
}

func (s memoryStub) Recall(context.Context, string, string, int) ([]Memory, error) {
	return s.items, s.err
}

type historyStub struct {
	items []LearningSignal
	err   error
}

func (s historyStub) Recent(context.Context, string, int) ([]LearningSignal, error) {
	return s.items, s.err
}

func TestAggregatorBuildsReadOnlySnapshot(t *testing.T) {
	scheduled := time.Date(2026, 7, 28, 9, 0, 0, 0, time.FixedZone("CST", 8*60*60))
	reader := New(
		profileStub{profile: Profile{ID: "profile-1", Candidate: "Li Ming", TargetRole: "Product Manager", Confirmed: true, Skills: []string{"Go"}}},
		scenarioStub{scenario: Scenario{ID: "scenario-1", Title: "Product interview", ScheduledAt: &scheduled, Facts: []Fact{{Key: "round", Value: "First round", Source: "user_statement", SourceRef: "message-1"}}}},
		memoryStub{items: []Memory{{ID: "memory-1", Summary: "Prefers direct feedback", Source: "mem0"}}},
		historyStub{items: []LearningSignal{{Kind: "practice", Summary: "Completed a Java interview practice", SourceRef: "session-1"}}},
	)

	snapshot, err := reader.Build(context.Background(), Request{UserID: "user-1", ThreadID: "thread-1", Query: "help me prepare"})
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Profile == nil || snapshot.Profile.TargetRole != "Product Manager" {
		t.Fatalf("profile = %#v", snapshot.Profile)
	}
	if snapshot.Scenario == nil || snapshot.Scenario.Facts[0].Value != "First round" {
		t.Fatalf("scenario = %#v", snapshot.Scenario)
	}
	if snapshot.Scenario.ScheduledAt.Location() != time.UTC {
		t.Fatalf("scheduledAt location = %v, want UTC", snapshot.Scenario.ScheduledAt.Location())
	}
	if len(snapshot.Memories) != 1 || len(snapshot.LearningSignals) != 1 {
		t.Fatalf("snapshot = %#v", snapshot)
	}
}

func TestAggregatorDegradesWhenOptionalSourcesFail(t *testing.T) {
	reader := New(
		profileStub{profile: Profile{Candidate: "Unconfirmed"}},
		scenarioStub{err: errors.New("not found")},
		memoryStub{err: errors.New("unavailable")},
		historyStub{err: errors.New("unavailable")},
	)

	snapshot, err := reader.Build(context.Background(), Request{UserID: "user-1", ThreadID: "thread-1", Query: "hello"})
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Profile != nil || snapshot.Scenario != nil || len(snapshot.Memories) != 0 || len(snapshot.LearningSignals) != 0 {
		t.Fatalf("snapshot should degrade to empty: %#v", snapshot)
	}
}

func TestAggregatorRequiresUserAndThread(t *testing.T) {
	reader := New(nil, nil, nil, nil)
	if _, err := reader.Build(context.Background(), Request{UserID: "user-1"}); !errors.Is(err, ErrInvalidRequest) {
		t.Fatalf("err = %v, want ErrInvalidRequest", err)
	}
}
