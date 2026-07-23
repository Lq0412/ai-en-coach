package preparation

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"
)

var (
	ErrInvalidScenario         = errors.New("preparation: invalid scenario")
	ErrScenarioNotFound        = errors.New("preparation: scenario not found")
	ErrScenarioVersionConflict = errors.New("preparation: scenario version conflict")
	ErrScenarioFactConflict    = errors.New("preparation: scenario fact conflict")
)

type ScenarioType string

const (
	ScenarioTypeInterview    ScenarioType = "interview"
	ScenarioTypeMeeting      ScenarioType = "meeting"
	ScenarioTypeClient       ScenarioType = "client"
	ScenarioTypePresentation ScenarioType = "presentation"
	ScenarioTypeOther        ScenarioType = "other"
)

func (value ScenarioType) Valid() bool {
	switch value {
	case ScenarioTypeInterview, ScenarioTypeMeeting, ScenarioTypeClient, ScenarioTypePresentation, ScenarioTypeOther:
		return true
	default:
		return false
	}
}

type ScenarioStatus string

const (
	ScenarioStatusActive        ScenarioStatus = "active"
	ScenarioStatusWaitingResult ScenarioStatus = "waiting_result"
	ScenarioStatusCompleted     ScenarioStatus = "completed"
	ScenarioStatusArchived      ScenarioStatus = "archived"
)

func (value ScenarioStatus) Valid() bool {
	switch value {
	case ScenarioStatusActive, ScenarioStatusWaitingResult, ScenarioStatusCompleted, ScenarioStatusArchived:
		return true
	default:
		return false
	}
}

// FactSource describes the authority of a structured fact. Higher authority
// may replace lower authority; conflicting facts at the same or lower level
// must be surfaced to the caller.
type FactSource string

const (
	FactSourceInference        FactSource = "model_inference"
	FactSourceMemory           FactSource = "long_term_memory"
	FactSourceMaterial         FactSource = "uploaded_material"
	FactSourceOfficialDocument FactSource = "official_document"
	FactSourceUserStatement    FactSource = "user_statement"
	FactSourceUserCorrection   FactSource = "user_correction"
)

func (value FactSource) Valid() bool { return value.priority() > 0 }

func (value FactSource) priority() int {
	switch value {
	case FactSourceInference:
		return 10
	case FactSourceMemory:
		return 20
	case FactSourceMaterial:
		return 30
	case FactSourceOfficialDocument:
		return 40
	case FactSourceUserStatement:
		return 50
	case FactSourceUserCorrection:
		return 60
	default:
		return 0
	}
}

type ScenarioFact struct {
	Value      string     `json:"value"`
	Source     FactSource `json:"source"`
	SourceRef  string     `json:"source_ref"`
	ObservedAt time.Time  `json:"observed_at"`
}

type FactCandidate struct {
	Key        string
	Value      string
	Source     FactSource
	SourceRef  string
	ObservedAt time.Time
}

type FactConflict struct {
	Key      string
	Existing ScenarioFact
	Incoming ScenarioFact
}

type FactConflictError struct {
	Conflicts []FactConflict
}

func (e *FactConflictError) Error() string {
	keys := make([]string, 0, len(e.Conflicts))
	for _, conflict := range e.Conflicts {
		keys = append(keys, conflict.Key)
	}
	return fmt.Sprintf("%s: %s", ErrScenarioFactConflict, strings.Join(keys, ", "))
}

func (e *FactConflictError) Unwrap() error { return ErrScenarioFactConflict }

type Scenario struct {
	ID                   string                  `json:"id"`
	UserID               string                  `json:"user_id"`
	Type                 ScenarioType            `json:"type"`
	Title                string                  `json:"title"`
	Goal                 string                  `json:"goal"`
	Status               ScenarioStatus          `json:"status"`
	Participants         []string                `json:"participants,omitempty"`
	ScheduledAt          *time.Time              `json:"scheduled_at,omitempty"`
	Deadline             *time.Time              `json:"deadline,omitempty"`
	StructuredFacts      map[string]ScenarioFact `json:"structured_facts,omitempty"`
	MaterialIDs          []string                `json:"material_ids,omitempty"`
	SourceThreadIDs      []string                `json:"source_thread_ids"`
	CreatedFromMessageID string                  `json:"created_from_message_id"`
	Version              uint64                  `json:"version"`
	CreatedAt            time.Time               `json:"created_at"`
	UpdatedAt            time.Time               `json:"updated_at"`
}

type NewScenarioInput struct {
	ID                   string
	UserID               string
	Type                 ScenarioType
	Title                string
	Goal                 string
	Participants         []string
	ScheduledAt          *time.Time
	Deadline             *time.Time
	Facts                []FactCandidate
	MaterialIDs          []string
	SourceThreadID       string
	CreatedFromMessageID string
}

func NewScenario(input NewScenarioInput, now time.Time) (Scenario, error) {
	now = normalizedTime(now)
	scenario := Scenario{
		ID:                   strings.TrimSpace(input.ID),
		UserID:               strings.TrimSpace(input.UserID),
		Type:                 input.Type,
		Title:                normalizedText(input.Title),
		Goal:                 normalizedText(input.Goal),
		Status:               ScenarioStatusActive,
		Participants:         normalizedStrings(input.Participants),
		ScheduledAt:          normalizedTimePointer(input.ScheduledAt),
		Deadline:             normalizedTimePointer(input.Deadline),
		StructuredFacts:      map[string]ScenarioFact{},
		MaterialIDs:          normalizedStrings(input.MaterialIDs),
		SourceThreadIDs:      normalizedStrings([]string{input.SourceThreadID}),
		CreatedFromMessageID: strings.TrimSpace(input.CreatedFromMessageID),
		Version:              1,
		CreatedAt:            now,
		UpdatedAt:            now,
	}
	if err := scenario.validate(); err != nil {
		return Scenario{}, err
	}
	if err := scenario.MergeFacts(input.Facts, now); err != nil {
		return Scenario{}, err
	}
	return scenario, nil
}

func (s Scenario) Clone() Scenario {
	s.Participants = append([]string(nil), s.Participants...)
	s.MaterialIDs = append([]string(nil), s.MaterialIDs...)
	s.SourceThreadIDs = append([]string(nil), s.SourceThreadIDs...)
	s.ScheduledAt = normalizedTimePointer(s.ScheduledAt)
	s.Deadline = normalizedTimePointer(s.Deadline)
	s.StructuredFacts = cloneFacts(s.StructuredFacts)
	return s
}

func (s *Scenario) ReplaceDetails(title, goal string, participants []string, scheduledAt, deadline *time.Time, now time.Time) error {
	candidate := s.Clone()
	candidate.Title = normalizedText(title)
	candidate.Goal = normalizedText(goal)
	candidate.Participants = normalizedStrings(participants)
	candidate.ScheduledAt = normalizedTimePointer(scheduledAt)
	candidate.Deadline = normalizedTimePointer(deadline)
	if err := candidate.validate(); err != nil {
		return err
	}
	candidate.UpdatedAt = normalizedTime(now)
	*s = candidate
	return nil
}

func (s *Scenario) ChangeStatus(status ScenarioStatus, now time.Time) error {
	if !status.Valid() {
		return fmt.Errorf("%w: unsupported status %q", ErrInvalidScenario, status)
	}
	if s.Status == status {
		return nil
	}
	if !validStatusTransition(s.Status, status) {
		return fmt.Errorf("%w: cannot transition status from %q to %q", ErrInvalidScenario, s.Status, status)
	}
	s.Status = status
	s.UpdatedAt = normalizedTime(now)
	return nil
}

func (s *Scenario) MergeFacts(candidates []FactCandidate, now time.Time) error {
	if len(candidates) == 0 {
		return nil
	}
	facts := cloneFacts(s.StructuredFacts)
	conflicts := make([]FactConflict, 0)
	for _, candidate := range candidates {
		key := strings.TrimSpace(candidate.Key)
		fact := ScenarioFact{
			Value:      normalizedText(candidate.Value),
			Source:     candidate.Source,
			SourceRef:  strings.TrimSpace(candidate.SourceRef),
			ObservedAt: normalizedTime(candidate.ObservedAt),
		}
		if fact.ObservedAt.IsZero() {
			fact.ObservedAt = normalizedTime(now)
		}
		if key == "" || fact.Value == "" || fact.SourceRef == "" || !fact.Source.Valid() {
			return fmt.Errorf("%w: fact key, value, source and sourceRef are required", ErrInvalidScenario)
		}
		existing, exists := facts[key]
		if !exists || fact.Source.priority() > existing.Source.priority() {
			facts[key] = fact
			continue
		}
		if existing.Value == fact.Value {
			if fact.Source.priority() == existing.Source.priority() && fact.ObservedAt.After(existing.ObservedAt) {
				facts[key] = fact
			}
			continue
		}
		conflicts = append(conflicts, FactConflict{Key: key, Existing: existing, Incoming: fact})
	}
	if len(conflicts) > 0 {
		return &FactConflictError{Conflicts: conflicts}
	}
	s.StructuredFacts = facts
	s.UpdatedAt = normalizedTime(now)
	return nil
}

func (s *Scenario) AttachMaterial(materialID string, now time.Time) error {
	materialID = strings.TrimSpace(materialID)
	if materialID == "" {
		return fmt.Errorf("%w: material ID is required", ErrInvalidScenario)
	}
	if slices.Contains(s.MaterialIDs, materialID) {
		return nil
	}
	s.MaterialIDs = append(s.MaterialIDs, materialID)
	s.UpdatedAt = normalizedTime(now)
	return nil
}

func (s *Scenario) DetachMaterial(materialID string, now time.Time) {
	for index, existing := range s.MaterialIDs {
		if existing != strings.TrimSpace(materialID) {
			continue
		}
		s.MaterialIDs = append(s.MaterialIDs[:index], s.MaterialIDs[index+1:]...)
		s.UpdatedAt = normalizedTime(now)
		return
	}
}

func (s *Scenario) LinkSourceThread(threadID string, now time.Time) error {
	threadID = strings.TrimSpace(threadID)
	if threadID == "" {
		return fmt.Errorf("%w: source thread ID is required", ErrInvalidScenario)
	}
	if slices.Contains(s.SourceThreadIDs, threadID) {
		return nil
	}
	s.SourceThreadIDs = append(s.SourceThreadIDs, threadID)
	s.UpdatedAt = normalizedTime(now)
	return nil
}

func (s Scenario) validate() error {
	switch {
	case s.ID == "":
		return fmt.Errorf("%w: ID is required", ErrInvalidScenario)
	case s.UserID == "":
		return fmt.Errorf("%w: user ID is required", ErrInvalidScenario)
	case !s.Type.Valid():
		return fmt.Errorf("%w: unsupported type %q", ErrInvalidScenario, s.Type)
	case s.Title == "":
		return fmt.Errorf("%w: title is required", ErrInvalidScenario)
	case s.Goal == "":
		return fmt.Errorf("%w: goal is required", ErrInvalidScenario)
	case !s.Status.Valid():
		return fmt.Errorf("%w: unsupported status %q", ErrInvalidScenario, s.Status)
	case len(s.SourceThreadIDs) == 0:
		return fmt.Errorf("%w: at least one source thread is required", ErrInvalidScenario)
	case s.CreatedFromMessageID == "":
		return fmt.Errorf("%w: source message ID is required", ErrInvalidScenario)
	case s.Version == 0:
		return fmt.Errorf("%w: version is required", ErrInvalidScenario)
	case s.CreatedAt.IsZero() || s.UpdatedAt.IsZero():
		return fmt.Errorf("%w: timestamps are required", ErrInvalidScenario)
	case s.UpdatedAt.Before(s.CreatedAt):
		return fmt.Errorf("%w: updated time cannot be before created time", ErrInvalidScenario)
	default:
		for key, fact := range s.StructuredFacts {
			if strings.TrimSpace(key) == "" || normalizedText(fact.Value) == "" || !fact.Source.Valid() || strings.TrimSpace(fact.SourceRef) == "" || fact.ObservedAt.IsZero() {
				return fmt.Errorf("%w: fact %q has incomplete provenance", ErrInvalidScenario, key)
			}
		}
		return nil
	}
}

func validStatusTransition(from, to ScenarioStatus) bool {
	switch from {
	case ScenarioStatusActive:
		return to == ScenarioStatusWaitingResult || to == ScenarioStatusCompleted || to == ScenarioStatusArchived
	case ScenarioStatusWaitingResult:
		return to == ScenarioStatusActive || to == ScenarioStatusCompleted || to == ScenarioStatusArchived
	case ScenarioStatusCompleted:
		return to == ScenarioStatusActive || to == ScenarioStatusArchived
	case ScenarioStatusArchived:
		return to == ScenarioStatusActive
	default:
		return false
	}
}

func normalizedText(value string) string { return strings.Join(strings.Fields(value), " ") }

func normalizedStrings(values []string) []string {
	result := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	for _, value := range values {
		value = normalizedText(value)
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func normalizedTime(value time.Time) time.Time {
	if value.IsZero() {
		return time.Time{}
	}
	return value.UTC()
}

func normalizedTimePointer(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	normalized := normalizedTime(*value)
	return &normalized
}

func cloneFacts(facts map[string]ScenarioFact) map[string]ScenarioFact {
	result := make(map[string]ScenarioFact, len(facts))
	for key, value := range facts {
		result[key] = value
	}
	return result
}
