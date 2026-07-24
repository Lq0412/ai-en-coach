// Package practice owns plans, interview sessions, and turn-outcome application.
package practice

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant"
)

type CreatePlanCommand struct {
	Role            string
	MaxTurns        any
	DurationMinutes any
}

type PlanSnapshot struct {
	ID              string
	TargetRole      string
	Interviewer     string
	MaxTurns        int
	DurationMinutes int
}

type SessionSnapshot struct {
	ID     string
	Status string
}

type TurnOutcome struct {
	AnswerValidity string
}

type TurnOutcomeResult struct {
	AnswerValidity    string
	ObjectiveCoverage string
	NextAction        string
}

type PlanService interface {
	CreatePlan(context.Context, CreatePlanCommand) (PlanSnapshot, error)
}

type SessionService interface {
	StartSession(context.Context) (SessionSnapshot, error)
}

// ApplyTurnOutcome is the narrow cross-module write port from Conversation.
type ApplyTurnOutcome interface {
	ApplyTurnOutcome(context.Context, TurnOutcome) (TurnOutcomeResult, error)
}

type Service interface {
	PlanService
	SessionService
	ApplyTurnOutcome
}

type StateStore interface {
	Transact(assistant.DemoTransaction) (assistant.ToolResult, error)
}

type service struct{ state StateStore }

func NewService(state StateStore) Service { return service{state: state} }

func (s service) CreatePlan(_ context.Context, command CreatePlanCommand) (plan PlanSnapshot, err error) {
	_, err = s.state.Transact(func(state *assistant.RuntimeSnapshot, _ *[]string) (assistant.ToolResult, error) {
		role := strings.TrimSpace(command.Role)
		if role == "" {
			role = "Software Engineer"
		}
		state.TargetRole = role
		state.Interviewer = "Senior Hiring Manager"
		// Zero is intentional: question count is dynamic and the session is
		// normally bounded by its deadline instead of a fixed number of turns.
		state.MaxTurns = boundedInt(command.MaxTurns, assistant.DefaultInterviewMaxTurns, 0, 100)
		state.DurationMinutes = boundedInt(command.DurationMinutes, assistant.DefaultInterviewDurationMinutes, 5, 60)
		plan = PlanSnapshot{ID: "plan-demo-001", TargetRole: role, Interviewer: state.Interviewer, MaxTurns: state.MaxTurns, DurationMinutes: state.DurationMinutes}
		return assistant.ToolResult{}, nil
	})
	return plan, err
}

func (s service) StartSession(_ context.Context) (session SessionSnapshot, err error) {
	_, err = s.state.Transact(func(state *assistant.RuntimeSnapshot, answers *[]string) (assistant.ToolResult, error) {
		startedAt := time.Now().UTC()
		*state = assistant.RuntimeSnapshot{
			CurrentSessionID: fmt.Sprintf("session-%d", startedAt.UnixNano()),
			TargetRole:       state.TargetRole, Interviewer: state.Interviewer,
			Scenario: state.Scenario, ScenarioVariant: state.ScenarioVariant,
			KnowledgeTags: state.KnowledgeTags, ScenarioKnowledge: state.ScenarioKnowledge,
			MaxTurns: state.MaxTurns, DurationMinutes: state.DurationMinutes,
			StartedAt: startedAt, Deadline: startedAt.Add(time.Duration(state.DurationMinutes) * time.Minute),
			Sessions:         append([]assistant.InterviewSession(nil), state.Sessions...),
			CandidateProfile: state.CandidateProfile,
			Attachments:      append([]assistant.Attachment(nil), state.Attachments...),
			Resumes:          append([]assistant.ResumeDocument(nil), state.Resumes...),
			ActiveResumeID:   state.ActiveResumeID,
		}
		*answers = nil
		session = SessionSnapshot{ID: state.CurrentSessionID, Status: "IN_PROGRESS"}
		return assistant.ToolResult{}, nil
	})
	return session, err
}

func (s service) ApplyTurnOutcome(_ context.Context, outcome TurnOutcome) (applied TurnOutcomeResult, err error) {
	_, err = s.state.Transact(func(state *assistant.RuntimeSnapshot, _ *[]string) (assistant.ToolResult, error) {
		coverage := "PARTIALLY_COVERED"
		if state.CompletedQuestionCount%2 == 0 {
			coverage = "COVERED"
		}
		nextAction := "MOVE_TO_NEXT_OBJECTIVE"
		if state.LimitReached(time.Now()) {
			nextAction = "COMPLETE_SESSION"
		}
		validity := strings.TrimSpace(outcome.AnswerValidity)
		if validity == "" {
			validity = "VALID"
		}
		applied = TurnOutcomeResult{AnswerValidity: validity, ObjectiveCoverage: coverage, NextAction: nextAction}
		return assistant.ToolResult{}, nil
	})
	return applied, err
}

func boundedInt(value any, fallback, minimum, maximum int) int {
	result := fallback
	switch typed := value.(type) {
	case int:
		result = typed
	case float64:
		result = int(typed)
	case json.Number:
		if parsed, err := typed.Int64(); err == nil {
			result = int(parsed)
		}
	}
	return max(minimum, min(result, maximum))
}
