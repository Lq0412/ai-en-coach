package preparation

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"
)

type CreateScenarioCommand struct {
	ActorUserID          string
	RequestID            string
	SourceThreadID       string
	CreatedFromMessageID string
	Type                 ScenarioType
	Title                string
	Goal                 string
	Participants         []string
	ScheduledAt          *time.Time
	Deadline             *time.Time
	Facts                []FactCandidate
	MaterialIDs          []string
}

type CreateScenarioOutcome struct {
	Scenario Scenario
	Created  bool
}

type ReplaceScenarioDetailsCommand struct {
	ActorUserID     string
	ScenarioID      string
	ExpectedVersion uint64
	Title           string
	Goal            string
	Participants    []string
	ScheduledAt     *time.Time
	Deadline        *time.Time
}

type MergeScenarioFactsCommand struct {
	ActorUserID     string
	ScenarioID      string
	ExpectedVersion uint64
	Facts           []FactCandidate
}

type ChangeScenarioStatusCommand struct {
	ActorUserID     string
	ScenarioID      string
	ExpectedVersion uint64
	Status          ScenarioStatus
}

type ScenarioMaterialCommand struct {
	ActorUserID     string
	ScenarioID      string
	ExpectedVersion uint64
	MaterialID      string
}

type SetCurrentScenarioCommand struct {
	ActorUserID string
	ThreadID    string
	ScenarioID  string
}

type ScenarioService interface {
	Create(context.Context, CreateScenarioCommand) (CreateScenarioOutcome, error)
	Get(context.Context, string, string) (Scenario, error)
	List(context.Context, string, ScenarioListFilter) ([]Scenario, error)
	Current(context.Context, string, string) (Scenario, error)
	ReplaceDetails(context.Context, ReplaceScenarioDetailsCommand) (Scenario, error)
	MergeFacts(context.Context, MergeScenarioFactsCommand) (Scenario, error)
	ChangeStatus(context.Context, ChangeScenarioStatusCommand) (Scenario, error)
	AttachMaterial(context.Context, ScenarioMaterialCommand) (Scenario, error)
	DetachMaterial(context.Context, ScenarioMaterialCommand) (Scenario, error)
	SetCurrent(context.Context, SetCurrentScenarioCommand) (Scenario, error)
}

type scenarioService struct {
	repository ScenarioRepository
	now        func() time.Time
	newID      func() (string, error)
}

func NewScenarioService(repository ScenarioRepository) ScenarioService {
	return newScenarioService(repository, time.Now, randomScenarioID)
}

func newScenarioService(repository ScenarioRepository, now func() time.Time, newID func() (string, error)) ScenarioService {
	return &scenarioService{repository: repository, now: now, newID: newID}
}

func (s *scenarioService) Create(ctx context.Context, command CreateScenarioCommand) (CreateScenarioOutcome, error) {
	if s.repository == nil {
		return CreateScenarioOutcome{}, fmt.Errorf("preparation: scenario repository is required")
	}
	if strings.TrimSpace(command.RequestID) == "" {
		return CreateScenarioOutcome{}, fmt.Errorf("%w: request ID is required", ErrInvalidScenario)
	}
	if existing, err := s.repository.GetByCreateRequest(ctx, command.ActorUserID, command.RequestID); err == nil {
		return CreateScenarioOutcome{Scenario: existing, Created: false}, nil
	} else if !errors.Is(err, ErrScenarioNotFound) {
		return CreateScenarioOutcome{}, err
	}
	id, err := s.newID()
	if err != nil {
		return CreateScenarioOutcome{}, fmt.Errorf("create scenario ID: %w", err)
	}
	scenario, err := NewScenario(NewScenarioInput{
		ID: id, UserID: command.ActorUserID, Type: command.Type,
		Title: command.Title, Goal: command.Goal, Participants: command.Participants,
		ScheduledAt: command.ScheduledAt, Deadline: command.Deadline, Facts: command.Facts,
		MaterialIDs: command.MaterialIDs, SourceThreadID: command.SourceThreadID,
		CreatedFromMessageID: command.CreatedFromMessageID,
	}, s.now())
	if err != nil {
		return CreateScenarioOutcome{}, err
	}
	result, err := s.repository.Create(ctx, CreateScenarioRecord{
		Scenario: scenario, RequestID: command.RequestID, CurrentThreadID: command.SourceThreadID,
	})
	if err != nil {
		return CreateScenarioOutcome{}, err
	}
	return CreateScenarioOutcome{Scenario: result.Scenario, Created: result.Created}, nil
}

func (s *scenarioService) Get(ctx context.Context, actorUserID, scenarioID string) (Scenario, error) {
	return s.repository.Get(ctx, actorUserID, scenarioID)
}

func (s *scenarioService) List(ctx context.Context, actorUserID string, filter ScenarioListFilter) ([]Scenario, error) {
	return s.repository.List(ctx, actorUserID, filter)
}

func (s *scenarioService) Current(ctx context.Context, actorUserID, threadID string) (Scenario, error) {
	return s.repository.Current(ctx, actorUserID, threadID)
}

func (s *scenarioService) ReplaceDetails(ctx context.Context, command ReplaceScenarioDetailsCommand) (Scenario, error) {
	scenario, err := s.repository.Get(ctx, command.ActorUserID, command.ScenarioID)
	if err != nil {
		return Scenario{}, err
	}
	if err := scenario.ReplaceDetails(command.Title, command.Goal, command.Participants, command.ScheduledAt, command.Deadline, s.now()); err != nil {
		return Scenario{}, err
	}
	return s.repository.Save(ctx, scenario, command.ExpectedVersion)
}

func (s *scenarioService) MergeFacts(ctx context.Context, command MergeScenarioFactsCommand) (Scenario, error) {
	scenario, err := s.repository.Get(ctx, command.ActorUserID, command.ScenarioID)
	if err != nil {
		return Scenario{}, err
	}
	if err := scenario.MergeFacts(command.Facts, s.now()); err != nil {
		return Scenario{}, err
	}
	return s.repository.Save(ctx, scenario, command.ExpectedVersion)
}

func (s *scenarioService) ChangeStatus(ctx context.Context, command ChangeScenarioStatusCommand) (Scenario, error) {
	scenario, err := s.repository.Get(ctx, command.ActorUserID, command.ScenarioID)
	if err != nil {
		return Scenario{}, err
	}
	if err := scenario.ChangeStatus(command.Status, s.now()); err != nil {
		return Scenario{}, err
	}
	updated, err := s.repository.Save(ctx, scenario, command.ExpectedVersion)
	if err != nil {
		return Scenario{}, err
	}
	return updated, nil
}

func (s *scenarioService) AttachMaterial(ctx context.Context, command ScenarioMaterialCommand) (Scenario, error) {
	scenario, err := s.repository.Get(ctx, command.ActorUserID, command.ScenarioID)
	if err != nil {
		return Scenario{}, err
	}
	if err := scenario.AttachMaterial(command.MaterialID, s.now()); err != nil {
		return Scenario{}, err
	}
	return s.repository.Save(ctx, scenario, command.ExpectedVersion)
}

func (s *scenarioService) DetachMaterial(ctx context.Context, command ScenarioMaterialCommand) (Scenario, error) {
	scenario, err := s.repository.Get(ctx, command.ActorUserID, command.ScenarioID)
	if err != nil {
		return Scenario{}, err
	}
	scenario.DetachMaterial(command.MaterialID, s.now())
	return s.repository.Save(ctx, scenario, command.ExpectedVersion)
}

func (s *scenarioService) SetCurrent(ctx context.Context, command SetCurrentScenarioCommand) (Scenario, error) {
	scenario, err := s.repository.Get(ctx, command.ActorUserID, command.ScenarioID)
	if err != nil {
		return Scenario{}, err
	}
	threadID := strings.TrimSpace(command.ThreadID)
	if !containsString(scenario.SourceThreadIDs, threadID) {
		expectedVersion := scenario.Version
		if err := scenario.LinkSourceThread(threadID, s.now()); err != nil {
			return Scenario{}, err
		}
		scenario, err = s.repository.Save(ctx, scenario, expectedVersion)
		if err != nil {
			return Scenario{}, err
		}
	}
	if err := s.repository.SetCurrent(ctx, command.ActorUserID, threadID, scenario.ID); err != nil {
		return Scenario{}, err
	}
	return scenario, nil
}

func randomScenarioID() (string, error) {
	buffer := make([]byte, 12)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return "scenario-" + hex.EncodeToString(buffer), nil
}
