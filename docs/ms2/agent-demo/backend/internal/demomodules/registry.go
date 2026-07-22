// Package demomodules is the Demo composition root. It adapts the four public
// business services to the Assistant ToolRegistry port.
package demomodules

import (
	"context"
	"fmt"
	"strings"

	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant"
	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/conversation"
	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/practice"
	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/preparation"
	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/review"
)

type Registry struct {
	preparation  preparation.ScenarioReader
	practice     practice.Service
	conversation conversation.Service
	review       review.Service
}

var _ assistant.ToolRegistry = (*Registry)(nil)
var _ assistant.AnswerCoachService = (*Registry)(nil)

func NewRegistry(state *assistant.DemoState, generator assistant.AgentContentGenerator) *Registry {
	return &Registry{
		preparation:  preparation.NewService(state),
		practice:     practice.NewService(state),
		conversation: conversation.NewService(state, generator),
		review:       review.NewService(state, generator),
	}
}

func (r *Registry) GenerateAnswerCoach(ctx context.Context) (assistant.AnswerCoach, error) {
	return r.conversation.GenerateAnswerCoach(ctx)
}

func (r *Registry) Execute(ctx context.Context, invocation assistant.ToolInvocation) (assistant.ToolResult, error) {
	switch invocation.ToolName {
	case "preparation.get_confirmed_context":
		value, err := r.preparation.GetConfirmedContext(ctx, strings.TrimSpace(fmt.Sprint(invocation.Arguments["scenario"])))
		return output(map[string]any{
			"background_snapshot_id": value.BackgroundSnapshotID, "target_role": value.TargetRole,
			"candidate_name": value.CandidateName, "headline": value.Headline,
			"summary": value.Summary, "skills": value.Skills, "experiences": value.Experiences,
			"confirmed": value.Confirmed,
		}, err)
	case "practice.create_plan":
		value, err := r.practice.CreatePlan(ctx, practice.CreatePlanCommand{
			Role:     strings.TrimSpace(fmt.Sprint(invocation.Arguments["role"])),
			MaxTurns: invocation.Arguments["max_turns"], DurationMinutes: invocation.Arguments["duration_minutes"],
		})
		return output(map[string]any{"practice_plan_id": value.ID, "target_role": value.TargetRole, "interviewer": value.Interviewer, "max_turns": value.MaxTurns, "duration_minutes": value.DurationMinutes}, err)
	case "practice.start_session":
		value, err := r.practice.StartSession(ctx)
		return output(map[string]any{"practice_session_id": value.ID, "status": value.Status}, err)
	case "practice.apply_turn_outcome":
		value, err := r.practice.ApplyTurnOutcome(ctx, practice.TurnOutcome{AnswerValidity: strings.TrimSpace(fmt.Sprint(invocation.Arguments["answer_validity"]))})
		return output(map[string]any{"answer_validity": value.AnswerValidity, "objective_coverage": value.ObjectiveCoverage, "next_action": value.NextAction}, err)
	case "conversation.generate_next_question":
		value, err := r.conversation.GenerateNextQuestion(ctx)
		return output(map[string]any{"question_id": value.ID, "question_type": value.Type, "content": value.Content, "sequence": value.Sequence}, err)
	case "conversation.generate_reply":
		messages, err := conversationMessages(invocation.Arguments["conversation_messages"])
		if err != nil {
			return assistant.ToolResult{}, err
		}
		value, err := r.conversation.GenerateReply(ctx, conversation.ReplyCommand{
			UserMessage:    strings.TrimSpace(fmt.Sprint(invocation.Arguments["user_message"])),
			ContextSummary: strings.TrimSpace(fmt.Sprint(invocation.Arguments["context_summary"])), Messages: messages,
		})
		return output(map[string]any{"summary": value.Summary, "user_message": value.UserMessage}, err)
	case "conversation.submit_turn":
		value, err := r.conversation.SubmitTurn(ctx, conversation.SubmitTurnCommand{
			AnswerText:      fmt.Sprint(invocation.Arguments["answer_text"]),
			InteractionMode: strings.TrimSpace(fmt.Sprint(invocation.Arguments["interaction_mode"])),
		})
		return output(map[string]any{"turn_id": value.ID, "turn_status": value.Status, "answer_text": value.AnswerText, "interaction_mode": value.InteractionMode}, err)
	case "review.generate_feedback":
		value, err := r.review.Analyze(ctx, review.AnalyzeCommand{Reason: strings.TrimSpace(fmt.Sprint(invocation.Arguments["reason"]))})
		return output(map[string]any{
			"feedback_id": value.ID, "practice_session_id": value.SessionID,
			"target_role": value.TargetRole, "completed_turns": value.CompletedTurns,
			"max_turns": value.MaxTurns, "summary": value.Summary,
		}, err)
	case "review.list_history":
		items, err := r.review.ListHistory(ctx, review.HistoryQuery{Limit: intArgument(invocation.Arguments["limit"])})
		mapped := make([]map[string]any, 0, len(items))
		for _, item := range items {
			mapped = append(mapped, map[string]any{"practice_session_id": item.PracticeSessionID, "scenario": item.Scenario, "completed_turns": item.CompletedTurns, "status": item.Status, "started_at": item.StartedAt, "feedback": item.Feedback})
		}
		return output(map[string]any{"items": mapped}, err)
	default:
		return assistant.ToolResult{}, fmt.Errorf("unregistered tool: %s", invocation.ToolName)
	}
}

func output(value map[string]any, err error) (assistant.ToolResult, error) {
	if err != nil {
		return assistant.ToolResult{}, err
	}
	return assistant.ToolResult{Output: value}, nil
}

func conversationMessages(value any) ([]conversation.ContextMessage, error) {
	messages, ok := value.([]assistant.ContextMessage)
	if !ok || len(messages) == 0 {
		return nil, fmt.Errorf("conversation.generate_reply requires complete conversation_messages")
	}
	result := make([]conversation.ContextMessage, 0, len(messages))
	for _, message := range messages {
		result = append(result, conversation.ContextMessage{Role: message.Role, Content: message.Content})
	}
	return result, nil
}

func intArgument(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case float64:
		return int(typed)
	default:
		return 0
	}
}
