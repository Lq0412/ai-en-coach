package assistant

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

type HTTPHandler struct {
	logger      *log.Logger
	service     *Service
	store       *MemoryConversationStore
	tools       DemoReadAPI
	preparation CandidatePreparationAPI
	coach       AnswerCoachService
	language    LanguageAssistanceGenerator
	transcriber Transcriber
	synthesizer SpeechSynthesizer
	models      map[string]string
}

func NewHTTPHandler(
	logger *log.Logger,
	service *Service,
	store *MemoryConversationStore,
	tools DemoReadAPI,
	preparation CandidatePreparationAPI,
	coach AnswerCoachService,
	language LanguageAssistanceGenerator,
	transcriber Transcriber,
	synthesizer SpeechSynthesizer,
	models map[string]string,
) *HTTPHandler {
	return &HTTPHandler{
		logger:      logger,
		service:     service,
		store:       store,
		tools:       tools,
		preparation: preparation,
		coach:       coach,
		language:    language,
		transcriber: transcriber,
		synthesizer: synthesizer,
		models:      models,
	}
}

func (h *HTTPHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /health", h.health)
	mux.HandleFunc("GET /v1/assistant/threads/{thread_id}", h.getThread)
	mux.HandleFunc("POST /v1/assistant/threads/{thread_id}/tasks", h.startTask)
	mux.HandleFunc("POST /v1/assistant/threads/{thread_id}/tasks/stream", h.streamTask)
	mux.HandleFunc("POST /v1/assistant/threads/{thread_id}/live-sessions", h.startLiveSession)
	mux.HandleFunc("POST /v1/assistant/live-sessions/{live_session_id}/resume", h.resumeLiveSession)
	mux.HandleFunc("POST /v1/assistant/live-sessions/{live_session_id}/end", h.endLiveSession)
	mux.HandleFunc("POST /v1/assistant/threads/{thread_id}/interview/end/stream", h.streamEndInterview)
	mux.HandleFunc("POST /v1/assistant/task-runs/{task_run_id}/resume", h.resumeTask)
	mux.HandleFunc("POST /v1/assistant/task-runs/{task_run_id}/reject", h.rejectTask)
	mux.HandleFunc("POST /v1/assistant/demo/reset", h.reset)
	mux.HandleFunc("GET /v1/assistant/conversations", h.listConversationArchives)
	mux.HandleFunc("GET /v1/assistant/conversations/{conversation_id}", h.getConversationArchive)
	mux.HandleFunc("DELETE /v1/assistant/conversations/{conversation_id}", h.deleteConversationArchive)
	mux.HandleFunc("GET /v1/practice/sessions", h.listInterviewSessions)
	mux.HandleFunc("GET /v1/practice/sessions/{session_id}", h.getInterviewSession)
	mux.HandleFunc("DELETE /v1/practice/sessions/{session_id}", h.deleteInterviewSession)
	mux.HandleFunc("POST /v1/practice/answer-coach", h.generateAnswerCoach)
	mux.HandleFunc("POST /v1/language-assistance", h.generateLanguageAssistance)
	mux.HandleFunc("POST /v1/assistant/attachments", h.uploadAttachment)
	mux.HandleFunc("POST /v1/assistant/messages/{message_id}/attachments", h.linkMessageAttachment)
	mux.HandleFunc("GET /v1/assistant/attachments/{attachment_id}/content", h.getAttachmentContent)
	mux.HandleFunc("DELETE /v1/assistant/attachments/{attachment_id}", h.deleteAttachment)
	mux.HandleFunc("GET /v1/preparation/profile", h.getCandidateProfile)
	mux.HandleFunc("POST /v1/preparation/profile", h.updateCandidateProfile)
	mux.HandleFunc("GET /v1/preparation/resumes", h.listResumes)
	mux.HandleFunc("POST /v1/preparation/resumes", h.uploadResume)
	mux.HandleFunc("GET /v1/preparation/resumes/{resume_id}", h.getResume)
	mux.HandleFunc("GET /v1/preparation/resumes/{resume_id}/file", h.downloadResume)
	mux.HandleFunc("PATCH /v1/preparation/resumes/{resume_id}", h.renameResume)
	mux.HandleFunc("PUT /v1/preparation/resumes/{resume_id}/profile", h.updateResumeProfile)
	mux.HandleFunc("POST /v1/preparation/resumes/{resume_id}/activate", h.activateResume)
	mux.HandleFunc("DELETE /v1/preparation/resumes/{resume_id}", h.deleteResume)
	mux.HandleFunc("POST /v1/audio/transcriptions", h.transcribe)
	mux.HandleFunc("GET /v1/audio/transcriptions/stream", h.streamTranscription)
	mux.HandleFunc("POST /v1/audio/speech", h.synthesize)
}

type liveSessionRequest struct {
	ActorUserID    string `json:"actor_user_id"`
	IdempotencyKey string `json:"idempotency_key,omitempty"`
}

func (h *HTTPHandler) startLiveSession(w http.ResponseWriter, r *http.Request) {
	var request liveSessionRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 16<<10)).Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid JSON body"})
		return
	}
	credentials, err := h.service.StartLiveSession(r.Context(), StartLiveSessionCommand{
		ActorUserID: request.ActorUserID, ThreadID: r.PathValue("thread_id"),
		IdempotencyKey: request.IdempotencyKey,
	})
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, credentials)
}

func (h *HTTPHandler) resumeLiveSession(w http.ResponseWriter, r *http.Request) {
	var request liveSessionRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 16<<10)).Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid JSON body"})
		return
	}
	credentials, err := h.service.ResumeLiveSession(r.Context(), ResumeLiveSessionCommand{
		ActorUserID: request.ActorUserID, LiveSessionID: r.PathValue("live_session_id"),
	})
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, credentials)
}

func (h *HTTPHandler) endLiveSession(w http.ResponseWriter, r *http.Request) {
	var request liveSessionRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 16<<10)).Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid JSON body"})
		return
	}
	session, err := h.service.EndLiveSession(r.Context(), EndLiveSessionCommand{
		ActorUserID: request.ActorUserID, LiveSessionID: r.PathValue("live_session_id"),
	})
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"live_session": session})
}

func (h *HTTPHandler) generateLanguageAssistance(w http.ResponseWriter, r *http.Request) {
	if h.language == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "language assistance is not configured"})
		return
	}
	var input LanguageAssistanceInput
	if err := json.NewDecoder(io.LimitReader(r.Body, 32<<10)).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid JSON body"})
		return
	}
	input.Operation = strings.TrimSpace(input.Operation)
	input.Text = strings.TrimSpace(input.Text)
	input.TargetLanguage = strings.TrimSpace(input.TargetLanguage)
	if input.Operation != "translate" && input.Operation != "correct" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "operation must be translate or correct"})
		return
	}
	if input.Text == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "text is required"})
		return
	}
	if len([]rune(input.Text)) > 4000 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "text must be 4000 characters or fewer"})
		return
	}
	if input.Operation == "translate" {
		if input.TargetLanguage == "" {
			input.TargetLanguage = "zh-CN"
		}
		if input.TargetLanguage != "zh-CN" {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "only zh-CN translation is currently supported"})
			return
		}
	}
	result, err := h.language.GenerateLanguageAssistance(r.Context(), input)
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *HTTPHandler) generateAnswerCoach(w http.ResponseWriter, r *http.Request) {
	if h.coach == nil {
		h.writeError(w, errors.New("assistant: answer coach is not configured"))
		return
	}
	answer, err := h.coach.GenerateAnswerCoach(r.Context())
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, answer)
}

func (h *HTTPHandler) getCandidateProfile(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, candidateProfileView(h.tools.State().CandidateProfile))
}

func (h *HTTPHandler) listInterviewSessions(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"items": h.tools.ListInterviewSessions()})
}

func (h *HTTPHandler) getInterviewSession(w http.ResponseWriter, r *http.Request) {
	session, err := h.tools.GetInterviewSession(r.PathValue("session_id"))
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (h *HTTPHandler) deleteInterviewSession(w http.ResponseWriter, r *http.Request) {
	if err := h.tools.DeleteInterviewSession(r.PathValue("session_id")); err != nil {
		h.writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *HTTPHandler) updateCandidateProfile(w http.ResponseWriter, r *http.Request) {
	var input CandidateProfileInput
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		r.Body = http.MaxBytesReader(w, r.Body, maxResumeBytes+1<<20)
		if err := r.ParseMultipartForm(maxResumeBytes + 1<<20); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "profile upload must be smaller than 11 MB"})
			return
		}
		input.JobTitle = strings.TrimSpace(r.FormValue("job_title"))
		input.JobDescription = strings.TrimSpace(r.FormValue("job_description"))
		input.ResumeText = strings.TrimSpace(r.FormValue("resume_text"))
		file, header, err := r.FormFile("resume")
		if err == nil {
			defer file.Close()
			data, readErr := io.ReadAll(io.LimitReader(file, maxResumeBytes+1))
			if readErr != nil {
				h.writeError(w, readErr)
				return
			}
			text, extractErr := ExtractResumeText(header.Filename, data)
			if extractErr != nil {
				writeJSON(w, http.StatusBadRequest, map[string]any{"error": extractErr.Error()})
				return
			}
			input.ResumeName = header.Filename
			input.ResumeText = text
		} else if !errors.Is(err, http.ErrMissingFile) {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "read resume upload: " + err.Error()})
			return
		}
	} else {
		var request struct {
			ResumeName     string `json:"resume_name"`
			ResumeText     string `json:"resume_text"`
			JobTitle       string `json:"job_title"`
			JobDescription string `json:"job_description"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, maxResumeBytes)).Decode(&request); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid JSON body"})
			return
		}
		input = CandidateProfileInput(request)
	}
	if strings.TrimSpace(input.ResumeText) == "" && strings.TrimSpace(input.JobTitle) == "" && strings.TrimSpace(input.JobDescription) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "resume text, job title, or job description is required"})
		return
	}
	profile, err := h.preparation.UpdateCandidateProfile(r.Context(), input)
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, candidateProfileView(profile))
}

func candidateProfileView(profile CandidateProfile) CandidateProfile {
	profile.ResumeText = ""
	return profile
}

func (h *HTTPHandler) listResumes(w http.ResponseWriter, _ *http.Request) {
	state := h.tools.State()
	writeJSON(w, http.StatusOK, map[string]any{
		"items":            h.preparation.ListResumes(),
		"active_resume_id": state.ActiveResumeID,
		"limit":            MaxManagedResumes,
	})
}

func (h *HTTPHandler) uploadResume(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxResumeBytes+1<<20)
	if err := r.ParseMultipartForm(maxResumeBytes + 1<<20); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "resume must be a PDF smaller than 10 MB"})
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "multipart field file is required"})
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxResumeBytes+1))
	if err != nil {
		h.writeError(w, err)
		return
	}
	if len(data) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "resume is empty"})
		return
	}
	if len(data) > maxResumeBytes {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "resume exceeds 10 MB"})
		return
	}
	if http.DetectContentType(data) != "application/pdf" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "only PDF resumes are supported"})
		return
	}
	attachment, err := h.preparation.AddAttachment(r.Context(), AttachmentInput{
		Filename:      header.Filename,
		MediaType:     "application/pdf",
		Data:          data,
		RequireResume: true,
	})
	if err != nil {
		h.writeError(w, err)
		return
	}
	resume, err := h.preparation.GetResume("resume-" + attachment.ID)
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"resume":            resume,
		"candidate_profile": candidateProfileView(h.tools.State().CandidateProfile),
	})
}

func (h *HTTPHandler) getResume(w http.ResponseWriter, r *http.Request) {
	resume, err := h.preparation.GetResume(r.PathValue("resume_id"))
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resume)
}

func (h *HTTPHandler) downloadResume(w http.ResponseWriter, r *http.Request) {
	data, name, err := h.preparation.ResumeFile(r.PathValue("resume_id"))
	if err != nil {
		h.writeError(w, err)
		return
	}
	disposition := mime.FormatMediaType("attachment", map[string]string{"filename": name})
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", disposition)
	w.Header().Set("Content-Length", fmt.Sprint(len(data)))
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func (h *HTTPHandler) renameResume(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 16<<10)).Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid JSON body"})
		return
	}
	resume, err := h.preparation.RenameResume(r.PathValue("resume_id"), request.Name)
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resume)
}

func (h *HTTPHandler) updateResumeProfile(w http.ResponseWriter, r *http.Request) {
	var request ResumeProfileUpdate
	if err := json.NewDecoder(io.LimitReader(r.Body, 256<<10)).Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid JSON body"})
		return
	}
	resume, err := h.preparation.UpdateResumeProfile(r.PathValue("resume_id"), request)
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"resume":            resume,
		"candidate_profile": candidateProfileView(h.tools.State().CandidateProfile),
	})
}

func (h *HTTPHandler) activateResume(w http.ResponseWriter, r *http.Request) {
	resume, err := h.preparation.ActivateResume(r.PathValue("resume_id"))
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"resume":            resume,
		"candidate_profile": candidateProfileView(h.tools.State().CandidateProfile),
	})
}

func (h *HTTPHandler) deleteResume(w http.ResponseWriter, r *http.Request) {
	if err := h.preparation.DeleteResume(r.PathValue("resume_id")); err != nil {
		h.writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type endInterviewRequest struct {
	ActorUserID    string `json:"actor_user_id"`
	Reason         string `json:"reason"`
	IdempotencyKey string `json:"idempotency_key"`
}

type startTaskRequest struct {
	ActorUserID     string           `json:"actor_user_id"`
	UserMessage     string           `json:"user_message"`
	AttachmentIDs   []string         `json:"attachment_ids,omitempty"`
	IdempotencyKey  string           `json:"idempotency_key"`
	InteractionMode string           `json:"interaction_mode,omitempty"`
	ClientMessageID string           `json:"client_message_id,omitempty"`
	LiveSessionID   string           `json:"live_session_id,omitempty"`
	TurnID          string           `json:"turn_id,omitempty"`
	Mode            ConversationMode `json:"mode,omitempty"`
}

const maxAttachmentBytes = 20 << 20

func (h *HTTPHandler) uploadAttachment(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxAttachmentBytes+1<<20)
	if err := r.ParseMultipartForm(maxAttachmentBytes + 1<<20); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "attachment must be multipart and smaller than 20 MB"})
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "multipart field file is required"})
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxAttachmentBytes+1))
	if err != nil {
		h.writeError(w, err)
		return
	}
	if len(data) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "attachment is empty"})
		return
	}
	if len(data) > maxAttachmentBytes {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "attachment exceeds 20 MB"})
		return
	}
	mediaType := strings.TrimSpace(header.Header.Get("Content-Type"))
	if parsedType, _, parseErr := mime.ParseMediaType(mediaType); parseErr == nil {
		mediaType = parsedType
	}
	detected := http.DetectContentType(data)
	if mediaType == "" || mediaType == "application/octet-stream" {
		mediaType = detected
	}
	allowed := map[string]bool{
		"application/pdf": true,
		"image/jpeg":      true,
		"image/png":       true,
		"image/webp":      true,
		"audio/webm":      true,
		"audio/ogg":       true,
		"audio/mp4":       true,
		"audio/mpeg":      true,
		"audio/wav":       true,
		"audio/x-wav":     true,
	}
	if !allowed[mediaType] || (mediaType == "application/pdf" && detected != "application/pdf") {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "only PDF, image, and supported audio attachments are allowed"})
		return
	}
	attachment, err := h.preparation.AddAttachment(r.Context(), AttachmentInput{
		Filename:  header.Filename,
		MediaType: mediaType,
		Data:      data,
	})
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"attachment":        attachment.AttachmentReference,
		"candidate_profile": candidateProfileView(h.tools.State().CandidateProfile),
	})
}

func (h *HTTPHandler) linkMessageAttachment(w http.ResponseWriter, r *http.Request) {
	var request struct {
		AttachmentID string `json:"attachment_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil || strings.TrimSpace(request.AttachmentID) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "attachment_id is required"})
		return
	}
	attachments, err := h.tools.Attachments([]string{request.AttachmentID})
	if err != nil || len(attachments) != 1 {
		h.writeError(w, ErrNotFound)
		return
	}
	message, err := h.store.LinkMessageAttachment(
		r.Context(), r.PathValue("message_id"), attachments[0].AttachmentReference,
	)
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": message})
}

func (h *HTTPHandler) getAttachmentContent(w http.ResponseWriter, r *http.Request) {
	data, name, mediaType, err := h.preparation.AttachmentContent(r.PathValue("attachment_id"))
	if err != nil {
		h.writeError(w, err)
		return
	}
	disposition := mime.FormatMediaType("inline", map[string]string{"filename": name})
	w.Header().Set("Content-Type", mediaType)
	w.Header().Set("Content-Disposition", disposition)
	w.Header().Set("Content-Length", fmt.Sprint(len(data)))
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func (h *HTTPHandler) deleteAttachment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("attachment_id")
	messages, err := h.store.ListMessages(r.Context(), DemoThreadID)
	if err != nil {
		h.writeError(w, err)
		return
	}
	for _, message := range messages {
		for _, attachment := range message.Attachments {
			if attachment.ID == id {
				h.writeError(w, ErrAttachmentInUse)
				return
			}
		}
	}
	if err := h.preparation.DeleteAttachment(id); err != nil {
		h.writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *HTTPHandler) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":   "ok",
		"module":   "assistant",
		"runtime":  "go",
		"provider": "dashscope",
		"models":   h.models,
	})
}

func (h *HTTPHandler) listConversationArchives(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"items": h.store.ListConversationArchives()})
}

func (h *HTTPHandler) getConversationArchive(w http.ResponseWriter, r *http.Request) {
	archive, err := h.store.GetConversationArchive(r.PathValue("conversation_id"))
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, archive)
}

func (h *HTTPHandler) deleteConversationArchive(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("conversation_id")
	archive, err := h.store.GetConversationArchive(id)
	if err != nil {
		h.writeError(w, err)
		return
	}
	if err := h.store.DeleteConversationArchive(id); err != nil {
		h.writeError(w, err)
		return
	}
	referenced := map[string]bool{}
	currentMessages, _ := h.store.ListMessages(r.Context(), DemoThreadID)
	markReferencedAttachments(referenced, currentMessages)
	for _, summary := range h.store.ListConversationArchives() {
		remaining, getErr := h.store.GetConversationArchive(summary.ID)
		if getErr == nil {
			markReferencedAttachments(referenced, remaining.Messages)
		}
	}
	for _, message := range archive.Messages {
		for _, attachment := range message.Attachments {
			if referenced[attachment.ID] {
				continue
			}
			if deleteErr := h.preparation.DeleteAttachment(attachment.ID); deleteErr != nil && !errors.Is(deleteErr, ErrNotFound) && !errors.Is(deleteErr, ErrAttachmentInUse) {
				h.logger.Printf("delete archived attachment %s: %v", attachment.ID, deleteErr)
			}
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func markReferencedAttachments(target map[string]bool, messages []AssistantMessage) {
	for _, message := range messages {
		for _, attachment := range message.Attachments {
			target[attachment.ID] = true
		}
	}
}

func (h *HTTPHandler) getThread(w http.ResponseWriter, r *http.Request) {
	actor := r.URL.Query().Get("actor_user_id")
	if actor == "" {
		actor = DemoUserID
	}
	if _, err := h.service.GetThread(r.Context(), GetThreadQuery{
		ActorUserID: actor,
		ThreadID:    r.PathValue("thread_id"),
	}); err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, h.store.Snapshot(h.tools.State()))
}

func (h *HTTPHandler) startTask(w http.ResponseWriter, r *http.Request) {
	var request startTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid JSON body"})
		return
	}
	run, err := h.service.StartTask(r.Context(), StartTaskCommand{
		ActorUserID:     request.ActorUserID,
		ThreadID:        r.PathValue("thread_id"),
		UserMessage:     request.UserMessage,
		AttachmentIDs:   request.AttachmentIDs,
		IdempotencyKey:  request.IdempotencyKey,
		InteractionMode: request.InteractionMode,
		ClientMessageID: request.ClientMessageID,
		LiveSessionID:   request.LiveSessionID,
		TurnID:          request.TurnID,
		Mode:            request.Mode,
	})
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"task_run": run,
		"snapshot": h.store.Snapshot(h.tools.State()),
	})
}

func (h *HTTPHandler) streamTask(w http.ResponseWriter, r *http.Request) {
	var request startTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid JSON body"})
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "streaming is not supported"})
		return
	}
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	_ = writeSSE(w, "task.started", map[string]any{"thread_id": r.PathValue("thread_id")})
	flusher.Flush()

	ctx := r.Context()
	if request.ClientMessageID != "" &&
		request.LiveSessionID != "" &&
		request.TurnID != "" &&
		request.Mode.Valid() {
		ctx = WithCanonicalUserMessageWriter(ctx, func(message AssistantMessage) error {
			event := LiveEvent{
				Type: LiveEventTurnUserCommitted, ThreadID: r.PathValue("thread_id"),
				LiveSessionID: request.LiveSessionID, TurnID: request.TurnID,
				ClientMessageID: request.ClientMessageID, Mode: request.Mode,
				OccurredAt: time.Now().UTC(), Sequence: 1, Message: &message,
			}
			if err := writeSSE(w, string(LiveEventTurnUserCommitted), event); err != nil {
				return err
			}
			flusher.Flush()
			return nil
		})
	}
	ctx = WithTextDeltaWriter(ctx, func(delta string) error {
		if err := writeSSE(w, "assistant.delta", map[string]any{"delta": delta}); err != nil {
			return err
		}
		flusher.Flush()
		return nil
	})
	run, err := h.service.StartTask(ctx, StartTaskCommand{
		ActorUserID:     request.ActorUserID,
		ThreadID:        r.PathValue("thread_id"),
		UserMessage:     request.UserMessage,
		AttachmentIDs:   request.AttachmentIDs,
		IdempotencyKey:  request.IdempotencyKey,
		InteractionMode: request.InteractionMode,
		ClientMessageID: request.ClientMessageID,
		LiveSessionID:   request.LiveSessionID,
		TurnID:          request.TurnID,
		Mode:            request.Mode,
	})
	if err != nil {
		h.logger.Printf("assistant stream failed: %v", err)
		payload := map[string]any{"error": err.Error()}
		var limitError ContextLimitError
		if errors.As(err, &limitError) {
			payload["code"] = "context_limit_exceeded"
			payload["token_count"] = limitError.TokenCount
			payload["token_limit"] = limitError.TokenLimit
		}
		_ = writeSSE(w, "task.failed", payload)
		flusher.Flush()
		return
	}
	_ = writeSSE(w, "task.completed", map[string]any{
		"task_run": run,
		"snapshot": h.store.Snapshot(h.tools.State()),
	})
	flusher.Flush()
}

func (h *HTTPHandler) streamEndInterview(w http.ResponseWriter, r *http.Request) {
	var request endInterviewRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid JSON body"})
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "streaming is not supported"})
		return
	}
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	_ = writeSSE(w, "task.started", map[string]any{"thread_id": r.PathValue("thread_id")})
	flusher.Flush()

	ctx := WithTextDeltaWriter(r.Context(), func(delta string) error {
		if err := writeSSE(w, "assistant.delta", map[string]any{"delta": delta}); err != nil {
			return err
		}
		flusher.Flush()
		return nil
	})
	run, err := h.service.EndInterview(ctx, EndInterviewCommand{
		ActorUserID:    request.ActorUserID,
		ThreadID:       r.PathValue("thread_id"),
		Reason:         request.Reason,
		IdempotencyKey: request.IdempotencyKey,
	})
	if err != nil {
		h.logger.Printf("end interview stream failed: %v", err)
		_ = writeSSE(w, "task.failed", map[string]any{"error": err.Error()})
		flusher.Flush()
		return
	}
	_ = writeSSE(w, "task.completed", map[string]any{
		"task_run": run,
		"snapshot": h.store.Snapshot(h.tools.State()),
	})
	flusher.Flush()
}

func (h *HTTPHandler) resumeTask(w http.ResponseWriter, r *http.Request) {
	var request struct {
		ActorUserID string `json:"actor_user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid JSON body"})
		return
	}
	run, err := h.service.ResumeTask(r.Context(), ResumeTaskCommand{
		ActorUserID: request.ActorUserID,
		TaskRunID:   r.PathValue("task_run_id"),
	})
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"task_run": run,
		"snapshot": h.store.Snapshot(h.tools.State()),
	})
}

func (h *HTTPHandler) rejectTask(w http.ResponseWriter, r *http.Request) {
	var request struct {
		ActorUserID string `json:"actor_user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid JSON body"})
		return
	}
	run, err := h.service.RejectTask(r.Context(), request.ActorUserID, r.PathValue("task_run_id"))
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"task_run": run,
		"snapshot": h.store.Snapshot(h.tools.State()),
	})
}

func (h *HTTPHandler) reset(w http.ResponseWriter, _ *http.Request) {
	h.service.ResetDemo()
	writeJSON(w, http.StatusOK, h.store.Snapshot(h.tools.State()))
}

func (h *HTTPHandler) transcribe(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 8<<20)
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "audio upload must be multipart and smaller than 8 MB"})
		return
	}
	file, header, err := r.FormFile("audio")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "multipart field audio is required"})
		return
	}
	defer file.Close()
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "audio/wav"
	}
	transcript, err := h.transcriber.Transcribe(r.Context(), file, contentType)
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"text": transcript.Text})
}

var transcriptionUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		return origin == "" ||
			origin == "http://localhost:3000" ||
			origin == "http://127.0.0.1:3000" ||
			origin == "http://localhost:3001" ||
			origin == "http://127.0.0.1:3001"
	},
}

func (h *HTTPHandler) streamTranscription(w http.ResponseWriter, r *http.Request) {
	streamer, ok := h.transcriber.(RealtimeTranscriber)
	if !ok {
		writeJSON(w, http.StatusNotImplemented, map[string]any{"error": "realtime transcription is not configured"})
		return
	}
	connection, err := transcriptionUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer connection.Close()
	reader, writer := io.Pipe()
	defer reader.Close()
	readDone := make(chan struct{})
	go func() {
		defer close(readDone)
		defer writer.Close()
		var received int64
		for {
			messageType, data, readErr := connection.ReadMessage()
			if readErr != nil {
				return
			}
			if messageType == websocket.TextMessage {
				var event struct {
					Type string `json:"type"`
				}
				if json.Unmarshal(data, &event) == nil && event.Type == "stop" {
					return
				}
				continue
			}
			if messageType != websocket.BinaryMessage || len(data) == 0 {
				continue
			}
			received += int64(len(data))
			if received > 8<<20 {
				_ = writer.CloseWithError(errors.New("realtime audio exceeds 8 MB"))
				return
			}
			if _, writeErr := writer.Write(data); writeErr != nil {
				return
			}
		}
	}()
	transcript, err := streamer.StreamTranscribePCM(r.Context(), reader, func(update TranscriptUpdate) error {
		eventType := "transcript.delta"
		if update.Completed {
			eventType = "transcript.completed"
		}
		return connection.WriteJSON(map[string]any{"type": eventType, "text": update.Text})
	})
	if err != nil {
		h.logger.Printf("realtime transcription failed: %v", err)
		_ = connection.WriteJSON(map[string]any{"type": "transcription.error", "error": err.Error()})
		return
	}
	_ = connection.WriteJSON(map[string]any{"type": "transcription.done", "text": transcript.Text})
	<-readDone
}

func (h *HTTPHandler) synthesize(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Text  string  `json:"text"`
		Voice *string `json:"voice,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid JSON body"})
		return
	}
	if strings.TrimSpace(request.Text) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "text is required"})
		return
	}
	if streamer, ok := h.synthesizer.(StreamingSpeechSynthesizer); ok {
		flusher, canFlush := w.(http.Flusher)
		started := false
		err := streamer.StreamSynthesize(r.Context(), request.Text, request.Voice, func(chunk []byte) error {
			if !started {
				w.Header().Set("Content-Type", "audio/mpeg")
				w.Header().Set("Cache-Control", "no-store, no-transform")
				w.Header().Set("X-Accel-Buffering", "no")
				w.WriteHeader(http.StatusOK)
				started = true
			}
			if _, err := w.Write(chunk); err != nil {
				return err
			}
			if canFlush {
				flusher.Flush()
			}
			return nil
		})
		if err != nil {
			if !started {
				h.writeError(w, err)
			} else {
				h.logger.Printf("stream TTS audio: %v", err)
			}
		}
		return
	}
	audio, err := h.synthesizer.Synthesize(r.Context(), request.Text, request.Voice)
	if err != nil {
		h.writeError(w, err)
		return
	}
	defer audio.Content.Close()
	w.Header().Set("Content-Type", audio.ContentType)
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	if _, err := io.Copy(w, audio.Content); err != nil {
		h.logger.Printf("stream TTS audio: %v", err)
	}
}

func writeSSE(w io.Writer, event string, value any) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	_, err = io.WriteString(w, "event: "+event+"\ndata: "+string(data)+"\n\n")
	return err
}

func (h *HTTPHandler) writeError(w http.ResponseWriter, err error) {
	h.logger.Printf("assistant request failed: %v", err)
	status := http.StatusInternalServerError
	if errors.Is(err, ErrNotFound) {
		status = http.StatusNotFound
	} else if errors.Is(err, ErrLiveVoiceUnavailable) {
		status = http.StatusServiceUnavailable
	} else if errors.Is(err, ErrForbidden) {
		status = http.StatusForbidden
	} else if errors.Is(err, ErrInvalidTaskRunState) || errors.Is(err, ErrNoPendingConfirm) {
		status = http.StatusConflict
	} else if errors.Is(err, ErrResumeLimit) {
		status = http.StatusConflict
	} else if errors.Is(err, ErrNotResume) {
		status = http.StatusUnprocessableEntity
	} else if errors.Is(err, ErrInvalidResumeProfile) {
		status = http.StatusBadRequest
	} else if errors.Is(err, ErrAttachmentInUse) {
		status = http.StatusConflict
	} else if errors.Is(err, ErrActiveInterview) {
		status = http.StatusConflict
	} else if errors.Is(err, ErrNoActiveQuestion) {
		status = http.StatusBadRequest
	}
	payload := map[string]any{"error": err.Error()}
	var limitError ContextLimitError
	if errors.As(err, &limitError) {
		status = http.StatusConflict
		payload["code"] = "context_limit_exceeded"
		payload["token_count"] = limitError.TokenCount
		payload["token_limit"] = limitError.TokenLimit
	}
	writeJSON(w, status, payload)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
