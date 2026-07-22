package mem0

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant"
)

func TestClientRecallAndObserveUseMem0Contract(t *testing.T) {
	var observed map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/search":
			var request map[string]any
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				t.Fatal(err)
			}
			filters := request["filters"].(map[string]any)
			if filters["user_id"] != "demo-user" || request["query"] != "我叫什么名字" {
				t.Fatalf("unexpected search request: %#v", request)
			}
			writeTestJSON(w, map[string]any{"results": []any{map[string]any{
				"id": "mem-1", "memory": "用户的名字是橘子", "score": 0.9,
			}}})
		case "/memories":
			if err := json.NewDecoder(r.Body).Decode(&observed); err != nil {
				t.Fatal(err)
			}
			writeTestJSON(w, map[string]any{"results": []any{}})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := New(server.URL)
	items, err := client.Recall(context.Background(), "demo-user", "run-2", "我叫什么名字", 5)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].Summary != "用户的名字是橘子" || items[0].Source != "mem0" {
		t.Fatalf("unexpected recall: %#v", items)
	}
	err = client.Observe(context.Background(), assistant.MemoryObservation{
		ActorUserID: "demo-user", ThreadID: "thread-1", RunID: "run-2", Source: "run",
		UserMessage: "我叫什么名字", AssistantResponse: "你叫橘子。",
	})
	if err != nil {
		t.Fatal(err)
	}
	if observed["user_id"] != "demo-user" || observed["run_id"] != "run-2" {
		t.Fatalf("unexpected observation scope: %#v", observed)
	}
	messages := observed["messages"].([]any)
	if len(messages) != 2 || messages[0].(map[string]any)["role"] != "user" || messages[1].(map[string]any)["role"] != "assistant" {
		t.Fatalf("unexpected observation messages: %#v", messages)
	}
}

func TestHTTPHandlerUsesNativeMem0ResourceShape(t *testing.T) {
	sidecar := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/memories":
			if r.URL.Query().Get("user_id") != "demo-user" {
				t.Fatalf("missing Mem0 user filter: %s", r.URL.RawQuery)
			}
			writeTestJSON(w, map[string]any{"results": []any{map[string]any{
				"id": "mem-1", "memory": "用户的名字是橘子", "metadata": map[string]any{"source": "run"},
			}}})
		case r.Method == http.MethodGet && r.URL.Path == "/memories/mem-1":
			writeTestJSON(w, map[string]any{"id": "mem-1", "memory": "用户的名字是橘子"})
		case r.Method == http.MethodGet && r.URL.Path == "/memories/mem-1/history":
			writeTestJSON(w, map[string]any{"results": []any{map[string]any{
				"memoryId": "mem-1", "action": "ADD", "newValue": "用户的名字是橘子",
			}}})
		case r.Method == http.MethodPut && r.URL.Path == "/memories/mem-1":
			var request map[string]any
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				t.Fatal(err)
			}
			if request["text"] != "用户叫橘子" {
				t.Fatalf("unexpected Mem0 update: %#v", request)
			}
			writeTestJSON(w, map[string]any{"id": "mem-1", "memory": "用户叫橘子"})
		case r.Method == http.MethodDelete && r.URL.Path == "/memories/mem-1":
			writeTestJSON(w, map[string]any{"message": "deleted"})
		default:
			http.NotFound(w, r)
		}
	}))
	defer sidecar.Close()

	mux := http.NewServeMux()
	NewHTTPHandler(New(sidecar.URL), "demo-user").Register(mux)

	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/memories", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("list status = %d body=%s", response.Code, response.Body.String())
	}
	var list struct {
		Results []Item `json:"results"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	if len(list.Results) != 1 || list.Results[0].Memory != "用户的名字是橘子" {
		t.Fatalf("unexpected native list response: %#v", list)
	}

	response = httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/memories/mem-1/history", nil))
	if response.Code != http.StatusOK || !bytes.Contains(response.Body.Bytes(), []byte(`"action":"ADD"`)) {
		t.Fatalf("unexpected history response: %d %s", response.Code, response.Body.String())
	}

	response = httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodPut, "/v1/memories/mem-1", bytes.NewBufferString(`{"memory":"用户叫橘子"}`)))
	if response.Code != http.StatusOK || !bytes.Contains(response.Body.Bytes(), []byte(`"memory":"用户叫橘子"`)) {
		t.Fatalf("unexpected update response: %d %s", response.Code, response.Body.String())
	}

	response = httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodDelete, "/v1/memories/mem-1", nil))
	if response.Code != http.StatusNoContent {
		t.Fatalf("delete status = %d body=%s", response.Code, response.Body.String())
	}
}

func writeTestJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(value)
}
