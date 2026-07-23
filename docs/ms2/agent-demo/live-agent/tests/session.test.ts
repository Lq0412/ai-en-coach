import assert from "node:assert/strict";
import test from "node:test";

import { SessionContext } from "../src/session-context.js";
import { TurnAudioBuffer } from "../src/turn-audio-buffer.js";
import { TurnCommitter } from "../src/turn-committer.js";
import { parseJobMetadata } from "../src/worker.js";
import { boundedTextSegments } from "../src/worker.js";
import { streamCommittedTurn } from "../src/worker.js";

test("worker metadata prefers job data and falls back to participant token metadata", () => {
  const job = JSON.stringify({
    actor_user_id: "job-user",
    thread_id: "thread-1",
    live_session_id: "live-1",
  });
  const participant = JSON.stringify({
    actor_user_id: "participant-user",
    thread_id: "thread-2",
    live_session_id: "live-2",
  });
  assert.equal(parseJobMetadata(job, participant).actor_user_id, "job-user");
  assert.equal(parseJobMetadata("", participant).actor_user_id, "participant-user");
  assert.throws(() => parseJobMetadata("", ""), /metadata is missing/);
});

test("session context emits correlated monotonic events and handles false interruption", () => {
  const context = new SessionContext({
    actorUserID: "demo-user",
    threadID: "thread-1",
    liveSessionID: "live-1",
  });
  const turn = context.beginTurn();
  const partial = context.event(turn, "transcript.partial", {
    transcript: "hel",
  });
  const final = context.event(turn, "turn.user_committed", {
    message: { ID: "message-1", client_message_id: turn.clientMessageID },
  });
  assert.equal(partial.sequence, 1);
  assert.equal(final.sequence, 2);
  assert.equal(partial.turn_id, final.turn_id);
  assert.equal(partial.thread_id, "thread-1");
  assert.equal(partial.mode, "live");

  const speech = context.startSpeech();
  assert.equal(context.interruptSpeech(), true);
  assert.equal(speech.signal.aborted, true);
  assert.equal(context.recoverFalseInterruption(), "listening");
});

test("finalized turns detach from continuous STT input and remain FIFO for generation", () => {
  const context = new SessionContext({
    actorUserID: "demo-user",
    threadID: "thread-1",
    liveSessionID: "live-1",
  });
  const first = context.beginTurn({ turnID: "turn-1", clientMessageID: "client-1" });
  context.finalizeTranscript("first");
  const second = context.requireTurn();
  context.finalizeTranscript("second");

  assert.notEqual(second.turnID, first.turnID);
  assert.equal(context.takeFinalizedTurn()?.transcript, "first");
  assert.equal(context.takeFinalizedTurn()?.transcript, "second");
  assert.equal(context.takeFinalizedTurn(), undefined);
});

test("TTS text segmentation flushes punctuation, bounded chunks, and final tail", async () => {
  async function* text() {
    yield "Hello";
    yield " world. This tail";
  }
  const segments = [];
  for await (const segment of boundedTextSegments(text(), 8)) segments.push(segment);
  assert.deepEqual(segments, ["Hello wo", "rld.", "This tai", "l"]);
});

test("audio buffer uploads committed turn once and drops cancelled or oversized turns", async () => {
  const uploads: Uint8Array[] = [];
  const links: string[] = [];
  const buffer = new TurnAudioBuffer({
    maxBytes: 4,
    upload: async (audio) => {
      uploads.push(audio);
      return "attachment-1";
    },
    link: async (messageID, attachmentID) => {
      links.push(`${messageID}:${attachmentID}`);
    },
  });
  buffer.append("turn-1", new Uint8Array([1, 2]));
  buffer.append("turn-1", new Uint8Array([3, 4]));
  await buffer.commit("turn-1", "message-1");
  await buffer.commit("turn-1", "message-1");
  assert.equal(uploads.length, 1);
  assert.deepEqual(links, ["message-1:attachment-1"]);

  buffer.append("turn-2", new Uint8Array([1]));
  buffer.cancel("turn-2");
  await buffer.commit("turn-2", "message-2");
  assert.equal(uploads.length, 1);
  assert.throws(
    () => buffer.append("turn-3", new Uint8Array([1, 2, 3, 4, 5])),
    /maximum/,
  );
});

test("audio buffer bounds completed upload idempotency entries", async () => {
  let uploads = 0;
  const buffer = new TurnAudioBuffer({
    maxBytes: 4,
    maxRecentCommits: 2,
    upload: async () => {
      uploads += 1;
      return `attachment-${uploads}`;
    },
    link: async () => undefined,
  });
  for (const turn of ["1", "2", "3"]) {
    buffer.append(turn, new Uint8Array([1, 0]));
    await buffer.commit(turn, `message-${turn}`);
  }
  buffer.append("1", new Uint8Array([1, 0]));
  await buffer.commit("1", "message-1b");
  assert.equal(uploads, 4);
});

test("committed turn publishes canonical, delta, attachment, and failure events", async () => {
  const context = new SessionContext({
    actorUserID: "demo-user",
    threadID: "thread-1",
    liveSessionID: "live-1",
  });
  const turn = context.beginTurn({
    turnID: "turn-1",
    clientMessageID: "client-1",
  });
  const audio = new TurnAudioBuffer({
    maxBytes: 16,
    upload: async () => "attachment-1",
    link: async () => ({
      ID: "message-user",
      Role: "user",
      Content: "hello",
      client_message_id: "client-1",
      attachments: [{ id: "attachment-1", mediaType: "audio/wav" }],
    }),
  });
  audio.append(turn.turnID, new Uint8Array([1, 2]));
  context.finalizeTranscript("hello");
  const committer = new TurnCommitter({
    streamTurn: async (_turn, callbacks = {}) => {
      const userMessage = {
        ID: "message-user",
        Role: "user",
        Content: "hello",
        client_message_id: "client-1",
      };
      const assistantMessage = {
        ID: "message-assistant",
        Role: "assistant",
        Content: "Hi there",
        client_message_id: "client-1",
      };
      await callbacks.onUserCommitted?.(userMessage);
      await callbacks.onAssistantDelta?.("Hi");
      await callbacks.onAssistantDelta?.(" there");
      await callbacks.onAssistantCommitted?.(assistantMessage);
      return { userMessage, assistantMessage, assistantText: "Hi there" };
    },
  });
  const events: Record<string, unknown>[] = [];
  const deltas: string[] = [];
  for await (const delta of streamCommittedTurn({
    context,
    committer,
    audio,
    publish: async (event) => {
      events.push(event);
    },
  })) {
    deltas.push(delta);
  }

  assert.deepEqual(deltas, ["Hi", " there"]);
  assert.deepEqual(events.map((event) => event.type), [
    "turn.user_committed",
    "assistant.delta",
    "assistant.delta",
    "turn.assistant_committed",
    "attachment.linked",
  ]);
  assert.deepEqual(events.map((event) => event.sequence), [1, 2, 3, 4, 5]);
  assert.equal(
    (events.at(-1)?.payload as Record<string, unknown>).attachment_id,
    "attachment-1",
  );

  const failedContext = new SessionContext({
    actorUserID: "demo-user",
    threadID: "thread-1",
    liveSessionID: "live-1",
  });
  failedContext.beginTurn({ turnID: "turn-failed", clientMessageID: "client-failed" });
  failedContext.finalizeTranscript("fail");
  const failedEvents: Record<string, unknown>[] = [];
  const failedStream = streamCommittedTurn({
    context: failedContext,
    committer: new TurnCommitter({
      streamTurn: async () => {
        throw new Error("adapter unavailable");
      },
    }),
    audio,
    publish: async (event) => {
      failedEvents.push(event);
    },
  });
  await assert.rejects(async () => {
    for await (const _delta of failedStream) {
      // Drain the generator.
    }
  }, /adapter unavailable/);
  assert.equal(failedEvents.at(-1)?.type, "turn.failed");
  assert.match(
    String((failedEvents.at(-1)?.payload as Record<string, unknown>).error),
    /adapter unavailable/,
  );
});
