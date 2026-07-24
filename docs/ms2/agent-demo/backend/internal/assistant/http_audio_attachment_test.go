package assistant

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"path/filepath"
	"testing"
	"time"
)

func TestAudioAttachmentUploadPersistsPlayableRecording(t *testing.T) {
	tools, err := NewPersistentDemoState(nil, filepath.Join(t.TempDir(), "tool-state.json"))
	if err != nil {
		t.Fatal(err)
	}
	handler := NewHTTPHandler(
		log.New(io.Discard, "", 0),
		nil, NewMemoryConversationStore(), tools, tools,
		nil, nil, nil, nil, nil, nil,
	)
	mux := http.NewServeMux()
	handler.Register(mux)

	audio := []byte("demo-webm-audio")
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", `form-data; name="file"; filename="voice.webm"`)
	header.Set("Content-Type", "audio/webm;codecs=opus")
	part, err := writer.CreatePart(header)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(audio); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	request := httptest.NewRequest(http.MethodPost, "/v1/assistant/attachments", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("unexpected status: %d body=%s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		Attachment AttachmentReference `json:"attachment"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatal(err)
	}
	if response.Attachment.Kind != "audio_recording" || response.Attachment.MediaType != "audio/webm" || !response.Attachment.ContentAvailable {
		t.Fatalf("unexpected recording metadata: %#v", response.Attachment)
	}

	contentRequest := httptest.NewRequest(
		http.MethodGet,
		"/v1/assistant/attachments/"+response.Attachment.ID+"/content",
		nil,
	)
	contentRecorder := httptest.NewRecorder()
	mux.ServeHTTP(contentRecorder, contentRequest)
	if contentRecorder.Code != http.StatusOK || contentRecorder.Header().Get("Content-Type") != "audio/webm" || !bytes.Equal(contentRecorder.Body.Bytes(), audio) {
		t.Fatalf("recording is not playable: status=%d type=%q body=%q", contentRecorder.Code, contentRecorder.Header().Get("Content-Type"), contentRecorder.Body.Bytes())
	}

	rangeRequest := httptest.NewRequest(
		http.MethodGet,
		"/v1/assistant/attachments/"+response.Attachment.ID+"/content",
		nil,
	)
	rangeRequest.Header.Set("Range", "bytes=0-3")
	rangeRecorder := httptest.NewRecorder()
	mux.ServeHTTP(rangeRecorder, rangeRequest)
	if rangeRecorder.Code != http.StatusPartialContent ||
		rangeRecorder.Header().Get("Accept-Ranges") != "bytes" ||
		rangeRecorder.Header().Get("Content-Range") != "bytes 0-3/15" ||
		!bytes.Equal(rangeRecorder.Body.Bytes(), audio[:4]) {
		t.Fatalf(
			"recording range response invalid: status=%d accept=%q range=%q body=%q",
			rangeRecorder.Code,
			rangeRecorder.Header().Get("Accept-Ranges"),
			rangeRecorder.Header().Get("Content-Range"),
			rangeRecorder.Body.Bytes(),
		)
	}
}

func TestMessageAssessmentPersistsPhonemeScores(t *testing.T) {
	store := NewMemoryConversationStore()
	message := AssistantMessage{
		ID:        "message-user-1",
		Role:      "user",
		Content:   "Think clearly.",
		CreatedAt: time.Now().UTC(),
	}
	if err := store.AppendMessage(context.Background(), message); err != nil {
		t.Fatal(err)
	}
	handler := NewHTTPHandler(
		log.New(io.Discard, "", 0),
		nil, store, nil, nil,
		nil, nil, nil, nil, nil, nil,
	)
	mux := http.NewServeMux()
	handler.Register(mux)
	body := bytes.NewBufferString(`{
		"provider":"xunfei.suntone",
		"overall":88,
		"fluency":91,
		"pronunciation":84,
		"words":[{
			"word":"think",
			"pronunciation":78,
			"phonemes":[{"phoneme":"TH","phone":"θ","pronunciation":62}]
		}]
	}`)
	request := httptest.NewRequest(
		http.MethodPut,
		"/v1/assistant/messages/message-user-1/assessment",
		body,
	)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d body=%s", recorder.Code, recorder.Body.String())
	}
	messages, err := store.ListMessages(context.Background(), DemoThreadID)
	if err != nil {
		t.Fatal(err)
	}
	saved := messages[len(messages)-1].LearningAssessment
	if saved == nil || saved.Provider != "xunfei.suntone" ||
		saved.Words[0].Phonemes[0].Phone != "θ" {
		t.Fatalf("assessment was not persisted: %#v", saved)
	}
}

type stubPronunciationAssessor struct {
	audio     []byte
	reference string
}

func (s *stubPronunciationAssessor) Assess(
	_ context.Context,
	audio []byte,
	reference string,
) (LearningAssessment, error) {
	s.audio = append([]byte(nil), audio...)
	s.reference = reference
	return LearningAssessment{
		Provider:      "xunfei.suntone",
		Overall:       87,
		Fluency:       89,
		Pronunciation: 85,
	}, nil
}

func TestLinkAudioAttachmentRunsPronunciationAssessment(t *testing.T) {
	tools, err := NewPersistentDemoState(nil, filepath.Join(t.TempDir(), "tool-state.json"))
	if err != nil {
		t.Fatal(err)
	}
	audio := []byte("wav-audio")
	attachment, err := tools.AddAttachment(context.Background(), AttachmentInput{
		Filename:  "voice.wav",
		MediaType: "audio/wav",
		Data:      audio,
	})
	if err != nil {
		t.Fatal(err)
	}
	store := NewMemoryConversationStore()
	message := AssistantMessage{
		ID:        "message-user-audio",
		Role:      "user",
		Content:   "Nice to meet you.",
		CreatedAt: time.Now().UTC(),
	}
	if err := store.AppendMessage(context.Background(), message); err != nil {
		t.Fatal(err)
	}
	assessor := &stubPronunciationAssessor{}
	handler := NewHTTPHandler(
		log.New(io.Discard, "", 0),
		nil, store, tools, tools,
		nil, nil, nil, nil, nil, nil,
	)
	handler.pronunciation = assessor
	mux := http.NewServeMux()
	handler.Register(mux)

	body := bytes.NewBufferString(`{"attachment_id":"` + attachment.ID + `"}`)
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/assistant/messages/"+message.ID+"/attachments",
		body,
	)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d body=%s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		Message AssistantMessage `json:"message"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(assessor.audio, audio) || assessor.reference != message.Content {
		t.Fatalf("assessor input mismatch: audio=%q reference=%q", assessor.audio, assessor.reference)
	}
	if response.Message.LearningAssessment == nil ||
		response.Message.LearningAssessment.Provider != "xunfei.suntone" ||
		response.Message.LearningAssessment.Overall != 87 {
		t.Fatalf("canonical message omitted assessment: %#v", response.Message)
	}
}
