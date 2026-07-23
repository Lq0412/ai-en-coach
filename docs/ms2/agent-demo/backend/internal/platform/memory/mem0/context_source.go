package mem0

import (
	"context"
	"fmt"

	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/usercontext"
)

// UserContextMemorySource adapts Mem0 recall to the neutral usercontext port.
// It keeps Mem0 details out of the context assembly package.
type UserContextMemorySource struct {
	client *Client
}

func NewUserContextMemorySource(client *Client) UserContextMemorySource {
	return UserContextMemorySource{client: client}
}

func (s UserContextMemorySource) Recall(ctx context.Context, userID, query string, limit int) ([]usercontext.Memory, error) {
	if s.client == nil {
		return nil, fmt.Errorf("mem0: client is required")
	}
	items, err := s.client.Recall(ctx, userID, "", query, limit)
	if err != nil {
		return nil, err
	}
	result := make([]usercontext.Memory, 0, len(items))
	for _, item := range items {
		result = append(result, usercontext.Memory{ID: item.ID, Summary: item.Summary, Source: item.Source})
	}
	return result, nil
}
