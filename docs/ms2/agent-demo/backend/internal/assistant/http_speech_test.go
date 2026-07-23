package assistant

import (
	"bytes"
	"context"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"testing"
)

type configurableSpeechSynthesizer struct {
	options SpeechSynthesisOptions
}

func (s *configurableSpeechSynthesizer) Synthesize(
	context.Context,
	string,
	*string,
) (GeneratedAudio, error) {
	return GeneratedAudio{Content: io.NopCloser(bytes.NewReader(nil)), ContentType: "audio/mpeg"}, nil
}

func (s *configurableSpeechSynthesizer) StreamSynthesizeWithOptions(
	_ context.Context,
	_ string,
	_ *string,
	options SpeechSynthesisOptions,
	writeChunk func([]byte) error,
) error {
	s.options = options
	return writeChunk([]byte{1, 0, 2, 0})
}

func TestSpeechEndpointStreamsPCM24K(t *testing.T) {
	synthesizer := &configurableSpeechSynthesizer{}
	handler := NewHTTPHandler(
		log.New(io.Discard, "", 0),
		nil, NewMemoryConversationStore(), nil, nil,
		nil, nil, nil, synthesizer, nil,
	)
	mux := http.NewServeMux()
	handler.Register(mux)

	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, httptest.NewRequest(
		http.MethodPost,
		"/v1/audio/speech",
		bytes.NewBufferString(`{"text":"Hello","format":"pcm","sample_rate":24000}`),
	))
	if recorder.Code != http.StatusOK ||
		recorder.Header().Get("Content-Type") != "audio/pcm" ||
		!bytes.Equal(recorder.Body.Bytes(), []byte{1, 0, 2, 0}) {
		t.Fatalf(
			"unexpected PCM response: status=%d type=%q body=%v",
			recorder.Code,
			recorder.Header().Get("Content-Type"),
			recorder.Body.Bytes(),
		)
	}
	if synthesizer.options.Format != "pcm" || synthesizer.options.SampleRate != 24000 {
		t.Fatalf("unexpected synthesis options: %#v", synthesizer.options)
	}
}

func TestSpeechEndpointRejectsUnsupportedFormatsAndSampleRates(t *testing.T) {
	handler := NewHTTPHandler(
		log.New(io.Discard, "", 0),
		nil, NewMemoryConversationStore(), nil, nil,
		nil, nil, nil, &configurableSpeechSynthesizer{}, nil,
	)
	mux := http.NewServeMux()
	handler.Register(mux)

	for _, body := range []string{
		`{"text":"Hello","format":"wav","sample_rate":24000}`,
		`{"text":"Hello","format":"pcm","sample_rate":22050}`,
		`{"text":"Hello","format":"mp3","sample_rate":24000}`,
	} {
		recorder := httptest.NewRecorder()
		mux.ServeHTTP(recorder, httptest.NewRequest(
			http.MethodPost,
			"/v1/audio/speech",
			bytes.NewBufferString(body),
		))
		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("body %s: status=%d response=%s", body, recorder.Code, recorder.Body.String())
		}
	}
}
