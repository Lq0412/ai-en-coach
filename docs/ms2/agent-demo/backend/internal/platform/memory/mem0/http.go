package mem0

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

type HTTPHandler struct {
	client *Client
	userID string
}

func NewHTTPHandler(client *Client, userID string) *HTTPHandler {
	return &HTTPHandler{client: client, userID: userID}
}

func (h *HTTPHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /v1/memories", h.list)
	mux.HandleFunc("GET /v1/memories/{memory_id}", h.get)
	mux.HandleFunc("PUT /v1/memories/{memory_id}", h.update)
	mux.HandleFunc("DELETE /v1/memories/{memory_id}", h.delete)
	mux.HandleFunc("GET /v1/memories/{memory_id}/history", h.history)
}

func (h *HTTPHandler) list(w http.ResponseWriter, r *http.Request) {
	items, err := h.client.List(r.Context(), h.userID)
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"results": items})
}

func (h *HTTPHandler) get(w http.ResponseWriter, r *http.Request) {
	item, err := h.client.Get(r.Context(), r.PathValue("memory_id"))
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (h *HTTPHandler) update(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Memory string `json:"memory"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	request.Memory = strings.TrimSpace(request.Memory)
	if request.Memory == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "memory is required"})
		return
	}
	item, err := h.client.Update(r.Context(), r.PathValue("memory_id"), request.Memory)
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (h *HTTPHandler) delete(w http.ResponseWriter, r *http.Request) {
	if err := h.client.Delete(r.Context(), r.PathValue("memory_id")); err != nil {
		h.writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *HTTPHandler) history(w http.ResponseWriter, r *http.Request) {
	history, err := h.client.History(r.Context(), r.PathValue("memory_id"))
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"results": history})
}

func (h *HTTPHandler) writeError(w http.ResponseWriter, err error) {
	status := http.StatusBadGateway
	if errors.Is(err, ErrNotFound) {
		status = http.StatusNotFound
	}
	writeJSON(w, status, map[string]any{"error": err.Error()})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
