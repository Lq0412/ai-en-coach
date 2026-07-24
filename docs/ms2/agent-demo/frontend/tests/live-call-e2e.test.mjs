import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  LiveCallFlow,
  LiveRecoveryController,
} from "../app/lib/livekit-session.ts";

test("token refresh is attempted once on the same session before fallback", async () => {
  const calls = [];
  const timers = [];
  const statuses = [];
  const credentials = (token) => ({
    server_url: "wss://live.test",
    participant_token: token,
    live_session: { live_session_id: "live-1" },
  });
  const flow = new LiveCallFlow({
    api: {
      start: async () => credentials("token-1"),
      resume: async (id) => {
        calls.push(`resume:${id}`);
        return credentials("token-2");
      },
      end: async (id) => {
        calls.push(`end:${id}`);
      },
    },
    createRoom: () => ({
      connect: async () => undefined,
      setMicrophoneEnabled: async () => undefined,
      disconnect: async () => undefined,
    }),
    onStatus: (status) => statuses.push(status),
  });
  const recovery = new LiveRecoveryController({
    recover: () => flow.resume(),
    fallback: () => flow.end(),
    onState: (state, error) => flow.notifyState(state, error),
    schedule: (callback) => {
      const timer = { callback, cancelled: false };
      timers.push(timer);
      return timer;
    },
    cancel: (timer) => {
      timer.cancelled = true;
    },
  });

  await flow.start({ actor_user_id: "demo-user", thread_id: "thread-1" });
  await recovery.recoverNow();
  assert.equal(flow.liveSessionID, "live-1");
  assert.deepEqual(calls, ["resume:live-1"]);

  await recovery.recoverNow();
  const fallbackTimer = timers.findLast((timer) => !timer.cancelled);
  fallbackTimer.callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["resume:live-1", "end:live-1"]);
  assert.equal(flow.state, "idle");
  assert.ok(statuses.some((status) => status.state === "failed"));
  recovery.dispose();
});

test("resume rejects a token issued for a different live session", async () => {
  const flow = new LiveCallFlow({
    api: {
      start: async () => ({
        server_url: "wss://live.test",
        participant_token: "token-1",
        live_session: { live_session_id: "live-1" },
      }),
      resume: async () => ({
        server_url: "wss://live.test",
        participant_token: "token-2",
        live_session: { live_session_id: "live-2" },
      }),
      end: async () => undefined,
    },
    createRoom: () => ({
      connect: async () => undefined,
      setMicrophoneEnabled: async () => undefined,
      disconnect: async () => undefined,
    }),
    onStatus: () => undefined,
  });
  await flow.start({ actor_user_id: "demo-user", thread_id: "thread-1" });
  await assert.rejects(flow.resume(), /不同的会话/);
});

test("host wires reconnect, foreground recovery, and feature-off signaling", async () => {
  const [host, page, bridge] = await Promise.all([
    readFile(
      new URL("../app/components/live-conversation-host.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../public/prototype/assets/agent-backend-bridge.js",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(host, /RoomEvent\.Reconnecting/);
  assert.match(host, /visibilitychange/);
  assert.match(host, /window\.addEventListener\("online"/);
  assert.match(host, /recovery\.recoverNow/);
  assert.match(host, /实时通话功能当前已关闭/);
  assert.match(host, /assistant\.audio_first/);
  assert.match(host, /assistant\.audio_stopped/);
  assert.doesNotMatch(host, /notifyState\(playing \? "speaking"/);
  assert.match(page, /NEXT_PUBLIC_LIVEKIT_VOICE_ENABLED/);
  assert.match(bridge, /attachment\.failed/);
  assert.match(bridge, /aria-label="录音未保存"/);
  assert.match(bridge, /aria-label="本次录音不可用"/);
});
