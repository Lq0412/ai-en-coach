package assistant

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type u2Planner struct{}

func (u2Planner) Plan(context.Context, PlanRequest) (Plan, error) {
	return freeConversationPlan(), nil
}

type u2Tools struct{}

func (u2Tools) Execute(ctx context.Context, _ ToolInvocation) (ToolResult, error) {
	if writer := textDeltaWriterFromContext(ctx); writer != nil {
		if err := writer("AI reply"); err != nil {
			return ToolResult{}, err
		}
	}
	return ToolResult{Output: map[string]any{
		"summary":      "AI reply",
		"user_message": "hello",
	}}, nil
}

func TestTaskStreamCommitsCanonicalUserBeforeAssistantDeltaAndLinksAttachment(t *testing.T) {
	store := NewMemoryConversationStore()
	tools := NewDemoState()
	service := NewService(Dependencies{
		Planner: u2Planner{}, Tools: u2Tools{}, ConversationStore: store,
		Runtime: tools, Attachments: tools,
	})
	handler := NewHTTPHandler(
		log.New(io.Discard, "", 0), service, store, tools, tools,
		nil, nil, nil, nil, nil,
	)
	mux := http.NewServeMux()
	handler.Register(mux)

	body := bytes.NewBufferString(`{
		"actor_user_id":"demo-user",
		"user_message":"hello",
		"idempotency_key":"client-1",
		"client_message_id":"client-1",
		"live_session_id":"live-1",
		"turn_id":"turn-client-1",
		"mode":"live"
	}`)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, httptest.NewRequest(
		http.MethodPost,
		"/v1/assistant/threads/thread-demo-001/tasks/stream",
		body,
	))
	stream := recorder.Body.String()
	canonicalAt := strings.Index(stream, "event: turn.user_committed")
	deltaAt := strings.Index(stream, "event: assistant.delta")
	assistantAt := strings.Index(stream, "event: turn.assistant_committed")
	completedAt := strings.Index(stream, "event: task.completed")
	if canonicalAt < 0 ||
		deltaAt < 0 ||
		assistantAt < 0 ||
		completedAt < 0 ||
		canonicalAt >= deltaAt ||
		deltaAt >= assistantAt ||
		assistantAt >= completedAt {
		t.Fatalf("canonical stream order is invalid:\n%s", stream)
	}

	messages, err := store.ListMessages(context.Background(), DemoThreadID)
	if err != nil {
		t.Fatal(err)
	}
	user := messages[len(messages)-2]
	assistant := messages[len(messages)-1]
	if user.ClientMessageID != "client-1" ||
		user.LiveSessionID != "live-1" ||
		user.TurnID != "turn-client-1" ||
		user.Mode != ConversationModeLive ||
		user.ID == "" {
		t.Fatalf("canonical user identity missing: %#v", user)
	}
	if assistant.Role != "assistant" ||
		assistant.ClientMessageID != user.ClientMessageID ||
		assistant.LiveSessionID != user.LiveSessionID ||
		assistant.TurnID != user.TurnID ||
		assistant.Mode != user.Mode ||
		!strings.Contains(stream[completedAt:], `"ID":"`+assistant.ID+`"`) {
		t.Fatalf("canonical assistant missing from persistence or snapshot: %#v", assistant)
	}

	attachment, err := tools.AddAttachment(context.Background(), AttachmentInput{
		Filename: "voice.webm", MediaType: "audio/webm", Data: []byte("audio"),
	})
	if err != nil {
		t.Fatal(err)
	}
	linkBody, _ := json.Marshal(map[string]string{"attachment_id": attachment.ID})
	for attempt := 0; attempt < 2; attempt++ {
		linkRecorder := httptest.NewRecorder()
		mux.ServeHTTP(linkRecorder, httptest.NewRequest(
			http.MethodPost,
			"/v1/assistant/messages/"+user.ID+"/attachments",
			bytes.NewReader(linkBody),
		))
		if linkRecorder.Code != http.StatusOK {
			t.Fatalf("link attempt %d: status=%d body=%s", attempt, linkRecorder.Code, linkRecorder.Body.String())
		}
	}
	messages, _ = store.ListMessages(context.Background(), DemoThreadID)
	user = messages[len(messages)-2]
	if len(user.Attachments) != 1 || user.Attachments[0].ID != attachment.ID {
		t.Fatalf("attachment link was not idempotent: %#v", user)
	}
}
