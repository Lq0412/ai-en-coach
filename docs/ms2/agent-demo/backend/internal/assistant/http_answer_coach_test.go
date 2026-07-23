package assistant

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type answerCoachStub struct {
	answer AnswerCoach
	err    error
}

func (s answerCoachStub) GenerateAnswerCoach(context.Context) (AnswerCoach, error) {
	return s.answer, s.err
}

type repracticeFeedbackStub struct {
	input RepracticeFeedbackInput
	note  ReviewNote
	err   error
}

func (s *repracticeFeedbackStub) GenerateRepracticeFeedback(_ context.Context, input RepracticeFeedbackInput) (ReviewNote, error) {
	s.input = input
	return s.note, s.err
}

func TestAnswerCoachHTTPResponse(t *testing.T) {
	handler := NewHTTPHandler(
		log.New(io.Discard, "", 0), nil, nil, nil, nil,
		answerCoachStub{answer: AnswerCoach{Question: "Why this role?", Answer: "I enjoy solving practical backend problems."}},
		nil, nil, nil, nil, nil,
	)
	mux := http.NewServeMux()
	handler.Register(mux)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/v1/practice/answer-coach", nil))

	if recorder.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d body=%s", recorder.Code, recorder.Body.String())
	}
	var response AnswerCoach
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatal(err)
	}
	if response.Question != "Why this role?" || response.Answer != "I enjoy solving practical backend problems." {
		t.Fatalf("unexpected response: %#v", response)
	}
}

func TestAnswerCoachHTTPRejectsMissingActiveQuestion(t *testing.T) {
	handler := NewHTTPHandler(
		log.New(io.Discard, "", 0), nil, nil, nil, nil,
		answerCoachStub{err: ErrNoActiveQuestion}, nil, nil, nil, nil, nil,
	)
	mux := http.NewServeMux()
	handler.Register(mux)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/v1/practice/answer-coach", nil))

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("unexpected status: %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestSavedMistakeRepracticeHTTPUsesGeneratedFeedback(t *testing.T) {
	tools := NewDemoState()
	_, err := tools.Transact(func(state *RuntimeSnapshot, _ *[]string) (ToolResult, error) {
		state.Sessions = append(state.Sessions, InterviewSession{
			ID:              "session-ai-repractice",
			TargetRole:      "AI Application Developer",
			Status:          "completed",
			MaxTurns:        3,
			DurationMinutes: 15,
			CompletedTurns:  2,
			StartedAt:       time.Now().UTC(),
			Questions: []string{
				"How did you manage long conversation memory?",
				"How did you validate the result?",
			},
			Answers: []string{
				"I triggered summarization at eighty percent.",
				"I compared token limit failures before and after the change.",
			},
		})
		return ToolResult{}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	mistake, err := tools.SaveReviewMistake("session-ai-repractice", 0)
	if err != nil {
		t.Fatal(err)
	}
	generator := &repracticeFeedbackStub{note: ReviewNote{
		Type:       "still_weak",
		Message:    "AI 认为这次回答结合了阈值策略，但结果还可以更具体。",
		Evidence:   "summarized only the oldest 50%",
		Suggestion: "补充测试范围、失败率或上下文保留效果。",
	}}
	handler := NewHTTPHandler(
		log.New(io.Discard, "", 0), nil, nil, tools, nil, nil,
		nil, generator, nil, nil, nil,
	)
	mux := http.NewServeMux()
	handler.Register(mux)
	body := bytes.NewBufferString(`{"answer_text":"I used an eighty percent threshold and summarized only the oldest 50% of the conversation."}`)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/v1/review/mistakes/"+mistake.ID+"/repractice", body))

	if recorder.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d body=%s", recorder.Code, recorder.Body.String())
	}
	if generator.input.Mistake.ID != mistake.ID || len(generator.input.Session.Questions) != 2 {
		t.Fatalf("generator did not receive mistake context: %#v", generator.input)
	}
	context, err := tools.GetSavedMistakeContext(mistake.ID)
	if err != nil {
		t.Fatal(err)
	}
	latest := context.Repractices[len(context.Repractices)-1]
	if latest.Summary != generator.note.Message || latest.Feedback.Suggestion != generator.note.Suggestion {
		t.Fatalf("generated feedback was not saved: %#v", latest)
	}
}
