package mem0

import (
	"context"

	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant"
	assistantcontext "github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant/context"
	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/usercontext"
)

// AssistantContextBuilder adapts the assistant context contract without
// introducing a second memory model alongside Mem0.
type AssistantContextBuilder struct {
	Builder     *assistantcontext.Builder
	UserContext usercontext.Reader
}

func (a AssistantContextBuilder) Build(ctx context.Context, request assistant.ContextBuildRequest) (assistant.ContextBuildResult, error) {
	snapshot := usercontext.Snapshot{}
	if a.UserContext != nil {
		if built, err := a.UserContext.Build(ctx, usercontext.Request{UserID: request.ActorUserID, ThreadID: request.ThreadID, Query: request.Query}); err == nil {
			snapshot = built
		}
	}
	messages := make([]assistantcontext.Message, 0, len(request.Messages))
	for _, item := range request.Messages {
		messages = append(messages, assistantcontext.Message{Role: item.Role, Content: item.Content})
	}
	result, err := a.Builder.Build(ctx, assistantcontext.BuildRequest{
		UserID:        request.ActorUserID,
		ThreadID:      request.ThreadID,
		RunID:         request.RunID,
		Query:         request.Query,
		ThreadSummary: request.ThreadSummary,
		Messages:      messages,
		UserContext:   snapshot,
	})
	if err != nil {
		return assistant.ContextBuildResult{}, err
	}
	built := make([]assistant.ContextMessage, 0, len(result.Messages))
	for _, item := range result.Messages {
		built = append(built, assistant.ContextMessage{Role: item.Role, Content: item.Content})
	}
	return assistant.ContextBuildResult{
		Messages: built, Summary: result.Summary, TokenCount: result.TokenCount, Compressed: result.Compressed,
	}, nil
}
