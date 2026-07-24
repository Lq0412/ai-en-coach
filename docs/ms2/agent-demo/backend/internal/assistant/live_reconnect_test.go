package assistant

import (
	"errors"
	"testing"
	"time"
)

func TestLiveSessionRefreshesTokenWithoutChangingCanonicalSession(t *testing.T) {
	config := testLiveKitConfig()
	config.TokenTTL = 2 * time.Minute
	coordinator := newLiveSessionCoordinator(config)
	now := time.Date(2026, 7, 23, 8, 0, 0, 0, time.UTC)
	coordinator.now = func() time.Time { return now }
	command := StartLiveSessionCommand{
		ActorUserID:    DemoUserID,
		ThreadID:       DemoThreadID,
		IdempotencyKey: "start-1",
	}
	started, err := coordinator.start(command)
	if err != nil {
		t.Fatal(err)
	}
	if err := coordinator.recordPartial(started.Session.ID, "turn-partial"); err != nil {
		t.Fatal(err)
	}
	if err := coordinator.commitTurn(started.Session.ID, "turn-committed"); err != nil {
		t.Fatal(err)
	}

	now = now.Add(3 * time.Minute)
	refreshed, err := coordinator.credentials(started.Session)
	if err != nil {
		t.Fatal(err)
	}
	if refreshed.Session.ID != started.Session.ID ||
		refreshed.Session.RoomName != started.Session.RoomName ||
		refreshed.Session.ParticipantIdentity != started.Session.ParticipantIdentity {
		t.Fatalf("refresh changed canonical session: %#v %#v", started.Session, refreshed.Session)
	}
	if !refreshed.IssuedAt.Equal(now) ||
		!refreshed.ExpiresAt.Equal(now.Add(config.TokenTTL)) {
		t.Fatalf("refresh timestamps = %v %v", refreshed.IssuedAt, refreshed.ExpiresAt)
	}
	current, err := coordinator.get(started.Session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(current.CommittedTurnIDs) != 1 ||
		current.CommittedTurnIDs[0] != "turn-committed" {
		t.Fatalf("refresh lost committed turn identity: %#v", current)
	}
}

func TestEndedLiveSessionRejectsStaleResumeAndDuplicateStart(t *testing.T) {
	coordinator := newLiveSessionCoordinator(testLiveKitConfig())
	command := StartLiveSessionCommand{
		ActorUserID:    DemoUserID,
		ThreadID:       DemoThreadID,
		IdempotencyKey: "start-ended",
	}
	started, err := coordinator.start(command)
	if err != nil {
		t.Fatal(err)
	}
	stale := started.Session
	if _, err := coordinator.end(stale.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := coordinator.credentials(stale); !errors.Is(err, ErrLiveSessionEnded) {
		t.Fatalf("stale resume error = %v, want ErrLiveSessionEnded", err)
	}
	if _, err := coordinator.start(command); !errors.Is(err, ErrLiveSessionEnded) {
		t.Fatalf("duplicate start error = %v, want ErrLiveSessionEnded", err)
	}
	current, err := coordinator.get(stale.ID)
	if err != nil {
		t.Fatal(err)
	}
	if current.Status != LiveSessionStatusEnded {
		t.Fatalf("stale resume overwrote ended state: %#v", current)
	}
}

func TestLiveKitTokenTTLConfigIsBounded(t *testing.T) {
	t.Setenv("LIVEKIT_TOKEN_TTL_SECONDS", "3600")
	config := LoadLiveKitConfig()
	if config.TokenTTL != defaultLiveKitTokenTTL {
		t.Fatalf("token TTL = %v, want maximum %v", config.TokenTTL, defaultLiveKitTokenTTL)
	}
}
