package assistant

import (
	"context"
	"testing"
)

type liveTurnPlanner struct{}

func (liveTurnPlanner) Plan(context.Context, PlanRequest) (Plan, error) {
	return freeConversationPlan(), nil
}

type liveTurnTools struct{}

func (liveTurnTools) Execute(context.Context, ToolInvocation) (ToolResult, error) {
	return ToolResult{Output: map[string]any{
		"summary":      "Canonical assistant reply",
		"user_message": "Canonical final transcript",
	}}, nil
}

func TestLiveTurnPersistsAndReplaysCanonicalMessagePair(t *testing.T) {
	store := NewMemoryConversationStore()
	service := NewService(Dependencies{
		Planner:           liveTurnPlanner{},
		Tools:             liveTurnTools{},
		ConversationStore: store,
	})
	command := StartTaskCommand{
		ActorUserID:     DemoUserID,
		ThreadID:        DemoThreadID,
		UserMessage:     "Canonical final transcript",
		IdempotencyKey:  "client-live-1",
		InteractionMode: "conversation",
		ClientMessageID: "client-live-1",
		LiveSessionID:   "live-1",
		TurnID:          "turn-1",
		Mode:            ConversationModeLive,
	}

	var emitted []AssistantMessage
	ctx := WithCanonicalMessageWriter(context.Background(), func(message AssistantMessage) error {
		emitted = append(emitted, message)
		return nil
	})
	first, err := service.StartTask(ctx, command)
	if err != nil {
		t.Fatal(err)
	}
	if first.Status != TaskRunStatusCompleted {
		t.Fatalf("first task status = %q", first.Status)
	}
	assertCanonicalLivePair(t, emitted)

	snapshot := store.Snapshot(MockDomainState{})
	var persisted []AssistantMessage
	for _, message := range snapshot.Messages {
		if message.ClientMessageID == command.ClientMessageID {
			persisted = append(persisted, message)
		}
	}
	assertCanonicalLivePair(t, persisted)
	if persisted[0].ID == persisted[1].ID {
		t.Fatalf("snapshot cannot distinguish user and assistant: %#v", persisted)
	}

	emitted = nil
	second, err := service.StartTask(ctx, command)
	if err != nil {
		t.Fatal(err)
	}
	if second.ID != first.ID {
		t.Fatalf("idempotent retry created task %q, want %q", second.ID, first.ID)
	}
	assertCanonicalLivePair(t, emitted)

	messages, err := store.ListMessages(context.Background(), DemoThreadID)
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, message := range messages {
		if message.ClientMessageID == command.ClientMessageID {
			count++
		}
	}
	if count != 2 {
		t.Fatalf("idempotent retry persisted %d canonical messages, want 2", count)
	}
}

func assertCanonicalLivePair(t *testing.T, messages []AssistantMessage) {
	t.Helper()
	if len(messages) != 2 {
		t.Fatalf("canonical messages = %d, want 2: %#v", len(messages), messages)
	}
	for index, role := range []string{"user", "assistant"} {
		message := messages[index]
		if message.Role != role ||
			message.ClientMessageID != "client-live-1" ||
			message.LiveSessionID != "live-1" ||
			message.TurnID != "turn-1" ||
			message.Mode != ConversationModeLive ||
			message.ID == "" {
			t.Fatalf("canonical %s message lost correlation: %#v", role, message)
		}
	}
}
