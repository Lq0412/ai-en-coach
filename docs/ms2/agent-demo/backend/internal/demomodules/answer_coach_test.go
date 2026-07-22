package demomodules

import (
	"context"
	"testing"

	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant"
)

type answerCoachCaptureGenerator struct {
	coachInputs []assistant.AnswerCoachInput
}

func (g *answerCoachCaptureGenerator) GenerateQuestion(_ context.Context, input assistant.InterviewGenerationInput) (string, error) {
	if input.CompletedQuestionCount == 0 {
		return "Tell me about your most relevant backend experience.", nil
	}
	return "How do you make a technical trade-off?", nil
}

func (g *answerCoachCaptureGenerator) GenerateFeedback(context.Context, assistant.InterviewFeedbackInput) (string, error) {
	return "feedback", nil
}

func (g *answerCoachCaptureGenerator) GenerateConversationReply(context.Context, assistant.ConversationReplyInput) (string, error) {
	return "reply", nil
}

func (g *answerCoachCaptureGenerator) GenerateAnswerCoach(_ context.Context, input assistant.AnswerCoachInput) (string, error) {
	g.coachInputs = append(g.coachInputs, input)
	return "I compare the user impact, implementation risk, and long-term maintenance cost before making a trade-off.", nil
}

func TestAnswerCoachUsesActiveInterviewContext(t *testing.T) {
	ctx := context.Background()
	state := assistant.NewDemoState()
	generator := &answerCoachCaptureGenerator{}
	registry := NewRegistry(state, generator)
	execute := func(tool string, arguments map[string]any) {
		t.Helper()
		if _, err := registry.Execute(ctx, assistant.ToolInvocation{ToolName: tool, Arguments: arguments}); err != nil {
			t.Fatalf("execute %s: %v", tool, err)
		}
	}

	execute("practice.create_plan", map[string]any{"role": "Go Backend Engineer", "max_turns": 3, "duration_minutes": 5})
	execute("practice.start_session", nil)
	execute("conversation.generate_next_question", nil)
	execute("conversation.submit_turn", map[string]any{"answer_text": "I built APIs in Go.", "interaction_mode": "TEXT"})
	execute("practice.apply_turn_outcome", map[string]any{"answer_validity": "VALID"})
	execute("conversation.generate_next_question", nil)

	result, err := registry.GenerateAnswerCoach(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if result.Question != "How do you make a technical trade-off?" || result.Answer == "" {
		t.Fatalf("unexpected answer coach result: %#v", result)
	}
	if len(generator.coachInputs) != 1 {
		t.Fatalf("expected one coach input, got %d", len(generator.coachInputs))
	}
	input := generator.coachInputs[0]
	if input.Question != result.Question || input.TargetRole != "Go Backend Engineer" {
		t.Fatalf("missing active question or role: %#v", input)
	}
	if len(input.PreviousAnswers) != 1 || input.PreviousAnswers[0] != "I built APIs in Go." {
		t.Fatalf("missing previous answers: %#v", input.PreviousAnswers)
	}
}

func TestAnswerCoachRejectsMissingActiveQuestion(t *testing.T) {
	registry := NewRegistry(assistant.NewDemoState(), &answerCoachCaptureGenerator{})
	if _, err := registry.GenerateAnswerCoach(context.Background()); err != assistant.ErrNoActiveQuestion {
		t.Fatalf("expected ErrNoActiveQuestion, got %v", err)
	}
}
