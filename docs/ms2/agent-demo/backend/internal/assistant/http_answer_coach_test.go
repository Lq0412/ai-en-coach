package assistant

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"testing"
)

type answerCoachStub struct {
	answer AnswerCoach
	err    error
}

func (s answerCoachStub) GenerateAnswerCoach(context.Context) (AnswerCoach, error) {
	return s.answer, s.err
}

func TestAnswerCoachHTTPResponse(t *testing.T) {
	handler := NewHTTPHandler(
		log.New(io.Discard, "", 0), nil, nil, nil, nil,
		answerCoachStub{answer: AnswerCoach{Question: "Why this role?", Answer: "I enjoy solving practical backend problems."}},
		nil, nil, nil,
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
		answerCoachStub{err: ErrNoActiveQuestion}, nil, nil, nil,
	)
	mux := http.NewServeMux()
	handler.Register(mux)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/v1/practice/answer-coach", nil))

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("unexpected status: %d body=%s", recorder.Code, recorder.Body.String())
	}
}
