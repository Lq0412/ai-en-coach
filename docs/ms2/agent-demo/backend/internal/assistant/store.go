package assistant

import (
	"context"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	DemoThreadID = "thread-demo-001"
	DemoUserID   = "demo-user"
)

type MemoryConversationStore struct {
	mu            sync.RWMutex
	persistPath   string
	thread        AssistantThread
	taskRuns      map[string]TaskRun
	idempotency   map[string]string
	plans         map[string]Plan
	toolCalls     []ToolCall
	confirmations map[string]ConfirmationRequest
	messages      []AssistantMessage
	archives      []ConversationArchive
}

func NewMemoryConversationStore() *MemoryConversationStore {
	store := &MemoryConversationStore{}
	store.Reset()
	return store
}

func (s *MemoryConversationStore) Reset() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.resetLocked()
	_ = s.persistLocked()
}

func (s *MemoryConversationStore) resetLocked() {
	createdAt := time.Now().UTC()
	s.thread = AssistantThread{
		ID:             DemoThreadID,
		UserID:         DemoUserID,
		Status:         ThreadStatusActive,
		ContextSummary: "自由对话中；session_in_progress=false",
		CreatedAt:      createdAt,
		UpdatedAt:      createdAt,
	}
	s.taskRuns = map[string]TaskRun{}
	s.idempotency = map[string]string{}
	s.plans = map[string]Plan{}
	s.toolCalls = nil
	s.confirmations = map[string]ConfirmationRequest{}
	s.messages = []AssistantMessage{{
		ID:        nextID("message"),
		Role:      "assistant",
		Content:   "你好，我是 SpeakUp。我们可以先自由聊天、练习英语或讨论技术；当你想开始时，直接告诉我进入面试场景。",
		CreatedAt: createdAt,
	}}
}

func (s *MemoryConversationStore) StartNewConversation() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.archiveCurrentLocked()
	s.resetLocked()
	_ = s.persistLocked()
}

func (s *MemoryConversationStore) archiveCurrentLocked() {
	firstUserMessage := ""
	for _, message := range s.messages {
		if message.Role == "user" && strings.TrimSpace(message.Content) != "" {
			firstUserMessage = strings.TrimSpace(message.Content)
			break
		}
	}
	if firstUserMessage == "" {
		return
	}
	title := []rune(strings.Join(strings.Fields(firstUserMessage), " "))
	if len(title) > 36 {
		title = append(title[:36], '…')
	}
	messages := cloneAssistantMessages(s.messages)
	createdAt := s.thread.CreatedAt
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
	}
	s.archives = append([]ConversationArchive{{
		ID:        nextID("conversation"),
		Title:     string(title),
		Messages:  messages,
		CreatedAt: createdAt,
		UpdatedAt: time.Now().UTC(),
	}}, s.archives...)
}

func (s *MemoryConversationStore) ListConversationArchives() []ConversationArchiveSummary {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]ConversationArchiveSummary, len(s.archives))
	for index, archive := range s.archives {
		items[index] = ConversationArchiveSummary{
			ID: archive.ID, Title: archive.Title, MessageCount: len(archive.Messages),
			CreatedAt: archive.CreatedAt, UpdatedAt: archive.UpdatedAt,
		}
	}
	return items
}

func (s *MemoryConversationStore) GetConversationArchive(id string) (ConversationArchive, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, archive := range s.archives {
		if archive.ID == id {
			archive.Messages = cloneAssistantMessages(archive.Messages)
			return archive, nil
		}
	}
	return ConversationArchive{}, ErrNotFound
}

func (s *MemoryConversationStore) DeleteConversationArchive(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for index, archive := range s.archives {
		if archive.ID != id {
			continue
		}
		s.archives = append(s.archives[:index], s.archives[index+1:]...)
		return s.persistLocked()
	}
	return ErrNotFound
}

func (s *MemoryConversationStore) GetThread(_ context.Context, id string) (AssistantThread, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if id != s.thread.ID {
		return AssistantThread{}, ErrNotFound
	}
	return s.thread, nil
}

func (s *MemoryConversationStore) SaveThread(_ context.Context, thread AssistantThread) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.thread = thread
	return s.persistLocked()
}

func (s *MemoryConversationStore) SaveTaskRun(_ context.Context, run TaskRun) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.taskRuns[run.ID] = run
	return s.persistLocked()
}

func (s *MemoryConversationStore) GetTaskRun(_ context.Context, id string) (TaskRun, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	run, ok := s.taskRuns[id]
	if !ok {
		return TaskRun{}, ErrNotFound
	}
	return run, nil
}

func (s *MemoryConversationStore) GetTaskRunByIdempotency(_ context.Context, actorUserID, key string) (TaskRun, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	runID, ok := s.idempotency[actorUserID+":"+key]
	if !ok {
		return TaskRun{}, ErrNotFound
	}
	run, ok := s.taskRuns[runID]
	if !ok {
		return TaskRun{}, ErrNotFound
	}
	return run, nil
}

func (s *MemoryConversationStore) SaveTaskIdempotency(_ context.Context, actorUserID, key, taskRunID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.idempotency[actorUserID+":"+key] = taskRunID
	return s.persistLocked()
}

func (s *MemoryConversationStore) SavePlan(_ context.Context, taskRunID string, plan Plan) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.plans[taskRunID] = plan
	return s.persistLocked()
}

func (s *MemoryConversationStore) GetPlan(_ context.Context, taskRunID string) (Plan, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	plan, ok := s.plans[taskRunID]
	if !ok {
		return Plan{}, ErrNotFound
	}
	return plan, nil
}

func (s *MemoryConversationStore) SaveToolCall(_ context.Context, call ToolCall) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.toolCalls = append([]ToolCall{call}, s.toolCalls...)
	return s.persistLocked()
}

func (s *MemoryConversationStore) GetPendingConfirmationRequest(_ context.Context, taskRunID string) (ConfirmationRequest, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, confirmation := range s.confirmations {
		if confirmation.TaskRunID == taskRunID && confirmation.Status == ConfirmationStatusPending {
			return confirmation, nil
		}
	}
	return ConfirmationRequest{}, ErrNoPendingConfirm
}

func (s *MemoryConversationStore) SaveConfirmationRequest(_ context.Context, request ConfirmationRequest) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.confirmations[request.ID] = request
	return s.persistLocked()
}

func (s *MemoryConversationStore) AppendMessage(_ context.Context, message AssistantMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.messages = append(s.messages, message)
	return s.persistLocked()
}

func (s *MemoryConversationStore) GetMessageByClientMessageID(_ context.Context, threadID, clientMessageID string) (AssistantMessage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if threadID != s.thread.ID {
		return AssistantMessage{}, ErrNotFound
	}
	for _, message := range s.messages {
		if message.ClientMessageID == clientMessageID {
			return message, nil
		}
	}
	return AssistantMessage{}, ErrNotFound
}

func (s *MemoryConversationStore) LinkMessageAttachment(_ context.Context, messageID string, attachment AttachmentReference) (AssistantMessage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for index := range s.messages {
		if s.messages[index].ID != messageID {
			continue
		}
		for _, existing := range s.messages[index].Attachments {
			if existing.ID == attachment.ID {
				return s.messages[index], nil
			}
		}
		s.messages[index].Attachments = append(s.messages[index].Attachments, attachment)
		if err := s.persistLocked(); err != nil {
			return AssistantMessage{}, err
		}
		return s.messages[index], nil
	}
	return AssistantMessage{}, ErrNotFound
}

func (s *MemoryConversationStore) UpdateMessageAssessment(_ context.Context, messageID string, assessment LearningAssessment) (AssistantMessage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for index := range s.messages {
		if s.messages[index].ID != messageID {
			continue
		}
		s.messages[index].LearningAssessment = &assessment
		if err := s.persistLocked(); err != nil {
			return AssistantMessage{}, err
		}
		return s.messages[index], nil
	}
	return AssistantMessage{}, ErrNotFound
}

func (s *MemoryConversationStore) ListMessages(_ context.Context, threadID string) ([]AssistantMessage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if threadID != s.thread.ID {
		return nil, ErrNotFound
	}
	return append([]AssistantMessage(nil), s.messages...), nil
}

func (s *MemoryConversationStore) Snapshot(state MockDomainState) DemoSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()

	runs := make([]TaskRun, 0, len(s.taskRuns))
	for _, run := range s.taskRuns {
		runs = append(runs, run)
	}
	sort.Slice(runs, func(i, j int) bool {
		return runs[i].CreatedAt.After(runs[j].CreatedAt)
	})
	confirmations := make([]ConfirmationRequest, 0, len(s.confirmations))
	for _, confirmation := range s.confirmations {
		confirmations = append(confirmations, confirmation)
	}
	sort.Slice(confirmations, func(i, j int) bool {
		return confirmations[i].ExpiresAt.After(confirmations[j].ExpiresAt)
	})
	plans := make(map[string]Plan, len(s.plans))
	for id, plan := range s.plans {
		plans[id] = plan
	}
	messages := make([]AssistantMessage, len(s.messages))
	for index, message := range s.messages {
		messages[index] = message
		messages[index].Attachments = append([]AttachmentReference(nil), message.Attachments...)
	}
	calls := append([]ToolCall{}, s.toolCalls...)
	var activeQuestion *string
	if state.ActiveQuestion != "" {
		question := state.ActiveQuestion
		activeQuestion = &question
	}
	var interviewStartedAt *time.Time
	if !state.StartedAt.IsZero() {
		startedAt := state.StartedAt
		interviewStartedAt = &startedAt
	}
	var interviewDeadline *time.Time
	if !state.Deadline.IsZero() {
		deadline := state.Deadline
		interviewDeadline = &deadline
	}
	contextMessages := make([]ContextMessage, 0, len(messages))
	attachmentByID := make(map[string]Attachment, len(state.Attachments))
	attachmentReferences := make([]AttachmentReference, 0, len(state.Attachments))
	for _, attachment := range state.Attachments {
		attachmentByID[attachment.ID] = attachment
		attachmentReferences = append(attachmentReferences, attachment.AttachmentReference)
	}
	for messageIndex := range messages {
		for attachmentIndex, reference := range messages[messageIndex].Attachments {
			if attachment, ok := attachmentByID[reference.ID]; ok {
				messages[messageIndex].Attachments[attachmentIndex] = attachment.AttachmentReference
			}
		}
	}
	for _, message := range messages {
		content := message.Content
		if len(message.Attachments) > 0 {
			resolved := make([]Attachment, 0, len(message.Attachments))
			for _, reference := range message.Attachments {
				if attachment, ok := attachmentByID[reference.ID]; ok {
					resolved = append(resolved, attachment)
				}
			}
			content = attachmentContext(content, resolved)
		}
		contextMessages = append(contextMessages, ContextMessage{
			Role:    message.Role,
			Content: content,
		})
	}
	contextTokenCount := EstimateContextTokens(contextMessages)
	return DemoSnapshot{
		Thread:                 s.thread,
		TaskRuns:               runs,
		Plans:                  plans,
		ToolCalls:              calls,
		Confirmations:          confirmations,
		Messages:               messages,
		ActiveQuestion:         activeQuestion,
		CompletedQuestionCount: state.CompletedQuestionCount,
		TargetRole:             state.TargetRole,
		Interviewer:            state.Interviewer,
		MaxInterviewTurns:      state.MaxTurns,
		InterviewDurationMin:   state.DurationMinutes,
		InterviewStartedAt:     interviewStartedAt,
		InterviewDeadline:      interviewDeadline,
		InterviewSessions:      cloneInterviewSessions(state.Sessions),
		SavedMistakes:          cloneSavedMistakes(state.SavedMistakes),
		RepracticeResults:      cloneMistakeRepracticeResults(state.RepracticeResults),
		CandidateProfile:       candidateProfileView(state.CandidateProfile),
		Attachments:            attachmentReferences,
		Resumes:                resumeViews(state.Resumes, state.ActiveResumeID),
		ActiveResumeID:         state.ActiveResumeID,
		ContextTokenCount:      contextTokenCount,
		ContextTokenLimit:      ContextTokenLimit,
		RequiresNewThread:      false,
	}
}

func cloneAssistantMessages(messages []AssistantMessage) []AssistantMessage {
	result := make([]AssistantMessage, len(messages))
	for index, message := range messages {
		result[index] = message
		if message.Report != nil {
			report := *message.Report
			result[index].Report = &report
		}
		if message.History != nil {
			history := *message.History
			history.Items = append([]InterviewHistoryCard(nil), message.History.Items...)
			result[index].History = &history
		}
		if message.Mistakes != nil {
			mistakes := *message.Mistakes
			mistakes.Items = append([]MistakeCard(nil), message.Mistakes.Items...)
			result[index].Mistakes = &mistakes
		}
		if message.LearningAssessment != nil {
			assessment := *message.LearningAssessment
			assessment.Explanations = append([]string(nil), message.LearningAssessment.Explanations...)
			assessment.Words = append([]PronunciationWord(nil), message.LearningAssessment.Words...)
			for wordIndex := range assessment.Words {
				assessment.Words[wordIndex].Phonemes = append(
					[]PronunciationPhoneme(nil),
					assessment.Words[wordIndex].Phonemes...,
				)
			}
			result[index].LearningAssessment = &assessment
		}
		result[index].Attachments = append([]AttachmentReference(nil), message.Attachments...)
	}
	return result
}
