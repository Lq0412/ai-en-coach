package preparation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
)

const scenarioSchemaVersion = 1

type CreateScenarioRecord struct {
	Scenario        Scenario
	RequestID       string
	CurrentThreadID string
}

type CreateScenarioResult struct {
	Scenario Scenario
	Created  bool
}

type ScenarioListFilter struct {
	Types          []ScenarioType
	Statuses       []ScenarioStatus
	SourceThreadID string
}

type ScenarioRepository interface {
	Create(context.Context, CreateScenarioRecord) (CreateScenarioResult, error)
	GetByCreateRequest(context.Context, string, string) (Scenario, error)
	Get(context.Context, string, string) (Scenario, error)
	List(context.Context, string, ScenarioListFilter) ([]Scenario, error)
	Save(context.Context, Scenario, uint64) (Scenario, error)
	SetCurrent(context.Context, string, string, string) error
	Current(context.Context, string, string) (Scenario, error)
	ClearCurrent(context.Context, string, string, string) error
}

func (r *scenarioRepository) GetByCreateRequest(ctx context.Context, userID, requestID string) (Scenario, error) {
	if err := ctx.Err(); err != nil {
		return Scenario{}, err
	}
	userID, requestID = strings.TrimSpace(userID), strings.TrimSpace(requestID)
	if userID == "" || requestID == "" {
		return Scenario{}, ErrScenarioNotFound
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	scenarioID, found := r.createRequests[ownerKey(userID, requestID)]
	if !found {
		return Scenario{}, ErrScenarioNotFound
	}
	return r.getLocked(userID, scenarioID)
}

type persistedScenarios struct {
	SchemaVersion   int                 `json:"schema_version"`
	Scenarios       map[string]Scenario `json:"scenarios"`
	CreateRequests  map[string]string   `json:"create_requests"`
	CurrentByThread map[string]string   `json:"current_by_thread"`
}

type scenarioRepository struct {
	mu              sync.RWMutex
	persistPath     string
	scenarios       map[string]Scenario
	createRequests  map[string]string
	currentByThread map[string]string
}

func NewMemoryScenarioRepository() ScenarioRepository {
	return &scenarioRepository{
		scenarios:       map[string]Scenario{},
		createRequests:  map[string]string{},
		currentByThread: map[string]string{},
	}
}

func NewFileScenarioRepository(path string) (ScenarioRepository, error) {
	repository := &scenarioRepository{persistPath: path}
	if err := repository.load(); err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			return nil, err
		}
		repository.scenarios = map[string]Scenario{}
		repository.createRequests = map[string]string{}
		repository.currentByThread = map[string]string{}
		if err := repository.persistLocked(); err != nil {
			return nil, fmt.Errorf("initialize scenario repository: %w", err)
		}
	}
	return repository, nil
}

func (r *scenarioRepository) Create(ctx context.Context, record CreateScenarioRecord) (CreateScenarioResult, error) {
	if err := ctx.Err(); err != nil {
		return CreateScenarioResult{}, err
	}
	record.RequestID = strings.TrimSpace(record.RequestID)
	record.CurrentThreadID = strings.TrimSpace(record.CurrentThreadID)
	if record.RequestID == "" || record.CurrentThreadID == "" {
		return CreateScenarioResult{}, fmt.Errorf("%w: request ID and current thread ID are required", ErrInvalidScenario)
	}
	if err := record.Scenario.validate(); err != nil {
		return CreateScenarioResult{}, err
	}
	if !containsString(record.Scenario.SourceThreadIDs, record.CurrentThreadID) {
		return CreateScenarioResult{}, fmt.Errorf("%w: current thread must be a source thread", ErrInvalidScenario)
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	requestKey := ownerKey(record.Scenario.UserID, record.RequestID)
	if scenarioID, exists := r.createRequests[requestKey]; exists {
		existing, found := r.scenarios[scenarioID]
		if !found {
			return CreateScenarioResult{}, fmt.Errorf("scenario request %q references missing scenario %q", record.RequestID, scenarioID)
		}
		return CreateScenarioResult{Scenario: existing.Clone(), Created: false}, nil
	}
	if _, exists := r.scenarios[record.Scenario.ID]; exists {
		return CreateScenarioResult{}, fmt.Errorf("%w: duplicate ID %q", ErrInvalidScenario, record.Scenario.ID)
	}

	scenario := record.Scenario.Clone()
	scenario.Version = 1
	r.scenarios[scenario.ID] = scenario
	r.createRequests[requestKey] = scenario.ID
	threadKey := ownerKey(scenario.UserID, record.CurrentThreadID)
	previousCurrent, hadCurrent := r.currentByThread[threadKey]
	r.currentByThread[threadKey] = scenario.ID
	if err := r.persistLocked(); err != nil {
		delete(r.scenarios, scenario.ID)
		delete(r.createRequests, requestKey)
		if hadCurrent {
			r.currentByThread[threadKey] = previousCurrent
		} else {
			delete(r.currentByThread, threadKey)
		}
		return CreateScenarioResult{}, err
	}
	return CreateScenarioResult{Scenario: scenario.Clone(), Created: true}, nil
}

func (r *scenarioRepository) Get(ctx context.Context, userID, scenarioID string) (Scenario, error) {
	if err := ctx.Err(); err != nil {
		return Scenario{}, err
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.getLocked(strings.TrimSpace(userID), strings.TrimSpace(scenarioID))
}

func (r *scenarioRepository) List(ctx context.Context, userID string, filter ScenarioListFilter) ([]Scenario, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return nil, fmt.Errorf("%w: user ID is required", ErrInvalidScenario)
	}
	typeFilter := make(map[ScenarioType]struct{}, len(filter.Types))
	for _, value := range filter.Types {
		if !value.Valid() {
			return nil, fmt.Errorf("%w: unsupported type %q", ErrInvalidScenario, value)
		}
		typeFilter[value] = struct{}{}
	}
	statusFilter := make(map[ScenarioStatus]struct{}, len(filter.Statuses))
	for _, value := range filter.Statuses {
		if !value.Valid() {
			return nil, fmt.Errorf("%w: unsupported status %q", ErrInvalidScenario, value)
		}
		statusFilter[value] = struct{}{}
	}
	sourceThreadID := strings.TrimSpace(filter.SourceThreadID)

	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]Scenario, 0)
	for _, scenario := range r.scenarios {
		if scenario.UserID != userID || !matchesType(scenario.Type, typeFilter) || !matchesStatus(scenario.Status, statusFilter) {
			continue
		}
		if sourceThreadID != "" && !containsString(scenario.SourceThreadIDs, sourceThreadID) {
			continue
		}
		result = append(result, scenario.Clone())
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].UpdatedAt.Equal(result[j].UpdatedAt) {
			return result[i].ID < result[j].ID
		}
		return result[i].UpdatedAt.After(result[j].UpdatedAt)
	})
	return result, nil
}

func (r *scenarioRepository) Save(ctx context.Context, scenario Scenario, expectedVersion uint64) (Scenario, error) {
	if err := ctx.Err(); err != nil {
		return Scenario{}, err
	}
	if err := scenario.validate(); err != nil {
		return Scenario{}, err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	existing, found := r.scenarios[scenario.ID]
	if !found || existing.UserID != scenario.UserID {
		return Scenario{}, ErrScenarioNotFound
	}
	if expectedVersion == 0 || existing.Version != expectedVersion {
		return Scenario{}, fmt.Errorf("%w: expected %d, current %d", ErrScenarioVersionConflict, expectedVersion, existing.Version)
	}
	if scenario.CreatedAt != existing.CreatedAt || scenario.CreatedFromMessageID != existing.CreatedFromMessageID {
		return Scenario{}, fmt.Errorf("%w: creation provenance is immutable", ErrInvalidScenario)
	}
	updated := scenario.Clone()
	updated.Version = existing.Version + 1
	r.scenarios[scenario.ID] = updated
	removedCurrent := map[string]string{}
	if updated.Status == ScenarioStatusArchived {
		for key, scenarioID := range r.currentByThread {
			if scenarioID == updated.ID {
				removedCurrent[key] = scenarioID
				delete(r.currentByThread, key)
			}
		}
	}
	if err := r.persistLocked(); err != nil {
		r.scenarios[scenario.ID] = existing
		for key, scenarioID := range removedCurrent {
			r.currentByThread[key] = scenarioID
		}
		return Scenario{}, err
	}
	return updated.Clone(), nil
}

func (r *scenarioRepository) SetCurrent(ctx context.Context, userID, threadID, scenarioID string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	userID, threadID, scenarioID = strings.TrimSpace(userID), strings.TrimSpace(threadID), strings.TrimSpace(scenarioID)
	if userID == "" || threadID == "" || scenarioID == "" {
		return fmt.Errorf("%w: user, thread and scenario IDs are required", ErrInvalidScenario)
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	scenario, found := r.scenarios[scenarioID]
	if !found || scenario.UserID != userID {
		return ErrScenarioNotFound
	}
	if scenario.Status == ScenarioStatusArchived {
		return fmt.Errorf("%w: archived scenario cannot be current", ErrInvalidScenario)
	}
	if !containsString(scenario.SourceThreadIDs, threadID) {
		return fmt.Errorf("%w: current thread must be linked to the scenario first", ErrInvalidScenario)
	}
	key := ownerKey(userID, threadID)
	previous, existed := r.currentByThread[key]
	r.currentByThread[key] = scenarioID
	if err := r.persistLocked(); err != nil {
		if existed {
			r.currentByThread[key] = previous
		} else {
			delete(r.currentByThread, key)
		}
		return err
	}
	return nil
}

func (r *scenarioRepository) Current(ctx context.Context, userID, threadID string) (Scenario, error) {
	if err := ctx.Err(); err != nil {
		return Scenario{}, err
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	scenarioID, found := r.currentByThread[ownerKey(strings.TrimSpace(userID), strings.TrimSpace(threadID))]
	if !found {
		return Scenario{}, ErrScenarioNotFound
	}
	return r.getLocked(strings.TrimSpace(userID), scenarioID)
}

func (r *scenarioRepository) ClearCurrent(ctx context.Context, userID, threadID, expectedScenarioID string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	userID, threadID = strings.TrimSpace(userID), strings.TrimSpace(threadID)
	if userID == "" || threadID == "" {
		return fmt.Errorf("%w: user and thread IDs are required", ErrInvalidScenario)
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	key := ownerKey(userID, threadID)
	current, found := r.currentByThread[key]
	if !found {
		return nil
	}
	if expected := strings.TrimSpace(expectedScenarioID); expected != "" && current != expected {
		return fmt.Errorf("%w: current scenario is %q", ErrScenarioVersionConflict, current)
	}
	delete(r.currentByThread, key)
	if err := r.persistLocked(); err != nil {
		r.currentByThread[key] = current
		return err
	}
	return nil
}

func (r *scenarioRepository) getLocked(userID, scenarioID string) (Scenario, error) {
	if userID == "" || scenarioID == "" {
		return Scenario{}, ErrScenarioNotFound
	}
	scenario, found := r.scenarios[scenarioID]
	if !found || scenario.UserID != userID {
		return Scenario{}, ErrScenarioNotFound
	}
	return scenario.Clone(), nil
}

func (r *scenarioRepository) load() error {
	data, err := os.ReadFile(r.persistPath)
	if err != nil {
		return err
	}
	var persisted persistedScenarios
	if err := json.Unmarshal(data, &persisted); err != nil {
		return fmt.Errorf("decode scenario repository %s: %w", r.persistPath, err)
	}
	if persisted.SchemaVersion != scenarioSchemaVersion {
		return fmt.Errorf("decode scenario repository %s: unsupported schema version %d", r.persistPath, persisted.SchemaVersion)
	}
	r.scenarios = nonNilScenarioMap(persisted.Scenarios)
	r.createRequests = nonNilStringMap(persisted.CreateRequests)
	r.currentByThread = nonNilStringMap(persisted.CurrentByThread)
	for id, scenario := range r.scenarios {
		if id != scenario.ID {
			return fmt.Errorf("decode scenario repository %s: mismatched scenario ID %q", r.persistPath, id)
		}
		if err := scenario.validate(); err != nil {
			return fmt.Errorf("decode scenario repository %s: %w", r.persistPath, err)
		}
	}
	for key, scenarioID := range r.createRequests {
		scenario, found := r.scenarios[scenarioID]
		if !found {
			return fmt.Errorf("decode scenario repository %s: request %q references missing scenario", r.persistPath, key)
		}
		if !strings.HasPrefix(key, scenario.UserID+"\x1f") {
			return fmt.Errorf("decode scenario repository %s: request %q has the wrong owner", r.persistPath, key)
		}
	}
	for key, scenarioID := range r.currentByThread {
		scenario, found := r.scenarios[scenarioID]
		if !found {
			return fmt.Errorf("decode scenario repository %s: thread %q references missing scenario", r.persistPath, key)
		}
		parts := strings.SplitN(key, "\x1f", 2)
		if len(parts) != 2 || parts[0] != scenario.UserID || !containsString(scenario.SourceThreadIDs, parts[1]) || scenario.Status == ScenarioStatusArchived {
			return fmt.Errorf("decode scenario repository %s: invalid current scenario link %q", r.persistPath, key)
		}
	}
	return nil
}

func (r *scenarioRepository) persistLocked() error {
	if r.persistPath == "" {
		return nil
	}
	data, err := json.MarshalIndent(persistedScenarios{
		SchemaVersion:   scenarioSchemaVersion,
		Scenarios:       r.scenarios,
		CreateRequests:  r.createRequests,
		CurrentByThread: r.currentByThread,
	}, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(r.persistPath), 0o700); err != nil {
		return err
	}
	temporary := r.persistPath + ".tmp"
	if err := os.WriteFile(temporary, data, 0o600); err != nil {
		return err
	}
	if err := os.Rename(temporary, r.persistPath); err != nil {
		_ = os.Remove(temporary)
		return err
	}
	return nil
}

func ownerKey(userID, value string) string {
	return strings.TrimSpace(userID) + "\x1f" + strings.TrimSpace(value)
}

func matchesType(value ScenarioType, filter map[ScenarioType]struct{}) bool {
	if len(filter) == 0 {
		return true
	}
	_, found := filter[value]
	return found
}

func matchesStatus(value ScenarioStatus, filter map[ScenarioStatus]struct{}) bool {
	if len(filter) == 0 {
		return true
	}
	_, found := filter[value]
	return found
}

func containsString(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

func nonNilScenarioMap(value map[string]Scenario) map[string]Scenario {
	if value == nil {
		return map[string]Scenario{}
	}
	return value
}

func nonNilStringMap(value map[string]string) map[string]string {
	if value == nil {
		return map[string]string{}
	}
	return value
}
