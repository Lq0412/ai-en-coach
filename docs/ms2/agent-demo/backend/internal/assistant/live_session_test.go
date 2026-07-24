package assistant

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/livekit/protocol/auth"
)

func testLiveKitConfig() LiveKitConfig {
	return LiveKitConfig{
		Enabled: true, ServerURL: "wss://example.livekit.cloud",
		APIKey: "api-key", APISecret: "api-secret", TokenTTL: 10 * time.Minute,
	}
}

func TestLiveSessionUnavailableWhenDisabledOrIncomplete(t *testing.T) {
	for _, config := range []LiveKitConfig{
		{},
		{Enabled: true, ServerURL: "wss://example.livekit.cloud"},
	} {
		service := NewService(Dependencies{
			ConversationStore: NewMemoryConversationStore(),
			LiveKit:           config,
		})
		_, err := service.StartLiveSession(context.Background(), StartLiveSessionCommand{
			ActorUserID: DemoUserID, ThreadID: DemoThreadID, IdempotencyKey: "start-1",
		})
		if !errors.Is(err, ErrLiveVoiceUnavailable) {
			t.Fatalf("config %#v error = %v", config, err)
		}
	}
}

func TestLiveSessionIssuesScopedShortLivedTokenAndIsIdempotent(t *testing.T) {
	service := NewService(Dependencies{
		ConversationStore: NewMemoryConversationStore(),
		LiveKit:           testLiveKitConfig(),
	})
	command := StartLiveSessionCommand{
		ActorUserID: DemoUserID, ThreadID: DemoThreadID, IdempotencyKey: "start-1",
		Voice: "Jennifer",
	}
	first, err := service.StartLiveSession(context.Background(), command)
	if err != nil {
		t.Fatal(err)
	}
	second, err := service.StartLiveSession(context.Background(), command)
	if err != nil {
		t.Fatal(err)
	}
	if first.Session.ID != second.Session.ID || first.Session.RoomName != second.Session.RoomName {
		t.Fatalf("duplicate start created a second binding: %#v %#v", first, second)
	}
	resumed, err := service.ResumeLiveSession(context.Background(), ResumeLiveSessionCommand{
		ActorUserID: DemoUserID, LiveSessionID: first.Session.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if resumed.Session.RoomName != first.Session.RoomName {
		t.Fatalf("resume changed room binding: %#v", resumed)
	}
	verifier, err := auth.ParseAPIToken(first.ParticipantToken)
	if err != nil {
		t.Fatal(err)
	}
	grants, err := verifier.Verify(testLiveKitConfig().APISecret)
	if err != nil {
		t.Fatal(err)
	}
	if grants.Video == nil ||
		!grants.Video.RoomJoin ||
		grants.Video.Room != first.Session.RoomName ||
		!grants.Video.GetCanPublish() ||
		!grants.Video.GetCanSubscribe() ||
		grants.Video.RoomAdmin ||
		grants.Video.RoomRecord ||
		grants.Video.RoomCreate ||
		len(grants.Video.CanPublishSources) != 1 ||
		grants.Video.CanPublishSources[0] != "microphone" {
		t.Fatalf("token permissions are not minimal: %#v", grants.Video)
	}
	var metadata map[string]string
	if err := json.Unmarshal([]byte(grants.Metadata), &metadata); err != nil {
		t.Fatalf("token metadata is not valid JSON: %v", err)
	}
	if metadata["actor_user_id"] != DemoUserID ||
		metadata["thread_id"] != DemoThreadID ||
		metadata["live_session_id"] != first.Session.ID ||
		metadata["voice"] != "Jennifer" ||
		len(metadata) != 4 {
		t.Fatalf("token metadata is not minimally scoped: %#v", metadata)
	}
	for _, sensitive := range []string{
		testLiveKitConfig().APIKey,
		testLiveKitConfig().APISecret,
		"messages",
		"prompt",
	} {
		if strings.Contains(grants.Metadata, sensitive) {
			t.Fatalf("token metadata contains sensitive value %q", sensitive)
		}
	}
	if first.ExpiresAt.Sub(first.IssuedAt) > 10*time.Minute+time.Second {
		t.Fatalf("token is not short lived: %#v", first)
	}
}

func TestLiveSessionVoiceDefaultsAndRejectsUnsupportedValues(t *testing.T) {
	service := NewService(Dependencies{
		ConversationStore: NewMemoryConversationStore(),
		LiveKit:           testLiveKitConfig(),
	})
	started, err := service.StartLiveSession(context.Background(), StartLiveSessionCommand{
		ActorUserID: DemoUserID, ThreadID: DemoThreadID, IdempotencyKey: "voice-default",
	})
	if err != nil {
		t.Fatal(err)
	}
	if started.Session.Voice != defaultOmniRealtimeVoice {
		t.Fatalf("default voice=%q", started.Session.Voice)
	}
	_, err = service.StartLiveSession(context.Background(), StartLiveSessionCommand{
		ActorUserID: DemoUserID, ThreadID: DemoThreadID,
		IdempotencyKey: "voice-invalid", Voice: "unknown",
	})
	if !errors.Is(err, ErrUnsupportedRealtimeVoice) {
		t.Fatalf("unsupported voice error=%v", err)
	}
}

func TestLiveSessionRejectsUnknownThreadAndEndDropsPartialOnly(t *testing.T) {
	service := NewService(Dependencies{
		ConversationStore: NewMemoryConversationStore(),
		LiveKit:           testLiveKitConfig(),
	})
	_, err := service.StartLiveSession(context.Background(), StartLiveSessionCommand{
		ActorUserID: DemoUserID, ThreadID: "missing", IdempotencyKey: "missing",
	})
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown thread error = %v", err)
	}
	started, err := service.StartLiveSession(context.Background(), StartLiveSessionCommand{
		ActorUserID: DemoUserID, ThreadID: DemoThreadID, IdempotencyKey: "start-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.RecordLivePartial(started.Session.ID, "turn-partial"); err != nil {
		t.Fatal(err)
	}
	if err := service.CommitLiveTurn(started.Session.ID, "turn-committed"); err != nil {
		t.Fatal(err)
	}
	ended, err := service.EndLiveSession(context.Background(), EndLiveSessionCommand{
		ActorUserID: DemoUserID, LiveSessionID: started.Session.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if ended.Status != LiveSessionStatusEnded ||
		ended.PartialTurnID != "" ||
		len(ended.CommittedTurnIDs) != 1 ||
		ended.CommittedTurnIDs[0] != "turn-committed" {
		t.Fatalf("unexpected finalized session: %#v", ended)
	}
}

func TestCommitOmniLiveTurnPersistsCanonicalPairIdempotently(t *testing.T) {
	store := NewMemoryConversationStore()
	service := NewService(Dependencies{
		ConversationStore: store,
		LiveKit:           testLiveKitConfig(),
	})
	started, err := service.StartLiveSession(context.Background(), StartLiveSessionCommand{
		ActorUserID: DemoUserID, ThreadID: DemoThreadID, IdempotencyKey: "omni-start",
	})
	if err != nil {
		t.Fatal(err)
	}
	command := CommitOmniLiveTurnCommand{
		ActorUserID: DemoUserID, ThreadID: DemoThreadID,
		LiveSessionID: started.Session.ID, TurnID: "turn-omni-1",
		ClientMessageID: "client-omni-1", UserTranscript: "Hello",
		AssistantTranscript: "Hi, nice to meet you.",
		InterviewSetup: &InterviewSetupCard{
			Title:      "Backend Engineer interview",
			TargetRole: "Backend Engineer",
			Goal:       "Practice system design and project deep dives",
		},
	}
	first, err := service.CommitOmniLiveTurn(context.Background(), command)
	if err != nil {
		t.Fatal(err)
	}
	second, err := service.CommitOmniLiveTurn(context.Background(), command)
	if err != nil {
		t.Fatal(err)
	}
	if first.UserMessage.ID == "" || first.AssistantMessage.ID == "" {
		t.Fatalf("missing canonical messages: %#v", first)
	}
	if first.AssistantMessage.Kind != "interview_setup_card" ||
		first.AssistantMessage.InterviewSetup == nil ||
		first.AssistantMessage.InterviewSetup.TargetRole != "Backend Engineer" {
		t.Fatalf("missing interview setup card: %#v", first.AssistantMessage)
	}
	if second.UserMessage.ID != first.UserMessage.ID ||
		second.AssistantMessage.ID != first.AssistantMessage.ID {
		t.Fatalf("retry created a second pair: %#v %#v", first, second)
	}
	messages, err := store.ListMessages(context.Background(), DemoThreadID)
	if err != nil {
		t.Fatal(err)
	}
	var matching int
	for _, message := range messages {
		if message.ClientMessageID == command.ClientMessageID {
			matching++
			if message.Mode != ConversationModeLive ||
				message.LiveSessionID != command.LiveSessionID ||
				message.TurnID != command.TurnID {
				t.Fatalf("lost live correlation: %#v", message)
			}
		}
	}
	if matching != 2 {
		t.Fatalf("canonical pair count=%d want=2", matching)
	}
}
