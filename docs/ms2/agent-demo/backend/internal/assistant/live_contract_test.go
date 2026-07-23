package assistant

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestLiveContractRejectsInvalidEvents(t *testing.T) {
	valid := LiveEvent{
		Type:            LiveEventTranscriptPartial,
		ThreadID:        "thread-1",
		LiveSessionID:   "live-1",
		TurnID:          "turn-1",
		ClientMessageID: "client-1",
		Mode:            ConversationModeLive,
		OccurredAt:      time.UnixMilli(1000).UTC(),
		Sequence:        1,
		Transcript:      "hello",
	}

	tests := []struct {
		name   string
		mutate func(*LiveEvent)
		want   string
	}{
		{name: "thread", mutate: func(event *LiveEvent) { event.ThreadID = "" }, want: "thread_id"},
		{name: "live session", mutate: func(event *LiveEvent) { event.LiveSessionID = "" }, want: "live_session_id"},
		{name: "turn", mutate: func(event *LiveEvent) { event.TurnID = "" }, want: "turn_id"},
		{name: "client message", mutate: func(event *LiveEvent) { event.ClientMessageID = "" }, want: "client_message_id"},
		{name: "mode", mutate: func(event *LiveEvent) { event.Mode = ConversationMode("automatic") }, want: "mode"},
		{name: "occurred at", mutate: func(event *LiveEvent) { event.OccurredAt = time.Time{} }, want: "occurred_at"},
		{name: "sequence", mutate: func(event *LiveEvent) { event.Sequence = 0 }, want: "sequence"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			event := valid
			test.mutate(&event)
			if err := event.Validate(); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("Validate() error = %v, want field %q", err, test.want)
			}
		})
	}
}

func TestLiveContractKeepsPartialEphemeralAndCanonicalExplicit(t *testing.T) {
	partial := LiveEvent{
		Type:            LiveEventTranscriptPartial,
		ThreadID:        "thread-1",
		LiveSessionID:   "live-1",
		TurnID:          "turn-1",
		ClientMessageID: "client-1",
		Mode:            ConversationModeLive,
		OccurredAt:      time.UnixMilli(1000).UTC(),
		Sequence:        1,
		Transcript:      "hel",
	}
	if err := partial.Validate(); err != nil {
		t.Fatalf("partial Validate() error = %v", err)
	}
	if partial.Canonical() {
		t.Fatal("partial transcript must remain ephemeral")
	}
	data, err := json.Marshal(partial)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), `"message"`) {
		t.Fatalf("partial event serialized a canonical message: %s", data)
	}

	committed := partial
	committed.Type = LiveEventTurnUserCommitted
	committed.Sequence = 2
	committed.Transcript = "hello"
	committed.Message = &AssistantMessage{
		ID:              "message-1",
		Role:            "user",
		Content:         "hello",
		ClientMessageID: "client-1",
		LiveSessionID:   "live-1",
		TurnID:          "turn-1",
		Mode:            ConversationModeLive,
	}
	if err := committed.Validate(); err != nil {
		t.Fatalf("committed Validate() error = %v", err)
	}
	if !committed.Canonical() {
		t.Fatal("turn.user_committed must be canonical")
	}
}

func TestLiveContractAcceptsAssistantDeltaAsEphemeral(t *testing.T) {
	event := LiveEvent{
		Type:            LiveEventAssistantDelta,
		ThreadID:        "thread-1",
		LiveSessionID:   "live-1",
		TurnID:          "turn-1",
		ClientMessageID: "client-1",
		Mode:            ConversationModeLive,
		OccurredAt:      time.UnixMilli(1000).UTC(),
		Sequence:        1,
		Delta:           "Hello",
	}
	if err := event.Validate(); err != nil {
		t.Fatal(err)
	}
	if event.Canonical() {
		t.Fatal("assistant delta must remain ephemeral")
	}
	event.Delta = ""
	if err := event.Validate(); err == nil {
		t.Fatal("empty assistant delta must be rejected")
	}
}

func TestLiveContractReconcilesDuplicateClientMessageToCanonicalTurn(t *testing.T) {
	existing := LiveTurn{
		ThreadID:        "thread-1",
		LiveSessionID:   "live-1",
		TurnID:          "turn-canonical",
		ClientMessageID: "client-stable",
		Mode:            ConversationModeLive,
		UserMessageID:   "message-canonical",
	}
	retry := existing
	retry.TurnID = "turn-retry"
	retry.UserMessageID = "message-retry"

	got, created, err := ReconcileCanonicalTurn(&existing, retry)
	if err != nil {
		t.Fatal(err)
	}
	if created {
		t.Fatal("duplicate client_message_id must not create another canonical turn")
	}
	if got.TurnID != existing.TurnID || got.UserMessageID != existing.UserMessageID {
		t.Fatalf("got retry turn %#v, want existing canonical turn %#v", got, existing)
	}
	if existing.IdempotencyKey() != retry.IdempotencyKey() {
		t.Fatalf("retry idempotency key changed: %q != %q", existing.IdempotencyKey(), retry.IdempotencyKey())
	}
}

func TestLiveContractLatencyPointsAreCorrelatedAndMonotonic(t *testing.T) {
	trace := NewLiveLatencyTrace("thread-1", "live-1", "turn-1", "client-1", ConversationModeLive)
	first, err := trace.Record(LiveLatencyCaptureEnded, LiveLatencySourceBrowser, time.UnixMilli(1000).UTC())
	if err != nil {
		t.Fatal(err)
	}
	second, err := trace.Record(LiveLatencyTranscriptCommitted, LiveLatencySourceGo, time.UnixMilli(1200).UTC())
	if err != nil {
		t.Fatal(err)
	}
	if first.Sequence != 1 || second.Sequence != 2 {
		t.Fatalf("sequences = %d, %d; want 1, 2", first.Sequence, second.Sequence)
	}
	if first.ThreadID != second.ThreadID ||
		first.LiveSessionID != second.LiveSessionID ||
		first.TurnID != second.TurnID ||
		first.ClientMessageID != second.ClientMessageID {
		t.Fatalf("latency correlation changed: %#v %#v", first, second)
	}
	if _, err := trace.Record(LiveLatencyAssistantTextFirst, LiveLatencySourceWorker, time.UnixMilli(1100).UTC()); err == nil {
		t.Fatal("out-of-order latency point must be rejected")
	}
}

func TestLegacyAssistantMessageJSONStillDecodes(t *testing.T) {
	const legacy = `{"ID":"message-1","Role":"user","Content":"hello","CreatedAt":"2026-07-23T00:00:00Z"}`
	var message AssistantMessage
	if err := json.Unmarshal([]byte(legacy), &message); err != nil {
		t.Fatal(err)
	}
	if message.ID != "message-1" || message.Role != "user" || message.Content != "hello" {
		t.Fatalf("legacy message changed: %#v", message)
	}
	if message.ClientMessageID != "" || message.LiveSessionID != "" || message.TurnID != "" || message.Mode != "" {
		t.Fatalf("legacy message unexpectedly gained live identity: %#v", message)
	}
	roundTrip, err := json.Marshal(message)
	if err != nil {
		t.Fatal(err)
	}
	for _, liveField := range []string{
		"client_message_id",
		"live_session_id",
		"turn_id",
		"mode",
	} {
		if strings.Contains(string(roundTrip), `"`+liveField+`"`) {
			t.Fatalf("legacy message serialized empty %s: %s", liveField, roundTrip)
		}
	}
	if !strings.Contains(string(roundTrip), `"ID":"message-1"`) {
		t.Fatalf("legacy message ID JSON shape changed: %s", roundTrip)
	}
}
