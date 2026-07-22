package preparation

import (
	"context"

	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant"
)

// ManagementService is the Preparation-owned HTTP/application surface for
// candidate context, uploaded materials, and managed resumes.
type ManagementService interface {
	UpdateCandidateProfile(context.Context, assistant.CandidateProfileInput) (assistant.CandidateProfile, error)
	AddAttachment(context.Context, assistant.AttachmentInput) (assistant.Attachment, error)
	Attachments([]string) ([]assistant.Attachment, error)
	AttachmentContent(string) ([]byte, string, string, error)
	DeleteAttachment(string) error
	ListResumes() []assistant.ResumeDocumentView
	GetResume(string) (assistant.ResumeDocumentView, error)
	ResumeFile(string) ([]byte, string, error)
	RenameResume(string, string) (assistant.ResumeDocumentView, error)
	UpdateResumeProfile(string, assistant.ResumeProfileUpdate) (assistant.ResumeDocumentView, error)
	ActivateResume(string) (assistant.ResumeDocumentView, error)
	DeleteResume(string) error
}

type management struct{ backend ManagementService }

func NewManagementService(backend ManagementService) ManagementService {
	return management{backend: backend}
}
func (m management) UpdateCandidateProfile(ctx context.Context, input assistant.CandidateProfileInput) (assistant.CandidateProfile, error) {
	return m.backend.UpdateCandidateProfile(ctx, input)
}
func (m management) AddAttachment(ctx context.Context, input assistant.AttachmentInput) (assistant.Attachment, error) {
	return m.backend.AddAttachment(ctx, input)
}
func (m management) Attachments(ids []string) ([]assistant.Attachment, error) {
	return m.backend.Attachments(ids)
}
func (m management) AttachmentContent(id string) ([]byte, string, string, error) {
	return m.backend.AttachmentContent(id)
}
func (m management) DeleteAttachment(id string) error            { return m.backend.DeleteAttachment(id) }
func (m management) ListResumes() []assistant.ResumeDocumentView { return m.backend.ListResumes() }
func (m management) GetResume(id string) (assistant.ResumeDocumentView, error) {
	return m.backend.GetResume(id)
}
func (m management) ResumeFile(id string) ([]byte, string, error) { return m.backend.ResumeFile(id) }
func (m management) RenameResume(id, name string) (assistant.ResumeDocumentView, error) {
	return m.backend.RenameResume(id, name)
}
func (m management) UpdateResumeProfile(id string, input assistant.ResumeProfileUpdate) (assistant.ResumeDocumentView, error) {
	return m.backend.UpdateResumeProfile(id, input)
}
func (m management) ActivateResume(id string) (assistant.ResumeDocumentView, error) {
	return m.backend.ActivateResume(id)
}
func (m management) DeleteResume(id string) error { return m.backend.DeleteResume(id) }
