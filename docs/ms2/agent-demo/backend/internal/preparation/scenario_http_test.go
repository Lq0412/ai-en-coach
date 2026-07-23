package preparation

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestScenarioHTTPHandlerManagesCurrentScenario(t *testing.T) {
	service := NewScenarioService(NewMemoryScenarioRepository())
	mux := http.NewServeMux()
	NewScenarioHTTPHandler(service, "user-1").Register(mux)

	create := func(key string) *httptest.ResponseRecorder {
		body := []byte(`{"source_thread_id":"thread-1","created_from_message_id":"message-1","type":"interview","title":"PM interview","goal":"prepare","facts":[{"key":"round","value":"first","source":"user_statement","source_ref":"message-1"}]}`)
		request := httptest.NewRequest(http.MethodPost, "/v1/scenarios", bytes.NewReader(body))
		request.Header.Set("Idempotency-Key", key)
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, request)
		return response
	}

	created := create("create-1")
	if created.Code != http.StatusCreated {
		t.Fatalf("create status = %d body=%s", created.Code, created.Body.String())
	}
	var payload struct {
		Scenario Scenario `json:"scenario"`
		Created  bool     `json:"created"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if !payload.Created || payload.Scenario.ID == "" {
		t.Fatalf("create payload = %#v", payload)
	}

	repeated := create("create-1")
	if repeated.Code != http.StatusOK {
		t.Fatalf("idempotent create status = %d body=%s", repeated.Code, repeated.Body.String())
	}

	current := httptest.NewRecorder()
	mux.ServeHTTP(current, httptest.NewRequest(http.MethodGet, "/v1/scenarios/current?thread_id=thread-1", nil))
	if current.Code != http.StatusOK || !bytes.Contains(current.Body.Bytes(), []byte(payload.Scenario.ID)) {
		t.Fatalf("current status=%d body=%s", current.Code, current.Body.String())
	}

	archiveBody := []byte(`{"action":"status","expected_version":1,"status":"archived"}`)
	archive := httptest.NewRecorder()
	mux.ServeHTTP(archive, httptest.NewRequest(http.MethodPatch, "/v1/scenarios/"+payload.Scenario.ID, bytes.NewReader(archiveBody)))
	if archive.Code != http.StatusOK {
		t.Fatalf("archive status=%d body=%s", archive.Code, archive.Body.String())
	}

	missing := httptest.NewRecorder()
	mux.ServeHTTP(missing, httptest.NewRequest(http.MethodGet, "/v1/scenarios/current?thread_id=thread-1", nil))
	if missing.Code != http.StatusNotFound {
		t.Fatalf("current after archive status=%d body=%s", missing.Code, missing.Body.String())
	}
}

func TestScenarioHTTPHandlerRejectsMissingIdempotencyKey(t *testing.T) {
	mux := http.NewServeMux()
	NewScenarioHTTPHandler(NewScenarioService(NewMemoryScenarioRepository()), "user-1").Register(mux)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/v1/scenarios", bytes.NewBufferString(`{}`)))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestScenarioHTTPHandlerDoesNotExposeAnotherUsersScenario(t *testing.T) {
	service := NewScenarioService(NewMemoryScenarioRepository())
	ownerMux := http.NewServeMux()
	NewScenarioHTTPHandler(service, "user-1").Register(ownerMux)

	request := httptest.NewRequest(http.MethodPost, "/v1/scenarios", bytes.NewBufferString(
		`{"source_thread_id":"thread-1","created_from_message_id":"message-1","type":"interview","title":"Private interview","goal":"prepare"}`,
	))
	request.Header.Set("Idempotency-Key", "create-private")
	created := httptest.NewRecorder()
	ownerMux.ServeHTTP(created, request)
	if created.Code != http.StatusCreated {
		t.Fatalf("create status=%d body=%s", created.Code, created.Body.String())
	}
	var payload struct {
		Scenario Scenario `json:"scenario"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}

	otherUserMux := http.NewServeMux()
	NewScenarioHTTPHandler(service, "user-2").Register(otherUserMux)
	response := httptest.NewRecorder()
	otherUserMux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/scenarios/"+payload.Scenario.ID, nil))
	if response.Code != http.StatusNotFound {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}

	deleteBody := bytes.NewBufferString(`{"expected_version":1}`)
	deleted := httptest.NewRecorder()
	ownerMux.ServeHTTP(deleted, httptest.NewRequest(http.MethodDelete, "/v1/scenarios/"+payload.Scenario.ID, deleteBody))
	if deleted.Code != http.StatusNoContent {
		t.Fatalf("delete status=%d body=%s", deleted.Code, deleted.Body.String())
	}
	missing := httptest.NewRecorder()
	ownerMux.ServeHTTP(missing, httptest.NewRequest(http.MethodGet, "/v1/scenarios/"+payload.Scenario.ID, nil))
	if missing.Code != http.StatusNotFound {
		t.Fatalf("get after delete status=%d body=%s", missing.Code, missing.Body.String())
	}
}
