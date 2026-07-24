package assistant_test

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant"
	assistantcontext "github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant/context"
	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/demomodules"
)

func newRuntime() (*assistant.Service, *assistant.MemoryConversationStore, *assistant.DemoState) {
	store := assistant.NewMemoryConversationStore()
	tools := assistant.NewDemoState()
	service := assistant.NewService(assistant.Dependencies{
		Planner:           assistant.NewMockPlanner(tools),
		Tools:             demomodules.NewRegistry(tools, nil),
		ConversationStore: store,
		Runtime:           tools,
		Attachments:       tools,
		Resetter:          tools,
	})
	return service, store, tools
}

type staticPlanner struct {
	plan assistant.Plan
	err  error
}

func (p staticPlanner) Plan(context.Context, assistant.PlanRequest) (assistant.Plan, error) {
	if p.err != nil {
		return assistant.Plan{}, p.err
	}
	return p.plan, nil
}

func TestStartTaskPausesAndResumeStartsSession(t *testing.T) {
	service, store, tools := newRuntime()
	ctx := context.Background()
	run, err := service.StartTask(ctx, assistant.StartTaskCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		UserMessage:    "开始一场 Go 后端英文面试",
		IdempotencyKey: "start-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if run.Status != assistant.TaskRunStatusAwaitingConfirm || run.CurrentStep != "practice.create_plan" {
		t.Fatalf("unexpected paused run: %#v", run)
	}
	snapshot := store.Snapshot(tools.State())
	calls := toolNamesForRun(snapshot.ToolCalls, run.ID)
	joinedCalls := strings.Join(calls, ",")
	if joinedCalls != "preparation.get_confirmed_context,scenario.retrieve_knowledge" &&
		joinedCalls != "scenario.retrieve_knowledge,preparation.get_confirmed_context" {
		t.Fatalf("unexpected calls before confirmation: %#v", snapshot.ToolCalls)
	}

	run, err = service.ResumeTask(ctx, assistant.ResumeTaskCommand{
		ActorUserID: assistant.DemoUserID,
		TaskRunID:   run.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if run.Status != assistant.TaskRunStatusCompleted || tools.State().ActiveQuestion == "" {
		t.Fatalf("resume did not start session: %#v %#v", run, tools.State())
	}
}

func TestFreeConversationDoesNotStartInterview(t *testing.T) {
	service, store, tools := newRuntime()
	run, err := service.StartTask(context.Background(), assistant.StartTaskCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		UserMessage:    "你好，今天适合聊什么？",
		IdempotencyKey: "chat-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if run.Intent != "free_conversation" || run.Status != assistant.TaskRunStatusCompleted {
		t.Fatalf("unexpected free conversation run: %#v", run)
	}
	if tools.State().ActiveQuestion != "" || tools.State().CompletedQuestionCount != 0 {
		t.Fatalf("free conversation changed interview state: %#v", tools.State())
	}
	snapshot := store.Snapshot(tools.State())
	if len(snapshot.ToolCalls) != 1 ||
		snapshot.ToolCalls[0].ToolName != "conversation.generate_reply" {
		t.Fatalf("unexpected free conversation calls: %#v", snapshot.ToolCalls)
	}
	if !strings.Contains(snapshot.Messages[len(snapshot.Messages)-1].Content, "普通自由对话") {
		t.Fatalf("missing conversation reply: %#v", snapshot.Messages)
	}
}

func TestOralFreePracticeUsesConversationReplyWithoutSession(t *testing.T) {
	service, store, tools := newRuntime()
	run, err := service.StartTask(context.Background(), assistant.StartTaskCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		UserMessage:    "我想随便练练口语",
		IdempotencyKey: "oral-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if run.Intent != "oral_free_practice" || run.Status != assistant.TaskRunStatusCompleted {
		t.Fatalf("unexpected oral practice run: %#v", run)
	}
	if tools.State().CurrentSessionID != "" || tools.State().ActiveQuestion != "" {
		t.Fatalf("oral free practice changed interview state: %#v", tools.State())
	}
	snapshot := store.Snapshot(tools.State())
	if len(snapshot.ToolCalls) != 1 || snapshot.ToolCalls[0].ToolName != "conversation.generate_reply" {
		t.Fatalf("unexpected oral practice calls: %#v", snapshot.ToolCalls)
	}
	if !strings.Contains(fmt.Sprint(snapshot.ToolCalls[0].Arguments["context_summary"]), "自由口语陪练") {
		t.Fatalf("missing oral practice context: %#v", snapshot.ToolCalls[0].Arguments)
	}
	if !strings.Contains(snapshot.Messages[len(snapshot.Messages)-1].Content, "practice casually") {
		t.Fatalf("missing oral practice reply: %#v", snapshot.Messages)
	}
}

func TestOralFreePracticeDuringPausedInterviewDoesNotConsumeTurn(t *testing.T) {
	service, store, tools := newRuntime()
	ctx := context.Background()
	started, err := service.StartTask(ctx, assistant.StartTaskCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		UserMessage:    "开始一场 Go 后端英文面试",
		IdempotencyKey: "paused-oral-start",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.ResumeTask(ctx, assistant.ResumeTaskCommand{
		ActorUserID: assistant.DemoUserID,
		TaskRunID:   started.ID,
	}); err != nil {
		t.Fatal(err)
	}
	activeQuestion := tools.State().ActiveQuestion
	run, err := service.StartTask(ctx, assistant.StartTaskCommand{
		ActorUserID:     assistant.DemoUserID,
		ThreadID:        assistant.DemoThreadID,
		UserMessage:     "我们用英语聊一会儿，随便练练口语",
		IdempotencyKey:  "paused-oral-chat",
		InteractionMode: "conversation",
	})
	if err != nil {
		t.Fatal(err)
	}
	if run.Intent != "oral_free_practice" {
		t.Fatalf("unexpected intent: %#v", run)
	}
	state := tools.State()
	if state.ActiveQuestion != activeQuestion || state.CompletedQuestionCount != 0 {
		t.Fatalf("paused oral practice consumed interview turn: %#v", state)
	}
	snapshot := store.Snapshot(state)
	var oralCall *assistant.ToolCall
	for index := range snapshot.ToolCalls {
		if snapshot.ToolCalls[index].TaskRunID == run.ID {
			oralCall = &snapshot.ToolCalls[index]
			break
		}
	}
	if oralCall == nil || oralCall.ToolName != "conversation.generate_reply" ||
		!strings.Contains(fmt.Sprint(oralCall.Arguments["context_summary"]), "interview_paused=true") {
		t.Fatalf("unexpected paused oral call: %#v", oralCall)
	}
}

func TestUnsupportedScenarioFallsBackToPreparationChat(t *testing.T) {
	store := assistant.NewMemoryConversationStore()
	tools := assistant.NewDemoState()
	service := assistant.NewService(assistant.Dependencies{
		Planner:           staticPlanner{err: assistant.UnsupportedScenarioVariantError{Variant: "business_meeting"}},
		Tools:             demomodules.NewRegistry(tools, nil),
		ConversationStore: store,
		Runtime:           tools,
		Attachments:       tools,
		Resetter:          tools,
	})

	run, err := service.StartTask(context.Background(), assistant.StartTaskCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		UserMessage:    "我明天要见美国客户，帮我练习一下",
		IdempotencyKey: "unsupported-business-prep",
	})
	if err != nil {
		t.Fatal(err)
	}
	if run.Intent != "oral_free_practice" || run.Status != assistant.TaskRunStatusCompleted {
		t.Fatalf("unexpected fallback run: %#v", run)
	}
	state := tools.State()
	if state.CurrentSessionID != "" || state.ActiveQuestion != "" {
		t.Fatalf("fallback created practice state: %#v", state)
	}
	snapshot := store.Snapshot(state)
	if len(snapshot.ToolCalls) != 1 || snapshot.ToolCalls[0].ToolName != "conversation.generate_reply" {
		t.Fatalf("unexpected fallback calls: %#v", snapshot.ToolCalls)
	}
	summary := fmt.Sprint(snapshot.ToolCalls[0].Arguments["context_summary"])
	if !strings.Contains(summary, "尚未接入正式工具") || !strings.Contains(summary, "不要创建 PracticeSession") {
		t.Fatalf("missing unsupported preparation context: %s", summary)
	}
}

func TestExplicitUnsupportedScenarioSessionExplainsToolUnavailable(t *testing.T) {
	store := assistant.NewMemoryConversationStore()
	tools := assistant.NewDemoState()
	service := assistant.NewService(assistant.Dependencies{
		Planner:           staticPlanner{err: assistant.UnsupportedScenarioVariantError{Variant: "business_meeting"}},
		Tools:             demomodules.NewRegistry(tools, nil),
		ConversationStore: store,
		Runtime:           tools,
		Attachments:       tools,
		Resetter:          tools,
	})

	run, err := service.StartTask(context.Background(), assistant.StartTaskCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		UserMessage:    "请创建一个生意会面的正式场景模拟",
		IdempotencyKey: "unsupported-business-session",
	})
	if err != nil {
		t.Fatal(err)
	}
	if run.Intent != "free_conversation" || run.Status != assistant.TaskRunStatusCompleted {
		t.Fatalf("unexpected unsupported-session run: %#v", run)
	}
	snapshot := store.Snapshot(tools.State())
	if len(snapshot.ToolCalls) != 1 || snapshot.ToolCalls[0].ToolName != "conversation.generate_reply" {
		t.Fatalf("unexpected unsupported-session calls: %#v", snapshot.ToolCalls)
	}
	summary := fmt.Sprint(snapshot.ToolCalls[0].Arguments["context_summary"])
	if !strings.Contains(summary, "还没有这个正式场景模拟工具") || !strings.Contains(summary, "不要创建 PracticeSession") {
		t.Fatalf("missing unsupported-session context: %s", summary)
	}
}

func TestVisibleMistakeListOrdinalStartsFirstDisplayedMistake(t *testing.T) {
	store := assistant.NewMemoryConversationStore()
	tools := assistant.NewDemoState()
	service := assistant.NewService(assistant.Dependencies{
		Planner: staticPlanner{plan: assistant.Plan{
			Intent: "free_conversation",
			Steps:  []assistant.PlanStep{{ToolName: "conversation.generate_reply", Arguments: map[string]any{}}},
		}},
		Tools:             demomodules.NewRegistry(tools, nil),
		ConversationStore: store,
		Runtime:           tools,
		Attachments:       tools,
		Resetter:          tools,
	})
	now := time.Now().UTC()
	_, err := tools.Transact(func(snapshot *assistant.RuntimeSnapshot, _ *[]string) (assistant.ToolResult, error) {
		snapshot.Sessions = append(snapshot.Sessions, assistant.InterviewSession{
			ID:         "session-visible-mistakes",
			TargetRole: "AI Application Developer",
			Status:     "completed",
			StartedAt:  now.Add(-time.Hour),
			Questions: []string{
				"Q1 original question?",
				"Q2 original question?",
				"Q3 displayed first question?",
			},
			Answers: []string{"answer 1", "answer 2", "answer 3"},
		})
		snapshot.SavedMistakes = append(snapshot.SavedMistakes,
			assistant.SavedMistake{
				ID: "saved-mistake-q1", SessionID: "session-visible-mistakes", QuestionIndex: 0,
				TargetRole: "AI Application Developer", QuestionText: "Q1 original question?", OriginalAnswer: "answer 1",
				Status: "pending", CreatedAt: now.Add(-30 * time.Minute), UpdatedAt: now.Add(-30 * time.Minute),
			},
			assistant.SavedMistake{
				ID: "saved-mistake-q3", SessionID: "session-visible-mistakes", QuestionIndex: 2,
				TargetRole: "AI Application Developer", QuestionText: "Q3 displayed first question?", OriginalAnswer: "answer 3",
				Status: "pending", CreatedAt: now.Add(-10 * time.Minute), UpdatedAt: now.Add(-10 * time.Minute),
			},
		)
		return assistant.ToolResult{}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.AppendMessage(context.Background(), assistant.AssistantMessage{
		ID: "message-visible-mistakes", Role: "assistant", Kind: "mistake_cards", Content: "最近的错题",
		Mistakes: &assistant.MistakeCards{Items: []assistant.MistakeCard{
			{MistakeID: "saved-mistake-q3", SessionID: "session-visible-mistakes", QuestionIndex: 2, TargetRole: "AI Application Developer", QuestionText: "Q3 displayed first question?", Status: "pending", CreatedAt: now.Add(-10 * time.Minute)},
			{MistakeID: "saved-mistake-q1", SessionID: "session-visible-mistakes", QuestionIndex: 0, TargetRole: "AI Application Developer", QuestionText: "Q1 original question?", Status: "pending", CreatedAt: now.Add(-30 * time.Minute)},
		}},
		CreatedAt: now,
	}); err != nil {
		t.Fatal(err)
	}

	run, err := service.StartTask(context.Background(), assistant.StartTaskCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		UserMessage:    "第一道陪我练练",
		IdempotencyKey: "visible-mistake-first",
	})
	if err != nil {
		t.Fatal(err)
	}
	if run.Intent != "view_mistake_context" {
		t.Fatalf("unexpected intent: %#v", run)
	}
	snapshot := store.Snapshot(tools.State())
	var call *assistant.ToolCall
	for index := range snapshot.ToolCalls {
		if snapshot.ToolCalls[index].TaskRunID == run.ID {
			call = &snapshot.ToolCalls[index]
			break
		}
	}
	if call == nil || call.ToolName != "review.get_mistake_context" || call.Arguments["mistake_id"] != "saved-mistake-q3" {
		t.Fatalf("visible ordinal did not resolve to first displayed card: %#v", call)
	}
	reply := snapshot.Messages[len(snapshot.Messages)-1].Content
	if !strings.Contains(reply, "Q3 displayed first question?") || strings.Contains(reply, "<nil>") {
		t.Fatalf("unexpected assistant reply: %q", reply)
	}
}

func TestStartInterviewRoleUsesExplicitUserMessageOverPlannerRole(t *testing.T) {
	store := assistant.NewMemoryConversationStore()
	tools := assistant.NewDemoState()
	service := assistant.NewService(assistant.Dependencies{
		Planner: staticPlanner{plan: assistant.Plan{
			Intent: "start_mock_interview",
			Steps: []assistant.PlanStep{
				{ToolName: "preparation.get_confirmed_context", Arguments: map[string]any{"scenario": "PROGRAMMER_INTERVIEW"}},
				{ToolName: "practice.create_plan", Arguments: map[string]any{
					"role": "Java Backend Engineer", "max_turns": 0, "duration_minutes": 15,
				}},
				{ToolName: "practice.start_session", Arguments: map[string]any{}},
				{ToolName: "conversation.generate_next_question", Arguments: map[string]any{}},
			},
		}},
		Tools:             demomodules.NewRegistry(tools, nil),
		ConversationStore: store,
		Runtime:           tools,
		Attachments:       tools,
		Resetter:          tools,
	})
	run, err := service.StartTask(context.Background(), assistant.StartTaskCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		UserMessage:    "我要 Go 后端面试",
		IdempotencyKey: "role-override",
	})
	if err != nil {
		t.Fatal(err)
	}
	plan, err := store.GetPlan(context.Background(), run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if targetRoleFromTestPlan(plan) != "Go Backend Engineer" {
		t.Fatalf("planner role was not corrected: %#v", plan)
	}
}

func TestScenarioPracticeGoInterviewRetrievesKnowledgeBeforeSession(t *testing.T) {
	store := assistant.NewMemoryConversationStore()
	generator := &contextCaptureGenerator{}
	tools := assistant.NewDemoStateWithGenerator(generator)
	service := assistant.NewService(assistant.Dependencies{
		Planner:           assistant.NewMockPlanner(tools),
		Tools:             demomodules.NewRegistry(tools, generator),
		ConversationStore: store,
		Runtime:           tools,
		Attachments:       tools,
		Resetter:          tools,
	})
	ctx := context.Background()
	run, err := service.StartTask(ctx, assistant.StartTaskCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		UserMessage:    "我要准备一场 Go 后端面试",
		IdempotencyKey: "scenario-go-start",
	})
	if err != nil {
		t.Fatal(err)
	}
	if run.Intent != "scenario_practice" || run.Status != assistant.TaskRunStatusAwaitingConfirm {
		t.Fatalf("unexpected scenario run: %#v", run)
	}
	plan, err := store.GetPlan(ctx, run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if plan.Scenario != "interview" || plan.ScenarioVariant != "go_backend_interview" ||
		strings.Join(plan.KnowledgeTags, ",") != "interview,go_backend" {
		t.Fatalf("unexpected scenario plan: %#v", plan)
	}
	snapshot := store.Snapshot(tools.State())
	calls := toolNamesForRun(snapshot.ToolCalls, run.ID)
	joinedCalls := strings.Join(calls, ",")
	if joinedCalls != "preparation.get_confirmed_context,scenario.retrieve_knowledge" &&
		joinedCalls != "scenario.retrieve_knowledge,preparation.get_confirmed_context" {
		t.Fatalf("unexpected pre-confirm calls: %#v", snapshot.ToolCalls)
	}
	if tools.State().CurrentSessionID != "" || tools.State().ActiveQuestion != "" {
		t.Fatalf("knowledge retrieval started session: %#v", tools.State())
	}

	run, err = service.ResumeTask(ctx, assistant.ResumeTaskCommand{
		ActorUserID: assistant.DemoUserID,
		TaskRunID:   run.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if run.Status != assistant.TaskRunStatusCompleted || tools.State().ActiveQuestion == "" {
		t.Fatalf("resume did not start scenario interview: %#v %#v", run, tools.State())
	}
	if len(generator.questionInputs) != 1 ||
		generator.questionInputs[0].ScenarioKnowledge.ScenarioVariant != "go_backend_interview" ||
		!strings.Contains(strings.Join(generator.questionInputs[0].ScenarioKnowledge.CompetencyContext, " "), "Goroutines") {
		t.Fatalf("question did not receive Go scenario knowledge: %#v", generator.questionInputs)
	}
}

func TestScenarioPracticeFillsCreatePlanRoleFromScenarioCatalog(t *testing.T) {
	store := assistant.NewMemoryConversationStore()
	tools := assistant.NewDemoState()
	service := assistant.NewService(assistant.Dependencies{
		Planner: staticPlanner{plan: assistant.Plan{
			Intent:          "scenario_practice",
			Scenario:        "interview",
			ScenarioVariant: "java_backend_interview",
			Steps: []assistant.PlanStep{
				{ToolName: "scenario.retrieve_knowledge", Arguments: map[string]any{}},
				{ToolName: "preparation.get_confirmed_context", Arguments: map[string]any{"scenario": "PROGRAMMER_INTERVIEW"}},
				{ToolName: "practice.create_plan", Arguments: map[string]any{"max_turns": 10}},
				{ToolName: "practice.start_session", Arguments: map[string]any{}},
				{ToolName: "conversation.generate_next_question", Arguments: map[string]any{}},
			},
		}},
		Tools:             demomodules.NewRegistry(tools, nil),
		ConversationStore: store,
		Runtime:           tools,
		Attachments:       tools,
		Resetter:          tools,
	})
	run, err := service.StartTask(context.Background(), assistant.StartTaskCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		UserMessage:    "我要准备一场 Java 后端面试",
		IdempotencyKey: "scenario-java-empty-role",
	})
	if err != nil {
		t.Fatal(err)
	}
	plan, err := store.GetPlan(context.Background(), run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if targetRoleFromTestPlan(plan) != "Java Backend Engineer" {
		t.Fatalf("scenario role default was not applied: %#v", plan)
	}
	if got := maxTurnsFromTestPlan(plan); got != 0 {
		t.Fatalf("planner-invented max_turns was not reset: got %d plan=%#v", got, plan)
	}
}

func targetRoleFromTestPlan(plan assistant.Plan) string {
	for _, step := range plan.Steps {
		if step.ToolName == "practice.create_plan" {
			return strings.TrimSpace(fmt.Sprint(step.Arguments["role"]))
		}
	}
	return ""
}

func maxTurnsFromTestPlan(plan assistant.Plan) int {
	for _, step := range plan.Steps {
		if step.ToolName == "practice.create_plan" {
			switch value := step.Arguments["max_turns"].(type) {
			case int:
				return value
			case float64:
				return int(value)
			}
		}
	}
	return -1
}

func toolNamesForRun(calls []assistant.ToolCall, runID string) []string {
	names := []string{}
	for _, call := range calls {
		if call.TaskRunID == runID {
			names = append(names, call.ToolName)
		}
	}
	return names
}

type contextCaptureGenerator struct {
	inputs         []assistant.ConversationReplyInput
	questionInputs []assistant.InterviewGenerationInput
	profileInputs  []assistant.CandidateProfileInput
}

func (g *contextCaptureGenerator) AnalyzeAttachment(
	_ context.Context,
	input assistant.AttachmentInput,
) (assistant.AttachmentAnalysis, error) {
	if strings.HasPrefix(input.MediaType, "image/") {
		return assistant.AttachmentAnalysis{
			Kind:     "image",
			IsResume: false,
			Summary:  "一张用于测试渲染的图片",
		}, nil
	}
	return assistant.AttachmentAnalysis{
		Kind:          "resume",
		IsResume:      true,
		Summary:       "李明的 Go 后端工程师简历",
		ExtractedText: "Li Ming built Go and Kafka payment services and reduced duplicate alerts by 80%.",
	}, nil
}

func (g *contextCaptureGenerator) AnalyzeCandidateProfile(
	_ context.Context,
	input assistant.CandidateProfileInput,
) (assistant.CandidateProfile, error) {
	g.profileInputs = append(g.profileInputs, input)
	return assistant.CandidateProfile{
		CandidateName: "Li Ming",
		Headline:      "Backend Engineer",
		Summary:       "Built reliable distributed services.",
		Skills:        []string{"Go", "Kafka"},
		Experiences:   []string{"Reduced duplicate payment alerts by 80%."},
	}, nil
}

func (g *contextCaptureGenerator) GenerateConversationReply(
	_ context.Context,
	input assistant.ConversationReplyInput,
) (string, error) {
	g.inputs = append(g.inputs, input)
	if input.UserMessage == "我叫什么名字" {
		for _, message := range input.Messages {
			if message.Role == "user" && message.Content == "我叫大毛" {
				return "你叫大毛。", nil
			}
		}
		return "", fmt.Errorf("complete context did not contain the user's name")
	}
	return "你好，大毛。", nil
}

func (g *contextCaptureGenerator) GenerateQuestion(
	_ context.Context,
	input assistant.InterviewGenerationInput,
) (string, error) {
	g.questionInputs = append(g.questionInputs, input)
	return fmt.Sprintf("Question %d?", input.CompletedQuestionCount+1), nil
}

func (g *contextCaptureGenerator) GenerateFeedback(
	context.Context,
	assistant.InterviewFeedbackInput,
) (string, error) {
	return "Feedback", nil
}

func TestConversationUsesCompleteCommittedThreadContext(t *testing.T) {
	store := assistant.NewMemoryConversationStore()
	generator := &contextCaptureGenerator{}
	tools := assistant.NewDemoStateWithGenerator(generator)
	service := assistant.NewService(assistant.Dependencies{
		Planner:           assistant.NewMockPlanner(tools),
		Tools:             demomodules.NewRegistry(tools, generator),
		ConversationStore: store,
		Runtime:           tools,
		Attachments:       tools,
		Resetter:          tools,
	})
	ctx := context.Background()
	for index, message := range []string{"我叫大毛", "我叫什么名字"} {
		if _, err := service.StartTask(ctx, assistant.StartTaskCommand{
			ActorUserID:    assistant.DemoUserID,
			ThreadID:       assistant.DemoThreadID,
			UserMessage:    message,
			IdempotencyKey: fmt.Sprintf("memory-%d", index),
		}); err != nil {
			t.Fatal(err)
		}
	}
	if len(generator.inputs) != 2 {
		t.Fatalf("generator calls = %d, want 2", len(generator.inputs))
	}
	second := generator.inputs[1]
	if len(second.Messages) != 4 {
		t.Fatalf("second call context has %d messages, want 4: %#v", len(second.Messages), second.Messages)
	}
	if second.Messages[1].Content != "我叫大毛" ||
		second.Messages[2].Content != "你好，大毛。" ||
		second.Messages[3].Content != "我叫什么名字" {
		t.Fatalf("conversation order was not preserved: %#v", second.Messages)
	}
	snapshot := store.Snapshot(tools.State())
	if got := snapshot.Messages[len(snapshot.Messages)-1].Content; got != "你叫大毛。" {
		t.Fatalf("reply = %q, want remembered name", got)
	}
}

func TestConfirmedCandidateProfileIsInjectedIntoQuestionGeneration(t *testing.T) {
	generator := &contextCaptureGenerator{}
	tools := assistant.NewDemoStateWithGenerator(generator)
	registry := demomodules.NewRegistry(tools, generator)
	profile, err := tools.UpdateCandidateProfile(context.Background(), assistant.CandidateProfileInput{
		ResumeName:     "resume.txt",
		ResumeText:     "Li Ming built Go services and reduced duplicate payment alerts by 80%.",
		JobTitle:       "Go Backend Engineer",
		JobDescription: "Build reliable distributed payment services.",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !profile.Configured() || profile.ID == "" {
		t.Fatalf("profile was not configured: %#v", profile)
	}
	for _, invocation := range []assistant.ToolInvocation{
		{ToolName: "practice.create_plan", Arguments: map[string]any{"role": "Go Backend Engineer", "max_turns": 3, "duration_minutes": 5}},
		{ToolName: "practice.start_session", Arguments: map[string]any{}},
		{ToolName: "conversation.generate_next_question", Arguments: map[string]any{}},
	} {
		if _, err := registry.Execute(context.Background(), invocation); err != nil {
			t.Fatal(err)
		}
	}
	if len(generator.questionInputs) != 1 {
		t.Fatalf("question inputs = %d, want 1", len(generator.questionInputs))
	}
	input := generator.questionInputs[0]
	if input.CandidateProfile.CandidateName != "Li Ming" ||
		input.CandidateProfile.Experiences[0] != "Reduced duplicate payment alerts by 80%." {
		t.Fatalf("question did not receive confirmed profile: %#v", input.CandidateProfile)
	}
}

func TestAttachmentJoinsConversationContextAndPersistsResumeMemory(t *testing.T) {
	store := assistant.NewMemoryConversationStore()
	generator := &contextCaptureGenerator{}
	tools := assistant.NewDemoStateWithGenerator(generator)
	service := assistant.NewService(assistant.Dependencies{
		Planner:           assistant.NewMockPlanner(tools),
		Tools:             demomodules.NewRegistry(tools, generator),
		ConversationStore: store,
		Runtime:           tools,
		Attachments:       tools,
		Resetter:          tools,
	})
	attachment, err := tools.AddAttachment(context.Background(), assistant.AttachmentInput{
		Filename:  "li-ming-resume.pdf",
		MediaType: "application/pdf",
		Data:      []byte("%PDF-test"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if !attachment.IsResume || tools.State().CandidateProfile.ResumeName != "li-ming-resume.pdf" {
		t.Fatalf("resume memory was not created: %#v %#v", attachment, tools.State().CandidateProfile)
	}
	if _, err := service.StartTask(context.Background(), assistant.StartTaskCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		AttachmentIDs:  []string{attachment.ID},
		IdempotencyKey: "attachment-message",
	}); err != nil {
		t.Fatal(err)
	}
	if len(generator.inputs) != 1 ||
		!strings.Contains(generator.inputs[0].UserMessage, "reduced duplicate alerts by 80%") {
		t.Fatalf("model did not receive parsed attachment context: %#v", generator.inputs)
	}
	snapshot := store.Snapshot(tools.State())
	userMessage := snapshot.Messages[len(snapshot.Messages)-2]
	if userMessage.Content != "请理解我上传的附件。" || len(userMessage.Attachments) != 1 {
		t.Fatalf("attachment was not committed as a visible user message: %#v", userMessage)
	}
	tools.Reset()
	if tools.State().CandidateProfile.ResumeName != "li-ming-resume.pdf" {
		t.Fatalf("new conversation forgot the resume: %#v", tools.State().CandidateProfile)
	}
	service.ResetDemo()
	if _, err := service.StartTask(context.Background(), assistant.StartTaskCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		UserMessage:    "新会话里还记得我的简历吗？",
		IdempotencyKey: "resume-memory-after-reset",
	}); err != nil {
		t.Fatal(err)
	}
	latest := generator.inputs[len(generator.inputs)-1]
	if latest.CandidateProfile.ResumeName != "li-ming-resume.pdf" ||
		!strings.Contains(latest.CandidateProfile.ResumeText, "Kafka") {
		t.Fatalf("persistent resume was not injected after reset: %#v", latest.CandidateProfile)
	}
}

type contextBuilderAdapter struct{ builder *assistantcontext.Builder }

func (a contextBuilderAdapter) Build(ctx context.Context, request assistant.ContextBuildRequest) (assistant.ContextBuildResult, error) {
	messages := make([]assistantcontext.Message, 0, len(request.Messages))
	for _, item := range request.Messages {
		messages = append(messages, assistantcontext.Message{Role: item.Role, Content: item.Content})
	}
	result, err := a.builder.Build(ctx, assistantcontext.BuildRequest{UserID: request.ActorUserID, ThreadID: request.ThreadID, Query: request.Query, ThreadSummary: request.ThreadSummary, Messages: messages})
	if err != nil {
		return assistant.ContextBuildResult{}, err
	}
	built := make([]assistant.ContextMessage, 0, len(result.Messages))
	for _, item := range result.Messages {
		built = append(built, assistant.ContextMessage{Role: item.Role, Content: item.Content})
	}
	return assistant.ContextBuildResult{Messages: built, Summary: result.Summary, TokenCount: result.TokenCount, Compressed: result.Compressed}, nil
}

func TestContextBuilderGracefullyHandlesLongMessage(t *testing.T) {
	store := assistant.NewMemoryConversationStore()
	tools := assistant.NewDemoState()
	service := assistant.NewService(assistant.Dependencies{
		Planner: assistant.NewMockPlanner(tools), Tools: demomodules.NewRegistry(tools, nil),
		ConversationStore: store, Runtime: tools, Attachments: tools, Resetter: tools,
		ContextBuilder: contextBuilderAdapter{builder: assistantcontext.NewBuilder(nil)},
	})
	run, err := service.StartTask(context.Background(), assistant.StartTaskCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		UserMessage:    strings.Repeat("大", assistant.ContextTokenLimit),
		IdempotencyKey: "context-overflow",
	})
	if err != nil {
		t.Fatal(err)
	}
	if run.Status != assistant.TaskRunStatusCompleted {
		t.Fatalf("long context did not complete: %#v", run)
	}
	after := store.Snapshot(tools.State())
	if len(after.Messages) < 3 || len(after.TaskRuns) != 1 {
		t.Fatalf("long message was not committed: %#v", after)
	}
}

func TestMockPlannerInfersRequestedInterviewRole(t *testing.T) {
	tools := assistant.NewDemoState()
	planner := assistant.NewMockPlanner(tools)

	plan, err := planner.Plan(context.Background(), assistant.PlanRequest{
		ThreadID:    assistant.DemoThreadID,
		UserMessage: "请帮我创建一场产品经理模拟面试",
	})
	if err != nil {
		t.Fatal(err)
	}
	if plan.Intent != "scenario_practice" || plan.ScenarioVariant != "product_manager_interview" {
		t.Fatalf("unexpected scenario plan: %#v", plan)
	}
	if strings.Join(plan.KnowledgeTags, ",") != "interview,product_manager" {
		t.Fatalf("knowledge tags = %#v, want product manager interview tags", plan.KnowledgeTags)
	}
}

func TestMockPlannerClarifiesMissingInterviewRoleThenUsesAnswer(t *testing.T) {
	tools := assistant.NewDemoState()
	planner := assistant.NewMockPlanner(tools)

	plan, err := planner.Plan(context.Background(), assistant.PlanRequest{
		ThreadID:    assistant.DemoThreadID,
		UserMessage: "我想做一次模拟面试",
	})
	if err != nil {
		t.Fatal(err)
	}
	if plan.Intent != "clarify_interview_requirements" {
		t.Fatalf("intent = %q, want clarify_interview_requirements", plan.Intent)
	}

	plan, err = planner.Plan(context.Background(), assistant.PlanRequest{
		ThreadID:       assistant.DemoThreadID,
		UserMessage:    "Go 后端工程师",
		ContextSummary: "面试需求收集中；interview_requirement=pending_target_role；session_in_progress=false",
	})
	if err != nil {
		t.Fatal(err)
	}
	if plan.Intent != "scenario_practice" || plan.ScenarioVariant != "go_backend_interview" {
		t.Fatalf("unexpected continuation plan: %#v", plan)
	}
}

func TestMissingInterviewRoleOnlyAsksForClarification(t *testing.T) {
	service, store, tools := newRuntime()
	run, err := service.StartTask(context.Background(), assistant.StartTaskCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		UserMessage:    "我想做一次模拟面试",
		IdempotencyKey: "clarify-role",
	})
	if err != nil {
		t.Fatal(err)
	}
	if run.Intent != "clarify_interview_requirements" || run.Status != assistant.TaskRunStatusCompleted {
		t.Fatalf("unexpected clarification run: %#v", run)
	}
	snapshot := store.Snapshot(tools.State())
	if len(snapshot.Confirmations) != 0 || tools.State().CurrentSessionID != "" {
		t.Fatalf("clarification created interview state: %#v", snapshot)
	}
	if len(snapshot.ToolCalls) != 1 || snapshot.ToolCalls[0].ToolName != "conversation.generate_reply" {
		t.Fatalf("unexpected clarification calls: %#v", snapshot.ToolCalls)
	}
	if !strings.Contains(snapshot.Thread.ContextSummary, "pending_target_role") {
		t.Fatalf("missing pending requirement state: %q", snapshot.Thread.ContextSummary)
	}
}

func TestDefaultInterviewUsesDynamicQuestionCount(t *testing.T) {
	service, store, tools := newRuntime()
	ctx := context.Background()
	started, err := service.StartTask(ctx, assistant.StartTaskCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		UserMessage:    "start a Go backend interview",
		IdempotencyKey: "start-2",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.ResumeTask(ctx, assistant.ResumeTaskCommand{
		ActorUserID: assistant.DemoUserID,
		TaskRunID:   started.ID,
	}); err != nil {
		t.Fatal(err)
	}

	if tools.State().MaxTurns != 0 || assistant.DefaultInterviewMaxTurns != 0 {
		t.Fatalf("default interview unexpectedly has a turn cap: %#v", tools.State())
	}
	for index := 0; index < 3; index++ {
		if _, err := service.StartTask(ctx, assistant.StartTaskCommand{
			ActorUserID:    assistant.DemoUserID,
			ThreadID:       assistant.DemoThreadID,
			UserMessage:    "My answer includes a concrete example and result.",
			IdempotencyKey: fmt.Sprintf("answer-%d", index+1),
		}); err != nil {
			t.Fatal(err)
		}
	}
	state := tools.State()
	if state.CompletedQuestionCount != 3 || state.ActiveQuestion == "" {
		t.Fatalf("dynamic interview stopped at an implicit turn limit: %#v", state)
	}
	snapshot := store.Snapshot(state)
	for _, message := range snapshot.Messages {
		if message.Kind == "interview_report" {
			t.Fatalf("dynamic interview generated an early report: %#v", snapshot.Messages)
		}
	}
	for _, message := range snapshot.Messages {
		if strings.Contains(message.Content, "My answer includes") || strings.Contains(message.Content, "面试开始。") {
			t.Fatalf("interview transcript leaked into main conversation: %#v", snapshot.Messages)
		}
	}
}

func TestPracticeHistoryIntentAppendsClickableHistoryCards(t *testing.T) {
	service, store, tools := newRuntime()
	seedAssistantCompletedSession(t, tools, "session-history-card", "AI Application Developer")

	if _, err := service.StartTask(context.Background(), assistant.StartTaskCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		UserMessage:    "帮我查一下我最近面试过哪些面试",
		IdempotencyKey: "history-cards",
	}); err != nil {
		t.Fatal(err)
	}
	snapshot := store.Snapshot(tools.State())
	last := snapshot.Messages[len(snapshot.Messages)-1]
	if last.Kind != "interview_history_cards" || last.History == nil || len(last.History.Items) != 1 {
		t.Fatalf("missing history cards: %#v", last)
	}
	if last.History.Items[0].SessionID != "session-history-card" {
		t.Fatalf("unexpected history card: %#v", last.History.Items[0])
	}
}

func TestSavedMistakeIntentAppendsClickableMistakeCards(t *testing.T) {
	service, store, tools := newRuntime()
	seedAssistantCompletedSession(t, tools, "session-mistake-card", "AI Application Developer")
	if _, err := tools.SaveReviewMistake("session-mistake-card", 0); err != nil {
		t.Fatal(err)
	}

	if _, err := service.StartTask(context.Background(), assistant.StartTaskCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		UserMessage:    "帮我看看我最近几道错题",
		IdempotencyKey: "mistake-cards",
	}); err != nil {
		t.Fatal(err)
	}
	snapshot := store.Snapshot(tools.State())
	last := snapshot.Messages[len(snapshot.Messages)-1]
	if last.Kind != "mistake_cards" || last.Mistakes == nil || len(last.Mistakes.Items) != 1 {
		t.Fatalf("missing mistake cards: %#v", last)
	}
	if last.Mistakes.Items[0].SessionID != "session-mistake-card" {
		t.Fatalf("unexpected mistake card: %#v", last.Mistakes.Items[0])
	}
}

func TestShortSavedMistakeRepracticeProducesFeedback(t *testing.T) {
	_, _, tools := newRuntime()
	seedAssistantCompletedSession(t, tools, "session-short-repractice", "AI Application Developer")
	mistake, err := tools.SaveReviewMistake("session-short-repractice", 0)
	if err != nil {
		t.Fatal(err)
	}

	result, err := tools.SubmitSavedMistakeRepractice(mistake.ID, "你好，点评一下")
	if err != nil {
		t.Fatal(err)
	}
	if result.Feedback.Type != "evidence_gap" || result.Summary == "" {
		t.Fatalf("short repractice should still produce feedback: %#v", result)
	}
	context, err := tools.GetSavedMistakeContext(mistake.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(context.Repractices) != 1 || context.Mistake.Status != "practiced" {
		t.Fatalf("repractice was not saved in context: %#v", context)
	}
}

func TestInterviewQuestionGenerationReceivesDialogueHistory(t *testing.T) {
	store := assistant.NewMemoryConversationStore()
	generator := &contextCaptureGenerator{}
	tools := assistant.NewDemoStateWithGenerator(generator)
	service := assistant.NewService(assistant.Dependencies{
		Planner:           assistant.NewMockPlanner(tools),
		Tools:             demomodules.NewRegistry(tools, generator),
		ConversationStore: store,
		Runtime:           tools,
		Attachments:       tools,
		Resetter:          tools,
	})
	ctx := context.Background()
	started, err := service.StartTask(ctx, assistant.StartTaskCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		UserMessage:    "开始产品经理面试",
		IdempotencyKey: "dynamic-start",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.ResumeTask(ctx, assistant.ResumeTaskCommand{
		ActorUserID: assistant.DemoUserID,
		TaskRunID:   started.ID,
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := service.StartTask(ctx, assistant.StartTaskCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		UserMessage:    "I prioritized retention after reviewing cohort data.",
		IdempotencyKey: "dynamic-answer",
	}); err != nil {
		t.Fatal(err)
	}
	if len(generator.questionInputs) != 2 {
		t.Fatalf("question calls = %d, want 2", len(generator.questionInputs))
	}
	second := generator.questionInputs[1]
	if len(second.Answers) != 1 ||
		second.Answers[0] != "I prioritized retention after reviewing cohort data." ||
		second.LatestAnswer != "I prioritized retention after reviewing cohort data." ||
		second.TargetRole != "Product Manager" ||
		second.MaxTurns != 0 ||
		len(second.PreviousQuestions) != 1 ||
		second.PreviousQuestion != second.PreviousQuestions[0] ||
		second.DurationMinutes != assistant.DefaultInterviewDurationMinutes ||
		second.ElapsedMinutes < 0 || second.RemainingMinutes <= 0 {
		t.Fatalf("next question did not receive interview history: %#v", second)
	}
}

func TestInterviewLimitsSupportTurnAndTimeCompletion(t *testing.T) {
	now := time.Now()
	if !(assistant.MockDomainState{
		MaxTurns:               3,
		CompletedQuestionCount: 3,
		Deadline:               now.Add(time.Minute),
	}).LimitReached(now) {
		t.Fatal("turn limit should complete interview")
	}
	if !(assistant.MockDomainState{
		MaxTurns:               10,
		CompletedQuestionCount: 2,
		Deadline:               now.Add(-time.Second),
	}).LimitReached(now) {
		t.Fatal("time limit should complete interview")
	}
}

func TestEndInterviewGeneratesFeedbackWithoutCountingUnansweredTurn(t *testing.T) {
	service, store, tools := newRuntime()
	ctx := context.Background()
	started, err := service.StartTask(ctx, assistant.StartTaskCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		UserMessage:    "开始 Go 后端面试",
		IdempotencyKey: "end-start",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.ResumeTask(ctx, assistant.ResumeTaskCommand{
		ActorUserID: assistant.DemoUserID,
		TaskRunID:   started.ID,
	}); err != nil {
		t.Fatal(err)
	}
	run, err := service.EndInterview(ctx, assistant.EndInterviewCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		Reason:         "user_requested",
		IdempotencyKey: "end-now",
	})
	if err != nil {
		t.Fatal(err)
	}
	if run.Intent != "end_interview" || run.Status != assistant.TaskRunStatusCompleted {
		t.Fatalf("unexpected end run: %#v", run)
	}
	state := tools.State()
	if state.CompletedQuestionCount != 0 || state.ActiveQuestion != "" {
		t.Fatalf("ending interview counted an unanswered turn: %#v", state)
	}
	last := store.Snapshot(state).Messages
	if last[len(last)-1].Kind != "interview_report" || last[len(last)-1].Report == nil {
		t.Fatalf("missing end report card: %#v", last)
	}
}

func TestStopMessageEndsInterviewWithoutCountingAsAnswer(t *testing.T) {
	service, store, tools := newRuntime()
	ctx := context.Background()
	started, err := service.StartTask(ctx, assistant.StartTaskCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		UserMessage:    "开始产品经理面试",
		IdempotencyKey: "stop-message-start",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.ResumeTask(ctx, assistant.ResumeTaskCommand{
		ActorUserID: assistant.DemoUserID,
		TaskRunID:   started.ID,
	}); err != nil {
		t.Fatal(err)
	}
	run, err := service.StartTask(ctx, assistant.StartTaskCommand{
		ActorUserID:     assistant.DemoUserID,
		ThreadID:        assistant.DemoThreadID,
		UserMessage:     "结束面试",
		InteractionMode: "interview",
		IdempotencyKey:  "stop-message",
	})
	if err != nil {
		t.Fatal(err)
	}
	if run.Intent != "end_interview" || run.Status != assistant.TaskRunStatusCompleted {
		t.Fatalf("stop message did not use end-interview flow: %#v", run)
	}
	state := tools.State()
	if state.CompletedQuestionCount != 0 || state.ActiveQuestion != "" {
		t.Fatalf("stop message was counted as an answer: %#v", state)
	}
	messages := store.Snapshot(state).Messages
	last := messages[len(messages)-1]
	if last.Kind != "interview_report" || last.Report == nil || last.Report.CompletedTurns != 0 {
		t.Fatalf("stop message did not generate a zero-answer report: %#v", messages)
	}
}

func TestPausedInterviewDoesNotConsumeFreeConversationAsAnswer(t *testing.T) {
	service, store, tools := newRuntime()
	ctx := context.Background()
	started, err := service.StartTask(ctx, assistant.StartTaskCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		UserMessage:    "开始 Go 后端面试",
		IdempotencyKey: "pause-start",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.ResumeTask(ctx, assistant.ResumeTaskCommand{
		ActorUserID: assistant.DemoUserID,
		TaskRunID:   started.ID,
	}); err != nil {
		t.Fatal(err)
	}
	originalQuestion := tools.State().ActiveQuestion
	if originalQuestion == "" {
		t.Fatal("interview did not start")
	}

	chatRun, err := service.StartTask(ctx, assistant.StartTaskCommand{
		ActorUserID:     assistant.DemoUserID,
		ThreadID:        assistant.DemoThreadID,
		UserMessage:     "你是谁",
		IdempotencyKey:  "pause-chat",
		InteractionMode: "conversation",
	})
	if err != nil {
		t.Fatal(err)
	}
	if chatRun.Intent != "free_conversation" {
		t.Fatalf("paused interview routed chat as %q", chatRun.Intent)
	}
	paused := tools.State()
	if paused.CompletedQuestionCount != 0 || paused.ActiveQuestion != originalQuestion {
		t.Fatalf("free chat changed interview progress: %#v", paused)
	}
	messages := store.Snapshot(paused).Messages
	if got := messages[len(messages)-1].Content; strings.Contains(got, "回答已保存") {
		t.Fatalf("free conversation received interview response: %q", got)
	}

	answerRun, err := service.StartTask(ctx, assistant.StartTaskCommand{
		ActorUserID:     assistant.DemoUserID,
		ThreadID:        assistant.DemoThreadID,
		UserMessage:     "这是我在面试页提交的回答",
		IdempotencyKey:  "pause-resume-answer",
		InteractionMode: "interview",
	})
	if err != nil {
		t.Fatal(err)
	}
	if answerRun.Intent != "submit_interview_answer" || tools.State().CompletedQuestionCount != 1 {
		t.Fatalf("resumed practice did not consume the answer: run=%#v state=%#v", answerRun, tools.State())
	}
	afterAnswer := store.Snapshot(tools.State()).Messages
	for _, message := range afterAnswer {
		if message.Content == "这是我在面试页提交的回答" {
			t.Fatalf("interview answer leaked into main conversation: %#v", afterAnswer)
		}
	}
}

func TestRejectDoesNotStartPracticeSession(t *testing.T) {
	service, store, tools := newRuntime()
	ctx := context.Background()
	started, err := service.StartTask(ctx, assistant.StartTaskCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		UserMessage:    "开始 Go 后端面试",
		IdempotencyKey: "start-3",
	})
	if err != nil {
		t.Fatal(err)
	}
	run, err := service.RejectTask(ctx, assistant.DemoUserID, started.ID)
	if err != nil {
		t.Fatal(err)
	}
	if cancelled, ok := run.Result["cancelled_by_user"].(bool); !ok || !cancelled {
		t.Fatalf("unexpected reject result: %#v", run.Result)
	}
	for _, call := range store.Snapshot(tools.State()).ToolCalls {
		if call.ToolName == "practice.start_session" {
			t.Fatal("rejected task must not start a PracticeSession")
		}
	}
}

func TestStartTaskIsIdempotent(t *testing.T) {
	service, store, tools := newRuntime()
	ctx := context.Background()
	command := assistant.StartTaskCommand{
		ActorUserID:    assistant.DemoUserID,
		ThreadID:       assistant.DemoThreadID,
		UserMessage:    "查看最近练习历史",
		IdempotencyKey: "same-request",
	}
	first, err := service.StartTask(ctx, command)
	if err != nil {
		t.Fatal(err)
	}
	second, err := service.StartTask(ctx, command)
	if err != nil {
		t.Fatal(err)
	}
	if first.ID != second.ID {
		t.Fatalf("idempotent request created two runs: %s != %s", first.ID, second.ID)
	}
	snapshot := store.Snapshot(tools.State())
	if len(snapshot.TaskRuns) != 1 || len(snapshot.ToolCalls) != 1 {
		t.Fatalf("idempotent request duplicated state: %#v", snapshot)
	}
}

func seedAssistantCompletedSession(t *testing.T, tools *assistant.DemoState, id, role string) {
	t.Helper()
	_, err := tools.Transact(func(snapshot *assistant.RuntimeSnapshot, _ *[]string) (assistant.ToolResult, error) {
		startedAt := time.Now().UTC().Add(-time.Hour)
		endedAt := startedAt.Add(12 * time.Minute)
		snapshot.Sessions = append(snapshot.Sessions, assistant.InterviewSession{
			ID: id, TargetRole: role, Interviewer: "Senior Hiring Manager",
			Status: "completed", MaxTurns: 10, DurationMinutes: 15,
			CompletedTurns: 1, StartedAt: startedAt, EndedAt: &endedAt,
			Questions: []string{"Tell me about a project where you used AI."},
			Answers:   []string{"I built an AI workflow and improved response quality by measuring review outcomes."},
			Feedback:  "本次回答有项目背景，可以继续补充技术取舍。",
		})
		return assistant.ToolResult{}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
