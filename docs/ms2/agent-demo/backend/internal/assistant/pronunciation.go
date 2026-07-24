package assistant

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

type PronunciationAssessor interface {
	Assess(context.Context, []byte, string) (LearningAssessment, error)
}

type pronunciationAssessmentClient struct {
	baseURL string
	client  *http.Client
}

func newPronunciationAssessmentClientFromEnv() PronunciationAssessor {
	enabled := strings.ToLower(strings.TrimSpace(os.Getenv("XUNFEI_ASSESSMENT_ENABLED")))
	if enabled != "1" && enabled != "true" {
		return nil
	}
	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("PRONUNCIATION_ASSESSMENT_BASE_URL")), "/")
	if baseURL == "" {
		baseURL = "http://127.0.0.1:8767"
	}
	return &pronunciationAssessmentClient{
		baseURL: baseURL,
		client:  &http.Client{Timeout: 45 * time.Second},
	}
}

func (c *pronunciationAssessmentClient) Assess(
	ctx context.Context,
	audio []byte,
	referenceText string,
) (LearningAssessment, error) {
	body, err := json.Marshal(map[string]string{
		"audio_base64":   base64.StdEncoding.EncodeToString(audio),
		"reference_text": strings.TrimSpace(referenceText),
	})
	if err != nil {
		return LearningAssessment{}, err
	}
	request, err := http.NewRequestWithContext(
		ctx, http.MethodPost, c.baseURL+"/assess", bytes.NewReader(body),
	)
	if err != nil {
		return LearningAssessment{}, err
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := c.client.Do(request)
	if err != nil {
		return LearningAssessment{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		detail, _ := io.ReadAll(io.LimitReader(response.Body, 8<<10))
		return LearningAssessment{}, fmt.Errorf(
			"pronunciation assessment failed with HTTP %d: %s",
			response.StatusCode, strings.TrimSpace(string(detail)),
		)
	}
	var assessment LearningAssessment
	if err := json.NewDecoder(io.LimitReader(response.Body, 2<<20)).Decode(&assessment); err != nil {
		return LearningAssessment{}, err
	}
	if strings.TrimSpace(assessment.Provider) == "" {
		return LearningAssessment{}, fmt.Errorf("pronunciation assessment omitted provider")
	}
	return assessment, nil
}
