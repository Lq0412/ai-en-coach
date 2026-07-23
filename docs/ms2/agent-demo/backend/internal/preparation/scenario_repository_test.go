package preparation

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestFileScenarioRepositoryPersistsIdentityIdempotencyAndCurrentScenario(t *testing.T) {
	path := filepath.Join(t.TempDir(), "scenarios.json")
	repository, err := NewFileScenarioRepository(path)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	scenario := mustScenario(t, "scenario-1", "user-1", "thread-1", now)
	created, err := repository.Create(context.Background(), CreateScenarioRecord{
		Scenario: scenario, RequestID: "request-1", CurrentThreadID: "thread-1",
	})
	if err != nil || !created.Created {
		t.Fatalf("create = %#v err=%v", created, err)
	}

	retry := mustScenario(t, "scenario-retry", "user-1", "thread-1", now.Add(time.Hour))
	idempotent, err := repository.Create(context.Background(), CreateScenarioRecord{
		Scenario: retry, RequestID: "request-1", CurrentThreadID: "thread-1",
	})
	if err != nil || idempotent.Created || idempotent.Scenario.ID != scenario.ID {
		t.Fatalf("idempotent result = %#v err=%v", idempotent, err)
	}

	reopened, err := NewFileScenarioRepository(path)
	if err != nil {
		t.Fatal(err)
	}
	current, err := reopened.Current(context.Background(), "user-1", "thread-1")
	if err != nil || current.ID != scenario.ID || current.CreatedFromMessageID != "message-1" {
		t.Fatalf("current after restart = %#v err=%v", current, err)
	}
	secondRetry := mustScenario(t, "scenario-after-restart", "user-1", "thread-1", now.Add(2*time.Hour))
	result, err := reopened.Create(context.Background(), CreateScenarioRecord{
		Scenario: secondRetry, RequestID: "request-1", CurrentThreadID: "thread-1",
	})
	if err != nil || result.Created || result.Scenario.ID != scenario.ID {
		t.Fatalf("idempotency after restart = %#v err=%v", result, err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if permissions := info.Mode().Perm(); permissions&0o077 != 0 {
		t.Fatalf("scenario file permissions = %o, want private", permissions)
	}
}

func TestScenarioRepositoryEnforcesOwnershipVersionsAndFilters(t *testing.T) {
	repository := NewMemoryScenarioRepository()
	ctx := context.Background()
	now := time.Now().UTC()
	first := mustScenario(t, "scenario-1", "user-1", "thread-1", now)
	if _, err := repository.Create(ctx, CreateScenarioRecord{Scenario: first, RequestID: "request-1", CurrentThreadID: "thread-1"}); err != nil {
		t.Fatal(err)
	}
	second := mustScenario(t, "scenario-2", "user-1", "thread-2", now.Add(time.Minute))
	second.Type = ScenarioTypeMeeting
	if _, err := repository.Create(ctx, CreateScenarioRecord{Scenario: second, RequestID: "request-2", CurrentThreadID: "thread-2"}); err != nil {
		t.Fatal(err)
	}
	other := mustScenario(t, "scenario-other", "user-2", "thread-other", now)
	if _, err := repository.Create(ctx, CreateScenarioRecord{Scenario: other, RequestID: "request-1", CurrentThreadID: "thread-other"}); err != nil {
		t.Fatal(err)
	}

	if _, err := repository.Get(ctx, "user-2", first.ID); !errors.Is(err, ErrScenarioNotFound) {
		t.Fatalf("cross-user read error = %v", err)
	}
	items, err := repository.List(ctx, "user-1", ScenarioListFilter{Types: []ScenarioType{ScenarioTypeMeeting}})
	if err != nil || len(items) != 1 || items[0].ID != second.ID {
		t.Fatalf("filtered list = %#v err=%v", items, err)
	}

	first.Title = "Updated interview"
	updated, err := repository.Save(ctx, first, 1)
	if err != nil || updated.Version != 2 {
		t.Fatalf("save = %#v err=%v", updated, err)
	}
	first.Goal = "stale write"
	if _, err := repository.Save(ctx, first, 1); !errors.Is(err, ErrScenarioVersionConflict) {
		t.Fatalf("stale write error = %v", err)
	}
	if err := repository.Delete(ctx, "user-2", first.ID, updated.Version); !errors.Is(err, ErrScenarioNotFound) {
		t.Fatalf("cross-user delete error = %v", err)
	}
	if err := repository.Delete(ctx, "user-1", first.ID, 1); !errors.Is(err, ErrScenarioVersionConflict) {
		t.Fatalf("stale delete error = %v", err)
	}
	if err := repository.Delete(ctx, "user-1", first.ID, updated.Version); err != nil {
		t.Fatal(err)
	}
	if _, err := repository.Get(ctx, "user-1", first.ID); !errors.Is(err, ErrScenarioNotFound) {
		t.Fatalf("deleted scenario read error = %v", err)
	}
	if _, err := repository.GetByCreateRequest(ctx, "user-1", "request-1"); !errors.Is(err, ErrScenarioNotFound) {
		t.Fatalf("deleted scenario idempotency mapping error = %v", err)
	}
	if _, err := repository.Current(ctx, "user-1", "thread-1"); !errors.Is(err, ErrScenarioNotFound) {
		t.Fatalf("deleted scenario current link error = %v", err)
	}
}

func TestArchivingScenarioAtomicallyClearsCurrentThreadLinks(t *testing.T) {
	repository := NewMemoryScenarioRepository()
	ctx := context.Background()
	now := time.Now().UTC()
	scenario := mustScenario(t, "scenario-1", "user-1", "thread-1", now)
	if err := scenario.LinkSourceThread("thread-2", now); err != nil {
		t.Fatal(err)
	}
	if _, err := repository.Create(ctx, CreateScenarioRecord{Scenario: scenario, RequestID: "request-1", CurrentThreadID: "thread-1"}); err != nil {
		t.Fatal(err)
	}
	if err := repository.SetCurrent(ctx, "user-1", "thread-2", scenario.ID); err != nil {
		t.Fatal(err)
	}
	if err := scenario.ChangeStatus(ScenarioStatusArchived, now.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	if _, err := repository.Save(ctx, scenario, 1); err != nil {
		t.Fatal(err)
	}
	for _, threadID := range []string{"thread-1", "thread-2"} {
		if _, err := repository.Current(ctx, "user-1", threadID); !errors.Is(err, ErrScenarioNotFound) {
			t.Fatalf("current for %s after archive error = %v", threadID, err)
		}
	}
	if err := repository.SetCurrent(ctx, "user-1", "thread-1", scenario.ID); !errors.Is(err, ErrInvalidScenario) {
		t.Fatalf("setting archived scenario current error = %v", err)
	}
}

func TestFileScenarioRepositoryRejectsCorruptAuthorityState(t *testing.T) {
	for name, body := range map[string]string{
		"wrong schema":        `{"schema_version":2,"scenarios":{},"create_requests":{},"current_by_thread":{}}`,
		"broken current link": `{"schema_version":1,"scenarios":{},"create_requests":{},"current_by_thread":{"user-1\\u001fthread-1":"missing"}}`,
	} {
		t.Run(name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "scenarios.json")
			if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
				t.Fatal(err)
			}
			if _, err := NewFileScenarioRepository(path); err == nil {
				t.Fatal("corrupt scenario repository was accepted")
			}
		})
	}
}
