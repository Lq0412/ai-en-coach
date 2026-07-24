package assistant

import (
	"context"
	"strings"
	"testing"
)

type realtimeContextBuilderStub struct {
	request ContextBuildRequest
}

func (stub *realtimeContextBuilderStub) Build(
	_ context.Context,
	request ContextBuildRequest,
) (ContextBuildResult, error) {
	stub.request = request
	return ContextBuildResult{
		Summary: "当前场景：后端工程师面试；session_in_progress=false",
		Messages: append([]ContextMessage{{
			Role:    "system",
			Content: "用户偏好：先自然交流，再给一条简短纠正。",
		}}, request.Messages...),
	}, nil
}

func TestBuildRealtimeContextUsesSharedPersistentContext(t *testing.T) {
	store := NewMemoryConversationStore()
	if err := store.AppendMessage(context.Background(), AssistantMessage{
		ID:      "message-user",
		Role:    "user",
		Content: "帮我创建一个后端工程师面试场景",
	}); err != nil {
		t.Fatal(err)
	}
	builder := &realtimeContextBuilderStub{}
	service := NewService(Dependencies{
		ConversationStore: store,
		ContextBuilder:    builder,
	})

	result, err := service.BuildRealtimeContext(
		context.Background(),
		DemoUserID,
		DemoThreadID,
	)
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{
		"当前场景：后端工程师面试",
		"用户偏好：先自然交流",
		"user: 帮我创建一个后端工程师面试场景",
		"Use create_learning_scenario only when the user explicitly asks",
	} {
		if !strings.Contains(result.Instructions, expected) {
			t.Fatalf("instructions missing %q:\n%s", expected, result.Instructions)
		}
	}
	if builder.request.Query != "帮我创建一个后端工程师面试场景" {
		t.Fatalf("builder query=%q", builder.request.Query)
	}
	if len(result.ContextVersion) != 16 {
		t.Fatalf("context version=%q", result.ContextVersion)
	}
	second, err := service.BuildRealtimeContext(
		context.Background(),
		DemoUserID,
		DemoThreadID,
	)
	if err != nil {
		t.Fatal(err)
	}
	if second.ContextVersion != result.ContextVersion {
		t.Fatalf("context version is not deterministic: %q != %q",
			second.ContextVersion, result.ContextVersion)
	}
}

func TestRealtimeInstructionsKeepOnlyRecentDialogue(t *testing.T) {
	messages := []ContextMessage{{Role: "system", Content: "persistent"}}
	for index := 0; index < 10; index++ {
		messages = append(messages, ContextMessage{
			Role:    "user",
			Content: "turn-" + string(rune('0'+index)),
		})
	}
	prompt := renderRealtimeInstructions("state", messages)

	if strings.Contains(prompt, "turn-0") || strings.Contains(prompt, "turn-1") {
		t.Fatalf("old dialogue should be truncated:\n%s", prompt)
	}
	if !strings.Contains(prompt, "turn-2") || !strings.Contains(prompt, "turn-9") {
		t.Fatalf("recent dialogue missing:\n%s", prompt)
	}
	if !strings.Contains(prompt, "persistent") {
		t.Fatalf("persistent context missing:\n%s", prompt)
	}
}
