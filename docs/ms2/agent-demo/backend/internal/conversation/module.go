// Package conversation owns question generation, free replies, and completed turns.
package conversation

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant"
)

type ContextMessage struct {
	Role    string
	Content string
}

type ReplyCommand struct {
	UserMessage    string
	ContextSummary string
	Messages       []ContextMessage
}

type Question struct {
	ID       string
	Type     string
	Content  string
	Sequence int
}

type Reply struct {
	Summary     string
	UserMessage string
}

type SubmitTurnCommand struct {
	AnswerText      string
	InteractionMode string
}

type CompletedTurn struct {
	ID              string
	Status          string
	AnswerText      string
	InteractionMode string
}

type QuestionService interface {
	GenerateNextQuestion(context.Context) (Question, error)
}

type ReplyService interface {
	GenerateReply(context.Context, ReplyCommand) (Reply, error)
}

type TurnService interface {
	SubmitTurn(context.Context, SubmitTurnCommand) (CompletedTurn, error)
}

type AnswerCoachService interface {
	GenerateAnswerCoach(context.Context) (assistant.AnswerCoach, error)
}

type Service interface {
	QuestionService
	ReplyService
	TurnService
	AnswerCoachService
}

type StateStore interface {
	Transact(assistant.DemoTransaction) (assistant.ToolResult, error)
}

type service struct {
	state     StateStore
	generator assistant.AgentContentGenerator
}

func NewService(state StateStore, generator assistant.AgentContentGenerator) Service {
	return service{state: state, generator: generator}
}

func (s service) GenerateNextQuestion(ctx context.Context) (questionResult Question, err error) {
	_, err = s.state.Transact(func(state *assistant.RuntimeSnapshot, answers *[]string) (assistant.ToolResult, error) {
		index := state.CompletedQuestionCount
		question := fmt.Sprintf("Please continue this %s interview with the single most relevant next question based on the candidate's latest answer.", state.TargetRole)
		previousQuestion := ""
		if len(state.Questions) > 0 {
			previousQuestion = state.Questions[len(state.Questions)-1]
		}
		latestAnswer := ""
		if len(*answers) > 0 {
			latestAnswer = (*answers)[len(*answers)-1]
		}
		elapsedMinutes, remainingMinutes := interviewProgress(*state)
		if s.generator != nil {
			generated, err := s.generator.GenerateQuestion(ctx, assistant.InterviewGenerationInput{
				CompletedQuestionCount: state.CompletedQuestionCount, PreviousQuestion: previousQuestion,
				LatestAnswer: latestAnswer, TargetRole: state.TargetRole, Answers: append([]string(nil), (*answers)...),
				PreviousQuestions: append([]string(nil), state.Questions...), MaxTurns: state.MaxTurns,
				DurationMinutes: state.DurationMinutes, ElapsedMinutes: elapsedMinutes,
				RemainingMinutes: remainingMinutes, CandidateProfile: state.CandidateProfile,
			})
			if err != nil {
				return assistant.ToolResult{}, err
			}
			question = generated
		}
		state.ActiveQuestion = question
		state.Questions = append(state.Questions, question)
		questionResult = Question{ID: fmt.Sprintf("question-demo-%d", index+1), Type: "PRIMARY", Content: question, Sequence: index + 1}
		return assistant.ToolResult{}, nil
	})
	return questionResult, err
}

func interviewProgress(state assistant.RuntimeSnapshot) (elapsedMinutes, remainingMinutes int) {
	now := time.Now().UTC()
	if !state.StartedAt.IsZero() {
		elapsedMinutes = max(0, int(now.Sub(state.StartedAt).Minutes()))
	}
	if !state.Deadline.IsZero() {
		remainingMinutes = max(0, int(state.Deadline.Sub(now).Minutes()))
	}
	return elapsedMinutes, remainingMinutes
}

func (s service) GenerateReply(ctx context.Context, command ReplyCommand) (replyResult Reply, err error) {
	if len(command.Messages) == 0 {
		return Reply{}, errors.New("conversation.generate_reply requires complete conversation_messages")
	}
	_, err = s.state.Transact(func(state *assistant.RuntimeSnapshot, _ *[]string) (assistant.ToolResult, error) {
		userMessage := strings.TrimSpace(command.UserMessage)
		contextSummary := strings.TrimSpace(command.ContextSummary)
		reply := "我可以和你自由对话，也可以在你提出面试需求时切换到模拟面试场景。"
		if userMessage != "" {
			reply = "你说的是：“" + userMessage + "”。这是一次普通自由对话，没有启动面试。"
		}
		if s.generator != nil {
			messages := make([]assistant.ContextMessage, 0, len(command.Messages))
			for _, message := range command.Messages {
				messages = append(messages, assistant.ContextMessage{Role: message.Role, Content: message.Content})
			}
			generated, err := s.generator.GenerateConversationReply(ctx, assistant.ConversationReplyInput{
				UserMessage: userMessage, ContextSummary: contextSummary,
				Messages: messages, CandidateProfile: state.CandidateProfile,
			})
			if err != nil {
				return assistant.ToolResult{}, err
			}
			reply = generated
		}
		replyResult = Reply{Summary: reply, UserMessage: userMessage}
		return assistant.ToolResult{}, nil
	})
	return replyResult, err
}

func (s service) GenerateAnswerCoach(ctx context.Context) (result assistant.AnswerCoach, err error) {
	generator, ok := s.generator.(assistant.AnswerCoachGenerator)
	if !ok {
		return assistant.AnswerCoach{}, errors.New("conversation answer coach generator is not configured")
	}
	_, err = s.state.Transact(func(state *assistant.RuntimeSnapshot, answers *[]string) (assistant.ToolResult, error) {
		question := strings.TrimSpace(state.ActiveQuestion)
		if question == "" {
			return assistant.ToolResult{}, assistant.ErrNoActiveQuestion
		}
		answer, generateErr := generator.GenerateAnswerCoach(ctx, assistant.AnswerCoachInput{
			Question:         question,
			TargetRole:       state.TargetRole,
			CandidateProfile: state.CandidateProfile,
			PreviousAnswers:  append([]string(nil), (*answers)...),
		})
		if generateErr != nil {
			return assistant.ToolResult{}, generateErr
		}
		answer = strings.TrimSpace(answer)
		if answer == "" {
			return assistant.ToolResult{}, errors.New("conversation answer coach returned an empty answer")
		}
		result = assistant.AnswerCoach{Question: question, Answer: answer}
		return assistant.ToolResult{}, nil
	})
	return result, err
}

func (s service) SubmitTurn(_ context.Context, command SubmitTurnCommand) (turn CompletedTurn, err error) {
	_, err = s.state.Transact(func(state *assistant.RuntimeSnapshot, answers *[]string) (assistant.ToolResult, error) {
		state.ActiveQuestion = ""
		state.CompletedQuestionCount++
		*answers = append(*answers, command.AnswerText)
		mode := strings.TrimSpace(command.InteractionMode)
		if mode == "" {
			mode = "TEXT"
		}
		turn = CompletedTurn{ID: fmt.Sprintf("turn-demo-%d", state.CompletedQuestionCount), Status: "completed", AnswerText: command.AnswerText, InteractionMode: mode}
		return assistant.ToolResult{}, nil
	})
	return turn, err
}
