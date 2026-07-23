// Package review owns feedback generation and the practice-history projection.
package review

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant"
)

const (
	ScenarioTechnicalInterview = "interview_technical"
	RubricTechnicalInterview   = "interview_technical_v1"

	EvidenceSufficient   = "sufficient"
	EvidenceInsufficient = "insufficient"
)

type AnalyzeCommand struct {
	Reason string
}

type Feedback struct {
	ID             string
	SessionID      string
	TargetRole     string
	CompletedTurns int
	MaxTurns       int
	Summary        string
	Result         ReviewResult
}

type ReviewResult struct {
	ID                string
	SessionID         string
	TargetRole        string
	ScenarioType      string
	CompletedTurns    int
	MaxTurns          int
	EvidenceStatus    string
	RubricID          string
	Scores            ScoreBreakdown
	FeedbackItems     []FeedbackItem
	Mistakes          []MistakeItem
	RepracticeTargets []RepracticeTarget
	Summary           string
	CreatedAt         time.Time
}

type ScoreBreakdown struct {
	Structure     int
	Content       int
	English       int
	ScenarioMatch int
	Overall       int
}

type FeedbackItem struct {
	Type       string
	Message    string
	Evidence   string
	Suggestion string
}

type MistakeItem struct {
	ID               string
	Type             string
	OriginalText     string
	Issue            string
	Suggestion       string
	RepracticeStatus string
}

type RepracticeTarget struct {
	ID               string
	Focus            string
	Reason           string
	Prompt           string
	SourceMistakeIDs []string
	Status           string
}

type HistoryQuery struct {
	Limit int
}

type HistoryItem struct {
	PracticeSessionID string
	Scenario          string
	CompletedTurns    int
	Status            string
	StartedAt         time.Time
	EndedAt           *time.Time
	Feedback          string
	ReviewID          string
	RepracticeFocus   string
	HasFeedback       bool
}

type AnalyzeUseCase interface {
	Analyze(context.Context, AnalyzeCommand) (Feedback, error)
}

type HistoryQueryUseCase interface {
	ListHistory(context.Context, HistoryQuery) ([]HistoryItem, error)
}

type Service interface {
	AnalyzeUseCase
	HistoryQueryUseCase
}

type StateStore interface {
	Transact(assistant.DemoTransaction) (assistant.ToolResult, error)
}

type service struct {
	state     StateStore
	generator assistant.InterviewContentGenerator
}

func NewService(state StateStore, generator assistant.InterviewContentGenerator) Service {
	return service{state: state, generator: generator}
}

func (s service) Analyze(ctx context.Context, _ AnalyzeCommand) (feedback Feedback, err error) {
	_, err = s.state.Transact(func(state *assistant.RuntimeSnapshot, answers *[]string) (assistant.ToolResult, error) {
		source := reviewSourceFromState(*state, *answers)
		result := analyzeSource(source)
		summary := fallbackSummary(result)
		if s.generator != nil {
			generated, err := s.generator.GenerateFeedback(ctx, assistant.InterviewFeedbackInput{
				CompletedQuestionCount: source.CompletedTurns, Answers: append([]string(nil), source.Answers...),
				TargetRole: source.TargetRole, MaxTurns: source.MaxTurns,
				DurationMinutes: source.DurationMinutes, CandidateProfile: source.CandidateProfile,
			})
			if err != nil {
				return assistant.ToolResult{}, err
			}
			if strings.TrimSpace(generated) != "" {
				summary = strings.TrimSpace(generated)
			}
		}
		result.Summary = summary
		feedback = Feedback{
			ID: result.ID, SessionID: result.SessionID,
			TargetRole: result.TargetRole, CompletedTurns: result.CompletedTurns,
			MaxTurns: result.MaxTurns, Summary: summary, Result: result,
		}
		if source.Active {
			state.ActiveQuestion = ""
			completeSession(state, *answers, summary)
		} else if source.SessionID != "" {
			updateSessionFeedback(state, source.SessionID, summary)
		}
		return assistant.ToolResult{}, nil
	})
	return feedback, err
}

func (s service) ListHistory(_ context.Context, query HistoryQuery) (items []HistoryItem, err error) {
	_, err = s.state.Transact(func(state *assistant.RuntimeSnapshot, _ *[]string) (assistant.ToolResult, error) {
		items = make([]HistoryItem, 0, len(state.Sessions))
		for index := len(state.Sessions) - 1; index >= 0; index-- {
			session := state.Sessions[index]
			result := analyzeSource(reviewSourceFromSession(session, state.CandidateProfile))
			items = append(items, HistoryItem{
				PracticeSessionID: session.ID, Scenario: session.TargetRole,
				CompletedTurns: session.CompletedTurns, Status: session.Status,
				StartedAt: session.StartedAt, EndedAt: session.EndedAt,
				Feedback: session.Feedback, ReviewID: result.ID,
				RepracticeFocus: firstRepracticeFocus(result), HasFeedback: strings.TrimSpace(session.Feedback) != "",
			})
			if query.Limit > 0 && len(items) >= query.Limit {
				break
			}
		}
		return assistant.ToolResult{}, nil
	})
	return items, err
}

type reviewSource struct {
	SessionID        string
	TargetRole       string
	MaxTurns         int
	DurationMinutes  int
	CompletedTurns   int
	StartedAt        time.Time
	Questions        []string
	Answers          []string
	CandidateProfile assistant.CandidateProfile
	Active           bool
}

func reviewSourceFromState(state assistant.RuntimeSnapshot, answers []string) reviewSource {
	if state.CurrentSessionID != "" {
		for _, session := range state.Sessions {
			if session.ID == state.CurrentSessionID && len(answers) == 0 {
				return reviewSourceFromSession(session, state.CandidateProfile)
			}
		}
		return reviewSource{
			SessionID: state.CurrentSessionID, TargetRole: state.TargetRole,
			MaxTurns: state.MaxTurns, DurationMinutes: state.DurationMinutes,
			CompletedTurns: state.CompletedQuestionCount, StartedAt: state.StartedAt,
			Questions: append([]string(nil), state.Questions...), Answers: cleanedAnswers(answers),
			CandidateProfile: state.CandidateProfile, Active: true,
		}
	}
	if len(state.Sessions) > 0 {
		return reviewSourceFromSession(state.Sessions[len(state.Sessions)-1], state.CandidateProfile)
	}
	return reviewSource{TargetRole: state.TargetRole, MaxTurns: state.MaxTurns, DurationMinutes: state.DurationMinutes}
}

func reviewSourceFromSession(session assistant.InterviewSession, profile assistant.CandidateProfile) reviewSource {
	return reviewSource{
		SessionID: session.ID, TargetRole: session.TargetRole,
		MaxTurns: session.MaxTurns, DurationMinutes: session.DurationMinutes,
		CompletedTurns: session.CompletedTurns, StartedAt: session.StartedAt,
		Questions: append([]string(nil), session.Questions...), Answers: cleanedAnswers(session.Answers),
		CandidateProfile: profile,
	}
}

func analyzeSource(source reviewSource) ReviewResult {
	now := time.Now().UTC()
	result := ReviewResult{
		ID: "review-" + stableIDPart(source.SessionID), SessionID: source.SessionID,
		TargetRole: source.TargetRole, ScenarioType: ScenarioTechnicalInterview,
		CompletedTurns: source.CompletedTurns, MaxTurns: source.MaxTurns,
		RubricID: RubricTechnicalInterview, CreatedAt: now,
	}
	if result.CompletedTurns == 0 {
		result.CompletedTurns = len(source.Answers)
	}
	totalWords := wordCount(strings.Join(source.Answers, " "))
	if len(source.Answers) == 0 || totalWords < 8 {
		result.EvidenceStatus = EvidenceInsufficient
		result.Scores = ScoreBreakdown{Structure: 20, Content: 20, English: 20, ScenarioMatch: 20, Overall: 20}
		evidence := "暂无可分析的完整英文回答。"
		if len(source.Answers) > 0 {
			evidence = compactText(source.Answers[0], 140)
		}
		result.FeedbackItems = []FeedbackItem{{
			Type: "evidence_gap", Message: "依据不足，暂时不能形成可靠的面试表现判断。",
			Evidence: evidence, Suggestion: "请至少完成一个包含背景、行动和结果的英文回答后再复盘。",
		}}
		result.Mistakes = []MistakeItem{{
			ID: "mistake-" + stableIDPart(source.SessionID) + "-evidence", Type: "evidence_gap",
			OriginalText: evidence, Issue: "缺少足够回答证据。",
			Suggestion: "补充一段 45 秒以上的完整英文回答。", RepracticeStatus: "pending",
		}}
		result.RepracticeTargets = []RepracticeTarget{{
			ID: "repractice-" + stableIDPart(source.SessionID) + "-evidence", Focus: "完成一个可复盘的英文回答",
			Reason:           "当前回答证据不足，无法判断结构、内容和表达质量。",
			Prompt:           "Please answer one behavioral interview question using Situation, Action, and Result.",
			SourceMistakeIDs: []string{result.Mistakes[0].ID}, Status: "blocked_insufficient_evidence",
		}}
		return result
	}

	answersText := strings.Join(source.Answers, " ")
	result.EvidenceStatus = EvidenceSufficient
	result.Scores = scoreAnswers(source, answersText)
	weakType := weakestScoreType(result.Scores)
	evidence := representativeEvidence(source.Answers, weakType)
	result.FeedbackItems = []FeedbackItem{
		strengthFeedback(source, result.Scores),
		improvementFeedback(weakType, evidence),
	}
	mistake := mistakeForWeakness(source.SessionID, weakType, evidence)
	result.Mistakes = []MistakeItem{mistake}
	result.RepracticeTargets = []RepracticeTarget{repracticeForMistake(source, mistake)}
	return result
}

func scoreAnswers(source reviewSource, answersText string) ScoreBreakdown {
	lower := strings.ToLower(answersText)
	structure := 45
	content := 45
	english := 45
	scenario := 50
	structure += 10 * countAny(lower, []string{"situation", "task", "action", "result", "first", "then", "finally", "because", "therefore", "learned"})
	content += 10 * countAny(lower, []string{"built", "designed", "implemented", "improved", "reduced", "increased", "metric", "users", "latency", "trade-off", "tradeoff"})
	if regexp.MustCompile(`\d|%`).MatchString(lower) {
		content += 15
	}
	ratio := englishRatio(answersText)
	switch {
	case ratio >= 0.85:
		english += 25
	case ratio >= 0.65:
		english += 15
	case ratio < 0.4:
		english -= 20
	}
	if wordCount(answersText) >= 45 {
		english += 10
	}
	scenario += scenarioMatchBonus(source, lower)
	return normalizeScores(ScoreBreakdown{
		Structure: structure, Content: content, English: english, ScenarioMatch: scenario,
	})
}

func normalizeScores(scores ScoreBreakdown) ScoreBreakdown {
	scores.Structure = boundedScore(scores.Structure)
	scores.Content = boundedScore(scores.Content)
	scores.English = boundedScore(scores.English)
	scores.ScenarioMatch = boundedScore(scores.ScenarioMatch)
	scores.Overall = (scores.Structure + scores.Content + scores.English + scores.ScenarioMatch) / 4
	return scores
}

func boundedScore(value int) int {
	if value < 0 {
		return 0
	}
	if value > 100 {
		return 100
	}
	return value
}

func countAny(text string, markers []string) int {
	count := 0
	for _, marker := range markers {
		if strings.Contains(text, marker) {
			count++
		}
	}
	if count > 4 {
		return 4
	}
	return count
}

func scenarioMatchBonus(source reviewSource, lowerAnswer string) int {
	bonus := 0
	for _, token := range strings.Fields(strings.ToLower(source.TargetRole)) {
		token = strings.Trim(token, ".,;:!?()[]{}")
		if len(token) >= 3 && strings.Contains(lowerAnswer, token) {
			bonus += 12
		}
	}
	for _, question := range source.Questions {
		for _, token := range strings.Fields(strings.ToLower(question)) {
			token = strings.Trim(token, ".,;:!?()[]{}")
			if len(token) >= 5 && strings.Contains(lowerAnswer, token) {
				bonus += 4
				break
			}
		}
	}
	if bonus > 35 {
		return 35
	}
	return bonus
}

func weakestScoreType(scores ScoreBreakdown) string {
	weakType, weakScore := "structure", scores.Structure
	if scores.Content < weakScore {
		weakType, weakScore = "content", scores.Content
	}
	if scores.English < weakScore {
		weakType, weakScore = "english_expression", scores.English
	}
	if scores.ScenarioMatch < weakScore {
		weakType = "scenario_match"
	}
	return weakType
}

func strengthFeedback(source reviewSource, scores ScoreBreakdown) FeedbackItem {
	evidence := representativeEvidence(source.Answers, "strength")
	message := "本场回答已经提供了可复盘的英文材料。"
	suggestion := "下一次继续保留清晰的经历线索，并补充更具体的行动和结果。"
	if scores.Content >= scores.Structure && scores.Content >= scores.English {
		message = "回答中已经出现了一些与经历或行动相关的信息。"
	} else if scores.English >= 70 {
		message = "英文表达整体可读，能够支撑面试官理解你的回答。"
	}
	return FeedbackItem{Type: "strength", Message: message, Evidence: evidence, Suggestion: suggestion}
}

func improvementFeedback(weakType, evidence string) FeedbackItem {
	mistake := mistakeForWeakness("feedback", weakType, evidence)
	return FeedbackItem{Type: "improvement", Message: mistake.Issue, Evidence: evidence, Suggestion: mistake.Suggestion}
}

func mistakeForWeakness(sessionID, weakType, evidence string) MistakeItem {
	item := MistakeItem{
		ID: "mistake-" + stableIDPart(sessionID) + "-" + weakType, Type: weakType,
		OriginalText: evidence, RepracticeStatus: "pending",
	}
	switch weakType {
	case "content":
		item.Issue = "回答缺少足够具体的任务、技术选择、指标或结果。"
		item.Suggestion = "补充你做了什么、为什么这样做，以及最终带来了什么可观察结果。"
	case "english_expression":
		item.Issue = "英文表达证据偏弱，可能存在回答过短或中英文混杂的问题。"
		item.Suggestion = "用 3 到 5 句完整英文回答，减少口头填充和中文解释。"
	case "scenario_match":
		item.Issue = "回答和目标岗位或当前问题的贴合度不够明显。"
		item.Suggestion = "开头直接回应问题，并把例子连接到目标岗位所需能力。"
	default:
		item.Issue = "回答结构不够清晰，背景、行动和结果之间的层次不足。"
		item.Suggestion = "按 Situation, Action, Result 组织回答，最后补一句复盘或学习。"
	}
	return item
}

func repracticeForMistake(source reviewSource, mistake MistakeItem) RepracticeTarget {
	target := RepracticeTarget{
		ID:               "repractice-" + stableIDPart(source.SessionID) + "-" + mistake.Type,
		SourceMistakeIDs: []string{mistake.ID}, Status: "ready",
	}
	role := strings.TrimSpace(source.TargetRole)
	if role == "" {
		role = "the target role"
	}
	switch mistake.Type {
	case "content":
		target.Focus = "补充具体行动和可量化结果"
		target.Reason = "本场回答最需要增强内容完整度。"
		target.Prompt = fmt.Sprintf("Please answer a %s interview question with one concrete project, your technical decision, and a measurable result.", role)
	case "english_expression":
		target.Focus = "用完整英文句子表达经历"
		target.Reason = "本场回答最需要提升英文表达稳定性。"
		target.Prompt = "Please answer the same question again in 3 to 5 complete English sentences."
	case "scenario_match":
		target.Focus = "提升回答和岗位问题的贴合度"
		target.Reason = "本场回答需要更直接回应岗位能力要求。"
		target.Prompt = fmt.Sprintf("Please answer again and explicitly connect your example to the core responsibilities of a %s.", role)
	default:
		target.Focus = "使用 STAR 结构组织回答"
		target.Reason = "本场回答最需要提升结构清晰度。"
		target.Prompt = "Please answer one interview question using Situation, Action, and Result, then add one short reflection."
	}
	return target
}

func fallbackSummary(result ReviewResult) string {
	if result.EvidenceStatus == EvidenceInsufficient {
		return "依据不足：本场练习缺少可分析的完整英文回答。建议先完成一个包含背景、行动和结果的回答，再生成正式复盘。"
	}
	focus := firstRepracticeFocus(result)
	if focus == "" {
		focus = "补充更具体的行动和结果"
	}
	return fmt.Sprintf("本场完成 %d 个有效 Turn，综合评分 %d/100。主要复练方向：%s。",
		result.CompletedTurns, result.Scores.Overall, focus)
}

func firstRepracticeFocus(result ReviewResult) string {
	if len(result.RepracticeTargets) == 0 {
		return ""
	}
	return result.RepracticeTargets[0].Focus
}

func representativeEvidence(answers []string, weakType string) string {
	if len(answers) == 0 {
		return "暂无原回答证据。"
	}
	selected := strings.TrimSpace(answers[0])
	if weakType == "english_expression" {
		for _, answer := range answers {
			if wordCount(answer) < wordCount(selected) {
				selected = strings.TrimSpace(answer)
			}
		}
	} else {
		for _, answer := range answers {
			if len([]rune(strings.TrimSpace(answer))) > len([]rune(selected)) {
				selected = strings.TrimSpace(answer)
			}
		}
	}
	return compactText(selected, 180)
}

func cleanedAnswers(answers []string) []string {
	result := make([]string, 0, len(answers))
	for _, answer := range answers {
		if trimmed := strings.TrimSpace(answer); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func wordCount(text string) int {
	return len(strings.Fields(text))
}

func englishRatio(text string) float64 {
	letters := 0
	latin := 0
	for _, r := range text {
		if unicode.IsLetter(r) {
			letters++
			if r <= unicode.MaxASCII {
				latin++
			}
		}
	}
	if letters == 0 {
		return 0
	}
	return float64(latin) / float64(letters)
}

func compactText(value string, limit int) string {
	value = strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
	if limit <= 0 || len([]rune(value)) <= limit {
		return value
	}
	runes := []rune(value)
	return string(runes[:limit]) + "..."
}

func stableIDPart(sessionID string) string {
	if strings.TrimSpace(sessionID) == "" {
		return "unavailable"
	}
	return sessionID
}

func completeSession(state *assistant.RuntimeSnapshot, answers []string, feedback string) {
	if state.CurrentSessionID == "" {
		return
	}
	if updateSessionFeedback(state, state.CurrentSessionID, feedback) {
		return
	}
	endedAt := time.Now().UTC()
	state.Sessions = append(state.Sessions, assistant.InterviewSession{
		ID: state.CurrentSessionID, TargetRole: state.TargetRole, Interviewer: state.Interviewer,
		Status: "completed", MaxTurns: state.MaxTurns, DurationMinutes: state.DurationMinutes,
		CompletedTurns: state.CompletedQuestionCount, StartedAt: state.StartedAt, EndedAt: &endedAt,
		Questions: append([]string(nil), state.Questions...), Answers: append([]string(nil), answers...), Feedback: feedback,
	})
}

func updateSessionFeedback(state *assistant.RuntimeSnapshot, sessionID, feedback string) bool {
	for index := range state.Sessions {
		if state.Sessions[index].ID == sessionID {
			state.Sessions[index].Feedback = feedback
			return true
		}
	}
	return false
}
