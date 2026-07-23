package assistant

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

var (
	ErrNotFound             = errors.New("assistant: not found")
	ErrForbidden            = errors.New("assistant: forbidden")
	ErrNoPendingConfirm     = errors.New("assistant: no pending confirmation")
	ErrInvalidTaskRunState  = errors.New("assistant: invalid task run state")
	ErrResumeLimit          = errors.New("assistant: resume limit reached")
	ErrNotResume            = errors.New("assistant: uploaded document is not a resume")
	ErrInvalidResumeProfile = errors.New("assistant: invalid resume profile")
	ErrAttachmentInUse      = errors.New("assistant: attachment is already in use")
	ErrActiveInterview      = errors.New("assistant: active interview cannot be deleted")
	ErrNoActiveQuestion     = errors.New("assistant: no active interview question")
)

type AssistantService interface {
	StartTask(context.Context, StartTaskCommand) (TaskRun, error)
	ResumeTask(context.Context, ResumeTaskCommand) (TaskRun, error)
	EndInterview(context.Context, EndInterviewCommand) (TaskRun, error)
	GetThread(context.Context, GetThreadQuery) (AssistantThread, error)
}

type Dependencies struct {
	Planner           Planner
	ContextBuilder    ContextBuilder
	MemoryObserver    MemoryObserver
	Tools             ToolRegistry
	ConversationStore ConversationStore
	Runtime           InterviewRuntime
	Attachments       AttachmentResolver
	Resetter          DemoResetter
	LiveKit           LiveKitConfig
}

type Service struct {
	dependencies Dependencies
	taskMu       sync.Mutex
	live         *liveSessionCoordinator
}

func NewService(dependencies Dependencies) *Service {
	return &Service{
		dependencies: dependencies,
		live:         newLiveSessionCoordinator(dependencies.LiveKit),
	}
}

type StartTaskCommand struct {
	ActorUserID     string
	ThreadID        string
	UserMessage     string
	AttachmentIDs   []string
	IdempotencyKey  string
	InteractionMode string
	ClientMessageID string
	LiveSessionID   string
	TurnID          string
	Mode            ConversationMode
}

type ResumeTaskCommand struct {
	ActorUserID string
	TaskRunID   string
}

type EndInterviewCommand struct {
	ActorUserID    string
	ThreadID       string
	Reason         string
	IdempotencyKey string
}

type GetThreadQuery struct {
	ActorUserID string
	ThreadID    string
}

func (s *Service) StartTask(ctx context.Context, command StartTaskCommand) (TaskRun, error) {
	s.taskMu.Lock()
	defer s.taskMu.Unlock()
	return s.startTask(ctx, command)
}

func (s *Service) startTask(ctx context.Context, command StartTaskCommand) (TaskRun, error) {
	thread, err := s.GetThread(ctx, GetThreadQuery{
		ActorUserID: command.ActorUserID,
		ThreadID:    command.ThreadID,
	})
	if err != nil {
		return TaskRun{}, err
	}
	if strings.TrimSpace(command.UserMessage) == "" && len(command.AttachmentIDs) == 0 {
		return TaskRun{}, errors.New("assistant: user message or attachment is required")
	}
	if strings.TrimSpace(command.IdempotencyKey) == "" {
		return TaskRun{}, errors.New("assistant: idempotency key is required")
	}
	interactionMode := strings.ToLower(strings.TrimSpace(command.InteractionMode))
	if interactionMode != "" && interactionMode != "conversation" && interactionMode != "interview" {
		return TaskRun{}, errors.New("assistant: interaction mode must be conversation or interview")
	}
	existing, err := s.dependencies.ConversationStore.GetTaskRunByIdempotency(
		ctx,
		command.ActorUserID,
		command.IdempotencyKey,
	)
	if err == nil {
		if command.ClientMessageID != "" {
			if message, messageErr := s.dependencies.ConversationStore.GetMessageByClientMessageID(
				ctx, thread.ID, command.ClientMessageID,
			); messageErr == nil {
				if writer := canonicalUserMessageWriterFromContext(ctx); writer != nil {
					if writeErr := writer(message); writeErr != nil {
						return TaskRun{}, writeErr
					}
				}
			}
		}
		return existing, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return TaskRun{}, err
	}

	attachments, err := s.resolveAttachments(command.AttachmentIDs)
	if err != nil {
		return TaskRun{}, err
	}
	visibleMessage := strings.TrimSpace(command.UserMessage)
	if visibleMessage == "" {
		visibleMessage = "请理解我上传的附件。"
	}
	contextContent := attachmentContext(visibleMessage, attachments)
	messages, err := s.contextMessages(ctx, thread.ID)
	if err != nil {
		return TaskRun{}, err
	}
	messages = append(messages, ContextMessage{
		Role:    "user",
		Content: contextContent,
	})
	contextSummary := thread.ContextSummary
	if s.dependencies.ContextBuilder != nil {
		built, buildErr := s.dependencies.ContextBuilder.Build(ctx, ContextBuildRequest{
			ActorUserID: command.ActorUserID, ThreadID: thread.ID, RunID: command.IdempotencyKey,
			Query: visibleMessage, ThreadSummary: thread.ContextSummary, Messages: messages,
		})
		if buildErr == nil {
			messages = built.Messages
			contextSummary = built.Summary
		}
	}
	plan, err := s.dependencies.Planner.Plan(ctx, PlanRequest{
		ThreadID:        thread.ID,
		UserMessage:     visibleMessage,
		ContextSummary:  contextSummary,
		Messages:        messages,
		InteractionMode: interactionMode,
	})
	if err != nil {
		return TaskRun{}, fmt.Errorf("plan task: %w", err)
	}
	state := RuntimeSnapshot{}
	if s.dependencies.Runtime != nil {
		state = s.dependencies.Runtime.State()
	}
	// The UI route is authoritative. An active interview may be paused while the
	// user returns to normal chat; those messages must never consume a turn.
	if interactionMode == "conversation" && plan.Intent == "submit_interview_answer" {
		plan = freeConversationPlan()
	}
	// Conversely, a message submitted from the practice composer is always the
	// answer to the active question, even if the wording resembles small talk.
	if interactionMode == "interview" && state.ActiveQuestion != "" && plan.Intent != "submit_interview_answer" {
		plan = interviewAnswerPlan(state.ShouldCompleteAfterNextTurn(time.Now()))
	}
	if plan.Intent == "submit_interview_answer" {
		for index := range plan.Steps {
			if plan.Steps[index].ToolName == "conversation.submit_turn" {
				plan.Steps[index].Arguments["answer_text"] = contextContent
				plan.Steps[index].Arguments["interaction_mode"] = "TEXT"
			}
		}
		if s.dependencies.Runtime != nil && s.dependencies.Runtime.State().ShouldCompleteAfterNextTurn(time.Now()) {
			replaceFinalInterviewStep(&plan, "review.generate_feedback")
		}
	}
	if plan.Intent == "start_mock_interview" {
		normalizeInterviewPlan(&plan)
	}
	if plan.Intent == "clarify_interview_requirements" {
		for index := range plan.Steps {
			if plan.Steps[index].ToolName == "conversation.generate_reply" {
				plan.Steps[index].Arguments["user_message"] = contextContent
				plan.Steps[index].Arguments["context_summary"] = "用户已经表达模拟面试意图，但目标岗位不足以创建面试卡片。请只用一个简短问题询问目标岗位或职位方向，不要声称已经创建或启动面试。"
				plan.Steps[index].Arguments["conversation_messages"] = messages
			}
		}
	}
	if plan.Intent == "free_conversation" {
		conversationSummary := thread.ContextSummary
		if interactionMode == "conversation" && state.ActiveQuestion != "" {
			conversationSummary = "自由对话中；interview_paused=true；当前消息不是面试回答，不得继续提问、催促回答或计入 Turn"
		}
		for index := range plan.Steps {
			if plan.Steps[index].ToolName == "conversation.generate_reply" {
				plan.Steps[index].Arguments["user_message"] = contextContent
				plan.Steps[index].Arguments["context_summary"] = conversationSummary
				plan.Steps[index].Arguments["conversation_messages"] = messages
			}
		}
	}
	if plan.Intent != "submit_interview_answer" {
		message, appendErr := s.appendMessageWithAttachments(
			ctx, "user", visibleMessage, attachments,
			command.ClientMessageID, command.LiveSessionID, command.TurnID, command.Mode,
		)
		if appendErr != nil {
			return TaskRun{}, appendErr
		}
		if writer := canonicalUserMessageWriterFromContext(ctx); writer != nil {
			if err := writer(message); err != nil {
				return TaskRun{}, err
			}
		}
	}

	startedAt := time.Now().UTC()
	run := TaskRun{
		ID:          nextID("task-run"),
		ThreadID:    thread.ID,
		Intent:      plan.Intent,
		Status:      TaskRunStatusRunning,
		CurrentStep: firstToolName(plan.Steps),
		Result:      map[string]any{},
		CreatedAt:   startedAt,
		UpdatedAt:   startedAt,
	}
	if err := s.dependencies.ConversationStore.SavePlan(ctx, run.ID, plan); err != nil {
		return TaskRun{}, err
	}
	if err := s.dependencies.ConversationStore.SaveTaskRun(ctx, run); err != nil {
		return TaskRun{}, err
	}
	if err := s.dependencies.ConversationStore.SaveTaskIdempotency(
		ctx,
		command.ActorUserID,
		command.IdempotencyKey,
		run.ID,
	); err != nil {
		return TaskRun{}, err
	}

	if plan.Intent == "start_mock_interview" {
		targetRole := targetRoleFromPlan(plan)
		maxTurns, durationMinutes := interviewLimitsFromPlan(plan)
		if _, err := s.executeSteps(ctx, command.ActorUserID, run, plan.Steps[:1]); err != nil {
			return TaskRun{}, err
		}
		confirmation := ConfirmationRequest{
			ID:        nextID("confirmation"),
			TaskRunID: run.ID,
			Action:    "practice.create_plan",
			RiskLevel: "user_visible_change",
			Summary:   fmt.Sprintf("使用已确认背景创建 %s 真实模拟面试，限制 %d 分钟、最多 %d 轮回答，并启动新的 PracticeSession。", targetRole, durationMinutes, maxTurns),
			Status:    ConfirmationStatusPending,
			ExpiresAt: time.Now().UTC().Add(15 * time.Minute),
		}
		if err := s.dependencies.ConversationStore.SaveConfirmationRequest(ctx, confirmation); err != nil {
			return TaskRun{}, err
		}
		run.Status = TaskRunStatusAwaitingConfirm
		run.CurrentStep = "practice.create_plan"
		run.UpdatedAt = time.Now().UTC()
		if err := s.dependencies.ConversationStore.SaveTaskRun(ctx, run); err != nil {
			return TaskRun{}, err
		}
		if err := s.appendMessage(ctx, "assistant", fmt.Sprintf("背景快照已读取。创建 %s 真实模拟面试（%d 分钟、最多 %d 轮回答）会产生新的练习记录，请确认后继续。", targetRole, durationMinutes, maxTurns)); err != nil {
			return TaskRun{}, err
		}
		return run, nil
	}

	return s.completeRun(ctx, command.ActorUserID, run, plan.Steps)
}

func freeConversationPlan() Plan {
	return Plan{
		Intent: "free_conversation",
		Steps: []PlanStep{{
			ToolName:  "conversation.generate_reply",
			Arguments: map[string]any{},
		}},
	}
}

func interviewAnswerPlan(last bool) Plan {
	lastTool := "conversation.generate_next_question"
	if last {
		lastTool = "review.generate_feedback"
	}
	return Plan{
		Intent: "submit_interview_answer",
		Steps: []PlanStep{
			{ToolName: "conversation.submit_turn", Arguments: map[string]any{}},
			{ToolName: "practice.apply_turn_outcome", Arguments: map[string]any{"answer_validity": "VALID"}},
			{ToolName: lastTool, Arguments: map[string]any{}},
		},
	}
}

func (s *Service) ResumeTask(ctx context.Context, command ResumeTaskCommand) (TaskRun, error) {
	s.taskMu.Lock()
	defer s.taskMu.Unlock()
	run, err := s.dependencies.ConversationStore.GetTaskRun(ctx, command.TaskRunID)
	if err != nil {
		return TaskRun{}, err
	}
	thread, err := s.GetThread(ctx, GetThreadQuery{
		ActorUserID: command.ActorUserID,
		ThreadID:    run.ThreadID,
	})
	if err != nil || thread.ID == "" {
		return TaskRun{}, err
	}
	if run.Status != TaskRunStatusAwaitingConfirm {
		return TaskRun{}, ErrInvalidTaskRunState
	}
	confirmation, err := s.dependencies.ConversationStore.GetPendingConfirmationRequest(ctx, run.ID)
	if err != nil {
		return TaskRun{}, err
	}
	confirmation.Status = ConfirmationStatusApproved
	if err := s.dependencies.ConversationStore.SaveConfirmationRequest(ctx, confirmation); err != nil {
		return TaskRun{}, err
	}
	plan, err := s.dependencies.ConversationStore.GetPlan(ctx, run.ID)
	if err != nil {
		return TaskRun{}, err
	}
	run.Status = TaskRunStatusRunning
	run.CurrentStep = plan.Steps[1].ToolName
	run.UpdatedAt = time.Now().UTC()
	if err := s.dependencies.ConversationStore.SaveTaskRun(ctx, run); err != nil {
		return TaskRun{}, err
	}
	return s.completeRun(ctx, command.ActorUserID, run, plan.Steps[1:])
}

func (s *Service) EndInterview(ctx context.Context, command EndInterviewCommand) (TaskRun, error) {
	s.taskMu.Lock()
	defer s.taskMu.Unlock()
	thread, err := s.GetThread(ctx, GetThreadQuery{
		ActorUserID: command.ActorUserID,
		ThreadID:    command.ThreadID,
	})
	if err != nil {
		return TaskRun{}, err
	}
	if strings.TrimSpace(command.IdempotencyKey) == "" {
		return TaskRun{}, errors.New("assistant: idempotency key is required")
	}
	if existing, lookupErr := s.dependencies.ConversationStore.GetTaskRunByIdempotency(ctx, command.ActorUserID, command.IdempotencyKey); lookupErr == nil {
		return existing, nil
	} else if !errors.Is(lookupErr, ErrNotFound) {
		return TaskRun{}, lookupErr
	}
	if s.dependencies.Runtime == nil || s.dependencies.Runtime.State().ActiveQuestion == "" {
		return TaskRun{}, ErrInvalidTaskRunState
	}

	plan := Plan{
		Intent: "end_interview",
		Steps:  []PlanStep{{ToolName: "review.generate_feedback", Arguments: map[string]any{"reason": command.Reason}}},
	}
	startedAt := time.Now().UTC()
	run := TaskRun{
		ID:          nextID("task-run"),
		ThreadID:    thread.ID,
		Intent:      plan.Intent,
		Status:      TaskRunStatusRunning,
		CurrentStep: "review.generate_feedback",
		Result:      map[string]any{},
		CreatedAt:   startedAt,
		UpdatedAt:   startedAt,
	}
	if err := s.dependencies.ConversationStore.SavePlan(ctx, run.ID, plan); err != nil {
		return TaskRun{}, err
	}
	if err := s.dependencies.ConversationStore.SaveTaskRun(ctx, run); err != nil {
		return TaskRun{}, err
	}
	if err := s.dependencies.ConversationStore.SaveTaskIdempotency(ctx, command.ActorUserID, command.IdempotencyKey, run.ID); err != nil {
		return TaskRun{}, err
	}
	return s.completeRun(ctx, command.ActorUserID, run, plan.Steps)
}

// RejectTask 是 Demo 用于验证 ConfirmationRequest 拒绝分支的增量入口。
func (s *Service) RejectTask(ctx context.Context, actorUserID, taskRunID string) (TaskRun, error) {
	s.taskMu.Lock()
	defer s.taskMu.Unlock()
	run, err := s.dependencies.ConversationStore.GetTaskRun(ctx, taskRunID)
	if err != nil {
		return TaskRun{}, err
	}
	if _, err := s.GetThread(ctx, GetThreadQuery{ActorUserID: actorUserID, ThreadID: run.ThreadID}); err != nil {
		return TaskRun{}, err
	}
	confirmation, err := s.dependencies.ConversationStore.GetPendingConfirmationRequest(ctx, run.ID)
	if err != nil {
		return TaskRun{}, err
	}
	confirmation.Status = ConfirmationStatusRejected
	if err := s.dependencies.ConversationStore.SaveConfirmationRequest(ctx, confirmation); err != nil {
		return TaskRun{}, err
	}
	run.Status = TaskRunStatusCompleted
	run.CurrentStep = ""
	run.Result = map[string]any{"cancelled_by_user": true}
	run.UpdatedAt = time.Now().UTC()
	if err := s.dependencies.ConversationStore.SaveTaskRun(ctx, run); err != nil {
		return TaskRun{}, err
	}
	if err := s.appendMessage(ctx, "assistant", "已取消创建训练计划，没有启动新的 Session。"); err != nil {
		return TaskRun{}, err
	}
	return run, nil
}

func (s *Service) ResetDemo() {
	s.taskMu.Lock()
	defer s.taskMu.Unlock()
	if s.dependencies.Resetter != nil {
		s.dependencies.Resetter.Reset()
	}
	if store, ok := s.dependencies.ConversationStore.(interface{ StartNewConversation() }); ok {
		store.StartNewConversation()
	} else if store, ok := s.dependencies.ConversationStore.(interface{ Reset() }); ok {
		store.Reset()
	}
}

func (s *Service) GetThread(ctx context.Context, query GetThreadQuery) (AssistantThread, error) {
	thread, err := s.dependencies.ConversationStore.GetThread(ctx, query.ThreadID)
	if err != nil {
		return AssistantThread{}, err
	}
	if thread.UserID != query.ActorUserID {
		return AssistantThread{}, ErrForbidden
	}
	return thread, nil
}

func (s *Service) completeRun(ctx context.Context, actorUserID string, run TaskRun, steps []PlanStep) (TaskRun, error) {
	result, err := s.executeSteps(ctx, actorUserID, run, steps)
	if err != nil {
		run.Status = TaskRunStatusFailed
		run.Result = map[string]any{"error": err.Error()}
		run.UpdatedAt = time.Now().UTC()
		_ = s.dependencies.ConversationStore.SaveTaskRun(ctx, run)
		return TaskRun{}, err
	}
	run.Status = TaskRunStatusCompleted
	run.CurrentStep = ""
	run.Result = result
	run.UpdatedAt = time.Now().UTC()
	if err := s.dependencies.ConversationStore.SaveTaskRun(ctx, run); err != nil {
		return TaskRun{}, err
	}
	if err := s.updateThreadSummary(ctx, run); err != nil {
		return TaskRun{}, err
	}
	if report := reportCardFromResult(run.Intent, result); report != nil {
		if err := s.appendReportCard(ctx, *report); err != nil {
			return TaskRun{}, err
		}
	} else if run.Intent != "submit_interview_answer" && run.Intent != "start_mock_interview" {
		if err := s.appendMessage(ctx, "assistant", composeResponse(run.Intent, result)); err != nil {
			return TaskRun{}, err
		}
	}
	s.observeMemory(ctx, actorUserID, run)
	return run, nil
}

func (s *Service) observeMemory(ctx context.Context, actorUserID string, run TaskRun) {
	if s.dependencies.MemoryObserver == nil {
		return
	}
	messages, err := s.dependencies.ConversationStore.ListMessages(ctx, run.ThreadID)
	if err != nil {
		return
	}
	var userMessage, assistantResponse string
	for index := len(messages) - 1; index >= 0; index-- {
		if assistantResponse == "" && messages[index].Role == "assistant" {
			assistantResponse = messages[index].Content
			continue
		}
		if messages[index].Role == "user" {
			userMessage = messages[index].Content
			break
		}
	}
	if strings.TrimSpace(userMessage) == "" {
		return
	}
	source := "run"
	if run.Intent == "submit_interview_answer" {
		source = "practice"
	} else if run.Intent == "review_latest_practice" {
		source = "review"
	}
	_ = s.dependencies.MemoryObserver.Observe(ctx, MemoryObservation{ActorUserID: actorUserID, ThreadID: run.ThreadID, RunID: run.ID, Source: source, UserMessage: userMessage, AssistantResponse: assistantResponse})
}

func (s *Service) executeSteps(ctx context.Context, actorUserID string, run TaskRun, steps []PlanStep) (map[string]any, error) {
	lastResult := map[string]any{}
	for _, step := range steps {
		if run.Intent == "submit_interview_answer" && step.ToolName == "conversation.generate_next_question" && s.dependencies.Runtime != nil {
			if s.dependencies.Runtime.State().LimitReached(time.Now()) {
				step.ToolName = "review.generate_feedback"
				step.Arguments = map[string]any{}
			}
		}
		run.Status = TaskRunStatusRunning
		run.CurrentStep = step.ToolName
		run.UpdatedAt = time.Now().UTC()
		if err := s.dependencies.ConversationStore.SaveTaskRun(ctx, run); err != nil {
			return nil, err
		}
		invocation := ToolInvocation{
			ActorUserID:    actorUserID,
			TaskRunID:      run.ID,
			ToolName:       step.ToolName,
			Arguments:      step.Arguments,
			IdempotencyKey: run.ID + ":" + step.ToolName,
		}
		result, err := s.dependencies.Tools.Execute(ctx, invocation)
		if err != nil {
			return nil, fmt.Errorf("execute %s: %w", step.ToolName, err)
		}
		lastResult = result.Output
		if err := s.dependencies.ConversationStore.SaveToolCall(ctx, ToolCall{
			ID:             nextID("tool-call"),
			TaskRunID:      run.ID,
			ToolName:       step.ToolName,
			Arguments:      step.Arguments,
			Result:         result.Output,
			IdempotencyKey: invocation.IdempotencyKey,
			CreatedAt:      time.Now().UTC(),
		}); err != nil {
			return nil, err
		}
	}
	return lastResult, nil
}

func (s *Service) updateThreadSummary(ctx context.Context, run TaskRun) error {
	thread, err := s.dependencies.ConversationStore.GetThread(ctx, run.ThreadID)
	if err != nil {
		return err
	}
	completed := 0
	maxTurns := DefaultInterviewMaxTurns
	durationMinutes := DefaultInterviewDurationMinutes
	active := false
	if s.dependencies.Runtime != nil {
		state := s.dependencies.Runtime.State()
		completed = state.CompletedQuestionCount
		if state.MaxTurns > 0 {
			maxTurns = state.MaxTurns
		}
		if state.DurationMinutes > 0 {
			durationMinutes = state.DurationMinutes
		}
		active = state.ActiveQuestion != ""
	}
	if run.Intent == "clarify_interview_requirements" {
		thread.ContextSummary = "面试需求收集中；interview_requirement=pending_target_role；session_in_progress=false"
	} else if run.Intent == "free_conversation" {
		thread.ContextSummary = fmt.Sprintf(
			"自由对话中；最近用户消息：%s；最近助手回复：%s；session_in_progress=false",
			compactText(fmt.Sprint(run.Result["user_message"]), 120),
			compactText(fmt.Sprint(run.Result["summary"]), 180),
		)
	} else {
		thread.ContextSummary = fmt.Sprintf("%s 已完成；session_in_progress=%t；有效回答 %d/%d；时长限制 %d 分钟", run.Intent, active, completed, maxTurns, durationMinutes)
	}
	thread.UpdatedAt = time.Now().UTC()
	return s.dependencies.ConversationStore.SaveThread(ctx, thread)
}

func (s *Service) appendMessage(ctx context.Context, role, content string) error {
	_, err := s.appendMessageWithAttachments(ctx, role, content, nil, "", "", "", "")
	return err
}

func (s *Service) appendMessageWithAttachments(
	ctx context.Context,
	role, content string,
	attachments []Attachment,
	clientMessageID, liveSessionID, turnID string,
	mode ConversationMode,
) (AssistantMessage, error) {
	references := make([]AttachmentReference, 0, len(attachments))
	for _, attachment := range attachments {
		references = append(references, attachment.AttachmentReference)
	}
	message := AssistantMessage{
		ID: nextID("message"), Role: role, Content: content,
		ClientMessageID: clientMessageID, LiveSessionID: liveSessionID,
		TurnID: turnID, Mode: mode,
		Attachments: references, CreatedAt: time.Now().UTC(),
	}
	if err := s.dependencies.ConversationStore.AppendMessage(ctx, message); err != nil {
		return AssistantMessage{}, err
	}
	return message, nil
}

func (s *Service) appendReportCard(ctx context.Context, report InterviewReportCard) error {
	return s.dependencies.ConversationStore.AppendMessage(ctx, AssistantMessage{
		ID: nextID("message"), Role: "assistant", Kind: "interview_report",
		Content: "模拟面试已完成", Report: &report, CreatedAt: time.Now().UTC(),
	})
}

func reportCardFromResult(intent string, result map[string]any) *InterviewReportCard {
	if intent != "submit_interview_answer" && intent != "end_interview" {
		return nil
	}
	sessionValue, hasSession := result["practice_session_id"]
	summaryValue, hasSummary := result["summary"]
	if !hasSession || !hasSummary {
		return nil
	}
	sessionID := strings.TrimSpace(fmt.Sprint(sessionValue))
	summary := strings.TrimSpace(fmt.Sprint(summaryValue))
	if sessionID == "" || summary == "" {
		return nil
	}
	return &InterviewReportCard{
		SessionID: sessionID, TargetRole: strings.TrimSpace(fmt.Sprint(result["target_role"])),
		CompletedTurns: boundedIntArgument(result["completed_turns"], 0, 0, 100),
		MaxTurns:       boundedIntArgument(result["max_turns"], DefaultInterviewMaxTurns, 1, 100),
		Summary:        compactReportSummary(summary),
	}
}

func compactReportSummary(summary string) string {
	summary = strings.NewReplacer("**", "", "__", "", "#", "").Replace(summary)
	summary = strings.Join(strings.Fields(summary), " ")
	return compactText(summary, 120)
}

func (s *Service) contextMessages(ctx context.Context, threadID string) ([]ContextMessage, error) {
	messages, err := s.dependencies.ConversationStore.ListMessages(ctx, threadID)
	if err != nil {
		return nil, err
	}
	if len(messages) == 0 {
		return nil, errors.New("assistant: thread has no committed messages")
	}
	contextMessages := make([]ContextMessage, 0, len(messages))
	for _, message := range messages {
		if strings.TrimSpace(message.Role) == "" || strings.TrimSpace(message.Content) == "" {
			return nil, errors.New("assistant: thread contains an invalid message")
		}
		content := message.Content
		if len(message.Attachments) > 0 {
			attachments, resolveErr := s.resolveAttachments(referenceIDs(message.Attachments))
			if resolveErr != nil {
				return nil, resolveErr
			}
			content = attachmentContext(content, attachments)
		}
		contextMessages = append(contextMessages, ContextMessage{
			Role:    message.Role,
			Content: content,
		})
	}
	return contextMessages, nil
}

func (s *Service) resolveAttachments(ids []string) ([]Attachment, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	if s.dependencies.Attachments == nil {
		return nil, errors.New("assistant: attachment store is not configured")
	}
	return s.dependencies.Attachments.Attachments(ids)
}

func referenceIDs(references []AttachmentReference) []string {
	ids := make([]string, 0, len(references))
	for _, reference := range references {
		ids = append(ids, reference.ID)
	}
	return ids
}

func attachmentContext(message string, attachments []Attachment) string {
	if len(attachments) == 0 {
		return message
	}
	var details strings.Builder
	details.WriteString(message)
	details.WriteString("\n\n[用户本轮上传的附件；以下内容由真实多模态/文档模型解析，属于权威附件上下文]\n")
	for _, attachment := range attachments {
		fmt.Fprintf(&details, "- 文件：%s；类型：%s；是否简历：%t；理解摘要：%s", attachment.Name, attachment.Kind, attachment.IsResume, attachment.Summary)
		if text := compactText(attachment.ExtractedText, 12000); text != "" {
			details.WriteString("；提取内容：")
			details.WriteString(text)
		}
		details.WriteString("\n")
	}
	return strings.TrimSpace(details.String())
}

func composeResponse(intent string, result map[string]any) string {
	switch intent {
	case "free_conversation", "clarify_interview_requirements":
		return fmt.Sprint(result["summary"])
	case "start_mock_interview":
		return fmt.Sprintf("面试开始。%v", result["content"])
	case "submit_interview_answer":
		if content, ok := result["content"].(string); ok {
			return content
		}
		return fmt.Sprintf("面试完成。%v", result["summary"])
	case "end_interview":
		return fmt.Sprintf("面试结束。%v", result["summary"])
	case "view_practice_history":
		items, _ := result["items"].([]map[string]any)
		if len(items) == 0 {
			return "还没有已完成的模拟面试记录。"
		}
		lines := make([]string, 0, min(len(items), 5))
		for index, item := range items {
			if index >= 5 {
				break
			}
			lines = append(lines, fmt.Sprintf(
				"%d. %s（%v 个有效回答）",
				index+1,
				strings.TrimSpace(fmt.Sprint(item["scenario"])),
				item["completed_turns"],
			))
		}
		return "最近的模拟面试：\n" + strings.Join(lines, "\n")
	default:
		return fmt.Sprint(result["summary"])
	}
}

func targetRoleFromPlan(plan Plan) string {
	for _, step := range plan.Steps {
		if step.ToolName != "practice.create_plan" {
			continue
		}
		role := strings.TrimSpace(fmt.Sprint(step.Arguments["role"]))
		if role != "" {
			return role
		}
	}
	return "目标岗位"
}

func normalizeInterviewPlan(plan *Plan) {
	for index := range plan.Steps {
		if plan.Steps[index].ToolName != "practice.create_plan" {
			continue
		}
		if plan.Steps[index].Arguments == nil {
			plan.Steps[index].Arguments = map[string]any{}
		}
		maxTurns := boundedIntArgument(plan.Steps[index].Arguments["max_turns"], DefaultInterviewMaxTurns, 3, 20)
		durationMinutes := boundedIntArgument(plan.Steps[index].Arguments["duration_minutes"], DefaultInterviewDurationMinutes, 5, 60)
		plan.Steps[index].Arguments["max_turns"] = maxTurns
		plan.Steps[index].Arguments["duration_minutes"] = durationMinutes
		return
	}
}

func interviewLimitsFromPlan(plan Plan) (int, int) {
	for _, step := range plan.Steps {
		if step.ToolName == "practice.create_plan" {
			return boundedIntArgument(step.Arguments["max_turns"], DefaultInterviewMaxTurns, 3, 20),
				boundedIntArgument(step.Arguments["duration_minutes"], DefaultInterviewDurationMinutes, 5, 60)
		}
	}
	return DefaultInterviewMaxTurns, DefaultInterviewDurationMinutes
}

func replaceFinalInterviewStep(plan *Plan, toolName string) {
	for index := len(plan.Steps) - 1; index >= 0; index-- {
		if plan.Steps[index].ToolName == "conversation.generate_next_question" ||
			plan.Steps[index].ToolName == "review.generate_feedback" {
			plan.Steps[index] = PlanStep{ToolName: toolName, Arguments: map[string]any{}}
			return
		}
	}
}

func compactText(value string, limit int) string {
	value = strings.Join(strings.Fields(value), " ")
	if len([]rune(value)) <= limit {
		return value
	}
	return string([]rune(value)[:limit]) + "…"
}

func firstToolName(steps []PlanStep) string {
	if len(steps) == 0 {
		return ""
	}
	return steps[0].ToolName
}

var idSequence atomic.Uint64

func nextID(prefix string) string {
	return fmt.Sprintf("%s-%d-%d", prefix, time.Now().UTC().UnixMilli(), idSequence.Add(1))
}
