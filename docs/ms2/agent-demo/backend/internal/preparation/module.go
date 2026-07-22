// Package preparation owns candidate context, uploaded materials, and resumes.
package preparation

import (
	"context"

	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant"
)

type ConfirmedContext struct {
	BackgroundSnapshotID string
	TargetRole           string
	CandidateName        string
	Headline             string
	Summary              string
	Skills               []string
	Experiences          []string
	Confirmed            bool
}

// ScenarioReader mirrors the Preparation read port used by downstream modules
// in the main repository. It exposes snapshots, never repositories.
type ScenarioReader interface {
	GetConfirmedContext(context.Context, string) (ConfirmedContext, error)
}

type StateStore interface {
	Transact(assistant.DemoTransaction) (assistant.ToolResult, error)
}

type service struct{ state StateStore }

func NewService(state StateStore) ScenarioReader { return service{state: state} }

func (s service) GetConfirmedContext(_ context.Context, _ string) (confirmed ConfirmedContext, err error) {
	_, err = s.state.Transact(func(state *assistant.RuntimeSnapshot, _ *[]string) (assistant.ToolResult, error) {
		profile := state.CandidateProfile
		confirmed = ConfirmedContext{
			BackgroundSnapshotID: profile.ID,
			TargetRole:           profile.JobTitle, CandidateName: profile.CandidateName,
			Headline: profile.Headline, Summary: profile.Summary,
			Skills:      append([]string(nil), profile.Skills...),
			Experiences: append([]string(nil), profile.Experiences...),
			Confirmed:   profile.Configured(),
		}
		return assistant.ToolResult{}, nil
	})
	return confirmed, err
}
