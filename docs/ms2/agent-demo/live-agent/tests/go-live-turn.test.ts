import assert from "node:assert/strict";
import test from "node:test";

import { GoLiveTurnRecorder } from "../src/providers/go-live-turn.js";

test("persists an interview setup card with the canonical live turn", async () => {
  let request: Request | undefined;
  const recorder = new GoLiveTurnRecorder("http://go.example", async (input, init) => {
    request = new Request(input, init);
    return new Response(JSON.stringify({
      user_message: { ID: "user-1" },
      assistant_message: {
        ID: "assistant-1",
        kind: "interview_setup_card",
      },
    }), { status: 200 });
  });
  await recorder.commit({
    actorUserID: "demo-user",
    threadID: "thread-1",
    liveSessionID: "live-1",
    turnID: "turn-1",
    clientMessageID: "client-1",
    transcript: "Create a Go interview",
  }, "I prepared a card for you.", {
    title: "Go backend interview",
    target_role: "Go Backend Engineer",
    goal: "Practice system design",
  });

  assert.deepEqual(await request?.json(), {
    actor_user_id: "demo-user",
    thread_id: "thread-1",
    turn_id: "turn-1",
    client_message_id: "client-1",
    user_transcript: "Create a Go interview",
    assistant_transcript: "I prepared a card for you.",
    interview_setup: {
      title: "Go backend interview",
      target_role: "Go Backend Engineer",
      goal: "Practice system design",
    },
  });
});
