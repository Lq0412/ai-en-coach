package assistant_test

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant"
)

func TestManagedResumesPersistAndControlAgentContext(t *testing.T) {
	path := filepath.Join(t.TempDir(), "tool-state.json")
	generator := &contextCaptureGenerator{}
	tools, err := assistant.NewPersistentDemoState(generator, path)
	if err != nil {
		t.Fatal(err)
	}

	for _, name := range []string{"backend.pdf", "platform.pdf", "leadership.pdf"} {
		_, err = tools.AddAttachment(context.Background(), assistant.AttachmentInput{
			Filename:      name,
			MediaType:     "application/pdf",
			Data:          []byte("%PDF-1.7 test"),
			RequireResume: true,
		})
		if err != nil {
			t.Fatalf("add %s: %v", name, err)
		}
	}

	resumes := tools.ListResumes()
	if len(resumes) != assistant.MaxManagedResumes || !resumes[0].Active || resumes[0].Name != "leadership.pdf" {
		t.Fatalf("unexpected managed resumes: %#v", resumes)
	}
	oldestID := resumes[2].ID
	if data, name, err := tools.ResumeFile(oldestID); err != nil || name != "backend.pdf" || string(data) != "%PDF-1.7 test" {
		t.Fatalf("stored original PDF is unavailable: name=%q data=%q err=%v", name, data, err)
	}
	if _, err := tools.ActivateResume(oldestID); err != nil {
		t.Fatal(err)
	}
	if tools.State().CandidateProfile.ResumeName != "backend.pdf" {
		t.Fatalf("active resume was not injected into agent context: %#v", tools.State().CandidateProfile)
	}
	if _, err := tools.RenameResume(oldestID, "Go 后端主简历.pdf"); err != nil {
		t.Fatal(err)
	}
	if tools.State().CandidateProfile.ResumeName != "Go 后端主简历.pdf" {
		t.Fatalf("active resume rename was not synchronized: %#v", tools.State().CandidateProfile)
	}
	updated, err := tools.UpdateResumeProfile(oldestID, assistant.ResumeProfileUpdate{
		CandidateName: "李明（已编辑）",
		Headline:      "Senior Go Engineer",
		Summary:       "负责支付平台可靠性与性能优化。",
		Skills:        []string{"Go", "Kafka", " go ", "Redis"},
		Experiences:   []string{"将支付 API p95 降至 120ms", "建立核心服务 SLO"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.CandidateProfile.CandidateName != "李明（已编辑）" || len(updated.CandidateProfile.Skills) != 3 {
		t.Fatalf("resume profile edit was not normalized: %#v", updated)
	}
	activeProfile := tools.State().CandidateProfile
	if activeProfile.Headline != "Senior Go Engineer" || activeProfile.Experiences[0] != "将支付 API p95 降至 120ms" || activeProfile.ResumeText == "" {
		t.Fatalf("edited active profile was not injected or lost source text: %#v", activeProfile)
	}

	_, err = tools.AddAttachment(context.Background(), assistant.AttachmentInput{
		Filename:      "overflow.pdf",
		MediaType:     "application/pdf",
		Data:          []byte("%PDF-1.7 overflow"),
		RequireResume: true,
	})
	if !errors.Is(err, assistant.ErrResumeLimit) {
		t.Fatalf("expected resume limit error, got %v", err)
	}

	imageBytes := []byte("\x89PNG\r\n\x1a\nrender-test")
	imageAttachment, err := tools.AddAttachment(context.Background(), assistant.AttachmentInput{
		Filename:  "architecture.png",
		MediaType: "image/png",
		Data:      imageBytes,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !imageAttachment.ContentAvailable {
		t.Fatalf("persisted image was not marked renderable: %#v", imageAttachment)
	}
	storedImage, imageName, imageType, err := tools.AttachmentContent(imageAttachment.ID)
	if err != nil || imageName != "architecture.png" || imageType != "image/png" || string(storedImage) != string(imageBytes) {
		t.Fatalf("stored image content mismatch: name=%q type=%q data=%q err=%v", imageName, imageType, storedImage, err)
	}

	reopened, err := assistant.NewPersistentDemoState(generator, path)
	if err != nil {
		t.Fatal(err)
	}
	if len(reopened.ListResumes()) != 3 || reopened.State().ActiveResumeID != oldestID || reopened.State().CandidateProfile.ResumeName != "Go 后端主简历.pdf" || reopened.State().CandidateProfile.CandidateName != "李明（已编辑）" {
		t.Fatalf("resume state did not survive restart: %#v", reopened.State())
	}
	if _, _, _, err := reopened.AttachmentContent(imageAttachment.ID); err != nil {
		t.Fatalf("image attachment did not survive restart: %v", err)
	}
	if err := reopened.DeleteAttachment(imageAttachment.ID); err != nil {
		t.Fatalf("delete pending image attachment: %v", err)
	}
	if _, _, _, err := reopened.AttachmentContent(imageAttachment.ID); !errors.Is(err, assistant.ErrNotFound) {
		t.Fatalf("deleted image attachment content is still readable: %v", err)
	}
	if err := reopened.DeleteResume(oldestID); err != nil {
		t.Fatal(err)
	}
	if len(reopened.ListResumes()) != 2 || len(reopened.State().Attachments) != 2 || reopened.State().ActiveResumeID == oldestID || !reopened.State().CandidateProfile.Configured() {
		t.Fatalf("deleting active resume did not select a remaining resume: %#v", reopened.State())
	}
	if _, _, err := reopened.ResumeFile(oldestID); !errors.Is(err, assistant.ErrNotFound) {
		t.Fatalf("deleted original PDF is still readable: %v", err)
	}
}
