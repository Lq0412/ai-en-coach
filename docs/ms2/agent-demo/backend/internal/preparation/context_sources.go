package preparation

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant"
	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/usercontext"
)

type ProfileContextSource struct {
	reader ScenarioReader
}

func NewProfileContextSource(reader ScenarioReader) ProfileContextSource {
	return ProfileContextSource{reader: reader}
}

func (s ProfileContextSource) Profile(ctx context.Context, userID string) (usercontext.Profile, error) {
	if s.reader == nil {
		return usercontext.Profile{}, fmt.Errorf("preparation: confirmed context reader is required")
	}
	confirmed, err := s.reader.GetConfirmedContext(ctx, userID)
	if err != nil {
		return usercontext.Profile{}, err
	}
	return usercontext.Profile{
		ID: confirmed.BackgroundSnapshotID, Candidate: confirmed.CandidateName, Headline: confirmed.Headline,
		Summary: confirmed.Summary, TargetRole: confirmed.TargetRole, Skills: append([]string(nil), confirmed.Skills...),
		Experiences: append([]string(nil), confirmed.Experiences...), Confirmed: confirmed.Confirmed,
	}, nil
}

type CurrentScenarioContextSource struct {
	service ScenarioService
}

func NewCurrentScenarioContextSource(service ScenarioService) CurrentScenarioContextSource {
	return CurrentScenarioContextSource{service: service}
}

func (s CurrentScenarioContextSource) Current(ctx context.Context, userID, threadID string) (usercontext.Scenario, error) {
	if s.service == nil {
		return usercontext.Scenario{}, fmt.Errorf("preparation: scenario service is required")
	}
	scenario, err := s.service.Current(ctx, userID, threadID)
	if err != nil {
		return usercontext.Scenario{}, err
	}
	facts := make([]usercontext.Fact, 0, len(scenario.StructuredFacts))
	for key, fact := range scenario.StructuredFacts {
		facts = append(facts, usercontext.Fact{Key: key, Value: fact.Value, Source: string(fact.Source), SourceRef: fact.SourceRef})
	}
	sort.Slice(facts, func(i, j int) bool { return facts[i].Key < facts[j].Key })
	return usercontext.Scenario{
		ID: scenario.ID, Type: string(scenario.Type), Title: scenario.Title, Goal: scenario.Goal, Status: string(scenario.Status),
		ScheduledAt: scenario.ScheduledAt, Deadline: scenario.Deadline, MaterialIDs: append([]string(nil), scenario.MaterialIDs...), Facts: facts,
	}, nil
}

type InterviewHistorySource interface {
	ListInterviewSessions() []assistant.InterviewSessionSummary
}

type LearningHistoryContextSource struct {
	history InterviewHistorySource
}

func NewLearningHistoryContextSource(history InterviewHistorySource) LearningHistoryContextSource {
	return LearningHistoryContextSource{history: history}
}

func (s LearningHistoryContextSource) Recent(_ context.Context, _ string, limit int) ([]usercontext.LearningSignal, error) {
	if s.history == nil || limit <= 0 {
		return nil, nil
	}
	items := s.history.ListInterviewSessions()
	result := make([]usercontext.LearningSignal, 0, limit)
	for _, item := range items {
		if item.Status == "in_progress" {
			continue
		}
		summary := strings.TrimSpace(item.TargetRole)
		if summary == "" {
			summary = "未命名练习"
		}
		summary = fmt.Sprintf("%s：完成 %d 轮%s", summary, item.CompletedTurns, feedbackSuffix(item.HasFeedback))
		result = append(result, usercontext.LearningSignal{Kind: "practice", Summary: summary, SourceRef: item.ID, Occurred: item.StartedAt.UTC()})
		if len(result) == limit {
			break
		}
	}
	return result, nil
}

func feedbackSuffix(hasFeedback bool) string {
	if hasFeedback {
		return "，已有反馈"
	}
	return ""
}
