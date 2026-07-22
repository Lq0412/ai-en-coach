package assistant

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

const (
	DefaultInterviewMaxTurns        = 10
	DefaultInterviewDurationMinutes = 15
	MaxManagedResumes               = 3
)

type MockPlanner struct {
	tools InterviewRuntime
}

func NewMockPlanner(tools InterviewRuntime) *MockPlanner {
	return &MockPlanner{tools: tools}
}

func (p *MockPlanner) Plan(_ context.Context, request PlanRequest) (Plan, error) {
	text := strings.ToLower(strings.TrimSpace(request.UserMessage))

	state := p.tools.State()
	if state.ActiveQuestion != "" {
		last := state.ShouldCompleteAfterNextTurn(time.Now())
		lastTool := "conversation.generate_next_question"
		if last {
			lastTool = "review.generate_feedback"
		}
		return Plan{
			Intent: "submit_interview_answer",
			Steps: []PlanStep{
				{ToolName: "conversation.submit_turn", Arguments: map[string]any{
					"answer_text": request.UserMessage, "interaction_mode": "TEXT",
				}},
				{ToolName: "practice.apply_turn_outcome", Arguments: map[string]any{"answer_validity": "VALID"}},
				{ToolName: lastTool, Arguments: map[string]any{}},
			},
		}, nil
	}

	if strings.Contains(text, "历史") || strings.Contains(text, "history") || strings.Contains(text, "记录") {
		return Plan{
			Intent: "view_practice_history",
			Steps:  []PlanStep{{ToolName: "review.list_history", Arguments: map[string]any{"limit": 3}}},
		}, nil
	}
	if strings.Contains(text, "复盘") || strings.Contains(text, "反馈") || strings.Contains(text, "review") {
		return Plan{
			Intent: "review_latest_practice",
			Steps:  []PlanStep{{ToolName: "review.generate_feedback", Arguments: map[string]any{}}},
		}, nil
	}

	interviewRequested := strings.Contains(text, "面试") || strings.Contains(text, "interview")
	requirementPending := strings.Contains(request.ContextSummary, "interview_requirement=pending_target_role")
	if interviewRequested && !hasExplicitTargetRole(request.UserMessage) {
		return interviewRequirementQuestionPlan(), nil
	}
	if interviewRequested || requirementPending {
		role := detectTargetRole(request.UserMessage)
		if role == "" {
			return interviewRequirementQuestionPlan(), nil
		}
		return Plan{
			Intent: "start_mock_interview",
			Steps: []PlanStep{
				{ToolName: "preparation.get_confirmed_context", Arguments: map[string]any{"scenario": "PROGRAMMER_INTERVIEW"}},
				{ToolName: "practice.create_plan", Arguments: map[string]any{
					"role": role, "max_turns": DefaultInterviewMaxTurns,
					"duration_minutes": DefaultInterviewDurationMinutes,
				}},
				{ToolName: "practice.start_session", Arguments: map[string]any{}},
				{ToolName: "conversation.generate_next_question", Arguments: map[string]any{}},
			},
		}, nil
	}

	return Plan{
		Intent: "free_conversation",
		Steps: []PlanStep{{
			ToolName: "conversation.generate_reply",
			Arguments: map[string]any{
				"user_message":    request.UserMessage,
				"context_summary": request.ContextSummary,
			},
		}},
	}, nil
}

type MockDomainState struct {
	CurrentSessionID       string
	ActiveQuestion         string
	CompletedQuestionCount int
	TargetRole             string
	Interviewer            string
	MaxTurns               int
	DurationMinutes        int
	StartedAt              time.Time
	Deadline               time.Time
	Questions              []string
	Sessions               []InterviewSession
	CandidateProfile       CandidateProfile
	Attachments            []Attachment
	Resumes                []ResumeDocument
	ActiveResumeID         string
}

// RuntimeSnapshot is the stable Demo read model exposed to the Assistant
// orchestration port. The legacy name remains for persisted-data compatibility.
type RuntimeSnapshot = MockDomainState

type DemoState struct {
	mu          sync.RWMutex
	state       MockDomainState
	generator   AgentContentGenerator
	answers     []string
	persistPath string
}

var (
	_ InterviewRuntime   = (*DemoState)(nil)
	_ AttachmentResolver = (*DemoState)(nil)
	_ DemoResetter       = (*DemoState)(nil)
)

func NewDemoState() *DemoState {
	return &DemoState{}
}

func NewDemoStateWithGenerator(generator AgentContentGenerator) *DemoState {
	return &DemoState{generator: generator}
}

func (r *DemoState) State() MockDomainState {
	r.mu.RLock()
	defer r.mu.RUnlock()
	state := r.state
	state.Questions = append([]string(nil), r.state.Questions...)
	state.Sessions = cloneInterviewSessions(r.state.Sessions)
	state.Attachments = cloneAttachments(r.state.Attachments)
	state.Resumes = cloneResumes(r.state.Resumes)
	state.CandidateProfile.Skills = append([]string(nil), r.state.CandidateProfile.Skills...)
	state.CandidateProfile.Experiences = append([]string(nil), r.state.CandidateProfile.Experiences...)
	return state
}

func (r *DemoState) ListInterviewSessions() []InterviewSessionSummary {
	r.mu.RLock()
	defer r.mu.RUnlock()
	items := make([]InterviewSessionSummary, 0, len(r.state.Sessions)+1)
	if r.state.CurrentSessionID != "" && r.state.ActiveQuestion != "" {
		items = append(items, InterviewSessionSummary{
			ID: r.state.CurrentSessionID, TargetRole: r.state.TargetRole, Interviewer: r.state.Interviewer,
			Status: "in_progress", MaxTurns: r.state.MaxTurns, DurationMinutes: r.state.DurationMinutes,
			CompletedTurns: r.state.CompletedQuestionCount, StartedAt: r.state.StartedAt,
		})
	}
	for index := len(r.state.Sessions) - 1; index >= 0; index-- {
		session := r.state.Sessions[index]
		items = append(items, InterviewSessionSummary{
			ID: session.ID, TargetRole: session.TargetRole, Interviewer: session.Interviewer,
			Status: session.Status, MaxTurns: session.MaxTurns, DurationMinutes: session.DurationMinutes,
			CompletedTurns: session.CompletedTurns, StartedAt: session.StartedAt, EndedAt: session.EndedAt,
			HasFeedback: strings.TrimSpace(session.Feedback) != "",
		})
	}
	return items
}

func (r *DemoState) GetInterviewSession(id string) (InterviewSession, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if id == r.state.CurrentSessionID && r.state.ActiveQuestion != "" {
		return InterviewSession{
			ID: id, TargetRole: r.state.TargetRole, Interviewer: r.state.Interviewer,
			Status: "in_progress", MaxTurns: r.state.MaxTurns, DurationMinutes: r.state.DurationMinutes,
			CompletedTurns: r.state.CompletedQuestionCount, StartedAt: r.state.StartedAt,
			Questions: append([]string(nil), r.state.Questions...), Answers: append([]string(nil), r.answers...),
		}, nil
	}
	for _, session := range r.state.Sessions {
		if session.ID == id {
			cloned := cloneInterviewSessions([]InterviewSession{session})
			return cloned[0], nil
		}
	}
	return InterviewSession{}, ErrNotFound
}

func (r *DemoState) DeleteInterviewSession(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if id == r.state.CurrentSessionID && r.state.ActiveQuestion != "" {
		return ErrActiveInterview
	}
	for index, session := range r.state.Sessions {
		if session.ID != id {
			continue
		}
		r.state.Sessions = append(r.state.Sessions[:index], r.state.Sessions[index+1:]...)
		if session.ID == r.state.CurrentSessionID {
			r.state.CurrentSessionID = ""
			r.state.ActiveQuestion = ""
			r.state.CompletedQuestionCount = 0
			r.state.TargetRole = ""
			r.state.Interviewer = ""
			r.state.MaxTurns = 0
			r.state.DurationMinutes = 0
			r.state.StartedAt = time.Time{}
			r.state.Deadline = time.Time{}
			r.state.Questions = nil
			r.answers = nil
		}
		return r.persistLocked()
	}
	return ErrNotFound
}

func (r *DemoState) Reset() {
	r.mu.Lock()
	defer r.mu.Unlock()
	sessions := cloneInterviewSessions(r.state.Sessions)
	attachments := cloneAttachments(r.state.Attachments)
	resumes := cloneResumes(r.state.Resumes)
	profile := r.state.CandidateProfile
	profile.Skills = append([]string(nil), profile.Skills...)
	profile.Experiences = append([]string(nil), profile.Experiences...)
	r.state = MockDomainState{Sessions: sessions, CandidateProfile: profile, Attachments: attachments, Resumes: resumes, ActiveResumeID: r.state.ActiveResumeID}
	r.answers = nil
	_ = r.persistLocked()
}

// DemoTransaction is the infrastructure boundary used by the four Demo
// modules. Business rules live in those modules; DemoState only serializes
// mutations and persists the resulting aggregate.
type DemoTransaction func(*RuntimeSnapshot, *[]string) (ToolResult, error)

func (r *DemoState) Transact(transaction DemoTransaction) (result ToolResult, err error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	defer func() {
		if err == nil {
			err = r.persistLocked()
		}
	}()
	return transaction(&r.state, &r.answers)
}

func (r *DemoState) UpdateCandidateProfile(ctx context.Context, input CandidateProfileInput) (CandidateProfile, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	analyzer, ok := r.generator.(CandidateProfileAnalyzer)
	if !ok {
		return CandidateProfile{}, errors.New("candidate profile analyzer is not configured")
	}
	profile, err := analyzer.AnalyzeCandidateProfile(ctx, input)
	if err != nil {
		return CandidateProfile{}, err
	}
	if strings.TrimSpace(profile.ID) == "" {
		profile.ID = fmt.Sprintf("background-%d", time.Now().UTC().UnixNano())
	}
	profile.ResumeName = input.ResumeName
	profile.ResumeText = input.ResumeText
	profile.JobTitle = input.JobTitle
	profile.JobDescription = input.JobDescription
	profile.UpdatedAt = time.Now().UTC()
	r.state.CandidateProfile = profile
	r.upsertResumeLocked(ResumeDocument{
		ID:               resumeIDForProfile(profile),
		Name:             input.ResumeName,
		MediaType:        "text/plain",
		Status:           "ready",
		CandidateProfile: profile,
		CreatedAt:        profile.UpdatedAt,
		UpdatedAt:        profile.UpdatedAt,
	})
	if err := r.persistLocked(); err != nil {
		return CandidateProfile{}, err
	}
	return profile, nil
}

func (r *DemoState) AddAttachment(ctx context.Context, input AttachmentInput) (Attachment, error) {
	analyzer, ok := r.generator.(AttachmentAnalyzer)
	if !ok {
		return Attachment{}, errors.New("attachment analyzer is not configured")
	}
	analysis, err := analyzer.AnalyzeAttachment(ctx, input)
	if err != nil {
		return Attachment{}, err
	}
	analysis.Kind = strings.TrimSpace(analysis.Kind)
	analysis.Summary = strings.TrimSpace(analysis.Summary)
	analysis.ExtractedText = strings.TrimSpace(analysis.ExtractedText)
	if analysis.Kind == "" || analysis.Summary == "" {
		return Attachment{}, errors.New("attachment analysis is incomplete")
	}
	if input.RequireResume && !analysis.IsResume {
		return Attachment{}, fmt.Errorf("%w: the uploaded PDF was parsed successfully but is not a resume", ErrNotResume)
	}

	var profile CandidateProfile
	if analysis.IsResume {
		r.mu.RLock()
		atLimit := len(r.state.Resumes) >= MaxManagedResumes
		r.mu.RUnlock()
		if atLimit {
			return Attachment{}, fmt.Errorf("%w: at most %d resumes can be saved", ErrResumeLimit, MaxManagedResumes)
		}
		profileAnalyzer, ok := r.generator.(CandidateProfileAnalyzer)
		if !ok {
			return Attachment{}, errors.New("candidate profile analyzer is not configured")
		}
		if analysis.ExtractedText == "" {
			return Attachment{}, errors.New("resume attachment did not contain readable text")
		}
		r.mu.RLock()
		existing := r.state.CandidateProfile
		r.mu.RUnlock()
		profile, err = profileAnalyzer.AnalyzeCandidateProfile(ctx, CandidateProfileInput{
			ResumeName:     input.Filename,
			ResumeText:     analysis.ExtractedText,
			JobTitle:       existing.JobTitle,
			JobDescription: existing.JobDescription,
		})
		if err != nil {
			return Attachment{}, err
		}
		profile.ResumeName = input.Filename
		profile.ResumeText = analysis.ExtractedText
		profile.JobTitle = existing.JobTitle
		profile.JobDescription = existing.JobDescription
		profile.UpdatedAt = time.Now().UTC()
	}

	attachment := Attachment{
		AttachmentReference: AttachmentReference{
			ID:        fmt.Sprintf("attachment-%d", time.Now().UTC().UnixNano()),
			Name:      input.Filename,
			MediaType: input.MediaType,
			Kind:      analysis.Kind,
			Size:      int64(len(input.Data)),
			IsResume:  analysis.IsResume,
			Summary:   analysis.Summary,
		},
		ExtractedText: analysis.ExtractedText,
		CreatedAt:     time.Now().UTC(),
	}
	if strings.HasPrefix(input.MediaType, "image/") {
		attachment.StoragePath, err = r.saveAttachmentFile(attachment.ID, input.MediaType, input.Data)
		if err != nil {
			return Attachment{}, err
		}
		attachment.ContentAvailable = attachment.StoragePath != ""
	}
	storagePath := ""
	if analysis.IsResume {
		storagePath, err = r.saveResumeFile(attachment.ID, input.Data)
		if err != nil {
			return Attachment{}, err
		}
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if analysis.IsResume && len(r.state.Resumes) >= MaxManagedResumes {
		_ = r.removeResumeFile(storagePath)
		return Attachment{}, fmt.Errorf("%w: at most %d resumes can be saved", ErrResumeLimit, MaxManagedResumes)
	}
	r.state.Attachments = append(r.state.Attachments, attachment)
	if analysis.IsResume {
		r.state.CandidateProfile = profile
		r.upsertResumeLocked(ResumeDocument{
			ID:               "resume-" + attachment.ID,
			Name:             input.Filename,
			MediaType:        input.MediaType,
			Size:             int64(len(input.Data)),
			Status:           "ready",
			AttachmentID:     attachment.ID,
			StoragePath:      storagePath,
			CandidateProfile: profile,
			CreatedAt:        attachment.CreatedAt,
			UpdatedAt:        attachment.CreatedAt,
		})
	}
	if err := r.persistLocked(); err != nil {
		return Attachment{}, err
	}
	return attachment, nil
}

func (r *DemoState) Attachments(ids []string) ([]Attachment, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	byID := make(map[string]Attachment, len(r.state.Attachments))
	for _, attachment := range r.state.Attachments {
		byID[attachment.ID] = attachment
	}
	result := make([]Attachment, 0, len(ids))
	for _, id := range ids {
		attachment, ok := byID[id]
		if !ok {
			return nil, fmt.Errorf("assistant: attachment %s not found", id)
		}
		result = append(result, attachment)
	}
	return cloneAttachments(result), nil
}

func (r *DemoState) AttachmentContent(id string) ([]byte, string, string, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, attachment := range r.state.Attachments {
		if attachment.ID != id {
			continue
		}
		if attachment.StoragePath == "" || r.persistPath == "" {
			return nil, "", "", ErrNotFound
		}
		data, err := os.ReadFile(filepath.Join(filepath.Dir(r.persistPath), attachment.StoragePath))
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return nil, "", "", ErrNotFound
			}
			return nil, "", "", err
		}
		return data, attachment.Name, attachment.MediaType, nil
	}
	return nil, "", "", ErrNotFound
}

func (r *DemoState) DeleteAttachment(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, resume := range r.state.Resumes {
		if resume.AttachmentID == id {
			return ErrAttachmentInUse
		}
	}
	index := -1
	for candidate := range r.state.Attachments {
		if r.state.Attachments[candidate].ID == id {
			index = candidate
			break
		}
	}
	if index < 0 {
		return ErrNotFound
	}
	storagePath := r.state.Attachments[index].StoragePath
	r.state.Attachments = append(r.state.Attachments[:index], r.state.Attachments[index+1:]...)
	if err := r.persistLocked(); err != nil {
		return err
	}
	return r.removeAttachmentFile(storagePath)
}

func (r *DemoState) ListResumes() []ResumeDocumentView {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return resumeViews(r.state.Resumes, r.state.ActiveResumeID)
}

func (r *DemoState) GetResume(id string) (ResumeDocumentView, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, resume := range r.state.Resumes {
		if resume.ID == id {
			return resumeView(resume, resume.ID == r.state.ActiveResumeID), nil
		}
	}
	return ResumeDocumentView{}, ErrNotFound
}

func (r *DemoState) ResumeFile(id string) ([]byte, string, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, resume := range r.state.Resumes {
		if resume.ID != id {
			continue
		}
		if resume.StoragePath == "" || r.persistPath == "" {
			return nil, "", ErrNotFound
		}
		data, err := os.ReadFile(filepath.Join(filepath.Dir(r.persistPath), resume.StoragePath))
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return nil, "", ErrNotFound
			}
			return nil, "", err
		}
		return data, resume.Name, nil
	}
	return nil, "", ErrNotFound
}

func (r *DemoState) RenameResume(id, name string) (ResumeDocumentView, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return ResumeDocumentView{}, errors.New("resume name is required")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	for index := range r.state.Resumes {
		if r.state.Resumes[index].ID != id {
			continue
		}
		r.state.Resumes[index].Name = name
		r.state.Resumes[index].CandidateProfile.ResumeName = name
		r.state.Resumes[index].UpdatedAt = time.Now().UTC()
		if id == r.state.ActiveResumeID {
			r.state.CandidateProfile.ResumeName = name
		}
		if err := r.persistLocked(); err != nil {
			return ResumeDocumentView{}, err
		}
		return resumeView(r.state.Resumes[index], id == r.state.ActiveResumeID), nil
	}
	return ResumeDocumentView{}, ErrNotFound
}

func (r *DemoState) UpdateResumeProfile(id string, input ResumeProfileUpdate) (ResumeDocumentView, error) {
	profile, err := normalizeResumeProfileUpdate(input)
	if err != nil {
		return ResumeDocumentView{}, err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	for index := range r.state.Resumes {
		if r.state.Resumes[index].ID != id {
			continue
		}
		stored := r.state.Resumes[index].CandidateProfile
		stored.CandidateName = profile.CandidateName
		stored.Headline = profile.Headline
		stored.Summary = profile.Summary
		stored.Skills = profile.Skills
		stored.Experiences = profile.Experiences
		stored.UpdatedAt = time.Now().UTC()
		r.state.Resumes[index].CandidateProfile = stored
		r.state.Resumes[index].UpdatedAt = stored.UpdatedAt
		if id == r.state.ActiveResumeID {
			r.state.CandidateProfile = cloneCandidateProfile(stored)
		}
		if err := r.persistLocked(); err != nil {
			return ResumeDocumentView{}, err
		}
		return resumeView(r.state.Resumes[index], id == r.state.ActiveResumeID), nil
	}
	return ResumeDocumentView{}, ErrNotFound
}

func normalizeResumeProfileUpdate(input ResumeProfileUpdate) (ResumeProfileUpdate, error) {
	result := ResumeProfileUpdate{
		CandidateName: strings.TrimSpace(input.CandidateName),
		Headline:      strings.TrimSpace(input.Headline),
		Summary:       strings.TrimSpace(input.Summary),
		Skills:        normalizeResumeTextItems(input.Skills),
		Experiences:   normalizeResumeTextItems(input.Experiences),
	}
	if utf8.RuneCountInString(result.CandidateName) > 120 || utf8.RuneCountInString(result.Headline) > 200 || utf8.RuneCountInString(result.Summary) > 4000 {
		return ResumeProfileUpdate{}, fmt.Errorf("%w: name, headline, or summary is too long", ErrInvalidResumeProfile)
	}
	if len(result.Skills) > 30 || len(result.Experiences) > 30 {
		return ResumeProfileUpdate{}, fmt.Errorf("%w: at most 30 skills and 30 experiences are allowed", ErrInvalidResumeProfile)
	}
	for _, skill := range result.Skills {
		if utf8.RuneCountInString(skill) > 80 {
			return ResumeProfileUpdate{}, fmt.Errorf("%w: each skill must be at most 80 characters", ErrInvalidResumeProfile)
		}
	}
	for _, experience := range result.Experiences {
		if utf8.RuneCountInString(experience) > 2000 {
			return ResumeProfileUpdate{}, fmt.Errorf("%w: each experience must be at most 2000 characters", ErrInvalidResumeProfile)
		}
	}
	return result, nil
}

func normalizeResumeTextItems(items []string) []string {
	result := make([]string, 0, len(items))
	seen := map[string]bool{}
	for _, item := range items {
		item = strings.TrimSpace(item)
		key := strings.ToLower(item)
		if item == "" || seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, item)
	}
	return result
}

func (r *DemoState) ActivateResume(id string) (ResumeDocumentView, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, resume := range r.state.Resumes {
		if resume.ID != id {
			continue
		}
		r.state.ActiveResumeID = id
		r.state.CandidateProfile = cloneCandidateProfile(resume.CandidateProfile)
		if err := r.persistLocked(); err != nil {
			return ResumeDocumentView{}, err
		}
		return resumeView(resume, true), nil
	}
	return ResumeDocumentView{}, ErrNotFound
}

func (r *DemoState) DeleteResume(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	index := -1
	for candidate := range r.state.Resumes {
		if r.state.Resumes[candidate].ID == id {
			index = candidate
			break
		}
	}
	if index < 0 {
		return ErrNotFound
	}
	attachmentID := r.state.Resumes[index].AttachmentID
	storagePath := r.state.Resumes[index].StoragePath
	r.state.Resumes = append(r.state.Resumes[:index], r.state.Resumes[index+1:]...)
	if attachmentID != "" {
		attachments := r.state.Attachments[:0]
		for _, attachment := range r.state.Attachments {
			if attachment.ID != attachmentID {
				attachments = append(attachments, attachment)
			}
		}
		r.state.Attachments = attachments
	}
	if r.state.ActiveResumeID == id {
		r.state.ActiveResumeID = ""
		r.state.CandidateProfile = CandidateProfile{}
		if len(r.state.Resumes) > 0 {
			latest := r.state.Resumes[len(r.state.Resumes)-1]
			r.state.ActiveResumeID = latest.ID
			r.state.CandidateProfile = cloneCandidateProfile(latest.CandidateProfile)
		}
	}
	if err := r.persistLocked(); err != nil {
		return err
	}
	return r.removeResumeFile(storagePath)
}

func (r *DemoState) saveResumeFile(attachmentID string, data []byte) (string, error) {
	if r.persistPath == "" {
		return "", nil
	}
	relativePath := filepath.Join("resumes", attachmentID+".pdf")
	absolutePath := filepath.Join(filepath.Dir(r.persistPath), relativePath)
	if err := os.MkdirAll(filepath.Dir(absolutePath), 0o700); err != nil {
		return "", fmt.Errorf("create resume storage: %w", err)
	}
	if err := os.WriteFile(absolutePath, data, 0o600); err != nil {
		return "", fmt.Errorf("store resume PDF: %w", err)
	}
	return relativePath, nil
}

func (r *DemoState) saveAttachmentFile(attachmentID, mediaType string, data []byte) (string, error) {
	if r.persistPath == "" {
		return "", nil
	}
	extension := map[string]string{
		"image/jpeg": ".jpg",
		"image/png":  ".png",
		"image/webp": ".webp",
	}[mediaType]
	if extension == "" {
		return "", fmt.Errorf("unsupported attachment media type: %s", mediaType)
	}
	relativePath := filepath.Join("attachments", attachmentID+extension)
	absolutePath := filepath.Join(filepath.Dir(r.persistPath), relativePath)
	if err := os.MkdirAll(filepath.Dir(absolutePath), 0o700); err != nil {
		return "", fmt.Errorf("create attachment storage: %w", err)
	}
	if err := os.WriteFile(absolutePath, data, 0o600); err != nil {
		return "", fmt.Errorf("store attachment content: %w", err)
	}
	return relativePath, nil
}

func (r *DemoState) removeResumeFile(storagePath string) error {
	if storagePath == "" || r.persistPath == "" {
		return nil
	}
	err := os.Remove(filepath.Join(filepath.Dir(r.persistPath), storagePath))
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("delete resume PDF: %w", err)
	}
	return nil
}

func (r *DemoState) removeAttachmentFile(storagePath string) error {
	if storagePath == "" || r.persistPath == "" {
		return nil
	}
	err := os.Remove(filepath.Join(filepath.Dir(r.persistPath), storagePath))
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("delete attachment content: %w", err)
	}
	return nil
}

func (r *DemoState) upsertResumeLocked(resume ResumeDocument) {
	if resume.ID == "" {
		resume.ID = fmt.Sprintf("resume-%d", time.Now().UTC().UnixNano())
	}
	if resume.CreatedAt.IsZero() {
		resume.CreatedAt = time.Now().UTC()
	}
	if resume.UpdatedAt.IsZero() {
		resume.UpdatedAt = resume.CreatedAt
	}
	for index := range r.state.Resumes {
		if r.state.Resumes[index].ID == resume.ID {
			r.state.Resumes[index] = resume
			r.state.ActiveResumeID = resume.ID
			return
		}
	}
	if len(r.state.Resumes) >= MaxManagedResumes {
		return
	}
	r.state.Resumes = append(r.state.Resumes, resume)
	r.state.ActiveResumeID = resume.ID
}

func cloneInterviewSessions(value []InterviewSession) []InterviewSession {
	result := make([]InterviewSession, len(value))
	for index, session := range value {
		result[index] = session
		result[index].Questions = append([]string(nil), session.Questions...)
		result[index].Answers = append([]string(nil), session.Answers...)
	}
	return result
}

func cloneAttachments(value []Attachment) []Attachment {
	return append([]Attachment(nil), value...)
}

func cloneResumes(value []ResumeDocument) []ResumeDocument {
	result := make([]ResumeDocument, len(value))
	for index, resume := range value {
		result[index] = resume
		result[index].CandidateProfile = cloneCandidateProfile(resume.CandidateProfile)
	}
	return result
}

func cloneCandidateProfile(profile CandidateProfile) CandidateProfile {
	profile.Skills = append([]string(nil), profile.Skills...)
	profile.Experiences = append([]string(nil), profile.Experiences...)
	return profile
}

func resumeIDForProfile(profile CandidateProfile) string {
	if profile.ID != "" {
		return "resume-" + profile.ID
	}
	return fmt.Sprintf("resume-%d", time.Now().UTC().UnixNano())
}

func resumeViews(resumes []ResumeDocument, activeID string) []ResumeDocumentView {
	views := make([]ResumeDocumentView, 0, len(resumes))
	for index := len(resumes) - 1; index >= 0; index-- {
		views = append(views, resumeView(resumes[index], resumes[index].ID == activeID))
	}
	return views
}

func resumeView(resume ResumeDocument, active bool) ResumeDocumentView {
	profile := cloneCandidateProfile(resume.CandidateProfile)
	profile.ResumeText = ""
	return ResumeDocumentView{
		ID: resume.ID, Name: resume.Name, MediaType: resume.MediaType, Size: resume.Size,
		Status: resume.Status, AttachmentID: resume.AttachmentID, Active: active,
		CandidateProfile: profile, CreatedAt: resume.CreatedAt, UpdatedAt: resume.UpdatedAt,
	}
}

func (s MockDomainState) LimitReached(now time.Time) bool {
	if s.MaxTurns > 0 && s.CompletedQuestionCount >= s.MaxTurns {
		return true
	}
	return !s.Deadline.IsZero() && !now.Before(s.Deadline)
}

func (s MockDomainState) ShouldCompleteAfterNextTurn(now time.Time) bool {
	if !s.Deadline.IsZero() && !now.Before(s.Deadline) {
		return true
	}
	return s.MaxTurns > 0 && s.CompletedQuestionCount+1 >= s.MaxTurns
}

func boundedIntArgument(value any, fallback, minimum, maximum int) int {
	result := fallback
	switch typed := value.(type) {
	case int:
		result = typed
	case float64:
		result = int(typed)
	case json.Number:
		if parsed, err := typed.Int64(); err == nil {
			result = int(parsed)
		}
	}
	return max(minimum, min(result, maximum))
}

func detectTargetRole(message string) string {
	text := strings.TrimSpace(message)
	lower := strings.ToLower(text)
	candidates := []struct {
		terms []string
		role  string
	}{
		{[]string{"产品经理", "product manager"}, "Product Manager"},
		{[]string{"前端", "frontend", "front-end"}, "Frontend Engineer"},
		{[]string{"算法", "机器学习", "machine learning", "ai engineer"}, "AI / Machine Learning Engineer"},
		{[]string{"数据分析", "data analyst"}, "Data Analyst"},
		{[]string{"java"}, "Java Backend Engineer"},
		{[]string{"go", "golang"}, "Go Backend Engineer"},
		{[]string{"后端", "backend"}, "Backend Engineer"},
	}
	for _, candidate := range candidates {
		for _, term := range candidate.terms {
			if strings.Contains(lower, term) {
				return candidate.role
			}
		}
	}
	return ""
}

func hasExplicitTargetRole(message string) bool {
	return detectTargetRole(message) != ""
}

func interviewRequirementQuestionPlan() Plan {
	return Plan{
		Intent: "clarify_interview_requirements",
		Steps: []PlanStep{{
			ToolName:  "conversation.generate_reply",
			Arguments: map[string]any{},
		}},
	}
}

func output(value map[string]any) ToolResult {
	return ToolResult{Output: value}
}
