import assert from "node:assert/strict";
import test from "node:test";

import { SessionContext } from "../src/session-context.js";
import { TurnAudioBuffer } from "../src/turn-audio-buffer.js";
import { TurnCommitter } from "../src/turn-committer.js";
import {
  ConversationOrchestrator,
  omniWebsocketURL,
  parseJobMetadata,
} from "../src/worker.js";
import {
  QwenOmniRealtimeModel,
  QWEN_OMNI_REALTIME_MODEL,
} from "../src/providers/qwen-omni-realtime.js";
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

test("live runtime is pinned to the end-to-end Qwen Omni realtime model", () => {
  const model = new QwenOmniRealtimeModel({ apiKey: "test-key" });
  assert.equal(model.model, QWEN_OMNI_REALTIME_MODEL);
  assert.equal(model.model, "qwen3.5-omni-flash-realtime");
  assert.equal(model.capabilities.turnDetection, true);
  assert.equal(model.capabilities.audioOutput, true);
  assert.equal(model.capabilities.userTranscription, true);
  assert.equal(
    omniWebsocketURL({ DASHSCOPE_WORKSPACE_ID: "workspace-1" }),
    "wss://workspace-1.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime",
  );
});

test("worker registers provider capabilities for every custom voice node", () => {
  const orchestrator = new ConversationOrchestrator(
    {} as never,
    {
      actor_user_id: "demo-user",
      thread_id: "thread-1",
      live_session_id: "live-1",
    },
    "http://127.0.0.1:8080",
  );
  const agent = orchestrator.createAgent();

  assert.equal(agent.stt?.capabilities.streaming, true);
  assert.equal(agent.stt?.capabilities.interimResults, true);
  assert.equal(agent.stt?.provider, "go");
  assert.equal(agent.llm?.provider, "go");
  assert.equal(agent.tts?.provider, "go");
  assert.equal(agent.tts?.capabilities.streaming, true);
  assert.equal(agent.turnHandling?.preemptiveGeneration?.enabled, false);
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

test("audio assessment runs after linking and does not discard a saved recording on failure", async () => {
  const sequence: string[] = [];
  const successful = new TurnAudioBuffer({
    maxBytes: 8,
    upload: async () => {
      sequence.push("upload");
      return "attachment-1";
    },
    link: async () => {
      sequence.push("link");
      return { ID: "message-1" };
    },
    assess: async (_audio, messageID, referenceText) => {
      sequence.push(`assess:${messageID}:${referenceText}`);
      return {
        ID: messageID,
        learning_assessment: { provider: "xunfei.suntone", pronunciation: 88 },
      };
    },
  });
  successful.append("turn-1", new Uint8Array([1, 0]));
  const assessed = await successful.commit("turn-1", "message-1", "hello");
  assert.deepEqual(sequence, ["upload", "link", "assess:message-1:hello"]);
  assert.equal(
    (assessed?.assessmentMessage?.learning_assessment as Record<string, unknown>)
      .pronunciation,
    88,
  );

  const failing = new TurnAudioBuffer({
    maxBytes: 8,
    upload: async () => "attachment-2",
    link: async () => ({ ID: "message-2" }),
    assess: async () => {
      throw new Error("quota exhausted");
    },
  });
  failing.append("turn-2", new Uint8Array([1, 0]));
  const linked = await failing.commit("turn-2", "message-2", "hello");
  assert.equal(linked?.message?.ID, "message-2");
  assert.equal(linked?.assessmentError, "quota exhausted");
});

test("committed turn streams speech and publishes only canonical message events", async () => {
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
  const background: Promise<void>[] = [];
  for await (const delta of streamCommittedTurn({
    context,
    committer,
    audio,
    publish: async (event) => {
      events.push(event);
    },
    onBackgroundTask: (task) => background.push(task),
  })) {
    deltas.push(delta);
  }
  await Promise.all(background);

  assert.deepEqual(deltas, ["Hi", " there"]);
  assert.deepEqual(events.map((event) => event.type), [
    "turn.user_committed",
    "latency.point",
    "turn.assistant_committed",
    "attachment.linked",
  ]);
  assert.deepEqual(
    events.map((event) => event.sequence),
    [1, 2, 3, 4],
  );
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

test("interrupting a generated turn aborts its pending Go LLM request", async () => {
  const context = new SessionContext({
    actorUserID: "demo-user",
    threadID: "thread-1",
    liveSessionID: "live-1",
  });
  context.beginTurn({ turnID: "turn-1", clientMessageID: "client-1" });
  context.finalizeTranscript("hello");
  let requestSignal: AbortSignal | undefined;
  const committer = new TurnCommitter({
    streamTurn: async (_turn, callbacks = {}, signal) => {
      requestSignal = signal;
      await callbacks.onUserCommitted?.({
        ID: "message-user",
        client_message_id: "client-1",
      });
      await callbacks.onAssistantDelta?.("Hi");
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    },
  });
  const stream = streamCommittedTurn({
    context,
    committer,
    audio: new TurnAudioBuffer({
      maxBytes: 16,
      upload: async () => "attachment-1",
      link: async () => undefined,
    }),
    publish: async () => undefined,
  });

  assert.deepEqual(await stream.next(), { value: "Hi", done: false });
  await stream.return(undefined);

  assert.equal(requestSignal?.aborted, true);
  assert.match(String(requestSignal?.reason), /interrupted/);
});
