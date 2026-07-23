package assistant

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"path/filepath"
	"testing"
)

func TestAudioAttachmentUploadPersistsPlayableRecording(t *testing.T) {
	tools, err := NewPersistentDemoState(nil, filepath.Join(t.TempDir(), "tool-state.json"))
	if err != nil {
		t.Fatal(err)
	}
	handler := NewHTTPHandler(
		log.New(io.Discard, "", 0),
		nil, NewMemoryConversationStore(), tools, tools,
		nil, nil, nil, nil, nil,
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
}
