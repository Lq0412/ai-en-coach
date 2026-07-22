package assistant_test

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant"
	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/demomodules"
)

func TestFileConversationStoreSurvivesRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "conversation.json")
	store, err := assistant.NewFileConversationStore(path)
	if err != nil {
		t.Fatal(err)
	}
	thread, err := store.GetThread(context.Background(), assistant.DemoThreadID)
	if err != nil {
		t.Fatal(err)
	}
	thread.ContextSummary = "persistent summary"
	if err := store.SaveThread(context.Background(), thread); err != nil {
		t.Fatal(err)
	}
	if err := store.AppendMessage(context.Background(), assistant.AssistantMessage{
		ID: "persisted-message", Role: "user", Content: "restart me",
	}); err != nil {
		t.Fatal(err)
	}

	reopened, err := assistant.NewFileConversationStore(path)
	if err != nil {
		t.Fatal(err)
	}
	snapshot := reopened.Snapshot(assistant.MockDomainState{})
	if snapshot.Thread.ContextSummary != "persistent summary" {
		t.Fatalf("summary after restart = %q", snapshot.Thread.ContextSummary)
	}
	if got := snapshot.Messages[len(snapshot.Messages)-1].Content; got != "restart me" {
		t.Fatalf("message after restart = %q", got)
	}
	reopened.StartNewConversation()
	archives := reopened.ListConversationArchives()
	if len(archives) != 1 || archives[0].Title != "restart me" || archives[0].MessageCount != 2 {
		t.Fatalf("unexpected conversation archive: %#v", archives)
	}
	archived, err := reopened.GetConversationArchive(archives[0].ID)
	if err != nil || archived.Messages[len(archived.Messages)-1].Content != "restart me" {
		t.Fatalf("archived complete context is unavailable: %#v err=%v", archived, err)
	}
	if current := reopened.Snapshot(assistant.MockDomainState{}); len(current.Messages) != 1 || current.Messages[0].Role != "assistant" {
		t.Fatalf("new conversation was not clean: %#v", current.Messages)
	}
	reopenedAgain, err := assistant.NewFileConversationStore(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(reopenedAgain.ListConversationArchives()) != 1 {
		t.Fatal("conversation archive did not survive restart")
	}
	if err := reopenedAgain.DeleteConversationArchive(archives[0].ID); err != nil {
		t.Fatal(err)
	}
	if len(reopenedAgain.ListConversationArchives()) != 0 {
		t.Fatal("conversation archive was not deleted")
	}
}

func TestPersistentToolRegistryRestoresCompletedInterviewHistory(t *testing.T) {
	path := filepath.Join(t.TempDir(), "interview-state.json")
	registry, err := assistant.NewPersistentDemoState(nil, path)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	tools := demomodules.NewRegistry(registry, nil)
	execute := func(tool string, arguments map[string]any) {
		t.Helper()
		if _, err := tools.Execute(ctx, assistant.ToolInvocation{
			ActorUserID: assistant.DemoUserID,
			TaskRunID:   "persistent-run",
			ToolName:    tool,
			Arguments:   arguments,
		}); err != nil {
			t.Fatal(err)
		}
	}
	execute("practice.create_plan", map[string]any{
		"role": "Product Manager", "max_turns": 3, "duration_minutes": 5,
	})
	execute("practice.start_session", map[string]any{})
	execute("conversation.generate_next_question", map[string]any{})
	execute("conversation.submit_turn", map[string]any{"answer_text": "A measurable answer."})
	execute("review.generate_feedback", map[string]any{})

	reopened, err := assistant.NewPersistentDemoState(nil, path)
	if err != nil {
		t.Fatal(err)
	}
	state := reopened.State()
	if len(state.Sessions) != 1 {
		t.Fatalf("sessions after restart = %d, want 1", len(state.Sessions))
	}
	session := state.Sessions[0]
	if session.TargetRole != "Product Manager" || session.CompletedTurns != 1 || len(session.Answers) != 1 {
		t.Fatalf("unexpected restored session: %#v", session)
	}
	reopened.Reset()
	reopenedTools := demomodules.NewRegistry(reopened, nil)
	if len(reopened.State().Sessions) != 1 {
		t.Fatal("starting a new conversation must preserve completed interview history")
	}
	for _, invocation := range []assistant.ToolInvocation{
		{ToolName: "practice.create_plan", Arguments: map[string]any{"role": "Frontend Engineer", "max_turns": 3, "duration_minutes": 5}},
		{ToolName: "practice.start_session", Arguments: map[string]any{}},
		{ToolName: "conversation.generate_next_question", Arguments: map[string]any{}},
		{ToolName: "review.generate_feedback", Arguments: map[string]any{}},
	} {
		invocation.ActorUserID = assistant.DemoUserID
		invocation.TaskRunID = "second-run"
		if _, err := reopenedTools.Execute(ctx, invocation); err != nil {
			t.Fatal(err)
		}
	}
	reopenedAgain, err := assistant.NewPersistentDemoState(nil, path)
	if err != nil {
		t.Fatal(err)
	}
	if len(reopenedAgain.State().Sessions) != 2 {
		t.Fatalf("sessions after second restart = %d, want 2", len(reopenedAgain.State().Sessions))
	}
	history, err := demomodules.NewRegistry(reopenedAgain, nil).Execute(ctx, assistant.ToolInvocation{
		ActorUserID: assistant.DemoUserID,
		TaskRunID:   "history-run",
		ToolName:    "review.list_history",
		Arguments:   map[string]any{"limit": 5},
	})
	if err != nil {
		t.Fatal(err)
	}
	items, ok := history.Output["items"].([]map[string]any)
	if !ok || len(items) != 2 {
		t.Fatalf("real history items = %#v", history.Output["items"])
	}
	summaries := reopenedAgain.ListInterviewSessions()
	if len(summaries) != 2 || !summaries[0].HasFeedback {
		t.Fatalf("history summaries = %#v", summaries)
	}
	detail, err := reopenedAgain.GetInterviewSession(summaries[0].ID)
	if err != nil || len(detail.Questions) == 0 || detail.Feedback == "" {
		t.Fatalf("history detail = %#v, err=%v", detail, err)
	}
	if err := reopenedAgain.DeleteInterviewSession(summaries[0].ID); err != nil {
		t.Fatal(err)
	}
	afterDelete, err := assistant.NewPersistentDemoState(nil, path)
	if err != nil {
		t.Fatal(err)
	}
	if len(afterDelete.ListInterviewSessions()) != 1 {
		t.Fatal("history deletion did not survive restart")
	}

	activeRegistry := assistant.NewDemoStateWithGenerator(nil)
	activeTools := demomodules.NewRegistry(activeRegistry, nil)
	for _, invocation := range []assistant.ToolInvocation{
		{ToolName: "practice.create_plan", Arguments: map[string]any{"role": "Go Engineer"}},
		{ToolName: "practice.start_session", Arguments: map[string]any{}},
		{ToolName: "conversation.generate_next_question", Arguments: map[string]any{}},
	} {
		if _, err := activeTools.Execute(ctx, invocation); err != nil {
			t.Fatal(err)
		}
	}
	activeID := activeRegistry.State().CurrentSessionID
	if err := activeRegistry.DeleteInterviewSession(activeID); !errors.Is(err, assistant.ErrActiveInterview) {
		t.Fatalf("deleting active interview error = %v", err)
	}
}
