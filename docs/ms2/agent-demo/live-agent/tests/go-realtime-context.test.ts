import assert from "node:assert/strict";
import test from "node:test";

import { GoRealtimeContext } from "../src/providers/go-realtime-context.js";

const metadata = {
  actor_user_id: "demo-user",
  thread_id: "thread/one",
  live_session_id: "live-1",
};

test("loads the shared realtime prompt for the active user and thread", async () => {
  let requested = "";
  const client = new GoRealtimeContext("http://go.example/", async (input) => {
    requested = String(input);
    return new Response(JSON.stringify({
      instructions: "shared prompt",
      context_version: "abc123",
    }), { status: 200 });
  });

  assert.deepEqual(await client.load(metadata), {
    instructions: "shared prompt",
    context_version: "abc123",
  });
  assert.equal(
    requested,
    "http://go.example/v1/assistant/threads/thread%2Fone/realtime-context?actor_user_id=demo-user",
  );
});

test("creates a persistent scenario with a retry-safe tool-call key", async () => {
  let request: Request | undefined;
  const client = new GoRealtimeContext("http://go.example", async (input, init) => {
    request = new Request(input, init);
    return new Response(JSON.stringify({ id: "scenario-1", current: true }), { status: 201 });
  });

  const result = await client.createLearningScenario(
    metadata,
    "message-1",
    "call-1",
    {
      type: "interview",
      title: "Backend interview",
      goal: "Practice a backend engineering interview",
      participants: ["interviewer", "candidate"],
    },
  );

  assert.equal(result.id, "scenario-1");
  assert.equal(request?.method, "POST");
  assert.equal(request?.headers.get("idempotency-key"), "live-scenario:live-1:call-1");
  assert.deepEqual(await request?.json(), {
    source_thread_id: "thread/one",
    created_from_message_id: "message-1",
    type: "interview",
    title: "Backend interview",
    goal: "Practice a backend engineering interview",
    participants: ["interviewer", "candidate"],
    facts: [],
    material_ids: [],
  });
});
