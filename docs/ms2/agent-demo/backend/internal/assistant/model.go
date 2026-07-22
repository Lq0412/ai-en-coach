package assistant

import "time"

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
	ID          string
	Role        string
	Content     string
	Kind        string                `json:"kind,omitempty"`
	Report      *InterviewReportCard  `json:"report,omitempty"`
	Attachments []AttachmentReference `json:"attachments,omitempty"`
	CreatedAt   time.Time
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
