package mem0

import (
	"context"
	"testing"

	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant"
	assistantcontext "github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant/context"
	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/usercontext"
)

type userContextStub struct {
	request usercontext.Request
	result  usercontext.Snapshot
	err     error
}

func (s *userContextStub) Build(_ context.Context, request usercontext.Request) (usercontext.Snapshot, error) {
	s.request = request
	return s.result, s.err
}

func TestAssistantContextBuilderInjectsUserContext(t *testing.T) {
	reader := &userContextStub{result: usercontext.Snapshot{
		Scenario: &usercontext.Scenario{Title: "客户延期说明", Goal: "准备会议表达"},
		Memories: []usercontext.Memory{{ID: "memory-1", Summary: "偏好直接反馈", Source: "mem0"}},
	}}
	builder := AssistantContextBuilder{Builder: assistantcontext.NewBuilder(nil), UserContext: reader}
	result, err := builder.Build(context.Background(), assistant.ContextBuildRequest{
		ActorUserID: "user-1", ThreadID: "thread-1", RunID: "run-1", Query: "如何解释延期",
		Messages: []assistant.ContextMessage{{Role: "user", Content: "如何解释延期"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if reader.request.UserID != "user-1" || reader.request.ThreadID != "thread-1" || reader.request.Query != "如何解释延期" {
		t.Fatalf("reader request = %#v", reader.request)
	}
	if len(result.Messages) != 3 || result.Messages[2].Content != "如何解释延期" {
		t.Fatalf("context messages = %#v", result.Messages)
	}
	if result.Messages[0].Role != "system" || result.Messages[1].Role != "system" {
		t.Fatalf("expected system context: %#v", result.Messages)
	}
}

func TestAssistantContextBuilderDegradesWhenUserContextFails(t *testing.T) {
	builder := AssistantContextBuilder{
		Builder:     assistantcontext.NewBuilder(nil),
		UserContext: &userContextStub{err: context.DeadlineExceeded},
	}
	result, err := builder.Build(context.Background(), assistant.ContextBuildRequest{
		ActorUserID: "user-1", ThreadID: "thread-1", RunID: "run-1", Query: "hello",
		Messages: []assistant.ContextMessage{{Role: "user", Content: "hello"}},
	})
	if err != nil || len(result.Messages) != 1 || result.Messages[0].Content != "hello" {
		t.Fatalf("result = %#v, err=%v", result, err)
	}
}
