package assistant

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestLiveSessionHTTPEndpointsUseTokenSourceSchema(t *testing.T) {
	store := NewMemoryConversationStore()
	tools := NewDemoState()
	service := NewService(Dependencies{
		ConversationStore: store,
		LiveKit:           testLiveKitConfig(),
	})
	handler := NewHTTPHandler(
		log.New(io.Discard, "", 0), service, store, tools, tools,
		nil, nil, nil, nil, nil,
	)
	mux := http.NewServeMux()
	handler.Register(mux)

	start := httptest.NewRecorder()
	mux.ServeHTTP(start, httptest.NewRequest(
		http.MethodPost,
		"/v1/assistant/threads/thread-demo-001/live-sessions",
		bytes.NewBufferString(`{"actor_user_id":"demo-user","idempotency_key":"live-1"}`),
	))
	if start.Code != http.StatusCreated {
		t.Fatalf("start status=%d body=%s", start.Code, start.Body.String())
	}
	var response struct {
		ServerURL        string      `json:"server_url"`
		ParticipantToken string      `json:"participant_token"`
		LiveSession      LiveSession `json:"live_session"`
	}
	if err := json.NewDecoder(start.Body).Decode(&response); err != nil {
		t.Fatal(err)
	}
	if response.ServerURL == "" || response.ParticipantToken == "" || response.LiveSession.ID == "" {
		t.Fatalf("invalid token endpoint response: %#v", response)
	}

	resume := httptest.NewRecorder()
	mux.ServeHTTP(resume, httptest.NewRequest(
		http.MethodPost,
		"/v1/assistant/live-sessions/"+response.LiveSession.ID+"/resume",
		bytes.NewBufferString(`{"actor_user_id":"demo-user"}`),
	))
	if resume.Code != http.StatusOK {
		t.Fatalf("resume status=%d body=%s", resume.Code, resume.Body.String())
	}
	end := httptest.NewRecorder()
	mux.ServeHTTP(end, httptest.NewRequest(
		http.MethodPost,
		"/v1/assistant/live-sessions/"+response.LiveSession.ID+"/end",
		bytes.NewBufferString(`{"actor_user_id":"demo-user"}`),
	))
	if end.Code != http.StatusOK {
		t.Fatalf("end status=%d body=%s", end.Code, end.Body.String())
	}
}

func TestLiveSessionHTTPUnavailableAndUnknownThread(t *testing.T) {
	for name, service := range map[string]*Service{
		"disabled": NewService(Dependencies{
			ConversationStore: NewMemoryConversationStore(),
		}),
		"missing-thread": NewService(Dependencies{
			ConversationStore: NewMemoryConversationStore(),
			LiveKit:           testLiveKitConfig(),
		}),
	} {
		t.Run(name, func(t *testing.T) {
			store := NewMemoryConversationStore()
			handler := NewHTTPHandler(
				log.New(io.Discard, "", 0), service, store, NewDemoState(), NewDemoState(),
				nil, nil, nil, nil, nil,
			)
			mux := http.NewServeMux()
			handler.Register(mux)
			threadID := DemoThreadID
			want := http.StatusServiceUnavailable
			if name == "missing-thread" {
				threadID = "missing"
				want = http.StatusNotFound
			}
			recorder := httptest.NewRecorder()
			mux.ServeHTTP(recorder, httptest.NewRequest(
				http.MethodPost,
				"/v1/assistant/threads/"+threadID+"/live-sessions",
				bytes.NewBufferString(`{"actor_user_id":"demo-user","idempotency_key":"live-1"}`),
			))
			if recorder.Code != want {
				t.Fatalf("status=%d want=%d body=%s", recorder.Code, want, recorder.Body.String())
			}
		})
	}
}
