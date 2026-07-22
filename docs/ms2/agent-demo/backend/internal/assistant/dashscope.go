package assistant

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

type DashScopeConfig struct {
	APIKey            string
	WorkspaceID       string
	CompatibleBaseURL string
	DashScopeBaseURL  string
	ASRWebSocketURL   string
	TTSWebSocketURL   string
	ChatModel         string
	EmbeddingModel    string
	DocumentModel     string
	ASRModel          string
	TTSModel          string
	TTSVoice          string
}

func LoadDashScopeConfig() (DashScopeConfig, error) {
	config := DashScopeConfig{
		APIKey:            strings.TrimSpace(os.Getenv("DASHSCOPE_API_KEY")),
		WorkspaceID:       strings.TrimSpace(os.Getenv("DASHSCOPE_WORKSPACE_ID")),
		CompatibleBaseURL: strings.TrimRight(strings.TrimSpace(os.Getenv("DASHSCOPE_COMPATIBLE_BASE_URL")), "/"),
		DashScopeBaseURL:  strings.TrimRight(strings.TrimSpace(os.Getenv("DASHSCOPE_API_BASE_URL")), "/"),
		ASRWebSocketURL:   strings.TrimRight(strings.TrimSpace(os.Getenv("DASHSCOPE_ASR_WEBSOCKET_URL")), "/"),
		TTSWebSocketURL:   strings.TrimRight(strings.TrimSpace(os.Getenv("DASHSCOPE_TTS_WEBSOCKET_URL")), "/"),
		ChatModel:         envOrDefault("DASHSCOPE_CHAT_MODEL", "qwen3.5-flash"),
		EmbeddingModel:    envOrDefault("DASHSCOPE_EMBEDDING_MODEL", "text-embedding-v4"),
		DocumentModel:     envOrDefault("DASHSCOPE_DOCUMENT_MODEL", "qwen-long"),
		ASRModel:          envOrDefault("DASHSCOPE_ASR_MODEL", "qwen3-asr-flash-realtime"),
		TTSModel:          envOrDefault("DASHSCOPE_TTS_MODEL", "qwen-audio-3.0-tts-flash"),
		TTSVoice:          envOrDefault("DASHSCOPE_TTS_VOICE", "longanlingxi"),
	}
	if config.APIKey == "" {
		return DashScopeConfig{}, errors.New("DASHSCOPE_API_KEY is required")
	}
	httpHost := "https://dashscope.aliyuncs.com"
	webSocketHost := "wss://dashscope.aliyuncs.com"
	if config.WorkspaceID != "" {
		httpHost = fmt.Sprintf("https://%s.cn-beijing.maas.aliyuncs.com", config.WorkspaceID)
		webSocketHost = fmt.Sprintf("wss://%s.cn-beijing.maas.aliyuncs.com", config.WorkspaceID)
	}
	if config.CompatibleBaseURL == "" {
		config.CompatibleBaseURL = httpHost + "/compatible-mode/v1"
	}
	if config.DashScopeBaseURL == "" {
		config.DashScopeBaseURL = httpHost + "/api/v1"
	}
	if config.ASRWebSocketURL == "" {
		config.ASRWebSocketURL = webSocketHost + "/api-ws/v1/realtime"
	}
	if config.TTSWebSocketURL == "" {
		config.TTSWebSocketURL = webSocketHost + "/api-ws/v1/inference"
	}
	return config, nil
}

type DashScopeProvider struct {
	config DashScopeConfig
	client *http.Client
	dialer *websocket.Dialer
}

const (
	plannerMaxTokens      = 512
	conversationMaxTokens = 160
	questionMaxTokens     = 96
	feedbackMaxTokens     = 240
	answerCoachMaxTokens  = 600
	profileMaxTokens      = 600
	attachmentMaxTokens   = 5000
)

func NewDashScopeProvider(config DashScopeConfig) *DashScopeProvider {
	return &DashScopeProvider{
		config: config,
		client: &http.Client{Timeout: 90 * time.Second},
		dialer: websocket.DefaultDialer,
	}
}

func (p *DashScopeProvider) Plan(ctx context.Context, request PlanRequest) (Plan, error) {
	if len(request.Messages) == 0 {
		return Plan{}, errors.New("planner requires the complete ordered thread messages")
	}
	transcript, err := json.Marshal(request.Messages)
	if err != nil {
		return Plan{}, fmt.Errorf("encode planner conversation context: %w", err)
	}
	system := `You are the planner for SpeakUp, an English interview practice application.
Return one JSON object only, without markdown:
{"Intent":"intent_name","Steps":[{"ToolName":"tool.name","Arguments":{}}]}

	Allowed plans:
	1. Normal free conversation (default whenever the user is not explicitly asking to start an interview, and no interview session is active):
	{"Intent":"free_conversation","Steps":[
	{"ToolName":"conversation.generate_reply","Arguments":{}}
	]}
	2. If the user asks for an interview but the complete conversation does not contain a specific target role, ask for it first:
{"Intent":"clarify_interview_requirements","Steps":[
{"ToolName":"conversation.generate_reply","Arguments":{}}
]}
If operational state contains interview_requirement=pending_target_role, treat the user's next role or job-direction answer as continuation of the interview request, even when that message does not repeat the word interview.
	3. Start interview only after a specific target role is present in the current message or earlier conversation:
{"Intent":"start_mock_interview","Steps":[
{"ToolName":"preparation.get_confirmed_context","Arguments":{"scenario":"PROGRAMMER_INTERVIEW"}},
{"ToolName":"practice.create_plan","Arguments":{"role":"infer the target role from the user message; default to Software Engineer","max_turns":10,"duration_minutes":15}},
{"ToolName":"practice.start_session","Arguments":{}},
{"ToolName":"conversation.generate_next_question","Arguments":{}}
]}
Use max_turns=10 and duration_minutes=15 by default. If the user explicitly requests limits, copy them within 3-20 turns and 5-60 minutes. Never use a generic default role when the role is missing; use clarify_interview_requirements instead.
	4. Submit an answer while session_in_progress=true:
{"Intent":"submit_interview_answer","Steps":[
{"ToolName":"conversation.submit_turn","Arguments":{"answer_text":"copy the user message exactly","interaction_mode":"TEXT"}},
{"ToolName":"practice.apply_turn_outcome","Arguments":{"answer_validity":"VALID"}},
{"ToolName":"conversation.generate_next_question","Arguments":{}}
]}
The server enforces the time and turn limits and may replace the last step with review.generate_feedback.
	5. View history: Intent view_practice_history, one review.list_history step.
	6. Review: Intent review_latest_practice, one review.generate_feedback step.
	The role argument must reflect the user's requested job, for example Product Manager, Frontend Engineer, or Go Backend Engineer. Do not force every interview to Go backend.
	Interaction mode is an authoritative UI signal. When interaction_mode=conversation, never use submit_interview_answer even if an unfinished interview exists. When interaction_mode=interview and a session is active, use submit_interview_answer.
	Greetings, questions, English practice, technical discussion, and all other messages use free_conversation.
	Never invent tools.`
	content, err := p.chat(ctx, system, fmt.Sprintf(
		"Operational state:\n%s\nInteraction mode: %s\n\nComplete ordered thread messages (JSON):\n%s\n\nThe final user message to plan:\n%s",
		request.ContextSummary,
		request.InteractionMode,
		transcript,
		request.UserMessage,
	), false, false, plannerMaxTokens)
	if err != nil {
		return Plan{}, err
	}
	var plan Plan
	if err := json.Unmarshal([]byte(stripJSONFence(content)), &plan); err != nil {
		return Plan{}, fmt.Errorf("decode planner JSON: %w", err)
	}
	if err := validatePlan(plan); err != nil {
		return Plan{}, err
	}
	return plan, nil
}

func (p *DashScopeProvider) GenerateQuestion(ctx context.Context, input InterviewGenerationInput) (string, error) {
	role := strings.TrimSpace(input.TargetRole)
	if role == "" {
		role = "Software Engineer"
	}
	answers, _ := json.Marshal(input.Answers)
	questions, _ := json.Marshal(input.PreviousQuestions)
	profile, _ := json.Marshal(candidateProfilePrompt(input.CandidateProfile))
	return p.chat(ctx,
		fmt.Sprintf("You are a senior hiring manager conducting a realistic continuous English interview for a %s. Ask exactly one concise question in English. Follow up naturally on the candidate's latest answer when useful, otherwise advance to another relevant competency. Never use a fixed question bank, repeat a previous question, add commentary, or add numbering.", role),
		fmt.Sprintf("Target role: %s\nUpcoming answer turn: %d of at most %d\nSession duration: %d minutes\nConfirmed candidate and JD background: %s\nPrevious questions: %s\nCandidate answers in matching order: %s\nAsk the single best next interview question based on this dialogue and the confirmed background. Never invent resume facts.",
			role,
			input.CompletedQuestionCount+1,
			input.MaxTurns,
			input.DurationMinutes,
			profile,
			questions,
			answers,
		),
		false,
		true,
		questionMaxTokens,
	)
}

func (p *DashScopeProvider) GenerateFeedback(ctx context.Context, input InterviewFeedbackInput) (string, error) {
	answers, _ := json.Marshal(input.Answers)
	profile, _ := json.Marshal(candidateProfilePrompt(input.CandidateProfile))
	return p.chat(ctx,
		"You are an English interview coach. Give concise Chinese feedback grounded in the supplied English answers. Mention one strength, two improvements, and one example improved sentence. Do not invent evidence.",
		fmt.Sprintf("Target role: %s\nCompleted turns: %d of at most %d\nSession duration: %d minutes\nConfirmed candidate and JD background: %s\nAnswers: %s", input.TargetRole, input.CompletedQuestionCount, input.MaxTurns, input.DurationMinutes, profile, answers),
		true,
		true,
		feedbackMaxTokens,
	)
}

func (p *DashScopeProvider) GenerateAnswerCoach(ctx context.Context, input AnswerCoachInput) (string, error) {
	question := strings.TrimSpace(input.Question)
	if question == "" {
		return "", ErrNoActiveQuestion
	}
	profile, _ := json.Marshal(candidateProfilePrompt(input.CandidateProfile))
	answers, _ := json.Marshal(input.PreviousAnswers)
	return p.chat(ctx,
		`You are an English interview answer coach. Write one complete, natural English answer that the candidate can read aloud verbatim. Answer the current question directly and make the level of detail fit the question. Use only facts found in the confirmed candidate background or prior answers. When specific personal evidence is unavailable, use truthful general reasoning without inventing employers, projects, metrics, credentials, or achievements. Return only the answer itself, with no markdown, headings, placeholders, brackets, alternatives, coaching commentary, or word-count target.`,
		fmt.Sprintf("Target role: %s\nCurrent interview question: %s\nConfirmed candidate background: %s\nPrior answers in this interview: %s", strings.TrimSpace(input.TargetRole), question, profile, answers),
		false,
		true,
		answerCoachMaxTokens,
	)
}

func (p *DashScopeProvider) AnalyzeCandidateProfile(ctx context.Context, input CandidateProfileInput) (CandidateProfile, error) {
	resumeText := compactText(input.ResumeText, 24000)
	jobDescription := compactText(input.JobDescription, 12000)
	content, err := p.chat(ctx,
		`You extract a candidate background for interview planning. Return exactly one JSON object without markdown:
{"candidateName":"","headline":"","summary":"","skills":[""],"experiences":[""]}
Use only facts present in the supplied resume and job description. Keep summary under 120 Chinese characters, at most 12 skills, and at most 8 concise experience evidence items. Empty or unknown fields must stay empty; never fabricate facts.`,
		fmt.Sprintf("Resume filename: %s\nTarget job title: %s\nJob description:\n%s\n\nResume text:\n%s", input.ResumeName, input.JobTitle, jobDescription, resumeText),
		false,
		false,
		profileMaxTokens,
	)
	if err != nil {
		return CandidateProfile{}, err
	}
	var profile CandidateProfile
	if err := json.Unmarshal([]byte(stripJSONFence(content)), &profile); err != nil {
		return CandidateProfile{}, fmt.Errorf("decode candidate profile JSON: %w", err)
	}
	profile.ID = fmt.Sprintf("background-%d", time.Now().UTC().UnixNano())
	return profile, nil
}

func (p *DashScopeProvider) AnalyzeAttachment(ctx context.Context, input AttachmentInput) (AttachmentAnalysis, error) {
	if len(input.Data) == 0 {
		return AttachmentAnalysis{}, errors.New("attachment is empty")
	}
	if input.MediaType == "application/pdf" {
		return p.analyzePDFAttachment(ctx, input)
	}
	if !strings.HasPrefix(input.MediaType, "image/") {
		return AttachmentAnalysis{}, fmt.Errorf("unsupported attachment media type %s", input.MediaType)
	}
	dataURL := "data:" + input.MediaType + ";base64," + base64.StdEncoding.EncodeToString(input.Data)
	payload := map[string]any{
		"model": p.config.ChatModel,
		"messages": []any{
			map[string]any{
				"role":    "system",
				"content": `You are SpeakUp's attachment understanding component. Inspect the image itself. Return exactly one JSON object without markdown: {"kind":"image|resume","isResume":false,"summary":"","extractedText":""}. Set isResume=true and kind=resume only when the image is clearly a resume/CV. summary must be a concise Chinese description grounded only in the image. extractedText must contain all legible text needed for later conversation and resume analysis; do not invent obscured text.`,
			},
			map[string]any{
				"role": "user",
				"content": []any{
					map[string]any{"type": "image_url", "image_url": map[string]any{"url": dataURL}},
					map[string]any{"type": "text", "text": "文件名：" + input.Filename + "。请理解这张图片并按指定 JSON 返回。"},
				},
			},
		},
		"enable_thinking": false,
		"stream":          false,
		"temperature":     0.1,
		"max_tokens":      attachmentMaxTokens,
	}
	return p.decodeAttachmentAnalysis(ctx, payload)
}

func (p *DashScopeProvider) analyzePDFAttachment(ctx context.Context, input AttachmentInput) (AttachmentAnalysis, error) {
	fileID, err := p.uploadFileForExtraction(ctx, input)
	if err != nil {
		return AttachmentAnalysis{}, err
	}
	defer p.deleteExtractedFile(fileID)
	if err := p.waitForExtractedFile(ctx, fileID); err != nil {
		return AttachmentAnalysis{}, err
	}
	payload := map[string]any{
		"model": p.config.DocumentModel,
		"messages": []any{
			map[string]any{"role": "system", "content": `You are SpeakUp's PDF understanding component. Return exactly one JSON object without markdown: {"kind":"document|resume","isResume":false,"summary":"","extractedText":""}. Set isResume=true and kind=resume only when the PDF is clearly a resume/CV. summary must be a concise Chinese description grounded only in the PDF. extractedText must faithfully preserve all text needed for later conversation and resume analysis, including names, dates, skills, education, employers, projects, metrics, and contact-free professional facts. Never fabricate missing content.`},
			map[string]any{"role": "system", "content": "fileid://" + fileID},
			map[string]any{"role": "user", "content": "文件名：" + input.Filename + "。请完整理解这份 PDF 并按指定 JSON 返回。"},
		},
		"stream":      false,
		"temperature": 0.1,
		"max_tokens":  attachmentMaxTokens,
	}
	return p.decodeAttachmentAnalysis(ctx, payload)
}

func (p *DashScopeProvider) decodeAttachmentAnalysis(ctx context.Context, payload map[string]any) (AttachmentAnalysis, error) {
	var response chatCompletionResponse
	if err := p.postJSON(ctx, p.config.CompatibleBaseURL+"/chat/completions", payload, &response); err != nil {
		return AttachmentAnalysis{}, err
	}
	content, err := response.content()
	if err != nil {
		return AttachmentAnalysis{}, err
	}
	var analysis AttachmentAnalysis
	if err := json.Unmarshal([]byte(stripJSONFence(content)), &analysis); err != nil {
		return AttachmentAnalysis{}, fmt.Errorf("decode attachment analysis JSON: %w", err)
	}
	analysis.Kind = strings.TrimSpace(analysis.Kind)
	analysis.Summary = strings.TrimSpace(analysis.Summary)
	analysis.ExtractedText = strings.TrimSpace(analysis.ExtractedText)
	if analysis.Kind == "" || analysis.Summary == "" {
		return AttachmentAnalysis{}, errors.New("DashScope attachment analysis is incomplete")
	}
	return analysis, nil
}

func (p *DashScopeProvider) uploadFileForExtraction(ctx context.Context, input AttachmentInput) (string, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", input.Filename)
	if err != nil {
		return "", err
	}
	if _, err := part.Write(input.Data); err != nil {
		return "", err
	}
	if err := writer.WriteField("purpose", "file-extract"); err != nil {
		return "", err
	}
	if err := writer.Close(); err != nil {
		return "", err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, p.config.CompatibleBaseURL+"/files", &body)
	if err != nil {
		return "", err
	}
	request.Header.Set("Authorization", "Bearer "+p.config.APIKey)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response, err := p.client.Do(request)
	if err != nil {
		return "", fmt.Errorf("upload PDF to DashScope: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		errorBody, _ := io.ReadAll(io.LimitReader(response.Body, 16<<10))
		return "", fmt.Errorf("DashScope file upload status %d: %s", response.StatusCode, strings.TrimSpace(string(errorBody)))
	}
	var result struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&result); err != nil {
		return "", fmt.Errorf("decode DashScope file upload: %w", err)
	}
	if strings.TrimSpace(result.ID) == "" {
		return "", errors.New("DashScope file upload did not return a file id")
	}
	return result.ID, nil
}

func (p *DashScopeProvider) waitForExtractedFile(ctx context.Context, fileID string) error {
	endpoint := p.config.CompatibleBaseURL + "/files/" + url.PathEscape(fileID)
	for attempt := 0; attempt < 30; attempt++ {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			return err
		}
		request.Header.Set("Authorization", "Bearer "+p.config.APIKey)
		response, err := p.client.Do(request)
		if err != nil {
			return fmt.Errorf("query DashScope file status: %w", err)
		}
		var result struct {
			Status        string `json:"status"`
			StatusDetails any    `json:"status_details"`
		}
		decodeErr := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&result)
		response.Body.Close()
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			return fmt.Errorf("DashScope file status query returned %d", response.StatusCode)
		}
		if decodeErr != nil {
			return fmt.Errorf("decode DashScope file status: %w", decodeErr)
		}
		switch result.Status {
		case "processed":
			return nil
		case "error":
			return fmt.Errorf("DashScope PDF parsing failed: %v", result.StatusDetails)
		case "uploaded", "processing":
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(time.Second):
			}
		default:
			return fmt.Errorf("DashScope returned unknown file status %q", result.Status)
		}
	}
	return errors.New("DashScope PDF parsing timed out")
}

func (p *DashScopeProvider) deleteExtractedFile(fileID string) {
	request, err := http.NewRequest(http.MethodDelete, p.config.CompatibleBaseURL+"/files/"+url.PathEscape(fileID), nil)
	if err != nil {
		return
	}
	request.Header.Set("Authorization", "Bearer "+p.config.APIKey)
	response, err := p.client.Do(request)
	if err == nil {
		response.Body.Close()
	}
}

func candidateProfilePrompt(profile CandidateProfile) map[string]any {
	if !profile.Configured() {
		return map[string]any{"configured": false}
	}
	return map[string]any{
		"configured":      true,
		"candidate_name":  profile.CandidateName,
		"headline":        profile.Headline,
		"summary":         profile.Summary,
		"skills":          profile.Skills,
		"experiences":     profile.Experiences,
		"job_title":       profile.JobTitle,
		"job_description": compactText(profile.JobDescription, 4000),
	}
}

func (p *DashScopeProvider) GenerateConversationReply(ctx context.Context, input ConversationReplyInput) (string, error) {
	if len(input.Messages) == 0 {
		return "", errors.New("conversation reply requires the complete ordered thread messages")
	}
	lastMessage := input.Messages[len(input.Messages)-1]
	if lastMessage.Role != "user" || strings.TrimSpace(lastMessage.Content) != strings.TrimSpace(input.UserMessage) {
		return "", errors.New("conversation context does not end with the current user message")
	}
	profile, err := json.Marshal(candidateProfilePrompt(input.CandidateProfile))
	if err != nil {
		return "", fmt.Errorf("encode candidate memory: %w", err)
	}
	system := `You are SpeakUp, a friendly bilingual conversation partner and English practice assistant.
The authoritative persistent context below may survive a new thread. Use it directly whenever it is relevant. If an earlier assistant message conflicts with persistent context, the earlier assistant message is wrong: correct it and answer from persistent context. Never claim information is missing when it appears in authoritative persistent context.
Respond naturally to the final user message. You MUST use the same language as the final user message unless that message explicitly requests another language.
You may discuss general topics, English learning, and software engineering.
Do not claim that an interview has started unless the orchestration layer has entered an interview session.
When operational state says interview_paused=true, answer only as a normal conversation partner. Do not continue the interview question, ask the user to answer it, or mention that the user should return to the interview.
Keep the response concise: at most 3 short sentences, no more than 120 Chinese characters for Chinese replies or 80 words for English replies. Do not add an unsolicited follow-up section.`
	authoritative := make([]string, 0, 2)
	dialogue := make([]any, 0, len(input.Messages)+1)
	for _, message := range input.Messages {
		role := strings.ToLower(strings.TrimSpace(message.Role))
		content := strings.TrimSpace(message.Content)
		if content == "" {
			continue
		}
		switch role {
		case "system":
			authoritative = append(authoritative, content)
		case "user", "assistant":
			dialogue = append(dialogue, map[string]any{"role": role, "content": content})
		default:
			return "", fmt.Errorf("unsupported conversation role %q", message.Role)
		}
	}
	system += fmt.Sprintf("\n\nOperational state (not conversational memory):\n%s\n\nPersistent candidate memory (JSON):\n%s", input.ContextSummary, profile)
	if len(authoritative) > 0 {
		system += "\n\nAuthoritative persistent context:\n" + strings.Join(authoritative, "\n\n")
	}
	messages := append([]any{map[string]any{"role": "system", "content": system}}, dialogue...)
	return p.chatMessages(ctx, messages, false, true, conversationMaxTokens)
}

func (p *DashScopeProvider) Transcribe(ctx context.Context, content io.Reader, contentType string) (TranscriptSnapshot, error) {
	audio, err := io.ReadAll(io.LimitReader(content, 8<<20))
	if err != nil {
		return TranscriptSnapshot{}, fmt.Errorf("read audio: %w", err)
	}
	if len(audio) == 0 {
		return TranscriptSnapshot{}, errors.New("audio is empty")
	}
	pcm, err := wavPCM16Mono16K(audio)
	if err != nil {
		return TranscriptSnapshot{}, err
	}
	endpoint, err := websocketEndpoint(p.config.ASRWebSocketURL, p.config.ASRModel)
	if err != nil {
		return TranscriptSnapshot{}, err
	}
	headers := http.Header{
		"Authorization": []string{"Bearer " + p.config.APIKey},
		"OpenAI-Beta":   []string{"realtime=v1"},
	}
	connection, response, err := p.dialer.DialContext(ctx, endpoint, headers)
	if err != nil {
		return TranscriptSnapshot{}, websocketDialError("ASR", err, response)
	}
	defer connection.Close()
	_ = connection.SetReadDeadline(time.Now().Add(90 * time.Second))
	_ = connection.SetWriteDeadline(time.Now().Add(30 * time.Second))

	if err := connection.WriteJSON(map[string]any{
		"event_id": eventID(),
		"type":     "session.update",
		"session": map[string]any{
			"modalities":         []string{"text"},
			"input_audio_format": "pcm",
			"sample_rate":        16000,
			"input_audio_transcription": map[string]any{
				"language": "en",
			},
			"turn_detection": nil,
		},
	}); err != nil {
		return TranscriptSnapshot{}, fmt.Errorf("initialize DashScope ASR: %w", err)
	}
	if err := waitForRealtimeEvent(connection, "session.updated"); err != nil {
		return TranscriptSnapshot{}, err
	}
	for start := 0; start < len(pcm); start += 3200 {
		end := min(start+3200, len(pcm))
		if err := connection.WriteJSON(map[string]any{
			"event_id": eventID(),
			"type":     "input_audio_buffer.append",
			"audio":    base64.StdEncoding.EncodeToString(pcm[start:end]),
		}); err != nil {
			return TranscriptSnapshot{}, fmt.Errorf("stream audio to DashScope ASR: %w", err)
		}
	}
	for _, eventType := range []string{"input_audio_buffer.commit", "session.finish"} {
		if err := connection.WriteJSON(map[string]any{"event_id": eventID(), "type": eventType}); err != nil {
			return TranscriptSnapshot{}, fmt.Errorf("finish DashScope ASR: %w", err)
		}
	}
	return readASRTranscript(connection)
}

func (p *DashScopeProvider) StreamTranscribePCM(
	ctx context.Context,
	pcm io.Reader,
	writeUpdate func(TranscriptUpdate) error,
) (TranscriptSnapshot, error) {
	endpoint, err := websocketEndpoint(p.config.ASRWebSocketURL, p.config.ASRModel)
	if err != nil {
		return TranscriptSnapshot{}, err
	}
	headers := http.Header{
		"Authorization": []string{"Bearer " + p.config.APIKey},
		"OpenAI-Beta":   []string{"realtime=v1"},
	}
	connection, response, err := p.dialer.DialContext(ctx, endpoint, headers)
	if err != nil {
		return TranscriptSnapshot{}, websocketDialError("ASR", err, response)
	}
	defer connection.Close()
	_ = connection.SetReadDeadline(time.Now().Add(10 * time.Minute))
	_ = connection.SetWriteDeadline(time.Now().Add(30 * time.Second))
	if err := connection.WriteJSON(asrSessionUpdate()); err != nil {
		return TranscriptSnapshot{}, fmt.Errorf("initialize DashScope ASR: %w", err)
	}
	if err := waitForRealtimeEvent(connection, "session.updated"); err != nil {
		return TranscriptSnapshot{}, err
	}

	done := make(chan TranscriptSnapshot, 1)
	readError := make(chan error, 1)
	go func() {
		var finalText strings.Builder
		for {
			var event realtimeEvent
			if err := connection.ReadJSON(&event); err != nil {
				readError <- fmt.Errorf("read DashScope ASR result: %w", err)
				return
			}
			switch event.Type {
			case "conversation.item.input_audio_transcription.delta":
				text := event.Delta
				if text == "" {
					text = event.Text
				}
				if text != "" {
					finalText.WriteString(text)
					if err := writeUpdate(TranscriptUpdate{Text: text}); err != nil {
						readError <- err
						return
					}
				}
			case "conversation.item.input_audio_transcription.completed":
				text := strings.TrimSpace(event.Transcript)
				if text == "" {
					text = strings.TrimSpace(finalText.String())
				}
				finalText.Reset()
				finalText.WriteString(text)
				if text != "" {
					if err := writeUpdate(TranscriptUpdate{Text: text, Completed: true}); err != nil {
						readError <- err
						return
					}
				}
			case "conversation.item.input_audio_transcription.failed", "error":
				readError <- realtimeEventError(event)
				return
			case "session.finished":
				text := strings.TrimSpace(finalText.String())
				if text == "" {
					readError <- errors.New("DashScope ASR returned an empty transcript")
					return
				}
				done <- TranscriptSnapshot{Text: text}
				return
			}
		}
	}()

	buffer := make([]byte, 3200)
	for {
		count, readErr := pcm.Read(buffer)
		if count > 0 {
			if err := connection.WriteJSON(map[string]any{
				"event_id": eventID(), "type": "input_audio_buffer.append",
				"audio": base64.StdEncoding.EncodeToString(buffer[:count]),
			}); err != nil {
				return TranscriptSnapshot{}, fmt.Errorf("stream audio to DashScope ASR: %w", err)
			}
		}
		if readErr != nil {
			if !errors.Is(readErr, io.EOF) {
				return TranscriptSnapshot{}, readErr
			}
			break
		}
	}
	for _, eventType := range []string{"input_audio_buffer.commit", "session.finish"} {
		if err := connection.WriteJSON(map[string]any{"event_id": eventID(), "type": eventType}); err != nil {
			return TranscriptSnapshot{}, fmt.Errorf("finish DashScope ASR: %w", err)
		}
	}
	select {
	case transcript := <-done:
		return transcript, nil
	case err := <-readError:
		return TranscriptSnapshot{}, err
	case <-ctx.Done():
		return TranscriptSnapshot{}, ctx.Err()
	}
}

func asrSessionUpdate() map[string]any {
	return map[string]any{
		"event_id": eventID(),
		"type":     "session.update",
		"session": map[string]any{
			"modalities":         []string{"text"},
			"input_audio_format": "pcm",
			"sample_rate":        16000,
			"input_audio_transcription": map[string]any{
				"language": "zh",
			},
			"turn_detection": nil,
		},
	}
}

func (p *DashScopeProvider) Synthesize(ctx context.Context, text string, voice *string) (GeneratedAudio, error) {
	var audio bytes.Buffer
	if err := p.StreamSynthesize(ctx, text, voice, func(chunk []byte) error {
		_, err := audio.Write(chunk)
		return err
	}); err != nil {
		return GeneratedAudio{}, err
	}
	return GeneratedAudio{
		Content:     io.NopCloser(bytes.NewReader(audio.Bytes())),
		ContentType: "audio/mpeg",
	}, nil
}

func (p *DashScopeProvider) StreamSynthesize(
	ctx context.Context,
	text string,
	voice *string,
	writeChunk func([]byte) error,
) error {
	if strings.TrimSpace(text) == "" {
		return errors.New("speech text is empty")
	}
	selectedVoice := p.config.TTSVoice
	if voice != nil && strings.TrimSpace(*voice) != "" {
		selectedVoice = strings.TrimSpace(*voice)
	}
	headers := http.Header{"Authorization": []string{"Bearer " + p.config.APIKey}}
	connection, response, err := p.dialer.DialContext(ctx, p.config.TTSWebSocketURL, headers)
	if err != nil {
		return websocketDialError("TTS", err, response)
	}
	defer connection.Close()
	_ = connection.SetReadDeadline(time.Now().Add(90 * time.Second))
	_ = connection.SetWriteDeadline(time.Now().Add(30 * time.Second))

	taskID := uuid()
	if err := connection.WriteJSON(map[string]any{
		"header": map[string]any{"action": "run-task", "task_id": taskID, "streaming": "duplex"},
		"payload": map[string]any{
			"task_group": "audio",
			"task":       "tts",
			"function":   "SpeechSynthesizer",
			"model":      p.config.TTSModel,
			"parameters": map[string]any{
				"text_type":   "PlainText",
				"voice":       selectedVoice,
				"format":      "mp3",
				"sample_rate": 22050,
				"volume":      50,
				"rate":        1.0,
				"pitch":       1.0,
				"enable_ssml": false,
			},
			"input": map[string]any{},
		},
	}); err != nil {
		return fmt.Errorf("start DashScope TTS: %w", err)
	}
	if err := waitForTaskEvent(connection, "task-started"); err != nil {
		return err
	}
	for _, message := range []map[string]any{
		{
			"header":  map[string]any{"action": "continue-task", "task_id": taskID, "streaming": "duplex"},
			"payload": map[string]any{"input": map[string]any{"text": text}},
		},
		{
			"header":  map[string]any{"action": "finish-task", "task_id": taskID, "streaming": "duplex"},
			"payload": map[string]any{"input": map[string]any{}},
		},
	} {
		if err := connection.WriteJSON(message); err != nil {
			return fmt.Errorf("send text to DashScope TTS: %w", err)
		}
	}
	hasAudio := false
	for {
		messageType, data, err := connection.ReadMessage()
		if err != nil {
			return fmt.Errorf("read DashScope TTS audio: %w", err)
		}
		if messageType == websocket.BinaryMessage {
			hasAudio = true
			if err := writeChunk(data); err != nil {
				return fmt.Errorf("stream DashScope TTS audio: %w", err)
			}
			continue
		}
		event, err := decodeTaskEvent(data)
		if err != nil {
			return err
		}
		switch event.Header.Event {
		case "task-finished":
			if !hasAudio {
				return errors.New("DashScope TTS returned no audio")
			}
			return nil
		case "task-failed":
			return taskEventError(event)
		}
	}
}

type realtimeEvent struct {
	Type       string `json:"type"`
	Transcript string `json:"transcript"`
	Delta      string `json:"delta"`
	Text       string `json:"text"`
	Error      struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func waitForRealtimeEvent(connection *websocket.Conn, expected string) error {
	for {
		var event realtimeEvent
		if err := connection.ReadJSON(&event); err != nil {
			return fmt.Errorf("read DashScope ASR event: %w", err)
		}
		if event.Type == expected {
			return nil
		}
		if event.Type == "error" || event.Type == "conversation.item.input_audio_transcription.failed" {
			return realtimeEventError(event)
		}
	}
}

func readASRTranscript(connection *websocket.Conn) (TranscriptSnapshot, error) {
	var transcript string
	for {
		var event realtimeEvent
		if err := connection.ReadJSON(&event); err != nil {
			return TranscriptSnapshot{}, fmt.Errorf("read DashScope ASR result: %w", err)
		}
		switch event.Type {
		case "conversation.item.input_audio_transcription.completed":
			transcript = strings.TrimSpace(event.Transcript)
		case "conversation.item.input_audio_transcription.failed", "error":
			return TranscriptSnapshot{}, realtimeEventError(event)
		case "session.finished":
			if transcript == "" {
				return TranscriptSnapshot{}, errors.New("DashScope ASR returned an empty transcript")
			}
			return TranscriptSnapshot{Text: transcript}, nil
		}
	}
}

func realtimeEventError(event realtimeEvent) error {
	message := strings.TrimSpace(event.Error.Message)
	if message == "" {
		message = "unknown error"
	}
	if event.Error.Code != "" {
		message = event.Error.Code + ": " + message
	}
	return fmt.Errorf("DashScope ASR %s: %s", event.Type, message)
}

type taskEvent struct {
	Header struct {
		Event     string `json:"event"`
		ErrorCode string `json:"error_code"`
		ErrorMsg  string `json:"error_message"`
	} `json:"header"`
}

func waitForTaskEvent(connection *websocket.Conn, expected string) error {
	for {
		messageType, data, err := connection.ReadMessage()
		if err != nil {
			return fmt.Errorf("read DashScope TTS event: %w", err)
		}
		if messageType != websocket.TextMessage {
			continue
		}
		event, err := decodeTaskEvent(data)
		if err != nil {
			return err
		}
		if event.Header.Event == expected {
			return nil
		}
		if event.Header.Event == "task-failed" {
			return taskEventError(event)
		}
	}
}

func decodeTaskEvent(data []byte) (taskEvent, error) {
	var event taskEvent
	if err := json.Unmarshal(data, &event); err != nil {
		return taskEvent{}, fmt.Errorf("decode DashScope TTS event: %w", err)
	}
	return event, nil
}

func taskEventError(event taskEvent) error {
	message := strings.TrimSpace(event.Header.ErrorMsg)
	if message == "" {
		message = "unknown error"
	}
	if event.Header.ErrorCode != "" {
		message = event.Header.ErrorCode + ": " + message
	}
	return fmt.Errorf("DashScope TTS task failed: %s", message)
}

func websocketEndpoint(base, model string) (string, error) {
	endpoint, err := url.Parse(base)
	if err != nil {
		return "", fmt.Errorf("invalid DashScope WebSocket URL: %w", err)
	}
	query := endpoint.Query()
	query.Set("model", model)
	endpoint.RawQuery = query.Encode()
	return endpoint.String(), nil
}

func websocketDialError(service string, err error, response *http.Response) error {
	if response == nil {
		return fmt.Errorf("connect to DashScope %s: %w", service, err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
	return fmt.Errorf("connect to DashScope %s: status %d: %s: %w",
		service, response.StatusCode, strings.TrimSpace(string(body)), err)
}

func wavPCM16Mono16K(wav []byte) ([]byte, error) {
	if len(wav) < 12 || string(wav[:4]) != "RIFF" || string(wav[8:12]) != "WAVE" {
		return nil, errors.New("ASR expects a RIFF/WAVE recording")
	}
	var formatFound bool
	var audioFormat, channels, bitsPerSample uint16
	var sampleRate uint32
	var pcm []byte
	for offset := 12; offset+8 <= len(wav); {
		chunkID := string(wav[offset : offset+4])
		chunkSize := int(binary.LittleEndian.Uint32(wav[offset+4 : offset+8]))
		start := offset + 8
		end := start + chunkSize
		if end > len(wav) {
			return nil, errors.New("WAV contains a truncated chunk")
		}
		switch chunkID {
		case "fmt ":
			if chunkSize < 16 {
				return nil, errors.New("WAV fmt chunk is too short")
			}
			audioFormat = binary.LittleEndian.Uint16(wav[start : start+2])
			channels = binary.LittleEndian.Uint16(wav[start+2 : start+4])
			sampleRate = binary.LittleEndian.Uint32(wav[start+4 : start+8])
			bitsPerSample = binary.LittleEndian.Uint16(wav[start+14 : start+16])
			formatFound = true
		case "data":
			pcm = wav[start:end]
		}
		offset = end + chunkSize%2
	}
	if !formatFound || len(pcm) == 0 {
		return nil, errors.New("WAV is missing fmt or audio data")
	}
	if audioFormat != 1 || channels != 1 || sampleRate != 16000 || bitsPerSample != 16 {
		return nil, fmt.Errorf("ASR expects PCM 16-bit mono 16 kHz WAV; got format=%d channels=%d rate=%d bits=%d",
			audioFormat, channels, sampleRate, bitsPerSample)
	}
	return pcm, nil
}

func eventID() string {
	return "event_" + strings.ReplaceAll(uuid(), "-", "")
}

func uuid() string {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	value[6] = (value[6] & 0x0f) | 0x40
	value[8] = (value[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		value[0:4], value[4:6], value[6:8], value[8:10], value[10:16])
}

func (p *DashScopeProvider) chat(
	ctx context.Context,
	system string,
	user string,
	thinking bool,
	allowStream bool,
	maxTokens int,
) (string, error) {
	return p.chatMessages(ctx, []any{
		map[string]any{"role": "system", "content": system},
		map[string]any{"role": "user", "content": user},
	}, thinking, allowStream, maxTokens)
}

func (p *DashScopeProvider) chatMessages(
	ctx context.Context,
	messages []any,
	thinking bool,
	allowStream bool,
	maxTokens int,
) (string, error) {
	payload := map[string]any{
		"model":           p.config.ChatModel,
		"messages":        messages,
		"enable_thinking": thinking,
		"stream":          allowStream && textDeltaWriterFromContext(ctx) != nil,
		"temperature":     0.2,
		"max_tokens":      maxTokens,
	}
	if payload["stream"] == true {
		return p.streamChat(ctx, payload, textDeltaWriterFromContext(ctx))
	}
	var response chatCompletionResponse
	if err := p.postJSON(ctx, p.config.CompatibleBaseURL+"/chat/completions", payload, &response); err != nil {
		return "", err
	}
	content, err := response.content()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(content), nil
}

func (p *DashScopeProvider) streamChat(
	ctx context.Context,
	payload map[string]any,
	writeDelta func(string) error,
) (string, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		p.config.CompatibleBaseURL+"/chat/completions",
		bytes.NewReader(body),
	)
	if err != nil {
		return "", err
	}
	request.Header.Set("Authorization", "Bearer "+p.config.APIKey)
	request.Header.Set("Content-Type", "application/json")
	response, err := p.client.Do(request)
	if err != nil {
		return "", fmt.Errorf("call DashScope: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		errorBody, _ := io.ReadAll(io.LimitReader(response.Body, 16<<10))
		return "", fmt.Errorf("DashScope status %d: %s", response.StatusCode, strings.TrimSpace(string(errorBody)))
	}

	var content strings.Builder
	scanner := bufio.NewScanner(response.Body)
	scanner.Buffer(make([]byte, 64<<10), 2<<20)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" || data == "[DONE]" {
			continue
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			return "", fmt.Errorf("decode DashScope stream chunk: %w", err)
		}
		if len(chunk.Choices) == 0 || chunk.Choices[0].Delta.Content == "" {
			continue
		}
		delta := chunk.Choices[0].Delta.Content
		content.WriteString(delta)
		if err := writeDelta(delta); err != nil {
			return "", err
		}
	}
	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("read DashScope stream: %w", err)
	}
	if strings.TrimSpace(content.String()) == "" {
		return "", errors.New("DashScope stream did not include message content")
	}
	return strings.TrimSpace(content.String()), nil
}

type chatCompletionResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

func (r chatCompletionResponse) content() (string, error) {
	if len(r.Choices) == 0 || strings.TrimSpace(r.Choices[0].Message.Content) == "" {
		return "", errors.New("DashScope response did not include message content")
	}
	return r.Choices[0].Message.Content, nil
}

func (p *DashScopeProvider) postJSON(ctx context.Context, endpoint string, payload any, target any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+p.config.APIKey)
	request.Header.Set("Content-Type", "application/json")
	response, err := p.client.Do(request)
	if err != nil {
		return fmt.Errorf("call DashScope: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		errorBody, _ := io.ReadAll(io.LimitReader(response.Body, 16<<10))
		return fmt.Errorf("DashScope status %d: %s", response.StatusCode, strings.TrimSpace(string(errorBody)))
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 4<<20)).Decode(target); err != nil {
		return fmt.Errorf("decode DashScope response: %w", err)
	}
	return nil
}

func validatePlan(plan Plan) error {
	allowed := map[string]bool{
		"preparation.get_confirmed_context":   true,
		"practice.create_plan":                true,
		"practice.start_session":              true,
		"conversation.generate_next_question": true,
		"conversation.submit_turn":            true,
		"conversation.generate_reply":         true,
		"practice.apply_turn_outcome":         true,
		"review.generate_feedback":            true,
		"review.list_history":                 true,
	}
	if plan.Intent == "" || len(plan.Steps) == 0 {
		return errors.New("planner returned an empty plan")
	}
	for _, step := range plan.Steps {
		if !allowed[step.ToolName] {
			return fmt.Errorf("planner returned unregistered tool %q", step.ToolName)
		}
	}
	expected := map[string][][]string{
		"free_conversation":              {{"conversation.generate_reply"}},
		"clarify_interview_requirements": {{"conversation.generate_reply"}},
		"start_mock_interview": {{
			"preparation.get_confirmed_context",
			"practice.create_plan",
			"practice.start_session",
			"conversation.generate_next_question",
		}},
		"submit_interview_answer": {
			{
				"conversation.submit_turn",
				"practice.apply_turn_outcome",
				"conversation.generate_next_question",
			},
			{
				"conversation.submit_turn",
				"practice.apply_turn_outcome",
				"review.generate_feedback",
			},
		},
		"view_practice_history":  {{"review.list_history"}},
		"review_latest_practice": {{"review.generate_feedback"}},
	}
	shapes, ok := expected[plan.Intent]
	if !ok {
		return fmt.Errorf("planner returned unsupported intent %q", plan.Intent)
	}
	for _, shape := range shapes {
		if len(shape) != len(plan.Steps) {
			continue
		}
		matches := true
		for index := range shape {
			if shape[index] != plan.Steps[index].ToolName {
				matches = false
				break
			}
		}
		if matches {
			return nil
		}
	}
	return fmt.Errorf("planner returned invalid step sequence for %q", plan.Intent)
}

func stripJSONFence(value string) string {
	value = strings.TrimSpace(value)
	value = strings.TrimPrefix(value, "```json")
	value = strings.TrimPrefix(value, "```")
	value = strings.TrimSuffix(value, "```")
	return strings.TrimSpace(value)
}

func envOrDefault(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}
