package preparation

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestScenarioServiceSupportsCrossThreadContinuation(t *testing.T) {
	repository := NewMemoryScenarioRepository()
	now := time.Date(2026, 7, 22, 2, 0, 0, 0, time.UTC)
	ids := []string{"scenario-1", "scenario-unused"}
	service := newScenarioService(repository, func() time.Time { return now }, func() (string, error) {
		id := ids[0]
		ids = ids[1:]
		return id, nil
	})
	ctx := context.Background()
	created, err := service.Create(ctx, CreateScenarioCommand{
		ActorUserID: "user-1", RequestID: "request-1", SourceThreadID: "thread-day-1",
		CreatedFromMessageID: "message-1", Type: ScenarioTypeInterview,
		Title: "Product Manager interview", Goal: "Prepare for first round",
	})
	if err != nil || !created.Created {
		t.Fatalf("create = %#v err=%v", created, err)
	}
	retry, err := service.Create(ctx, CreateScenarioCommand{
		ActorUserID: "user-1", RequestID: "request-1", SourceThreadID: "thread-day-1",
		CreatedFromMessageID: "message-1", Type: ScenarioTypeInterview,
		Title: "Duplicate", Goal: "Should not be created",
	})
	if err != nil || retry.Created || retry.Scenario.ID != created.Scenario.ID {
		t.Fatalf("retry = %#v err=%v", retry, err)
	}

	continued, err := service.SetCurrent(ctx, SetCurrentScenarioCommand{
		ActorUserID: "user-1", ThreadID: "thread-day-2", ScenarioID: created.Scenario.ID,
	})
	if err != nil || continued.Version != 2 {
		t.Fatalf("continue = %#v err=%v", continued, err)
	}
	current, err := service.Current(ctx, "user-1", "thread-day-2")
	if err != nil || current.ID != created.Scenario.ID || !containsString(current.SourceThreadIDs, "thread-day-2") {
		t.Fatalf("day-2 current = %#v err=%v", current, err)
	}

	archived, err := service.ChangeStatus(ctx, ChangeScenarioStatusCommand{
		ActorUserID: "user-1", ScenarioID: current.ID, ExpectedVersion: current.Version,
		Status: ScenarioStatusArchived,
	})
	if err != nil || archived.Status != ScenarioStatusArchived {
		t.Fatalf("archive = %#v err=%v", archived, err)
	}
	if _, err := service.Current(ctx, "user-1", "thread-day-2"); !errors.Is(err, ErrScenarioNotFound) {
		t.Fatalf("archived scenario remained current: %v", err)
	}
}

func TestScenarioServiceIdempotentRetryDoesNotGenerateAnotherID(t *testing.T) {
	repository := NewMemoryScenarioRepository()
	now := time.Now().UTC()
	idCalls := 0
	service := newScenarioService(repository, func() time.Time { return now }, func() (string, error) {
		idCalls++
		if idCalls > 1 {
			return "", errors.New("ID source unavailable")
		}
		return "scenario-1", nil
	})
	command := CreateScenarioCommand{
		ActorUserID: "user-1", RequestID: "request-1", SourceThreadID: "thread-1",
		CreatedFromMessageID: "message-1", Type: ScenarioTypeInterview, Title: "Interview", Goal: "Prepare",
	}
	if _, err := service.Create(context.Background(), command); err != nil {
		t.Fatal(err)
	}
	result, err := service.Create(context.Background(), command)
	if err != nil || result.Created || result.Scenario.ID != "scenario-1" || idCalls != 1 {
		t.Fatalf("retry = %#v err=%v idCalls=%d", result, err, idCalls)
	}
}
