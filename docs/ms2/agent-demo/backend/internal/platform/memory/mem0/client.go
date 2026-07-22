package mem0

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant"
	assistantcontext "github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant/context"
	_ "modernc.org/sqlite"
)

var ErrNotFound = errors.New("mem0: memory not found")

type Client struct {
	baseURL string
	http    *http.Client
}

type Item struct {
	ID        string         `json:"id"`
	Memory    string         `json:"memory"`
	Hash      string         `json:"hash,omitempty"`
	Score     float64        `json:"score,omitempty"`
	CreatedAt string         `json:"createdAt,omitempty"`
	UpdatedAt string         `json:"updatedAt,omitempty"`
	Metadata  map[string]any `json:"metadata,omitempty"`
}

type HistoryEntry struct {
	ID            any    `json:"id,omitempty"`
	MemoryID      string `json:"memoryId,omitempty"`
	PreviousValue string `json:"previousValue,omitempty"`
	NewValue      string `json:"newValue,omitempty"`
	Action        string `json:"action,omitempty"`
	CreatedAt     string `json:"createdAt,omitempty"`
	UpdatedAt     string `json:"updatedAt,omitempty"`
}

type ImportItem struct {
	ID       string         `json:"id"`
	Memory   string         `json:"memory"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

func New(baseURL string) *Client {
	return &Client{
		baseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		http:    &http.Client{Timeout: 90 * time.Second},
	}
}

func (c *Client) Health(ctx context.Context) error {
	var response struct {
		Status string `json:"status"`
		Engine string `json:"engine"`
	}
	if err := c.do(ctx, http.MethodGet, "/health", nil, &response); err != nil {
		return err
	}
	if response.Status != "ok" || response.Engine != "mem0" {
		return errors.New("mem0: unhealthy sidecar")
	}
	return nil
}

func (c *Client) Recall(ctx context.Context, userID, _ string, query string, limit int) ([]assistantcontext.Memory, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, errors.New("mem0: user id is required")
	}
	if limit <= 0 {
		limit = 5
	}
	var response struct {
		Results []Item `json:"results"`
	}
	err := c.do(ctx, http.MethodPost, "/search", map[string]any{
		"query": query, "filters": map[string]any{"user_id": userID},
		"top_k": limit, "threshold": 0.1, "rerank": false,
	}, &response)
	if err != nil {
		return nil, err
	}
	result := make([]assistantcontext.Memory, 0, len(response.Results))
	for _, item := range response.Results {
		if strings.TrimSpace(item.Memory) == "" {
			continue
		}
		result = append(result, assistantcontext.Memory{ID: item.ID, Summary: item.Memory, Source: "mem0"})
	}
	return result, nil
}

func (c *Client) Observe(ctx context.Context, item assistant.MemoryObservation) error {
	messages := make([]map[string]string, 0, 2)
	if value := strings.TrimSpace(item.UserMessage); value != "" {
		messages = append(messages, map[string]string{"role": "user", "content": value})
	}
	if value := strings.TrimSpace(item.AssistantResponse); value != "" {
		messages = append(messages, map[string]string{"role": "assistant", "content": value})
	}
	if len(messages) == 0 {
		return nil
	}
	return c.do(ctx, http.MethodPost, "/memories", map[string]any{
		"messages": messages,
		"user_id":  item.ActorUserID,
		"run_id":   item.RunID,
		"metadata": map[string]any{
			"source": item.Source, "source_id": item.RunID, "thread_id": item.ThreadID,
		},
	}, nil)
}

func (c *Client) List(ctx context.Context, userID string) ([]Item, error) {
	var response struct {
		Results []Item `json:"results"`
	}
	path := "/memories?user_id=" + url.QueryEscape(userID) + "&top_k=1000"
	if err := c.do(ctx, http.MethodGet, path, nil, &response); err != nil {
		return nil, err
	}
	return response.Results, nil
}

func (c *Client) Get(ctx context.Context, id string) (Item, error) {
	var result Item
	if err := c.do(ctx, http.MethodGet, "/memories/"+url.PathEscape(id), nil, &result); err != nil {
		return Item{}, err
	}
	return result, nil
}

func (c *Client) Update(ctx context.Context, id, text string) (Item, error) {
	var result Item
	if err := c.do(ctx, http.MethodPut, "/memories/"+url.PathEscape(id), map[string]any{"text": text}, &result); err != nil {
		return Item{}, err
	}
	return result, nil
}

func (c *Client) Delete(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodDelete, "/memories/"+url.PathEscape(id), nil, nil)
}

func (c *Client) History(ctx context.Context, id string) ([]HistoryEntry, error) {
	var response struct {
		Results []HistoryEntry `json:"results"`
	}
	if err := c.do(ctx, http.MethodGet, "/memories/"+url.PathEscape(id)+"/history", nil, &response); err != nil {
		return nil, err
	}
	return response.Results, nil
}

func (c *Client) Import(ctx context.Context, userID string, items []ImportItem) error {
	if len(items) == 0 {
		return nil
	}
	return c.do(ctx, http.MethodPost, "/imports", map[string]any{"user_id": userID, "items": items}, nil)
}

func LegacyActiveFacts(path, userID string) ([]ImportItem, error) {
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		return nil, nil
	} else if err != nil {
		return nil, err
	}
	dsn := (&url.URL{Scheme: "file", Path: path}).String() + "?mode=ro"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	defer db.Close()
	rows, err := db.Query(`SELECT id,value,category,canonical_key,confidence,created_at,updated_at FROM memory_facts WHERE user_id=? AND status='active'`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []ImportItem
	for rows.Next() {
		var item ImportItem
		var category, canonicalKey, createdAt, updatedAt string
		var confidence float64
		if err := rows.Scan(&item.ID, &item.Memory, &category, &canonicalKey, &confidence, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		item.Metadata = map[string]any{
			"category": category, "canonical_key": canonicalKey, "confidence": confidence,
			"legacy_created_at": createdAt, "legacy_updated_at": updatedAt,
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (c *Client) do(ctx context.Context, method, path string, input, output any) error {
	var body io.Reader
	if input != nil {
		encoded, err := json.Marshal(input)
		if err != nil {
			return err
		}
		body = bytes.NewReader(encoded)
	}
	request, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return err
	}
	if input != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := c.http.Do(request)
	if err != nil {
		return fmt.Errorf("call Mem0: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		payload, _ := io.ReadAll(io.LimitReader(response.Body, 16<<10))
		if response.StatusCode == http.StatusNotFound {
			return ErrNotFound
		}
		return fmt.Errorf("Mem0 status %d: %s", response.StatusCode, strings.TrimSpace(string(payload)))
	}
	if output == nil || response.StatusCode == http.StatusNoContent {
		_, _ = io.Copy(io.Discard, response.Body)
		return nil
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 8<<20)).Decode(output); err != nil {
		return fmt.Errorf("decode Mem0 response: %w", err)
	}
	return nil
}
