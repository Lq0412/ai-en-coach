import assert from "node:assert/strict";
import test from "node:test";

import {
  LiveCallFlow,
  createLiveSessionAPI,
} from "../app/lib/livekit-session.ts";

test("selected realtime voice is sent when the server session is created", async () => {
  let request;
  const api = createLiveSessionAPI("http://agent.test", async (input, init) => {
    request = new Request(input, init);
    return new Response(JSON.stringify({
      server_url: "wss://live.test",
      participant_token: "token-1",
      live_session: { live_session_id: "live-1" },
    }), { status: 201 });
  });

  await api.start({
    actor_user_id: "demo-user",
    thread_id: "thread-1",
    voice: "Jennifer",
  });

  const body = await request.json();
  assert.equal(body.actor_user_id, "demo-user");
  assert.equal(body.voice, "Jennifer");
  assert.equal(typeof body.idempotency_key, "string");
});

test("start, mute, resume, and end release the room and microphone", async () => {
  const calls = [];
  const statuses = [];
  const api = {
    start: async () => {
      calls.push("api:start");
      return {
        server_url: "wss://live.test",
        participant_token: "token-1",
        live_session: { live_session_id: "live-1" },
      };
    },
    resume: async (id) => {
      calls.push(`api:resume:${id}`);
      return {
        server_url: "wss://live.test",
        participant_token: "token-2",
        live_session: { live_session_id: id },
      };
    },
    end: async (id) => {
      calls.push(`api:end:${id}`);
    },
  };
  const rooms = [];
  const flow = new LiveCallFlow({
    api,
    createRoom: () => {
      const room = {
        connect: async () => calls.push("room:connect"),
        setMicrophoneEnabled: async (enabled) => calls.push(`mic:${enabled}`),
        disconnect: async () => calls.push("room:disconnect"),
      };
      rooms.push(room);
      return room;
    },
    onStatus: (status) => statuses.push(status),
  });

  await flow.start({ actor_user_id: "demo-user", thread_id: "thread-1" });
  flow.notifyState("speaking");
  await flow.setMuted(true);
  await flow.resume();
  await flow.end();

  assert.equal(rooms.length, 2);
  assert.deepEqual(
    statuses.map((status) => status.state),
    [
      "connecting",
      "listening",
      "speaking",
      "speaking",
      "connecting",
      "listening",
      "idle",
    ],
  );
  assert.deepEqual(calls, [
    "api:start",
    "room:connect",
    "mic:true",
    "mic:false",
    "mic:false",
    "room:disconnect",
    "api:resume:live-1",
    "room:connect",
    "mic:false",
    "mic:false",
    "room:disconnect",
    "api:end:live-1",
  ]);
});

test("microphone denial fails safely and leaves no active room", async () => {
  const statuses = [];
  let disconnected = 0;
  const flow = new LiveCallFlow({
    api: {
      start: async () => ({
        server_url: "wss://live.test",
        participant_token: "token",
        live_session: { live_session_id: "live-1" },
      }),
      resume: async () => {
        throw new Error("not used");
      },
      end: async () => undefined,
    },
    createRoom: () => ({
      connect: async () => undefined,
      setMicrophoneEnabled: async () => {
        throw new DOMException("Permission denied", "NotAllowedError");
      },
      disconnect: async () => {
        disconnected += 1;
      },
    }),
    onStatus: (status) => statuses.push(status),
  });

  await assert.rejects(
    flow.start({ actor_user_id: "demo-user", thread_id: "thread-1" }),
    /麦克风权限/,
  );
  assert.equal(disconnected, 1);
  assert.equal(statuses.at(-1).state, "failed");
  assert.equal(flow.liveSessionID, "");
});

test("connect failure ends the allocated server session and resume cleans its room", async () => {
  const calls = [];
  let roomNumber = 0;
  const flow = new LiveCallFlow({
    api: {
      start: async () => ({
        server_url: "wss://live.test",
        participant_token: "token",
        live_session: { live_session_id: "live-1" },
      }),
      resume: async () => ({
        server_url: "wss://live.test",
        participant_token: "token-2",
        live_session: { live_session_id: "live-1" },
      }),
      end: async (id) => {
        calls.push(`api:end:${id}`);
      },
    },
    createRoom: () => {
      roomNumber += 1;
      return {
        connect: async () => {
          if (roomNumber === 2) throw new Error("resume connect failed");
        },
        setMicrophoneEnabled: async () => undefined,
        disconnect: async () => calls.push(`room:${roomNumber}:disconnect`),
      };
    },
    onStatus: () => undefined,
  });
  await flow.start({ actor_user_id: "demo-user", thread_id: "thread-1" });
  await assert.rejects(flow.resume(), /resume connect failed/);
  assert.match(calls.join(","), /room:2:disconnect/);

  const failedStart = new LiveCallFlow({
    api: {
      start: async () => ({
        server_url: "wss://live.test",
        participant_token: "token",
        live_session: { live_session_id: "live-2" },
      }),
      resume: async () => {
        throw new Error("not used");
      },
      end: async (id) => {
        calls.push(`api:end:${id}`);
      },
    },
    createRoom: () => ({
      connect: async () => {
        throw new Error("connect failed");
      },
      setMicrophoneEnabled: async () => undefined,
      disconnect: async () => undefined,
    }),
    onStatus: () => undefined,
  });
  await assert.rejects(
    failedStart.start({ actor_user_id: "demo-user", thread_id: "thread-1" }),
    /connect failed/,
  );
  assert.ok(calls.includes("api:end:live-2"));
});

test("end emits idle even when the server end request fails", async () => {
  const statuses = [];
  const flow = new LiveCallFlow({
    api: {
      start: async () => ({
        server_url: "wss://live.test",
        participant_token: "token",
        live_session: { live_session_id: "live-1" },
      }),
      resume: async () => {
        throw new Error("not used");
      },
      end: async () => {
        throw new Error("server unavailable");
      },
    },
    createRoom: () => ({
      connect: async () => undefined,
      setMicrophoneEnabled: async () => undefined,
      disconnect: async () => undefined,
    }),
    onStatus: (status) => statuses.push(status),
  });
  await flow.start({ actor_user_id: "demo-user", thread_id: "thread-1" });
  await assert.rejects(flow.end(), /server unavailable/);
  assert.equal(statuses.at(-1).state, "idle");
  assert.equal(flow.liveSessionID, "");
});

test("end still calls the server when local room cleanup fails", async () => {
  const calls = [];
  const statuses = [];
  const flow = new LiveCallFlow({
    api: {
      start: async () => ({
        server_url: "wss://live.test",
        participant_token: "token",
        live_session: { live_session_id: "live-1" },
      }),
      resume: async () => {
        throw new Error("not used");
      },
      end: async (id) => {
        calls.push(`api:end:${id}`);
      },
    },
    createRoom: () => ({
      connect: async () => undefined,
      setMicrophoneEnabled: async () => undefined,
      disconnect: async () => {
        throw new Error("disconnect failed");
      },
    }),
    onStatus: (status) => statuses.push(status),
  });

  await flow.start({ actor_user_id: "demo-user", thread_id: "thread-1" });
  await assert.rejects(flow.end(), /disconnect failed/);
  assert.deepEqual(calls, ["api:end:live-1"]);
  assert.equal(statuses.at(-1).state, "idle");
  assert.equal(flow.liveSessionID, "");
});
