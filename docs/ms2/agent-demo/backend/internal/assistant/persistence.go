package assistant

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

type persistedConversationStore struct {
	Thread        AssistantThread                `json:"thread"`
	TaskRuns      map[string]TaskRun             `json:"task_runs"`
	Idempotency   map[string]string              `json:"idempotency"`
	Plans         map[string]Plan                `json:"plans"`
	ToolCalls     []ToolCall                     `json:"tool_calls"`
	Confirmations map[string]ConfirmationRequest `json:"confirmations"`
	Messages      []AssistantMessage             `json:"messages"`
	Archives      []ConversationArchive          `json:"archives"`
}

type persistedToolRegistry struct {
	State   MockDomainState `json:"state"`
	Answers []string        `json:"answers"`
}

func NewFileConversationStore(path string) (*MemoryConversationStore, error) {
	store := &MemoryConversationStore{persistPath: path}
	if err := store.load(); err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			return nil, err
		}
		store.Reset()
		if _, err := os.Stat(path); err != nil {
			return nil, fmt.Errorf("initialize conversation store: %w", err)
		}
	}
	return store, nil
}

func (s *MemoryConversationStore) load() error {
	data, err := os.ReadFile(s.persistPath)
	if err != nil {
		return err
	}
	var persisted persistedConversationStore
	if err := json.Unmarshal(data, &persisted); err != nil {
		return fmt.Errorf("decode conversation store %s: %w", s.persistPath, err)
	}
	if persisted.Thread.ID == "" || persisted.Thread.UserID == "" {
		return fmt.Errorf("decode conversation store %s: missing thread identity", s.persistPath)
	}
	s.thread = persisted.Thread
	s.taskRuns = nonNilMap(persisted.TaskRuns)
	s.idempotency = nonNilMap(persisted.Idempotency)
	s.plans = nonNilMap(persisted.Plans)
	s.toolCalls = persisted.ToolCalls
	s.confirmations = nonNilMap(persisted.Confirmations)
	s.messages = persisted.Messages
	s.archives = persisted.Archives
	return nil
}

func (s *MemoryConversationStore) persistLocked() error {
	if s.persistPath == "" {
		return nil
	}
	return writeJSONAtomic(s.persistPath, persistedConversationStore{
		Thread:        s.thread,
		TaskRuns:      s.taskRuns,
		Idempotency:   s.idempotency,
		Plans:         s.plans,
		ToolCalls:     s.toolCalls,
		Confirmations: s.confirmations,
		Messages:      s.messages,
		Archives:      s.archives,
	})
}

func NewPersistentDemoState(generator AgentContentGenerator, path string) (*DemoState, error) {
	registry := &DemoState{generator: generator, persistPath: path}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			if err := registry.persistLocked(); err != nil {
				return nil, err
			}
			return registry, nil
		}
		return nil, err
	}
	var persisted persistedToolRegistry
	if err := json.Unmarshal(data, &persisted); err != nil {
		return nil, fmt.Errorf("decode tool registry %s: %w", path, err)
	}
	registry.state = persisted.State
	registry.answers = persisted.Answers
	registry.normalizeResumeStateLocked()
	if err := registry.persistLocked(); err != nil {
		return nil, err
	}
	return registry, nil
}

func (r *DemoState) normalizeResumeStateLocked() {
	if len(r.state.Resumes) == 0 && r.state.CandidateProfile.Configured() {
		profile := cloneCandidateProfile(r.state.CandidateProfile)
		createdAt := profile.UpdatedAt
		if createdAt.IsZero() {
			createdAt = time.Now().UTC()
		}
		resume := ResumeDocument{
			ID:               resumeIDForProfile(profile),
			Name:             profile.ResumeName,
			MediaType:        "application/pdf",
			Status:           "ready",
			CandidateProfile: profile,
			CreatedAt:        createdAt,
			UpdatedAt:        createdAt,
		}
		r.state.Resumes = []ResumeDocument{resume}
		r.state.ActiveResumeID = resume.ID
	}
	if len(r.state.Resumes) == 0 {
		r.state.ActiveResumeID = ""
		return
	}
	for _, resume := range r.state.Resumes {
		if resume.ID == r.state.ActiveResumeID {
			r.state.CandidateProfile = cloneCandidateProfile(resume.CandidateProfile)
			return
		}
	}
	latest := r.state.Resumes[len(r.state.Resumes)-1]
	r.state.ActiveResumeID = latest.ID
	r.state.CandidateProfile = cloneCandidateProfile(latest.CandidateProfile)
}

func (r *DemoState) persistLocked() error {
	if r.persistPath == "" {
		return nil
	}
	return writeJSONAtomic(r.persistPath, persistedToolRegistry{
		State:   r.state,
		Answers: r.answers,
	})
}

func writeJSONAtomic(path string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	temporary := path + ".tmp"
	if err := os.WriteFile(temporary, data, 0o600); err != nil {
		return err
	}
	if err := os.Rename(temporary, path); err != nil {
		_ = os.Remove(temporary)
		return err
	}
	return nil
}

func nonNilMap[K comparable, V any](value map[K]V) map[K]V {
	if value == nil {
		return map[K]V{}
	}
	return value
}
