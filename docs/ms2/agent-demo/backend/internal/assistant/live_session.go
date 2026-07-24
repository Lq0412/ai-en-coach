package assistant

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/livekit/protocol/auth"
	"github.com/livekit/protocol/livekit"
)

var ErrLiveVoiceUnavailable = errors.New("assistant: live voice unavailable")
var ErrLiveSessionEnded = errors.New("assistant: live session already ended")

const defaultLiveKitTokenTTL = 10 * time.Minute

type LiveKitConfig struct {
	Enabled   bool
	ServerURL string
	APIKey    string
	APISecret string
	TokenTTL  time.Duration
}

func LoadLiveKitConfig() LiveKitConfig {
	tokenTTL := defaultLiveKitTokenTTL
	if seconds, err := strconv.Atoi(strings.TrimSpace(os.Getenv("LIVEKIT_TOKEN_TTL_SECONDS"))); err == nil &&
		seconds > 0 {
		tokenTTL = time.Duration(seconds) * time.Second
	}
	if tokenTTL > defaultLiveKitTokenTTL {
		tokenTTL = defaultLiveKitTokenTTL
	}
	return LiveKitConfig{
		Enabled:   strings.EqualFold(strings.TrimSpace(os.Getenv("LIVEKIT_VOICE_ENABLED")), "true") || os.Getenv("LIVEKIT_VOICE_ENABLED") == "1",
		ServerURL: strings.TrimSpace(os.Getenv("LIVEKIT_URL")),
		APIKey:    strings.TrimSpace(os.Getenv("LIVEKIT_API_KEY")),
		APISecret: strings.TrimSpace(os.Getenv("LIVEKIT_API_SECRET")),
		TokenTTL:  tokenTTL,
	}
}

func (config LiveKitConfig) available() bool {
	return config.Enabled &&
		strings.TrimSpace(config.ServerURL) != "" &&
		strings.TrimSpace(config.APIKey) != "" &&
		strings.TrimSpace(config.APISecret) != ""
}

func (config LiveKitConfig) Available() bool {
	return config.available()
}

type StartLiveSessionCommand struct {
	ActorUserID    string
	ThreadID       string
	IdempotencyKey string
}

type ResumeLiveSessionCommand struct {
	ActorUserID   string
	LiveSessionID string
}

type EndLiveSessionCommand struct {
	ActorUserID   string
	LiveSessionID string
}

type LiveSessionCredentials struct {
	ServerURL        string      `json:"server_url"`
	ParticipantToken string      `json:"participant_token"`
	Session          LiveSession `json:"live_session"`
	IssuedAt         time.Time   `json:"-"`
	ExpiresAt        time.Time   `json:"-"`
}

type liveSessionCoordinator struct {
	mu         sync.Mutex
	config     LiveKitConfig
	byID       map[string]LiveSession
	byStartKey map[string]string
	now        func() time.Time
}

func newLiveSessionCoordinator(config LiveKitConfig) *liveSessionCoordinator {
	return &liveSessionCoordinator{
		config: config, byID: map[string]LiveSession{}, byStartKey: map[string]string{},
		now: func() time.Time {
			return time.Now().UTC()
		},
	}
}

func (s *Service) StartLiveSession(ctx context.Context, command StartLiveSessionCommand) (LiveSessionCredentials, error) {
	if _, err := s.GetThread(ctx, GetThreadQuery{
		ActorUserID: command.ActorUserID, ThreadID: command.ThreadID,
	}); err != nil {
		return LiveSessionCredentials{}, err
	}
	if strings.TrimSpace(command.IdempotencyKey) == "" {
		return LiveSessionCredentials{}, errors.New("assistant: live session idempotency key is required")
	}
	return s.live.start(command)
}

func (s *Service) ResumeLiveSession(ctx context.Context, command ResumeLiveSessionCommand) (LiveSessionCredentials, error) {
	session, err := s.live.get(command.LiveSessionID)
	if err != nil {
		return LiveSessionCredentials{}, err
	}
	if _, err := s.GetThread(ctx, GetThreadQuery{
		ActorUserID: command.ActorUserID, ThreadID: session.ThreadID,
	}); err != nil {
		return LiveSessionCredentials{}, err
	}
	return s.live.credentials(session)
}

func (s *Service) EndLiveSession(ctx context.Context, command EndLiveSessionCommand) (LiveSession, error) {
	session, err := s.live.get(command.LiveSessionID)
	if err != nil {
		return LiveSession{}, err
	}
	if _, err := s.GetThread(ctx, GetThreadQuery{
		ActorUserID: command.ActorUserID, ThreadID: session.ThreadID,
	}); err != nil {
		return LiveSession{}, err
	}
	return s.live.end(session.ID)
}

func (s *Service) RecordLivePartial(liveSessionID, turnID string) error {
	return s.live.recordPartial(liveSessionID, turnID)
}

func (s *Service) CommitLiveTurn(liveSessionID, turnID string) error {
	return s.live.commitTurn(liveSessionID, turnID)
}

func (coordinator *liveSessionCoordinator) start(command StartLiveSessionCommand) (LiveSessionCredentials, error) {
	if !coordinator.config.available() {
		return LiveSessionCredentials{}, ErrLiveVoiceUnavailable
	}
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	key := command.ActorUserID + ":" + command.ThreadID + ":" + command.IdempotencyKey
	if id := coordinator.byStartKey[key]; id != "" {
		session := coordinator.byID[id]
		if session.Status == LiveSessionStatusEnded {
			return LiveSessionCredentials{}, ErrLiveSessionEnded
		}
		return coordinator.credentialsLocked(session)
	}
	now := coordinator.now()
	id := nextID("live-session")
	session := LiveSession{
		ID: id, ThreadID: command.ThreadID,
		RoomName:            "speakup-" + id,
		ParticipantIdentity: command.ActorUserID + ":" + id,
		Mode:                ConversationModeLive, Status: LiveSessionStatusConnecting,
		CreatedAt: now, UpdatedAt: now,
	}
	coordinator.byID[id] = session
	coordinator.byStartKey[key] = id
	return coordinator.credentialsLocked(session)
}

func (coordinator *liveSessionCoordinator) get(id string) (LiveSession, error) {
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	session, ok := coordinator.byID[id]
	if !ok {
		return LiveSession{}, ErrNotFound
	}
	return session, nil
}

func (coordinator *liveSessionCoordinator) credentials(session LiveSession) (LiveSessionCredentials, error) {
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	current, ok := coordinator.byID[session.ID]
	if !ok {
		return LiveSessionCredentials{}, ErrNotFound
	}
	if current.Status == LiveSessionStatusEnded {
		return LiveSessionCredentials{}, ErrLiveSessionEnded
	}
	current.Status = LiveSessionStatusReconnecting
	current.UpdatedAt = coordinator.now()
	coordinator.byID[current.ID] = current
	return coordinator.credentialsLocked(current)
}

func (coordinator *liveSessionCoordinator) credentialsLocked(session LiveSession) (LiveSessionCredentials, error) {
	if !coordinator.config.available() {
		return LiveSessionCredentials{}, ErrLiveVoiceUnavailable
	}
	ttl := coordinator.config.TokenTTL
	if ttl <= 0 || ttl > defaultLiveKitTokenTTL {
		ttl = defaultLiveKitTokenTTL
	}
	canPublish, canSubscribe, canPublishData := true, true, true
	grant := &auth.VideoGrant{
		RoomJoin: true, Room: session.RoomName,
		CanPublish: &canPublish, CanSubscribe: &canSubscribe,
		CanPublishData: &canPublishData,
	}
	grant.SetCanPublishSources([]livekit.TrackSource{livekit.TrackSource_MICROPHONE})
	metadata, err := json.Marshal(map[string]string{
		"actor_user_id":   strings.SplitN(session.ParticipantIdentity, ":", 2)[0],
		"thread_id":       session.ThreadID,
		"live_session_id": session.ID,
	})
	if err != nil {
		return LiveSessionCredentials{}, fmt.Errorf("assistant: create livekit metadata: %w", err)
	}
	issuedAt := coordinator.now()
	token, err := auth.NewAccessToken(coordinator.config.APIKey, coordinator.config.APISecret).
		SetIdentity(session.ParticipantIdentity).
		SetMetadata(string(metadata)).
		SetValidFor(ttl).
		AddGrant(grant).
		ToJWT()
	if err != nil {
		return LiveSessionCredentials{}, fmt.Errorf("assistant: create livekit token: %w", err)
	}
	return LiveSessionCredentials{
		ServerURL: coordinator.config.ServerURL, ParticipantToken: token,
		Session: session, IssuedAt: issuedAt, ExpiresAt: issuedAt.Add(ttl),
	}, nil
}

func (coordinator *liveSessionCoordinator) recordPartial(sessionID, turnID string) error {
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	session, ok := coordinator.byID[sessionID]
	if !ok {
		return ErrNotFound
	}
	session.PartialTurnID = strings.TrimSpace(turnID)
	session.UpdatedAt = coordinator.now()
	coordinator.byID[sessionID] = session
	return nil
}

func (coordinator *liveSessionCoordinator) commitTurn(sessionID, turnID string) error {
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	session, ok := coordinator.byID[sessionID]
	if !ok {
		return ErrNotFound
	}
	turnID = strings.TrimSpace(turnID)
	for _, committed := range session.CommittedTurnIDs {
		if committed == turnID {
			return nil
		}
	}
	session.CommittedTurnIDs = append(session.CommittedTurnIDs, turnID)
	if session.PartialTurnID == turnID {
		session.PartialTurnID = ""
	}
	session.UpdatedAt = coordinator.now()
	coordinator.byID[sessionID] = session
	return nil
}

func (coordinator *liveSessionCoordinator) end(sessionID string) (LiveSession, error) {
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	session, ok := coordinator.byID[sessionID]
	if !ok {
		return LiveSession{}, ErrNotFound
	}
	session.PartialTurnID = ""
	session.Status = LiveSessionStatusEnded
	session.UpdatedAt = coordinator.now()
	coordinator.byID[sessionID] = session
	return session, nil
}
