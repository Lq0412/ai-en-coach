"use client";

import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
} from "livekit-client";
import { useEffect, useRef } from "react";

import {
  LIVE_BRIDGE_VERSION,
  LIVE_HOST_SOURCE,
  LiveCallFlow,
  LiveRecoveryController,
  createLiveSessionAPI,
  decodeLiveDataEvent,
  isIframeBridgeMessage,
  isTrustedMessageEvent,
  type LiveRoomPort,
  type LiveSessionCredentials,
  type LiveStatus,
  type RealtimeVoice,
} from "../lib/livekit-session";

type LiveConversationHostProps = {
  agentAPI: string;
  featureEnabled: boolean;
  prototypeURL: string;
};

type RoomCallbacks = {
  onData: (data: Uint8Array) => void;
  onReconnecting: () => void;
  onReconnected: () => void;
  onDisconnected: () => void;
};

const createBrowserRoom = (
  audioContainer: HTMLElement,
  callbacks: RoomCallbacks,
): LiveRoomPort => {
  const room = new Room({ adaptiveStream: true, dynacast: true });
  const audioElements = new Set<HTMLMediaElement>();
  let intentionalDisconnect = false;

  const detachTrack = (track: RemoteTrack) => {
    for (const element of track.detach()) {
      audioElements.delete(element);
      element.remove();
    }
  };
  const onTrackSubscribed = (track: RemoteTrack) => {
    if (track.kind !== Track.Kind.Audio) return;
    const element = track.attach();
    element.autoplay = true;
    element.setAttribute("playsinline", "");
    audioElements.add(element);
    audioContainer.append(element);
    void element.play().catch(() => undefined);
  };
  const onTrackUnsubscribed = (track: RemoteTrack) => {
    detachTrack(track);
  };
  const onDataReceived = (data: Uint8Array) => callbacks.onData(data);
  const onDisconnected = () => {
    if (intentionalDisconnect) return;
    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participant.audioTrackPublications.values()) {
        if (publication.track) detachTrack(publication.track);
      }
    }
    for (const element of audioElements) element.remove();
    audioElements.clear();
    callbacks.onDisconnected();
  };

  room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
  room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
  room.on(RoomEvent.DataReceived, onDataReceived);
  room.on(RoomEvent.Reconnecting, callbacks.onReconnecting);
  room.on(RoomEvent.Reconnected, callbacks.onReconnected);
  room.on(RoomEvent.Disconnected, onDisconnected);

  return {
    connect: async (credentials: LiveSessionCredentials) => {
      await room.connect(credentials.server_url, credentials.participant_token, {
        autoSubscribe: true,
      });
    },
    setMicrophoneEnabled: async (enabled: boolean) => {
      await room.localParticipant.setMicrophoneEnabled(enabled);
    },
    disconnect: async () => {
      intentionalDisconnect = true;
      room.removeAllListeners();
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.audioTrackPublications.values()) {
          if (publication.track) detachTrack(publication.track);
        }
      }
      for (const element of audioElements) element.remove();
      audioElements.clear();
      await room.disconnect();
    },
  };
};

export function LiveConversationHost({
  agentAPI,
  featureEnabled,
  prototypeURL,
}: LiveConversationHostProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const audioRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<LiveCallFlow | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    const iframe = iframeRef.current;
    const audioContainer = audioRef.current;
    if (!iframe || !audioContainer) return;

    const post = (type: "live.status" | "live.event", payload: unknown) => {
      iframe.contentWindow?.postMessage(
        {
          source: LIVE_HOST_SOURCE,
          version: LIVE_BRIDGE_VERSION,
          type,
          payload,
        },
        window.location.origin,
      );
    };
    const postStatus = (status: LiveStatus) => post("live.status", status);
    const flow = new LiveCallFlow({
      api: createLiveSessionAPI(agentAPI),
      createRoom: () =>
        createBrowserRoom(audioContainer, {
          onData: (data) => {
            const event = decodeLiveDataEvent(data);
            if (!event) return;
            post("live.event", event);
            if (event.type === "transcript.partial") {
              flowRef.current?.notifyState("listening");
            } else if (event.type === "turn.user_committed") {
              flowRef.current?.notifyState("thinking");
            } else if (
              event.type === "latency.point" &&
              event.latency &&
              typeof event.latency === "object" &&
              !Array.isArray(event.latency)
            ) {
              const stage = (event.latency as Record<string, unknown>).stage;
              if (stage === "assistant.audio_first") {
                flowRef.current?.notifyState("speaking");
              } else if (stage === "assistant.audio_stopped") {
                flowRef.current?.notifyState("listening");
              }
            } else if (event.type === "turn.failed") {
              flowRef.current?.notifyState(
                "failed",
                typeof event.error === "string"
                  ? event.error
                  : "实时回复生成失败",
              );
            }
          },
          onReconnecting: () => recovery.markReconnecting(),
          onReconnected: () => {
            recovery.markHealthy();
            flowRef.current?.notifyState("listening");
          },
          onDisconnected: () => {
            flowRef.current?.notifyState("reconnecting");
            void recovery.recoverNow();
          },
        }),
      onStatus: postStatus,
    });
    flowRef.current = flow;
    const recovery = new LiveRecoveryController({
      recover: () => flow.resume(),
      fallback: () => flow.end(),
      onState: (state, error) => flow.notifyState(state, error),
    });

    const recoverWhenForegrounded = () => {
      if (!document.hidden && flow.state === "reconnecting") {
        void recovery.recoverNow();
      }
    };

    const handleMessage = (event: MessageEvent) => {
      if (
        !isTrustedMessageEvent(
          event,
          iframe.contentWindow,
          window.location.origin,
          isIframeBridgeMessage,
        ) ||
        !featureEnabled ||
        busyRef.current
      ) return;
      const message = event.data as {
        type: string;
        payload: Record<string, unknown>;
      };
      const run = async () => {
        busyRef.current = true;
        try {
          if (message.type === "live.intent.start") {
            await flow.start({
              actor_user_id: String(message.payload.actor_user_id),
              thread_id: String(message.payload.thread_id),
              ...(message.payload.voice
                ? { voice: String(message.payload.voice) as RealtimeVoice }
                : {}),
            });
          } else if (message.type === "live.intent.resume") {
            if (message.payload.live_session_id === flow.liveSessionID) {
              await flow.resume();
              recovery.markHealthy();
            }
          } else if (message.type === "live.intent.end") {
            if (message.payload.live_session_id === flow.liveSessionID) {
              await flow.end();
            }
          } else if (message.type === "live.intent.mute") {
            await flow.setMuted(Boolean(message.payload.muted));
          } else if (message.type === "live.intent.recover") {
            await flow.end();
          }
        } catch {
          // LiveCallFlow emits a safe user-facing status for every failure.
        } finally {
          busyRef.current = false;
        }
      };
      void run();
    };

    window.addEventListener("message", handleMessage);
    window.addEventListener("online", recoverWhenForegrounded);
    document.addEventListener("visibilitychange", recoverWhenForegrounded);
    postStatus({
      state: "idle",
      muted: false,
      ...(!featureEnabled ? { error: "实时通话功能当前已关闭" } : {}),
    });
    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("online", recoverWhenForegrounded);
      document.removeEventListener("visibilitychange", recoverWhenForegrounded);
      recovery.dispose();
      flowRef.current = null;
      void flow.end().catch(() => undefined);
    };
  }, [agentAPI, featureEnabled]);

  return (
    <main className="prototype-host">
      <iframe
        ref={iframeRef}
        allow="microphone; autoplay"
        className="prototype-frame"
        src={prototypeURL}
        title="SpeakUp 产品原型"
      />
      <div ref={audioRef} className="livekit-audio-host" aria-hidden="true" />
    </main>
  );
}
