package preparation

import (
	"errors"
	"testing"
	"time"
)

func TestScenarioCapturesAuthoritativeRealityMatter(t *testing.T) {
	now := time.Date(2026, 7, 22, 10, 0, 0, 0, time.FixedZone("CST", 8*60*60))
	scheduledAt := now.Add(7 * 24 * time.Hour)
	deadline := now.Add(5 * 24 * time.Hour)
	scenario, err := NewScenario(NewScenarioInput{
		ID: "scenario-1", UserID: "user-1", Type: ScenarioTypeInterview,
		Title: "  Product   Manager interview ", Goal: "Prepare concise project stories",
		Participants: []string{"Hiring manager", "Hiring manager", "Recruiter"},
		ScheduledAt:  &scheduledAt, Deadline: &deadline,
		Facts: []FactCandidate{{
			Key: "round", Value: "First round", Source: FactSourceUserStatement,
			SourceRef: "message-1", ObservedAt: now,
		}},
		MaterialIDs:    []string{"resume-1", "jd-1", "resume-1"},
		SourceThreadID: "thread-1", CreatedFromMessageID: "message-1",
	}, now)
	if err != nil {
		t.Fatal(err)
	}
	if scenario.Status != ScenarioStatusActive || scenario.Version != 1 {
		t.Fatalf("unexpected initial lifecycle: status=%q version=%d", scenario.Status, scenario.Version)
	}
	if scenario.Title != "Product Manager interview" || len(scenario.Participants) != 2 || len(scenario.MaterialIDs) != 2 {
		t.Fatalf("scenario was not normalized: %#v", scenario)
	}
	if scenario.CreatedAt.Location() != time.UTC || scenario.ScheduledAt.Location() != time.UTC {
		t.Fatalf("timestamps are not UTC: created=%v scheduled=%v", scenario.CreatedAt, scenario.ScheduledAt)
	}
	if got := scenario.StructuredFacts["round"]; got.Value != "First round" || got.SourceRef != "message-1" {
		t.Fatalf("fact provenance was not retained: %#v", got)
	}

	clone := scenario.Clone()
	clone.MaterialIDs[0] = "mutated"
	clone.StructuredFacts["round"] = ScenarioFact{Value: "mutated"}
	if scenario.MaterialIDs[0] != "resume-1" || scenario.StructuredFacts["round"].Value != "First round" {
		t.Fatal("Clone leaked mutable scenario state")
	}
}

func TestScenarioRejectsIncompleteProvenance(t *testing.T) {
	now := time.Now().UTC()
	base := NewScenarioInput{
		ID: "scenario-1", UserID: "user-1", Type: ScenarioTypeInterview,
		Title: "Interview", Goal: "Prepare", SourceThreadID: "thread-1", CreatedFromMessageID: "message-1",
	}
	for name, mutate := range map[string]func(*NewScenarioInput){
		"missing user":    func(input *NewScenarioInput) { input.UserID = "" },
		"invalid type":    func(input *NewScenarioInput) { input.Type = "unknown" },
		"missing title":   func(input *NewScenarioInput) { input.Title = "" },
		"missing goal":    func(input *NewScenarioInput) { input.Goal = "" },
		"missing thread":  func(input *NewScenarioInput) { input.SourceThreadID = "" },
		"missing message": func(input *NewScenarioInput) { input.CreatedFromMessageID = "" },
	} {
		t.Run(name, func(t *testing.T) {
			input := base
			mutate(&input)
			if _, err := NewScenario(input, now); !errors.Is(err, ErrInvalidScenario) {
				t.Fatalf("error = %v, want ErrInvalidScenario", err)
			}
		})
	}
}

func TestScenarioFactsRespectAuthorityAndSurfaceConflicts(t *testing.T) {
	now := time.Now().UTC()
	scenario := mustScenario(t, "scenario-1", "user-1", "thread-1", now)
	if err := scenario.MergeFacts([]FactCandidate{{
		Key: "target_role", Value: "Product Manager", Source: FactSourceOfficialDocument, SourceRef: "jd-1",
	}}, now); err != nil {
		t.Fatal(err)
	}

	before := scenario.Clone()
	err := scenario.MergeFacts([]FactCandidate{
		{Key: "target_role", Value: "Program Manager", Source: FactSourceMaterial, SourceRef: "resume-1"},
		{Key: "round", Value: "First round", Source: FactSourceUserStatement, SourceRef: "message-2"},
	}, now.Add(time.Minute))
	var conflict *FactConflictError
	if !errors.As(err, &conflict) || len(conflict.Conflicts) != 1 || conflict.Conflicts[0].Key != "target_role" {
		t.Fatalf("conflict = %#v err=%v", conflict, err)
	}
	if len(scenario.StructuredFacts) != len(before.StructuredFacts) {
		t.Fatal("fact merge was not atomic")
	}

	if err := scenario.MergeFacts([]FactCandidate{{
		Key: "target_role", Value: "Senior Product Manager", Source: FactSourceUserCorrection, SourceRef: "message-3",
	}}, now.Add(2*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if got := scenario.StructuredFacts["target_role"]; got.Value != "Senior Product Manager" || got.Source != FactSourceUserCorrection {
		t.Fatalf("higher-authority correction did not win: %#v", got)
	}
	if err := scenario.MergeFacts([]FactCandidate{{
		Key: "target_role", Value: "Senior Product Manager", Source: FactSourceMemory, SourceRef: "memory-1",
	}}, now.Add(3*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if got := scenario.StructuredFacts["target_role"]; got.Source != FactSourceUserCorrection {
		t.Fatalf("same value downgraded authority: %#v", got)
	}
}

func TestScenarioLifecycleAndAssociations(t *testing.T) {
	now := time.Now().UTC()
	scenario := mustScenario(t, "scenario-1", "user-1", "thread-1", now)
	if err := scenario.AttachMaterial("jd-1", now); err != nil {
		t.Fatal(err)
	}
	if err := scenario.AttachMaterial("jd-1", now); err != nil || len(scenario.MaterialIDs) != 1 {
		t.Fatalf("attachment is not idempotent: %#v err=%v", scenario.MaterialIDs, err)
	}
	if err := scenario.LinkSourceThread("thread-2", now); err != nil {
		t.Fatal(err)
	}
	for _, status := range []ScenarioStatus{ScenarioStatusWaitingResult, ScenarioStatusCompleted, ScenarioStatusArchived, ScenarioStatusActive} {
		if err := scenario.ChangeStatus(status, now); err != nil {
			t.Fatalf("transition to %q: %v", status, err)
		}
	}
	if err := scenario.ChangeStatus("deleted", now); !errors.Is(err, ErrInvalidScenario) {
		t.Fatalf("invalid status error = %v", err)
	}
}

func mustScenario(t *testing.T, id, userID, threadID string, now time.Time) Scenario {
	t.Helper()
	scenario, err := NewScenario(NewScenarioInput{
		ID: id, UserID: userID, Type: ScenarioTypeInterview,
		Title: "Interview", Goal: "Prepare", SourceThreadID: threadID, CreatedFromMessageID: "message-1",
	}, now)
	if err != nil {
		t.Fatal(err)
	}
	return scenario
}
