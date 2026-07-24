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
	state        *assistant.DemoState
	preparation  preparation.ScenarioReader
	practice     practice.Service
	conversation conversation.Service
	review       review.Service
}

var _ assistant.ToolRegistry = (*Registry)(nil)
var _ assistant.AnswerCoachService = (*Registry)(nil)

func NewRegistry(state *assistant.DemoState, generator assistant.AgentContentGenerator) *Registry {
	return &Registry{
		state:        state,
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
	case "scenario.retrieve_knowledge":
		scenarioVariant := strings.TrimSpace(fmt.Sprint(invocation.Arguments["scenario_variant"]))
		tags := stringSliceArgument(invocation.Arguments["tags"])
		knowledge := assistant.RetrieveScenarioKnowledge(scenarioVariant, tags)
		_, err := r.state.Transact(func(state *assistant.RuntimeSnapshot, _ *[]string) (assistant.ToolResult, error) {
			state.ScenarioVariant = knowledge.ScenarioVariant
			if spec, ok := assistant.FindScenarioSpec(knowledge.ScenarioVariant); ok {
				state.Scenario = spec.Scenario
			}
			state.KnowledgeTags = append([]string(nil), knowledge.KnowledgeTags...)
			state.ScenarioKnowledge = knowledge
			return assistant.ToolResult{}, nil
		})
		return output(scenarioKnowledgeOutput(knowledge), err)
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
			"review_result":      reviewResultOutput(value.Result),
			"mistakes":           mistakesOutput(value.Result.Mistakes),
			"repractice_targets": repracticeTargetsOutput(value.Result.RepracticeTargets),
		}, err)
	case "review.list_history":
		items, err := r.review.ListHistory(ctx, review.HistoryQuery{Limit: intArgument(invocation.Arguments["limit"])})
		mapped := make([]map[string]any, 0, len(items))
		for _, item := range items {
			mapped = append(mapped, map[string]any{
				"practice_session_id": item.PracticeSessionID, "scenario": item.Scenario,
				"completed_turns": item.CompletedTurns, "status": item.Status,
				"started_at": item.StartedAt, "ended_at": item.EndedAt,
				"feedback": item.Feedback, "has_feedback": item.HasFeedback,
				"review_id": item.ReviewID, "repractice_focus": item.RepracticeFocus,
			})
		}
		return output(map[string]any{"items": mapped}, err)
	case "review.save_mistake":
		value, err := r.review.SaveMistake(ctx, review.SaveMistakeCommand{
			SessionID:     stringArgument(invocation.Arguments["practice_session_id"]),
			QuestionIndex: intArgument(invocation.Arguments["question_index"]),
		})
		return output(map[string]any{"mistake": savedMistakeOutput(value), "card": mistakeCardOutput(mistakeCardFromSaved(value))}, err)
	case "review.list_mistakes":
		items, err := r.review.ListMistakes(ctx, review.ListMistakesQuery{
			Limit:  intArgument(invocation.Arguments["limit"]),
			Status: stringArgument(invocation.Arguments["status"]),
		})
		return output(map[string]any{"items": mistakeCardsOutput(items)}, err)
	case "review.get_mistake_context":
		value, err := r.review.GetMistakeContext(ctx, review.MistakeContextQuery{MistakeID: stringArgument(invocation.Arguments["mistake_id"])})
		return output(map[string]any{
			"mistake": savedMistakeOutput(value.Mistake),
			"session": map[string]any{
				"id": value.Session.ID, "target_role": value.Session.TargetRole,
				"interviewer": value.Session.Interviewer, "status": value.Session.Status,
				"completed_turns": value.Session.CompletedTurns, "max_turns": value.Session.MaxTurns,
				"questions": value.Session.Questions, "answers": value.Session.Answers,
			},
			"question_index": value.QuestionIndex,
			"repractices":    repracticeResultsOutput(value.Repractices),
		}, err)
	case "review.submit_mistake_repractice":
		value, err := r.review.SubmitMistakeRepractice(ctx, review.SubmitMistakeRepracticeCommand{
			MistakeID:  stringArgument(invocation.Arguments["mistake_id"]),
			AnswerText: fmt.Sprint(invocation.Arguments["answer_text"]),
		})
		return output(map[string]any{"repractice": repracticeResultOutput(value), "summary": value.Summary}, err)
	default:
		return assistant.ToolResult{}, fmt.Errorf("unregistered tool: %s", invocation.ToolName)
	}
}

func scenarioKnowledgeOutput(knowledge assistant.ScenarioKnowledge) map[string]any {
	return map[string]any{
		"scenario_variant":   knowledge.ScenarioVariant,
		"knowledge_tags":     append([]string(nil), knowledge.KnowledgeTags...),
		"competency_context": append([]string(nil), knowledge.CompetencyContext...),
		"question_guidance":  knowledge.QuestionGuidance,
	}
}

func output(value map[string]any, err error) (assistant.ToolResult, error) {
	if err != nil {
		return assistant.ToolResult{}, err
	}
	return assistant.ToolResult{Output: value}, nil
}

func reviewResultOutput(result review.ReviewResult) map[string]any {
	return map[string]any{
		"id": result.ID, "practice_session_id": result.SessionID,
		"target_role": result.TargetRole, "scenario_type": result.ScenarioType,
		"completed_turns": result.CompletedTurns, "max_turns": result.MaxTurns,
		"evidence_status": result.EvidenceStatus, "rubric_id": result.RubricID,
		"scores": map[string]any{
			"structure": result.Scores.Structure, "content": result.Scores.Content,
			"english": result.Scores.English, "scenario_match": result.Scores.ScenarioMatch,
			"overall": result.Scores.Overall,
		},
		"feedback_items":     feedbackItemsOutput(result.FeedbackItems),
		"mistakes":           mistakesOutput(result.Mistakes),
		"repractice_targets": repracticeTargetsOutput(result.RepracticeTargets),
		"summary":            result.Summary,
		"created_at":         result.CreatedAt,
	}
}

func feedbackItemsOutput(items []review.FeedbackItem) []map[string]any {
	mapped := make([]map[string]any, 0, len(items))
	for _, item := range items {
		mapped = append(mapped, map[string]any{
			"type": item.Type, "message": item.Message,
			"evidence": item.Evidence, "suggestion": item.Suggestion,
		})
	}
	return mapped
}

func mistakesOutput(items []review.MistakeItem) []map[string]any {
	mapped := make([]map[string]any, 0, len(items))
	for _, item := range items {
		mapped = append(mapped, map[string]any{
			"id": item.ID, "type": item.Type, "original_text": item.OriginalText,
			"issue": item.Issue, "suggestion": item.Suggestion,
			"repractice_status": item.RepracticeStatus,
		})
	}
	return mapped
}

func repracticeTargetsOutput(items []review.RepracticeTarget) []map[string]any {
	mapped := make([]map[string]any, 0, len(items))
	for _, item := range items {
		mapped = append(mapped, map[string]any{
			"id": item.ID, "focus": item.Focus, "reason": item.Reason,
			"prompt": item.Prompt, "source_mistake_ids": item.SourceMistakeIDs,
			"status": item.Status,
		})
	}
	return mapped
}

func savedMistakeOutput(item assistant.SavedMistake) map[string]any {
	return map[string]any{
		"id": item.ID, "practice_session_id": item.SessionID,
		"question_index": item.QuestionIndex, "target_role": item.TargetRole,
		"question_text": item.QuestionText, "original_answer": item.OriginalAnswer,
		"source_review_id": item.SourceReviewID, "status": item.Status,
		"latest_repractice_id": item.LatestRepracticeID, "created_at": item.CreatedAt,
		"updated_at": item.UpdatedAt,
	}
}

func mistakeCardFromSaved(item assistant.SavedMistake) assistant.MistakeCard {
	return assistant.MistakeCard{
		MistakeID: item.ID, SessionID: item.SessionID, QuestionIndex: item.QuestionIndex,
		TargetRole: item.TargetRole, QuestionText: item.QuestionText,
		OriginalAnswer: item.OriginalAnswer, Status: item.Status, CreatedAt: item.CreatedAt,
	}
}

func mistakeCardsOutput(items []assistant.MistakeCard) []map[string]any {
	mapped := make([]map[string]any, 0, len(items))
	for _, item := range items {
		mapped = append(mapped, mistakeCardOutput(item))
	}
	return mapped
}

func mistakeCardOutput(item assistant.MistakeCard) map[string]any {
	return map[string]any{
		"mistake_id": item.MistakeID, "practice_session_id": item.SessionID,
		"question_index": item.QuestionIndex, "target_role": item.TargetRole,
		"question_text": item.QuestionText, "original_answer": item.OriginalAnswer,
		"status": item.Status, "created_at": item.CreatedAt,
		"latest_summary": item.LatestSummary,
	}
}

func repracticeResultsOutput(items []assistant.MistakeRepracticeResult) []map[string]any {
	mapped := make([]map[string]any, 0, len(items))
	for _, item := range items {
		mapped = append(mapped, repracticeResultOutput(item))
	}
	return mapped
}

func repracticeResultOutput(item assistant.MistakeRepracticeResult) map[string]any {
	return map[string]any{
		"id": item.ID, "mistake_id": item.MistakeID,
		"practice_session_id": item.SessionID, "question_index": item.QuestionIndex,
		"question_text": item.QuestionText, "original_answer": item.OriginalAnswer,
		"new_answer": item.NewAnswer, "summary": item.Summary, "created_at": item.CreatedAt,
		"feedback": map[string]any{
			"type": item.Feedback.Type, "message": item.Feedback.Message,
			"evidence": item.Feedback.Evidence, "suggestion": item.Feedback.Suggestion,
		},
	}
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

func stringArgument(value any) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

func stringSliceArgument(value any) []string {
	switch typed := value.(type) {
	case []string:
		return append([]string(nil), typed...)
	case []any:
		result := make([]string, 0, len(typed))
		for _, item := range typed {
			if text := strings.TrimSpace(fmt.Sprint(item)); text != "" {
				result = append(result, text)
			}
		}
		return result
	default:
		text := stringArgument(value)
		if text == "" {
			return nil
		}
		return []string{text}
	}
}
