package context

import (
	"context"
	"fmt"
	"strings"
)

const (
	DefaultTokenLimit = 10_000
	DefaultThreshold  = 8_200
	DefaultRecent     = 1_800
)

type Memory struct {
	ID      string
	Summary string
	Source  string
}

type RecallPort interface {
	Recall(context.Context, string, string, string, int) ([]Memory, error)
}

type BuildRequest struct {
	UserID        string
	ThreadID      string
	RunID         string
	Query         string
	ThreadSummary string
	OpenLoops     []string
	Messages      []Message
}

type BuildResult struct {
	Messages       []Message
	Summary        string
	TokenCount     int
	Recalled       []Memory
	Compressed     bool
	Fallback       bool
	PreservedStart int
}

type Builder struct {
	recall       RecallPort
	tokenLimit   int
	threshold    int
	recentBudget int
}

func NewBuilder(recall RecallPort) *Builder {
	return &Builder{recall: recall, tokenLimit: DefaultTokenLimit, threshold: DefaultThreshold, recentBudget: DefaultRecent}
}

func (b *Builder) Build(ctx context.Context, request BuildRequest) (BuildResult, error) {
	if len(request.Messages) == 0 {
		return BuildResult{}, fmt.Errorf("context: messages are required")
	}
	recalled := []Memory(nil)
	if b.recall != nil && strings.TrimSpace(request.Query) != "" {
		items, err := b.recall.Recall(ctx, request.UserID, request.RunID, request.Query, 5)
		if err == nil {
			recalled = items
		}
	}
	memoryMessage := renderMemories(recalled)
	messages := append([]Message(nil), request.Messages...)
	if memoryMessage.Content != "" {
		messages = append([]Message{memoryMessage}, messages...)
	}
	result := BuildResult{Messages: messages, Summary: request.ThreadSummary, Recalled: recalled, TokenCount: EstimateTokens(messages)}
	if result.TokenCount <= b.threshold {
		return result, nil
	}

	start := recentStart(request.Messages, b.recentBudget)
	recent := append([]Message(nil), request.Messages[start:]...)
	summary := compress(request.ThreadSummary, request.OpenLoops, request.Messages[:start])
	compact := make([]Message, 0, len(recent)+2)
	if memoryMessage.Content != "" {
		compact = append(compact, memoryMessage)
	}
	if summary != "" {
		compact = append(compact, Message{Role: "system", Content: "对话摘要（非用户原话）：\n" + summary})
	}
	compact = append(compact, recent...)
	result.Messages, result.Summary, result.Compressed, result.PreservedStart = compact, summary, true, start
	result.TokenCount = EstimateTokens(compact)
	if result.TokenCount <= b.tokenLimit {
		return result, nil
	}

	// The latest complete turn and current user message are never summarized.
	for len(result.Messages) > 2 && result.TokenCount > b.tokenLimit {
		result.Messages = append([]Message(nil), result.Messages[1:]...)
		result.TokenCount = EstimateTokens(result.Messages)
		result.Fallback = true
	}
	if result.TokenCount > b.tokenLimit {
		last := result.Messages[len(result.Messages)-1]
		last.Content = truncateToRunes(last.Content, b.tokenLimit*2)
		result.Messages = []Message{last}
		result.TokenCount = EstimateTokens(result.Messages)
		result.Fallback = true
	}
	return result, nil
}

func recentStart(messages []Message, budget int) int {
	if len(messages) <= 2 {
		return 0
	}
	start := len(messages) - 2
	for start > 0 && EstimateTokens(messages[start-1:]) <= budget {
		start--
	}
	return start
}

func compress(existing string, openLoops []string, messages []Message) string {
	parts := make([]string, 0, len(messages)+2)
	if strings.TrimSpace(existing) != "" {
		parts = append(parts, strings.TrimSpace(existing))
	}
	for _, message := range messages {
		content := strings.Join(strings.Fields(message.Content), " ")
		if content == "" {
			continue
		}
		parts = append(parts, message.Role+": "+truncateToRunes(content, 180))
	}
	if len(openLoops) > 0 {
		parts = append(parts, "待处理事项: "+strings.Join(openLoops, "；"))
	}
	return truncateToRunes(strings.Join(parts, "\n"), 2_400)
}

func renderMemories(memories []Memory) Message {
	if len(memories) == 0 {
		return Message{}
	}
	lines := []string{"以下是已验证的长期记忆，仅在相关时使用；如与用户当前陈述冲突，以当前陈述为准："}
	for _, item := range memories {
		lines = append(lines, fmt.Sprintf("- %s [memory:%s; source:%s]", item.Summary, item.ID, item.Source))
	}
	return Message{Role: "system", Content: strings.Join(lines, "\n")}
}

func truncateToRunes(value string, limit int) string {
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit]) + "…"
}
