package context

import (
	"context"
	"strings"
	"testing"
)

type recallStub struct{}

func (recallStub) Recall(context.Context, string, string, string, int) ([]Memory, error) {
	return []Memory{{ID: "fact-1", Summary: "用户偏好直接反馈", Source: "run:1"}}, nil
}

func TestBuilderCompressesAndPreservesLatestTurn(t *testing.T) {
	builder := NewBuilder(recallStub{})
	large := strings.Repeat("历史内容。", 500)
	messages := make([]Message, 0, 22)
	for index := 0; index < 10; index++ {
		messages = append(messages, Message{Role: "user", Content: large}, Message{Role: "assistant", Content: large})
	}
	messages = append(messages, Message{Role: "assistant", Content: "latest answer"}, Message{Role: "user", Content: "latest question"})
	result, err := builder.Build(context.Background(), BuildRequest{UserID: "u1", ThreadID: "t1", Query: "feedback", Messages: messages})
	if err != nil {
		t.Fatal(err)
	}
	if !result.Compressed {
		t.Fatal("expected compressed context")
	}
	if got := result.Messages[len(result.Messages)-1].Content; got != "latest question" {
		t.Fatalf("latest message changed: %q", got)
	}
	if result.TokenCount > DefaultTokenLimit {
		t.Fatalf("context remains over budget: %d", result.TokenCount)
	}
	if !strings.Contains(result.Messages[0].Content, "fact-1") {
		t.Fatal("recalled memory was not injected with provenance")
	}
}
