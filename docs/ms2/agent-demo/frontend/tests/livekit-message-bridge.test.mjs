import assert from "node:assert/strict";
import test from "node:test";

import {
  LIVE_BRIDGE_SOURCE,
  LIVE_BRIDGE_VERSION,
  LIVE_HOST_SOURCE,
  decodeLiveDataEvent,
  isHostBridgeMessage,
  isIframeBridgeMessage,
  isTrustedMessageEvent,
} from "../app/lib/livekit-session.ts";

test("accepts only known, bounded iframe commands", () => {
  const valid = {
    source: LIVE_BRIDGE_SOURCE,
    version: LIVE_BRIDGE_VERSION,
    type: "live.intent.start",
    payload: { actor_user_id: "demo-user", thread_id: "thread-demo-001" },
  };
  assert.equal(isIframeBridgeMessage(valid), true);
  assert.equal(isIframeBridgeMessage({ ...valid, type: "live.intent.destroy" }), false);
  assert.equal(isIframeBridgeMessage({ ...valid, extra: true }), false);
  assert.equal(
    isIframeBridgeMessage({
      ...valid,
      payload: { ...valid.payload, thread_id: "x".repeat(300) },
    }),
    false,
  );
});

test("validates source window, same origin, and host schema together", () => {
  const frameWindow = {};
  const message = {
    source: LIVE_HOST_SOURCE,
    version: LIVE_BRIDGE_VERSION,
    type: "live.status",
    payload: { state: "listening", muted: false, live_session_id: "live-1" },
  };
  assert.equal(
    isTrustedMessageEvent(
      { source: frameWindow, origin: "https://speakup.test", data: message },
      frameWindow,
      "https://speakup.test",
      isHostBridgeMessage,
    ),
    true,
  );
  assert.equal(
    isTrustedMessageEvent(
      { source: {}, origin: "https://speakup.test", data: message },
      frameWindow,
      "https://speakup.test",
      isHostBridgeMessage,
    ),
    false,
  );
  assert.equal(
    isTrustedMessageEvent(
      { source: frameWindow, origin: "https://evil.test", data: message },
      frameWindow,
      "https://speakup.test",
      isHostBridgeMessage,
    ),
    false,
  );
});

test("decodes bounded canonical and partial LiveKit data events", () => {
  const encoded = new TextEncoder().encode(
    JSON.stringify({
      type: "transcript.partial",
      mode: "live",
      thread_id: "thread-1",
      live_session_id: "live-1",
      turn_id: "turn-1",
      client_message_id: "client-1",
      sequence: 1,
      occurred_at: new Date().toISOString(),
      payload: { transcript: "hel" },
    }),
  );
  assert.equal(decodeLiveDataEvent(encoded)?.transcript, "hel");
  assert.equal(decodeLiveDataEvent(new Uint8Array(20_000)), null);
});

test("decodes bounded worker failures and rejects oversized details", () => {
  const event = {
    type: "turn.failed",
    mode: "live",
    thread_id: "thread-1",
    live_session_id: "live-1",
    turn_id: "turn-1",
    client_message_id: "client-1",
    sequence: 2,
    occurred_at: new Date().toISOString(),
    payload: { error: "adapter unavailable" },
  };
  assert.equal(
    decodeLiveDataEvent(new TextEncoder().encode(JSON.stringify(event)))?.error,
    "adapter unavailable",
  );
  event.payload.error = "x".repeat(501);
  assert.equal(
    decodeLiveDataEvent(new TextEncoder().encode(JSON.stringify(event))),
    null,
  );
});
