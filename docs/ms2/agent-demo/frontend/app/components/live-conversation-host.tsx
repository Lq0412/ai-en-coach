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
  createLiveSessionAPI,
  decodeLiveDataEvent,
  isIframeBridgeMessage,
  isTrustedMessageEvent,
  type LiveRoomPort,
  type LiveSessionCredentials,
  type LiveStatus,
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
  onAudioState: (playing: boolean) => void;
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
    element.addEventListener("playing", () => callbacks.onAudioState(true));
    element.addEventListener("pause", () => callbacks.onAudioState(false));
    element.addEventListener("ended", () => callbacks.onAudioState(false));
    audioElements.add(element);
    audioContainer.append(element);
    void element.play().catch(() => {
      callbacks.onAudioState(false);
    });
  };
  const onTrackUnsubscribed = (track: RemoteTrack) => {
    detachTrack(track);
    callbacks.onAudioState(false);
  };
  const onDataReceived = (data: Uint8Array) => callbacks.onData(data);
  const onDisconnected = () => {
    if (!intentionalDisconnect) callbacks.onDisconnected();
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
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
            } else if (event.type === "turn.failed") {
              flowRef.current?.notifyState(
                "failed",
                typeof event.error === "string"
                  ? event.error
                  : "实时回复生成失败",
              );
            }
          },
          onReconnecting: () => flowRef.current?.notifyState("reconnecting"),
          onReconnected: () => flowRef.current?.notifyState("listening"),
          onDisconnected: () => {
            const message = "实时连接已中断，已回到普通模式";
            flowRef.current?.notifyState("failed", message);
            fallbackTimerRef.current = setTimeout(() => {
              void flowRef.current?.end().catch(() => undefined);
            }, 2_500);
          },
          onAudioState: (playing) =>
            flowRef.current?.notifyState(playing ? "speaking" : "listening"),
        }),
      onStatus: postStatus,
    });
    flowRef.current = flow;

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
            });
          } else if (message.type === "live.intent.resume") {
            if (message.payload.live_session_id === flow.liveSessionID) {
              await flow.resume();
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
    postStatus({ state: "idle", muted: false });
    return () => {
      window.removeEventListener("message", handleMessage);
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
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
