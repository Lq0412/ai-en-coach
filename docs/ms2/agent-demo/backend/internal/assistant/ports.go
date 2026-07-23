package assistant

import (
	"context"
	"io"
)

type Planner interface {
	Plan(context.Context, PlanRequest) (Plan, error)
}

type ContextBuildRequest struct {
	ActorUserID   string
	ThreadID      string
	RunID         string
	Query         string
	ThreadSummary string
	Messages      []ContextMessage
}

type ContextBuildResult struct {
	Messages   []ContextMessage
	Summary    string
	TokenCount int
	Compressed bool
}

type ContextBuilder interface {
	Build(context.Context, ContextBuildRequest) (ContextBuildResult, error)
}

type MemoryObservation struct {
	ActorUserID       string
	ThreadID          string
	RunID             string
	Source            string
	UserMessage       string
	AssistantResponse string
}

type MemoryObserver interface {
	Observe(context.Context, MemoryObservation) error
}

type PlanRequest struct {
	ThreadID        string
	UserMessage     string
	ContextSummary  string
	Messages        []ContextMessage
	InteractionMode string
}

type ToolRegistry interface {
	Execute(context.Context, ToolInvocation) (ToolResult, error)
}

// InterviewRuntime is the narrow read model the Assistant needs to choose
// orchestration steps. It is not a module repository.
type InterviewRuntime interface {
	State() RuntimeSnapshot
}

type DemoResetter interface {
	Reset()
}

type AttachmentResolver interface {
	Attachments([]string) ([]Attachment, error)
}

// DemoReadAPI is used by the Demo HTTP surface. It is deliberately separate
// from ToolRegistry so the Assistant orchestration path has no concrete module
// dependency and no management operations.
type DemoReadAPI interface {
	InterviewRuntime
	DemoResetter
	AttachmentResolver
	ListInterviewSessions() []InterviewSessionSummary
	GetInterviewSession(string) (InterviewSession, error)
	DeleteInterviewSession(string) error
}

type CandidatePreparationAPI interface {
	UpdateCandidateProfile(context.Context, CandidateProfileInput) (CandidateProfile, error)
	AddAttachment(context.Context, AttachmentInput) (Attachment, error)
	AttachmentContent(string) ([]byte, string, string, error)
	DeleteAttachment(string) error
	ListResumes() []ResumeDocumentView
	GetResume(string) (ResumeDocumentView, error)
	ResumeFile(string) ([]byte, string, error)
	RenameResume(string, string) (ResumeDocumentView, error)
	UpdateResumeProfile(string, ResumeProfileUpdate) (ResumeDocumentView, error)
	ActivateResume(string) (ResumeDocumentView, error)
	DeleteResume(string) error
}

type InterviewContentGenerator interface {
	GenerateQuestion(context.Context, InterviewGenerationInput) (string, error)
	GenerateFeedback(context.Context, InterviewFeedbackInput) (string, error)
}

type ConversationResponder interface {
	GenerateConversationReply(context.Context, ConversationReplyInput) (string, error)
}

type LanguageAssistanceGenerator interface {
	GenerateLanguageAssistance(context.Context, LanguageAssistanceInput) (LanguageAssistanceResult, error)
}

type LanguageAssistanceInput struct {
	Operation      string `json:"operation"`
	Text           string `json:"text"`
	TargetLanguage string `json:"target_language,omitempty"`
}

type LanguageAssistanceResult struct {
	Operation      string              `json:"operation"`
	TargetLanguage string              `json:"target_language,omitempty"`
	Translation    string              `json:"translation,omitempty"`
	Correction     *LanguageCorrection `json:"correction,omitempty"`
}

type LanguageCorrection struct {
	HasIssues      bool                     `json:"has_issues"`
	CorrectedText  string                   `json:"corrected_text"`
	Brief          string                   `json:"brief"`
	Items          []LanguageCorrectionItem `json:"items"`
	NaturalVersion string                   `json:"natural_version,omitempty"`
}

type LanguageCorrectionItem struct {
	Type        string `json:"type"`
	Original    string `json:"original"`
	Corrected   string `json:"corrected"`
	Explanation string `json:"explanation"`
}

// AnswerCoachGenerator produces a complete example answer for the active
// interview question. It remains separate from AgentContentGenerator so the
// Assistant's existing generator contract does not grow with Demo UI needs.
type AnswerCoachGenerator interface {
	GenerateAnswerCoach(context.Context, AnswerCoachInput) (string, error)
}

// AnswerCoachService is the Assistant-facing Port implemented by the Demo
// module registry. The HTTP layer does not reach into Conversation directly.
type AnswerCoachService interface {
	GenerateAnswerCoach(context.Context) (AnswerCoach, error)
}

type AnswerCoachInput struct {
	Question         string
	TargetRole       string
	CandidateProfile CandidateProfile
	PreviousAnswers  []string
}

type AnswerCoach struct {
	Question string `json:"question"`
	Answer   string `json:"answer"`
}

type AgentContentGenerator interface {
	InterviewContentGenerator
	ConversationResponder
}

type CandidateProfileAnalyzer interface {
	AnalyzeCandidateProfile(context.Context, CandidateProfileInput) (CandidateProfile, error)
}

type AttachmentAnalyzer interface {
	AnalyzeAttachment(context.Context, AttachmentInput) (AttachmentAnalysis, error)
}

type AttachmentInput struct {
	Filename      string
	MediaType     string
	Data          []byte
	RequireResume bool
}

type AttachmentAnalysis struct {
	Kind          string `json:"kind"`
	IsResume      bool   `json:"isResume"`
	Summary       string `json:"summary"`
	ExtractedText string `json:"extractedText"`
}

type CandidateProfileInput struct {
	ResumeName     string
	ResumeText     string
	JobTitle       string
	JobDescription string
}

type ConversationReplyInput struct {
	UserMessage      string
	ContextSummary   string
	Messages         []ContextMessage
	CandidateProfile CandidateProfile
}

type ContextMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type InterviewGenerationInput struct {
	CompletedQuestionCount int
	PreviousQuestion       string
	TargetRole             string
	Answers                []string
	PreviousQuestions      []string
	MaxTurns               int
	DurationMinutes        int
	CandidateProfile       CandidateProfile
}

type InterviewFeedbackInput struct {
	CompletedQuestionCount int
	Answers                []string
	TargetRole             string
	MaxTurns               int
	DurationMinutes        int
	CandidateProfile       CandidateProfile
}

type Transcriber interface {
	Transcribe(context.Context, io.Reader, string) (TranscriptSnapshot, error)
}

type RealtimeTranscriber interface {
	StreamTranscribePCM(context.Context, io.Reader, func(TranscriptUpdate) error) (TranscriptSnapshot, error)
}

type TranscriptUpdate struct {
	Text      string `json:"text"`
	Completed bool   `json:"completed"`
}

type SpeechSynthesizer interface {
	Synthesize(context.Context, string, *string) (GeneratedAudio, error)
}

type StreamingSpeechSynthesizer interface {
	StreamSynthesize(context.Context, string, *string, func([]byte) error) error
}

type SpeechSynthesisOptions struct {
	Format     string
	SampleRate int
}

type ConfigurableStreamingSpeechSynthesizer interface {
	StreamSynthesizeWithOptions(
		context.Context,
		string,
		*string,
		SpeechSynthesisOptions,
		func([]byte) error,
	) error
}

type TranscriptSnapshot struct {
	Text string
}

type GeneratedAudio struct {
	Content     io.ReadCloser
	ContentType string
	DurationMS  int64
}

// LiveEventPublisher is the transport-neutral boundary shared by Go, the
// LiveKit Worker, and the browser. Ephemeral events are published for UI only;
// canonical events carry the Go-owned AssistantMessage.
type LiveEventPublisher interface {
	PublishLiveEvent(context.Context, LiveEvent) error
}

// LiveLatencyRecorder persists structured time points without coupling the
// assistant domain to a metrics or tracing vendor.
type LiveLatencyRecorder interface {
	RecordLiveLatency(context.Context, LiveLatencyPoint) error
}

// LiveTurnStore defines the idempotent lookup boundary used by later live turn
// persistence work. client_message_id, scoped by thread, is the stable key.
type LiveTurnStore interface {
	GetLiveTurnByClientMessageID(context.Context, string, string) (LiveTurn, error)
	SaveLiveTurn(context.Context, LiveTurn) error
}

type ToolInvocation struct {
	ActorUserID    string
	TaskRunID      string
	ToolName       string
	Arguments      map[string]any
	IdempotencyKey string
}

type textDeltaWriterKey struct{}
type canonicalUserMessageWriterKey struct{}

func WithTextDeltaWriter(ctx context.Context, writer func(string) error) context.Context {
	return context.WithValue(ctx, textDeltaWriterKey{}, writer)
}

func textDeltaWriterFromContext(ctx context.Context) func(string) error {
	writer, _ := ctx.Value(textDeltaWriterKey{}).(func(string) error)
	return writer
}

func WithCanonicalUserMessageWriter(ctx context.Context, writer func(AssistantMessage) error) context.Context {
	return context.WithValue(ctx, canonicalUserMessageWriterKey{}, writer)
}

func canonicalUserMessageWriterFromContext(ctx context.Context) func(AssistantMessage) error {
	writer, _ := ctx.Value(canonicalUserMessageWriterKey{}).(func(AssistantMessage) error)
	return writer
}

// ConversationStore 保留仓库中的接口名，并补充 Demo 恢复 TaskRun/Plan
// 与记录文字消息所需的最小方法。
type ConversationStore interface {
	GetThread(context.Context, string) (AssistantThread, error)
	SaveThread(context.Context, AssistantThread) error
	SaveTaskRun(context.Context, TaskRun) error
	GetTaskRun(context.Context, string) (TaskRun, error)
	GetTaskRunByIdempotency(context.Context, string, string) (TaskRun, error)
	SaveTaskIdempotency(context.Context, string, string, string) error
	SavePlan(context.Context, string, Plan) error
	GetPlan(context.Context, string) (Plan, error)
	SaveToolCall(context.Context, ToolCall) error
	GetPendingConfirmationRequest(context.Context, string) (ConfirmationRequest, error)
	SaveConfirmationRequest(context.Context, ConfirmationRequest) error
	AppendMessage(context.Context, AssistantMessage) error
	GetMessageByClientMessageID(context.Context, string, string) (AssistantMessage, error)
	LinkMessageAttachment(context.Context, string, AttachmentReference) (AssistantMessage, error)
	ListMessages(context.Context, string) ([]AssistantMessage, error)
}
