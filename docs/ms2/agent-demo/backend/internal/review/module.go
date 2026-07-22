// Package review owns feedback generation and the practice-history projection.
package review

import (
	"context"
	"fmt"
	"time"

	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant"
)

type AnalyzeCommand struct {
	Reason string
}

type Feedback struct {
	ID             string
	SessionID      string
	TargetRole     string
	CompletedTurns int
	MaxTurns       int
	Summary        string
}

type HistoryQuery struct {
	Limit int
}

type HistoryItem struct {
	PracticeSessionID string
	Scenario          string
	CompletedTurns    int
	Status            string
	StartedAt         time.Time
	Feedback          string
}

type AnalyzeUseCase interface {
	Analyze(context.Context, AnalyzeCommand) (Feedback, error)
}

type HistoryQueryUseCase interface {
	ListHistory(context.Context, HistoryQuery) ([]HistoryItem, error)
}

type Service interface {
	AnalyzeUseCase
	HistoryQueryUseCase
}

type StateStore interface {
	Transact(assistant.DemoTransaction) (assistant.ToolResult, error)
}

type service struct {
	state     StateStore
	generator assistant.InterviewContentGenerator
}

func NewService(state StateStore, generator assistant.InterviewContentGenerator) Service {
	return service{state: state, generator: generator}
}

func (s service) Analyze(ctx context.Context, _ AnalyzeCommand) (feedback Feedback, err error) {
	_, err = s.state.Transact(func(state *assistant.RuntimeSnapshot, answers *[]string) (assistant.ToolResult, error) {
		state.ActiveQuestion = ""
		summary := "暂无真实回答。模拟反馈：建议使用 Situation–Action–Result 结构，并补充可量化结果。"
		if state.CompletedQuestionCount > 0 {
			summary = fmt.Sprintf("已完成 %d 个有效 Turn。表达结构清晰；下一步建议增加技术取舍、指标和复盘结果。", state.CompletedQuestionCount)
		}
		if s.generator != nil {
			generated, err := s.generator.GenerateFeedback(ctx, assistant.InterviewFeedbackInput{
				CompletedQuestionCount: state.CompletedQuestionCount, Answers: append([]string(nil), (*answers)...),
				TargetRole: state.TargetRole, MaxTurns: state.MaxTurns,
				DurationMinutes: state.DurationMinutes, CandidateProfile: state.CandidateProfile,
			})
			if err != nil {
				return assistant.ToolResult{}, err
			}
			summary = generated
		}
		sessionID := state.CurrentSessionID
		feedback = Feedback{
			ID: "feedback-" + sessionID, SessionID: sessionID,
			TargetRole: state.TargetRole, CompletedTurns: state.CompletedQuestionCount,
			MaxTurns: state.MaxTurns, Summary: summary,
		}
		completeSession(state, *answers, summary)
		return assistant.ToolResult{}, nil
	})
	return feedback, err
}

func (s service) ListHistory(_ context.Context, query HistoryQuery) (items []HistoryItem, err error) {
	_, err = s.state.Transact(func(state *assistant.RuntimeSnapshot, _ *[]string) (assistant.ToolResult, error) {
		items = make([]HistoryItem, 0, len(state.Sessions))
		for index := len(state.Sessions) - 1; index >= 0; index-- {
			session := state.Sessions[index]
			items = append(items, HistoryItem{PracticeSessionID: session.ID, Scenario: session.TargetRole, CompletedTurns: session.CompletedTurns, Status: session.Status, StartedAt: session.StartedAt, Feedback: session.Feedback})
			if query.Limit > 0 && len(items) >= query.Limit {
				break
			}
		}
		return assistant.ToolResult{}, nil
	})
	return items, err
}

func completeSession(state *assistant.RuntimeSnapshot, answers []string, feedback string) {
	if state.CurrentSessionID == "" {
		return
	}
	for index := range state.Sessions {
		if state.Sessions[index].ID == state.CurrentSessionID {
			state.Sessions[index].Feedback = feedback
			return
		}
	}
	endedAt := time.Now().UTC()
	state.Sessions = append(state.Sessions, assistant.InterviewSession{
		ID: state.CurrentSessionID, TargetRole: state.TargetRole, Interviewer: state.Interviewer,
		Status: "completed", MaxTurns: state.MaxTurns, DurationMinutes: state.DurationMinutes,
		CompletedTurns: state.CompletedQuestionCount, StartedAt: state.StartedAt, EndedAt: &endedAt,
		Questions: append([]string(nil), state.Questions...), Answers: append([]string(nil), answers...), Feedback: feedback,
	})
}
