package context

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/usercontext"
)

type recallStub struct{}

func (recallStub) Recall(context.Context, string, string, string, int) ([]Memory, error) {
	return []Memory{{ID: "fact-1", Summary: "用户偏好直接反馈", Source: "run:1"}}, nil
}

func TestBuilderInjectsScenarioAndPreservesCurrentMessage(t *testing.T) {
	scheduled := time.Date(2026, 7, 28, 0, 0, 0, 0, time.UTC)
	builder := NewBuilder(nil)
	result, err := builder.Build(context.Background(), BuildRequest{
		UserID: "user-1", ThreadID: "thread-1", Query: "help", Messages: []Message{{Role: "user", Content: "我想准备下周面试"}},
		UserContext: usercontext.Snapshot{
			Profile:         &usercontext.Profile{Candidate: "Li Ming", TargetRole: "Product Manager", Confirmed: true},
			Scenario:        &usercontext.Scenario{Title: "支付公司一面", Goal: "准备项目追问", ScheduledAt: &scheduled, Facts: []usercontext.Fact{{Key: "round", Value: "first", Source: "user_statement"}}},
			Memories:        []usercontext.Memory{{ID: "memory-1", Summary: "偏好直接反馈", Source: "mem0"}},
			LearningSignals: []usercontext.LearningSignal{{Summary: "最近完成 3 轮 Java 面试练习"}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Messages) != 3 {
		t.Fatalf("messages = %#v", result.Messages)
	}
	if !strings.Contains(result.Messages[0].Content, "支付公司一面") || !strings.Contains(result.Messages[0].Content, "Product Manager") {
		t.Fatalf("scenario context = %q", result.Messages[0].Content)
	}
	if !strings.Contains(result.Messages[1].Content, "memory-1") {
		t.Fatalf("memory context = %q", result.Messages[1].Content)
	}
	if got := result.Messages[len(result.Messages)-1].Content; got != "我想准备下周面试" {
		t.Fatalf("current message = %q", got)
	}
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

func TestBuilderDropsHistoryBeforeScenarioContext(t *testing.T) {
	builder := NewBuilder(nil)
	history := strings.Repeat("旧对话内容。", 1_200)
	messages := make([]Message, 0, 22)
	for index := 0; index < 10; index++ {
		messages = append(messages, Message{Role: "user", Content: history}, Message{Role: "assistant", Content: history})
	}
	messages = append(messages, Message{Role: "user", Content: "请帮我准备明天的面试"})
	result, err := builder.Build(context.Background(), BuildRequest{
		UserID: "user-1", ThreadID: "thread-1", Query: "准备面试", Messages: messages,
		UserContext: usercontext.Snapshot{Scenario: &usercontext.Scenario{Title: "跨境支付产品经理面试", Goal: "准备项目追问"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !result.Compressed || result.TokenCount > DefaultTokenLimit {
		t.Fatalf("result = %#v", result)
	}
	if !strings.Contains(result.Messages[0].Content, "跨境支付产品经理面试") {
		t.Fatalf("scenario context was dropped: %#v", result.Messages)
	}
	if got := result.Messages[len(result.Messages)-1].Content; got != "请帮我准备明天的面试" {
		t.Fatalf("latest user message = %q", got)
	}
}
