package preparation

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"
)

type ScenarioHTTPHandler struct {
	service ScenarioService
	userID  string
}

func NewScenarioHTTPHandler(service ScenarioService, userID string) *ScenarioHTTPHandler {
	return &ScenarioHTTPHandler{service: service, userID: strings.TrimSpace(userID)}
}

func (h *ScenarioHTTPHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /v1/scenarios", h.create)
	mux.HandleFunc("GET /v1/scenarios", h.list)
	mux.HandleFunc("GET /v1/scenarios/current", h.current)
	mux.HandleFunc("GET /v1/scenarios/{scenario_id}", h.get)
	mux.HandleFunc("PATCH /v1/scenarios/{scenario_id}", h.update)
	mux.HandleFunc("DELETE /v1/scenarios/{scenario_id}", h.delete)
	mux.HandleFunc("PUT /v1/assistant/threads/{thread_id}/scenario", h.setCurrent)
}

type createScenarioRequest struct {
	SourceThreadID       string          `json:"source_thread_id"`
	CreatedFromMessageID string          `json:"created_from_message_id"`
	Type                 ScenarioType    `json:"type"`
	Title                string          `json:"title"`
	Goal                 string          `json:"goal"`
	Participants         []string        `json:"participants"`
	ScheduledAt          *time.Time      `json:"scheduled_at"`
	Deadline             *time.Time      `json:"deadline"`
	Facts                []FactCandidate `json:"facts"`
	MaterialIDs          []string        `json:"material_ids"`
}

func (h *ScenarioHTTPHandler) create(w http.ResponseWriter, r *http.Request) {
	requestID := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if requestID == "" {
		writeScenarioError(w, ErrInvalidScenario)
		return
	}
	var input createScenarioRequest
	if err := decodeScenarioJSON(r, &input); err != nil {
		writeScenarioError(w, err)
		return
	}
	result, err := h.service.Create(r.Context(), CreateScenarioCommand{
		ActorUserID: h.userID, RequestID: requestID, SourceThreadID: input.SourceThreadID,
		CreatedFromMessageID: input.CreatedFromMessageID, Type: input.Type, Title: input.Title, Goal: input.Goal,
		Participants: input.Participants, ScheduledAt: input.ScheduledAt, Deadline: input.Deadline,
		Facts: input.Facts, MaterialIDs: input.MaterialIDs,
	})
	if err != nil {
		writeScenarioError(w, err)
		return
	}
	status := http.StatusCreated
	if !result.Created {
		status = http.StatusOK
	}
	writeScenarioJSON(w, status, map[string]any{"scenario": result.Scenario, "created": result.Created})
}

func (h *ScenarioHTTPHandler) list(w http.ResponseWriter, r *http.Request) {
	filter, err := scenarioListFilter(r)
	if err != nil {
		writeScenarioError(w, err)
		return
	}
	items, err := h.service.List(r.Context(), h.userID, filter)
	if err != nil {
		writeScenarioError(w, err)
		return
	}
	writeScenarioJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *ScenarioHTTPHandler) current(w http.ResponseWriter, r *http.Request) {
	scenario, err := h.service.Current(r.Context(), h.userID, r.URL.Query().Get("thread_id"))
	if err != nil {
		writeScenarioError(w, err)
		return
	}
	writeScenarioJSON(w, http.StatusOK, map[string]any{"scenario": scenario})
}

func (h *ScenarioHTTPHandler) get(w http.ResponseWriter, r *http.Request) {
	scenario, err := h.service.Get(r.Context(), h.userID, r.PathValue("scenario_id"))
	if err != nil {
		writeScenarioError(w, err)
		return
	}
	writeScenarioJSON(w, http.StatusOK, map[string]any{"scenario": scenario})
}

type updateScenarioRequest struct {
	Action          string          `json:"action"`
	ExpectedVersion uint64          `json:"expected_version"`
	Title           string          `json:"title"`
	Goal            string          `json:"goal"`
	Participants    []string        `json:"participants"`
	ScheduledAt     *time.Time      `json:"scheduled_at"`
	Deadline        *time.Time      `json:"deadline"`
	Status          ScenarioStatus  `json:"status"`
	Facts           []FactCandidate `json:"facts"`
	MaterialID      string          `json:"material_id"`
}

func (h *ScenarioHTTPHandler) update(w http.ResponseWriter, r *http.Request) {
	var input updateScenarioRequest
	if err := decodeScenarioJSON(r, &input); err != nil {
		writeScenarioError(w, err)
		return
	}
	scenarioID := r.PathValue("scenario_id")
	var (
		scenario Scenario
		err      error
	)
	switch strings.TrimSpace(input.Action) {
	case "details":
		scenario, err = h.service.ReplaceDetails(r.Context(), ReplaceScenarioDetailsCommand{
			ActorUserID: h.userID, ScenarioID: scenarioID, ExpectedVersion: input.ExpectedVersion,
			Title: input.Title, Goal: input.Goal, Participants: input.Participants, ScheduledAt: input.ScheduledAt, Deadline: input.Deadline,
		})
	case "status":
		scenario, err = h.service.ChangeStatus(r.Context(), ChangeScenarioStatusCommand{
			ActorUserID: h.userID, ScenarioID: scenarioID, ExpectedVersion: input.ExpectedVersion, Status: input.Status,
		})
	case "facts":
		scenario, err = h.service.MergeFacts(r.Context(), MergeScenarioFactsCommand{
			ActorUserID: h.userID, ScenarioID: scenarioID, ExpectedVersion: input.ExpectedVersion, Facts: input.Facts,
		})
	case "attach_material":
		scenario, err = h.service.AttachMaterial(r.Context(), ScenarioMaterialCommand{
			ActorUserID: h.userID, ScenarioID: scenarioID, ExpectedVersion: input.ExpectedVersion, MaterialID: input.MaterialID,
		})
	case "detach_material":
		scenario, err = h.service.DetachMaterial(r.Context(), ScenarioMaterialCommand{
			ActorUserID: h.userID, ScenarioID: scenarioID, ExpectedVersion: input.ExpectedVersion, MaterialID: input.MaterialID,
		})
	default:
		err = ErrInvalidScenario
	}
	if err != nil {
		writeScenarioError(w, err)
		return
	}
	writeScenarioJSON(w, http.StatusOK, map[string]any{"scenario": scenario})
}

type deleteScenarioRequest struct {
	ExpectedVersion uint64 `json:"expected_version"`
}

func (h *ScenarioHTTPHandler) delete(w http.ResponseWriter, r *http.Request) {
	var input deleteScenarioRequest
	if err := decodeScenarioJSON(r, &input); err != nil {
		writeScenarioError(w, err)
		return
	}
	if err := h.service.Delete(r.Context(), DeleteScenarioCommand{
		ActorUserID: h.userID, ScenarioID: r.PathValue("scenario_id"), ExpectedVersion: input.ExpectedVersion,
	}); err != nil {
		writeScenarioError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type setCurrentScenarioRequest struct {
	ScenarioID string `json:"scenario_id"`
}

func (h *ScenarioHTTPHandler) setCurrent(w http.ResponseWriter, r *http.Request) {
	var input setCurrentScenarioRequest
	if err := decodeScenarioJSON(r, &input); err != nil {
		writeScenarioError(w, err)
		return
	}
	scenario, err := h.service.SetCurrent(r.Context(), SetCurrentScenarioCommand{
		ActorUserID: h.userID, ThreadID: r.PathValue("thread_id"), ScenarioID: input.ScenarioID,
	})
	if err != nil {
		writeScenarioError(w, err)
		return
	}
	writeScenarioJSON(w, http.StatusOK, map[string]any{"scenario": scenario})
}

func scenarioListFilter(r *http.Request) (ScenarioListFilter, error) {
	filter := ScenarioListFilter{SourceThreadID: r.URL.Query().Get("thread_id")}
	for _, raw := range r.URL.Query()["type"] {
		for _, value := range strings.Split(raw, ",") {
			if value = strings.TrimSpace(value); value != "" {
				filter.Types = append(filter.Types, ScenarioType(value))
			}
		}
	}
	for _, raw := range r.URL.Query()["status"] {
		for _, value := range strings.Split(raw, ",") {
			if value = strings.TrimSpace(value); value != "" {
				filter.Statuses = append(filter.Statuses, ScenarioStatus(value))
			}
		}
	}
	return filter, nil
}

func decodeScenarioJSON(r *http.Request, value any) error {
	decoder := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		if err == nil {
			return ErrInvalidScenario
		}
		return err
	}
	return nil
}

func writeScenarioJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeScenarioError(w http.ResponseWriter, err error) {
	status := http.StatusBadRequest
	if errors.Is(err, ErrScenarioNotFound) {
		status = http.StatusNotFound
	}
	if errors.Is(err, ErrScenarioVersionConflict) || errors.Is(err, ErrScenarioFactConflict) {
		status = http.StatusConflict
	}
	writeScenarioJSON(w, status, map[string]any{"error": err.Error()})
}
