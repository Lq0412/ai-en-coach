// Package usercontext assembles read-only user data for model context.
package usercontext

import (
	"context"
	"errors"
	"strings"
	"time"
)

var ErrInvalidRequest = errors.New("usercontext: user ID and thread ID are required")

type Request struct {
	UserID   string
	ThreadID string
	Query    string
}

type Profile struct {
	ID          string
	Candidate   string
	Headline    string
	Summary     string
	TargetRole  string
	Skills      []string
	Experiences []string
	Confirmed   bool
}

type Fact struct {
	Key       string
	Value     string
	Source    string
	SourceRef string
}

type Scenario struct {
	ID          string
	Type        string
	Title       string
	Goal        string
	Status      string
	ScheduledAt *time.Time
	Deadline    *time.Time
	MaterialIDs []string
	Facts       []Fact
}

type Memory struct {
	ID      string
	Summary string
	Source  string
}

type LearningSignal struct {
	Kind      string
	Summary   string
	SourceRef string
	Occurred  time.Time
}

type Snapshot struct {
	Profile         *Profile
	Scenario        *Scenario
	Memories        []Memory
	LearningSignals []LearningSignal
}

type ProfileReader interface {
	Profile(context.Context, string) (Profile, error)
}

type ScenarioReader interface {
	Current(context.Context, string, string) (Scenario, error)
}

type MemoryReader interface {
	Recall(context.Context, string, string, int) ([]Memory, error)
}

type LearningHistoryReader interface {
	Recent(context.Context, string, int) ([]LearningSignal, error)
}

type Reader interface {
	Build(context.Context, Request) (Snapshot, error)
}

type Aggregator struct {
	profiles  ProfileReader
	scenarios ScenarioReader
	memories  MemoryReader
	history   LearningHistoryReader
}

func New(profiles ProfileReader, scenarios ScenarioReader, memories MemoryReader, history LearningHistoryReader) *Aggregator {
	return &Aggregator{profiles: profiles, scenarios: scenarios, memories: memories, history: history}
}

// Build treats every data source as optional. A missing Scenario, unavailable
// memory service, or unavailable history must not stop the live conversation.
func (a *Aggregator) Build(ctx context.Context, request Request) (Snapshot, error) {
	request.UserID = strings.TrimSpace(request.UserID)
	request.ThreadID = strings.TrimSpace(request.ThreadID)
	if request.UserID == "" || request.ThreadID == "" {
		return Snapshot{}, ErrInvalidRequest
	}

	result := Snapshot{}
	if a.profiles != nil {
		if profile, err := a.profiles.Profile(ctx, request.UserID); err == nil && profile.Confirmed {
			result.Profile = cloneProfile(profile)
		}
	}
	if a.scenarios != nil {
		if scenario, err := a.scenarios.Current(ctx, request.UserID, request.ThreadID); err == nil {
			result.Scenario = cloneScenario(scenario)
		}
	}
	if a.memories != nil && strings.TrimSpace(request.Query) != "" {
		if memories, err := a.memories.Recall(ctx, request.UserID, request.Query, 3); err == nil {
			result.Memories = cloneMemories(memories)
		}
	}
	if a.history != nil {
		if signals, err := a.history.Recent(ctx, request.UserID, 3); err == nil {
			result.LearningSignals = cloneSignals(signals)
		}
	}
	return result, nil
}

func cloneProfile(value Profile) *Profile {
	value.Skills = append([]string(nil), value.Skills...)
	value.Experiences = append([]string(nil), value.Experiences...)
	return &value
}

func cloneScenario(value Scenario) *Scenario {
	value.MaterialIDs = append([]string(nil), value.MaterialIDs...)
	value.Facts = append([]Fact(nil), value.Facts...)
	if value.ScheduledAt != nil {
		copy := value.ScheduledAt.UTC()
		value.ScheduledAt = &copy
	}
	if value.Deadline != nil {
		copy := value.Deadline.UTC()
		value.Deadline = &copy
	}
	return &value
}

func cloneMemories(values []Memory) []Memory {
	return append([]Memory(nil), values...)
}

func cloneSignals(values []LearningSignal) []LearningSignal {
	return append([]LearningSignal(nil), values...)
}
