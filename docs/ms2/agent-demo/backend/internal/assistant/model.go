package assistant

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

type ThreadStatus string

const (
	ThreadStatusActive ThreadStatus = "active"
	ThreadStatusClosed ThreadStatus = "closed"
)

type TaskRunStatus string

const (
	TaskRunStatusPending         TaskRunStatus = "pending"
	TaskRunStatusRunning         TaskRunStatus = "running"
	TaskRunStatusAwaitingConfirm TaskRunStatus = "awaiting_confirmation"
	TaskRunStatusCompleted       TaskRunStatus = "completed"
	TaskRunStatusFailed          TaskRunStatus = "failed"
)

type ConfirmationStatus string

const (
	ConfirmationStatusPending  ConfirmationStatus = "pending"
	ConfirmationStatusApproved ConfirmationStatus = "approved"
	ConfirmationStatusRejected ConfirmationStatus = "rejected"
	ConfirmationStatusExpired  ConfirmationStatus = "expired"
)

// ConversationMode distinguishes the existing request/response path from a
// continuous realtime call. It is independent from the existing
// conversation/interview interaction_mode used to select orchestration.
type ConversationMode string

const (
	ConversationModeNormal ConversationMode = "normal"
	ConversationModeLive   ConversationMode = "live"
)

func (mode ConversationMode) Valid() bool {
	return mode == ConversationModeNormal || mode == ConversationModeLive
}

type LiveSessionStatus string

const (
	LiveSessionStatusConnecting   LiveSessionStatus = "connecting"
	LiveSessionStatusListening    LiveSessionStatus = "listening"
	LiveSessionStatusThinking     LiveSessionStatus = "thinking"
	LiveSessionStatusSpeaking     LiveSessionStatus = "speaking"
	LiveSessionStatusReconnecting LiveSessionStatus = "reconnecting"
	LiveSessionStatusFailed       LiveSessionStatus = "failed"
	LiveSessionStatusEnded        LiveSessionStatus = "ended"
)

type LiveSession struct {
	ID                  string            `json:"live_session_id"`
	ThreadID            string            `json:"thread_id"`
	RoomName            string            `json:"room_name"`
	ParticipantIdentity string            `json:"participant_identity"`
	Mode                ConversationMode  `json:"mode"`
	Status              LiveSessionStatus `json:"status"`
	PartialTurnID       string            `json:"partial_turn_id,omitempty"`
	CommittedTurnIDs    []string          `json:"committed_turn_ids,omitempty"`
	CreatedAt           time.Time         `json:"created_at"`
	UpdatedAt           time.Time         `json:"updated_at"`
}

// LiveClientMessage is allocated by the browser before network submission.
// Its ID remains stable across retries and is the reconciliation key for the
// authoritative AssistantMessage returned by Go.
type LiveClientMessage struct {
	ID            string           `json:"client_message_id"`
	ThreadID      string           `json:"thread_id"`
	LiveSessionID string           `json:"live_session_id"`
	TurnID        string           `json:"turn_id"`
	Mode          ConversationMode `json:"mode"`
	CreatedAt     time.Time        `json:"created_at"`
}

type LiveTurn struct {
	ThreadID           string           `json:"thread_id"`
	LiveSessionID      string           `json:"live_session_id"`
	TurnID             string           `json:"turn_id"`
	ClientMessageID    string           `json:"client_message_id"`
	Mode               ConversationMode `json:"mode"`
	UserMessageID      string           `json:"user_message_id,omitempty"`
	AssistantMessageID string           `json:"assistant_message_id,omitempty"`
}

func (turn LiveTurn) Validate() error {
	for field, value := range map[string]string{
		"thread_id":         turn.ThreadID,
		"live_session_id":   turn.LiveSessionID,
		"turn_id":           turn.TurnID,
		"client_message_id": turn.ClientMessageID,
	} {
		if strings.TrimSpace(value) == "" {
			return fmt.Errorf("assistant: live turn %s is required", field)
		}
	}
	if !turn.Mode.Valid() {
		return errors.New("assistant: live turn mode must be normal or live")
	}
	return nil
}

// IdempotencyKey deliberately excludes live_session_id and turn_id: both may
// be regenerated during reconnect, while the browser's client_message_id is
// stable for the user's submission.
func (turn LiveTurn) IdempotencyKey() string {
	return strings.TrimSpace(turn.ThreadID) + ":" + strings.TrimSpace(turn.ClientMessageID)
}

// ReconcileCanonicalTurn captures the KTD2 ownership rule without performing
// persistence. Callers load by IdempotencyKey, then keep the existing Go-owned
// turn when a browser or Worker retry presents the same client message.
func ReconcileCanonicalTurn(existing *LiveTurn, incoming LiveTurn) (LiveTurn, bool, error) {
	if err := incoming.Validate(); err != nil {
		return LiveTurn{}, false, err
	}
	if existing == nil {
		return incoming, true, nil
	}
	if err := existing.Validate(); err != nil {
		return LiveTurn{}, false, err
	}
	if existing.IdempotencyKey() != incoming.IdempotencyKey() {
		return LiveTurn{}, false, errors.New("assistant: canonical turn reconciliation key mismatch")
	}
	return *existing, false, nil
}

type LiveEventType string

const (
	LiveEventTranscriptPartial      LiveEventType = "transcript.partial"
	LiveEventTurnUserCommitted      LiveEventType = "turn.user_committed"
	LiveEventTurnAssistantCommitted LiveEventType = "turn.assistant_committed"
	LiveEventAttachmentLinked       LiveEventType = "attachment.linked"
	LiveEventLatencyPoint           LiveEventType = "latency.point"
)

func (eventType LiveEventType) valid() bool {
	switch eventType {
	case LiveEventTranscriptPartial,
		LiveEventTurnUserCommitted,
		LiveEventTurnAssistantCommitted,
		LiveEventAttachmentLinked,
		LiveEventLatencyPoint:
		return true
	default:
		return false
	}
}

func (eventType LiveEventType) canonical() bool {
	switch eventType {
	case LiveEventTurnUserCommitted, LiveEventTurnAssistantCommitted, LiveEventAttachmentLinked:
		return true
	default:
		return false
	}
}

type LiveEvent struct {
	Type            LiveEventType     `json:"type"`
	ThreadID        string            `json:"thread_id"`
	LiveSessionID   string            `json:"live_session_id"`
	TurnID          string            `json:"turn_id"`
	ClientMessageID string            `json:"client_message_id"`
	Mode            ConversationMode  `json:"mode"`
	OccurredAt      time.Time         `json:"occurred_at"`
	Sequence        uint64            `json:"sequence"`
	Transcript      string            `json:"transcript,omitempty"`
	Message         *AssistantMessage `json:"message,omitempty"`
	Latency         *LiveLatencyPoint `json:"latency,omitempty"`
}

func (event LiveEvent) Canonical() bool {
	return event.Type.canonical()
}

func (event LiveEvent) Validate() error {
	if !event.Type.valid() {
		return errors.New("assistant: live event type is invalid")
	}
	for field, value := range map[string]string{
		"thread_id":         event.ThreadID,
		"live_session_id":   event.LiveSessionID,
		"turn_id":           event.TurnID,
		"client_message_id": event.ClientMessageID,
	} {
		if strings.TrimSpace(value) == "" {
			return fmt.Errorf("assistant: live event %s is required", field)
		}
	}
	if !event.Mode.Valid() {
		return errors.New("assistant: live event mode must be normal or live")
	}
	if event.OccurredAt.IsZero() {
		return errors.New("assistant: live event occurred_at is required")
	}
	if event.Sequence == 0 {
		return errors.New("assistant: live event sequence must be positive")
	}
	if event.Canonical() {
		if event.Message == nil || strings.TrimSpace(event.Message.ID) == "" {
			return errors.New("assistant: canonical live event message is required")
		}
		if event.Message.ClientMessageID != event.ClientMessageID {
			return errors.New("assistant: canonical message client_message_id must match event")
		}
	} else if event.Message != nil {
		return errors.New("assistant: ephemeral live event cannot contain canonical message")
	}
	if event.Type == LiveEventLatencyPoint && event.Latency == nil {
		return errors.New("assistant: latency.point event latency is required")
	}
	return nil
}

type LiveLatencyStage string

const (
	LiveLatencyCaptureStarted        LiveLatencyStage = "capture.started"
	LiveLatencyCaptureEnded          LiveLatencyStage = "capture.ended"
	LiveLatencyTurnSubmitted         LiveLatencyStage = "turn.submitted"
	LiveLatencyTranscriptCommitted   LiveLatencyStage = "transcript.committed"
	LiveLatencyAssistantTextFirst    LiveLatencyStage = "assistant.text_first"
	LiveLatencyAssistantAudioFirst   LiveLatencyStage = "assistant.audio_first"
	LiveLatencyAssistantAudioStopped LiveLatencyStage = "assistant.audio_stopped"
	LiveLatencyTurnPersisted         LiveLatencyStage = "turn.persisted"
)

type LiveLatencySource string

const (
	LiveLatencySourceBrowser LiveLatencySource = "browser"
	LiveLatencySourceWorker  LiveLatencySource = "worker"
	LiveLatencySourceGo      LiveLatencySource = "go"
)

type LiveLatencyPoint struct {
	ThreadID        string            `json:"thread_id"`
	LiveSessionID   string            `json:"live_session_id"`
	TurnID          string            `json:"turn_id"`
	ClientMessageID string            `json:"client_message_id"`
	Mode            ConversationMode  `json:"mode"`
	Stage           LiveLatencyStage  `json:"stage"`
	Source          LiveLatencySource `json:"source"`
	OccurredAt      time.Time         `json:"occurred_at"`
	Sequence        uint64            `json:"sequence"`
}

type LiveLatencyTrace struct {
	point LiveLatencyPoint
}

func NewLiveLatencyTrace(
	threadID string,
	liveSessionID string,
	turnID string,
	clientMessageID string,
	mode ConversationMode,
) *LiveLatencyTrace {
	return &LiveLatencyTrace{point: LiveLatencyPoint{
		ThreadID:        threadID,
		LiveSessionID:   liveSessionID,
		TurnID:          turnID,
		ClientMessageID: clientMessageID,
		Mode:            mode,
	}}
}

func (trace *LiveLatencyTrace) Record(
	stage LiveLatencyStage,
	source LiveLatencySource,
	occurredAt time.Time,
) (LiveLatencyPoint, error) {
	if trace == nil {
		return LiveLatencyPoint{}, errors.New("assistant: live latency trace is required")
	}
	if trace.point.Sequence > 0 && occurredAt.Before(trace.point.OccurredAt) {
		return LiveLatencyPoint{}, errors.New("assistant: live latency occurred_at must be monotonic")
	}
	point := trace.point
	point.Stage = stage
	point.Source = source
	point.OccurredAt = occurredAt
	point.Sequence++
	if err := point.Validate(); err != nil {
		return LiveLatencyPoint{}, err
	}
	trace.point = point
	return point, nil
}

func (point LiveLatencyPoint) Validate() error {
	for field, value := range map[string]string{
		"thread_id":         point.ThreadID,
		"live_session_id":   point.LiveSessionID,
		"turn_id":           point.TurnID,
		"client_message_id": point.ClientMessageID,
		"stage":             string(point.Stage),
		"source":            string(point.Source),
	} {
		if strings.TrimSpace(value) == "" {
			return fmt.Errorf("assistant: live latency %s is required", field)
		}
	}
	if !point.Mode.Valid() {
		return errors.New("assistant: live latency mode must be normal or live")
	}
	if point.OccurredAt.IsZero() {
		return errors.New("assistant: live latency occurred_at is required")
	}
	if point.Sequence == 0 {
		return errors.New("assistant: live latency sequence must be positive")
	}
	return nil
}

type AssistantThread struct {
	ID             string
	UserID         string
	Status         ThreadStatus
	ContextSummary string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type TaskRun struct {
	ID          string
	ThreadID    string
	Intent      string
	Status      TaskRunStatus
	CurrentStep string
	Result      map[string]any
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type ToolCall struct {
	ID             string
	TaskRunID      string
	ToolName       string
	Arguments      map[string]any
	Result         map[string]any
	IdempotencyKey string
	CreatedAt      time.Time
}

type ConfirmationRequest struct {
	ID        string
	TaskRunID string
	Action    string
	RiskLevel string
	Summary   string
	Status    ConfirmationStatus
	ExpiresAt time.Time
}

type Plan struct {
	Intent string
	Steps  []PlanStep
}

type PlanStep struct {
	ToolName  string
	Arguments map[string]any
}

type ToolResult struct {
	Output map[string]any
}

// AssistantMessage 仅服务于 Demo UI；它不改变 XE3-ESL assistant 核心契约。
type AssistantMessage struct {
	ID              string
	Role            string
	Content         string
	ClientMessageID string                `json:"client_message_id,omitempty"`
	LiveSessionID   string                `json:"live_session_id,omitempty"`
	TurnID          string                `json:"turn_id,omitempty"`
	Mode            ConversationMode      `json:"mode,omitempty"`
	Kind            string                `json:"kind,omitempty"`
	Report          *InterviewReportCard  `json:"report,omitempty"`
	Attachments     []AttachmentReference `json:"attachments,omitempty"`
	CreatedAt       time.Time
}

type InterviewReportCard struct {
	SessionID      string `json:"sessionId"`
	TargetRole     string `json:"targetRole"`
	CompletedTurns int    `json:"completedTurns"`
	MaxTurns       int    `json:"maxTurns"`
	Summary        string `json:"summary"`
}

type ConversationArchive struct {
	ID        string             `json:"id"`
	Title     string             `json:"title"`
	Messages  []AssistantMessage `json:"messages"`
	CreatedAt time.Time          `json:"createdAt"`
	UpdatedAt time.Time          `json:"updatedAt"`
}

type ConversationArchiveSummary struct {
	ID           string    `json:"id"`
	Title        string    `json:"title"`
	MessageCount int       `json:"messageCount"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type AttachmentReference struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	MediaType        string `json:"mediaType"`
	Kind             string `json:"kind"`
	Size             int64  `json:"size"`
	IsResume         bool   `json:"isResume"`
	Summary          string `json:"summary"`
	ContentAvailable bool   `json:"contentAvailable,omitempty"`
}

type Attachment struct {
	AttachmentReference
	ExtractedText string    `json:"extractedText,omitempty"`
	StoragePath   string    `json:"storagePath,omitempty"`
	CreatedAt     time.Time `json:"createdAt"`
}

type DemoSnapshot struct {
	Thread                 AssistantThread       `json:"thread"`
	TaskRuns               []TaskRun             `json:"taskRuns"`
	Plans                  map[string]Plan       `json:"plans"`
	ToolCalls              []ToolCall            `json:"toolCalls"`
	Confirmations          []ConfirmationRequest `json:"confirmations"`
	Messages               []AssistantMessage    `json:"messages"`
	ActiveQuestion         *string               `json:"activeQuestion,omitempty"`
	CompletedQuestionCount int                   `json:"completedQuestionCount"`
	TargetRole             string                `json:"targetRole,omitempty"`
	Interviewer            string                `json:"interviewer,omitempty"`
	ContextTokenCount      int                   `json:"contextTokenCount"`
	ContextTokenLimit      int                   `json:"contextTokenLimit"`
	RequiresNewThread      bool                  `json:"requiresNewThread"`
	MaxInterviewTurns      int                   `json:"maxInterviewTurns,omitempty"`
	InterviewDurationMin   int                   `json:"interviewDurationMinutes,omitempty"`
	InterviewStartedAt     *time.Time            `json:"interviewStartedAt,omitempty"`
	InterviewDeadline      *time.Time            `json:"interviewDeadline,omitempty"`
	InterviewSessions      []InterviewSession    `json:"interviewSessions,omitempty"`
	CandidateProfile       CandidateProfile      `json:"candidateProfile,omitempty"`
	Attachments            []AttachmentReference `json:"attachments,omitempty"`
	Resumes                []ResumeDocumentView  `json:"resumes,omitempty"`
	ActiveResumeID         string                `json:"activeResumeId,omitempty"`
}

type InterviewSession struct {
	ID              string     `json:"id"`
	TargetRole      string     `json:"targetRole"`
	Interviewer     string     `json:"interviewer"`
	Status          string     `json:"status"`
	MaxTurns        int        `json:"maxTurns"`
	DurationMinutes int        `json:"durationMinutes"`
	CompletedTurns  int        `json:"completedTurns"`
	StartedAt       time.Time  `json:"startedAt"`
	EndedAt         *time.Time `json:"endedAt,omitempty"`
	Questions       []string   `json:"questions"`
	Answers         []string   `json:"answers"`
	Feedback        string     `json:"feedback,omitempty"`
}

type InterviewSessionSummary struct {
	ID              string     `json:"id"`
	TargetRole      string     `json:"targetRole"`
	Interviewer     string     `json:"interviewer"`
	Status          string     `json:"status"`
	MaxTurns        int        `json:"maxTurns"`
	DurationMinutes int        `json:"durationMinutes"`
	CompletedTurns  int        `json:"completedTurns"`
	StartedAt       time.Time  `json:"startedAt"`
	EndedAt         *time.Time `json:"endedAt,omitempty"`
	HasFeedback     bool       `json:"hasFeedback"`
}

type CandidateProfile struct {
	ID             string    `json:"id"`
	ResumeName     string    `json:"resumeName,omitempty"`
	CandidateName  string    `json:"candidateName,omitempty"`
	Headline       string    `json:"headline,omitempty"`
	Summary        string    `json:"summary,omitempty"`
	Skills         []string  `json:"skills,omitempty"`
	Experiences    []string  `json:"experiences,omitempty"`
	JobTitle       string    `json:"jobTitle,omitempty"`
	JobDescription string    `json:"jobDescription,omitempty"`
	ResumeText     string    `json:"resumeText,omitempty"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type ResumeDocument struct {
	ID               string           `json:"id"`
	Name             string           `json:"name"`
	MediaType        string           `json:"mediaType"`
	Size             int64            `json:"size"`
	Status           string           `json:"status"`
	AttachmentID     string           `json:"attachmentId,omitempty"`
	StoragePath      string           `json:"storagePath,omitempty"`
	CandidateProfile CandidateProfile `json:"candidateProfile"`
	CreatedAt        time.Time        `json:"createdAt"`
	UpdatedAt        time.Time        `json:"updatedAt"`
}

type ResumeDocumentView struct {
	ID               string           `json:"id"`
	Name             string           `json:"name"`
	MediaType        string           `json:"mediaType"`
	Size             int64            `json:"size"`
	Status           string           `json:"status"`
	AttachmentID     string           `json:"attachmentId,omitempty"`
	Active           bool             `json:"active"`
	CandidateProfile CandidateProfile `json:"candidateProfile"`
	CreatedAt        time.Time        `json:"createdAt"`
	UpdatedAt        time.Time        `json:"updatedAt"`
}

type ResumeProfileUpdate struct {
	CandidateName string   `json:"candidateName"`
	Headline      string   `json:"headline"`
	Summary       string   `json:"summary"`
	Skills        []string `json:"skills"`
	Experiences   []string `json:"experiences"`
}

func (p CandidateProfile) Configured() bool {
	return p.ResumeText != "" || p.JobTitle != "" || p.JobDescription != ""
}
