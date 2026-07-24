package assistant

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type languageAssistanceStub struct {
	result LanguageAssistanceResult
	input  LanguageAssistanceInput
}

func (s *languageAssistanceStub) GenerateLanguageAssistance(
	_ context.Context,
	input LanguageAssistanceInput,
) (LanguageAssistanceResult, error) {
	s.input = input
	return s.result, nil
}

func TestLanguageAssistanceHTTPResponse(t *testing.T) {
	stub := &languageAssistanceStub{result: LanguageAssistanceResult{
		Operation:      "translate",
		TargetLanguage: "zh-CN",
		Translation:    "今天的会议怎么样？",
	}}
	handler := NewHTTPHandler(
		log.New(io.Discard, "", 0),
		nil, nil, nil, nil, nil, stub, nil, nil, nil, nil,
	)
	mux := http.NewServeMux()
	handler.Register(mux)
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/language-assistance",
		strings.NewReader(`{"operation":"translate","text":"How was the meeting?"}`),
	)
	mux.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d body=%s", recorder.Code, recorder.Body.String())
	}
	if stub.input.TargetLanguage != "zh-CN" {
		t.Fatalf("target language default was not applied: %#v", stub.input)
	}
	var response LanguageAssistanceResult
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatal(err)
	}
	if response.Translation != "今天的会议怎么样？" {
		t.Fatalf("unexpected response: %#v", response)
	}
}

func TestLanguageAssistanceAcceptsCanonicalLiveMessageText(t *testing.T) {
	stub := &languageAssistanceStub{result: LanguageAssistanceResult{
		Operation:  "correct",
		Correction: &LanguageCorrection{HasIssues: false, Brief: "表达自然"},
	}}
	handler := NewHTTPHandler(
		log.New(io.Discard, "", 0),
		nil, nil, nil, nil, nil, stub, nil, nil, nil, nil,
	)
	mux := http.NewServeMux()
	handler.Register(mux)

	message := AssistantMessage{
		ID:              "message-live-user",
		Role:            "user",
		Content:         "I handled the project successfully.",
		ClientMessageID: "client-live-1",
		LiveSessionID:   "live-1",
		TurnID:          "turn-1",
		Mode:            ConversationModeLive,
	}
	body, err := json.Marshal(LanguageAssistanceInput{
		Operation: "correct",
		Text:      message.Content,
	})
	if err != nil {
		t.Fatal(err)
	}
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, httptest.NewRequest(
		http.MethodPost,
		"/v1/language-assistance",
		strings.NewReader(string(body)),
	))

	if recorder.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d body=%s", recorder.Code, recorder.Body.String())
	}
	if stub.input.Text != message.Content || stub.input.Operation != "correct" {
		t.Fatalf("live message text did not reuse language assistance: %#v", stub.input)
	}
}

func TestLanguageAssistanceHTTPValidatesOperationAndText(t *testing.T) {
	handler := NewHTTPHandler(
		log.New(io.Discard, "", 0),
		nil, nil, nil, nil, nil, &languageAssistanceStub{}, nil, nil, nil, nil,
	)
	mux := http.NewServeMux()
	handler.Register(mux)

	for _, body := range []string{
		`{"operation":"summarize","text":"Hello"}`,
		`{"operation":"correct","text":""}`,
	} {
		recorder := httptest.NewRecorder()
		mux.ServeHTTP(
			recorder,
			httptest.NewRequest(http.MethodPost, "/v1/language-assistance", strings.NewReader(body)),
		)
		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("body %s returned status %d", body, recorder.Code)
		}
	}
}
