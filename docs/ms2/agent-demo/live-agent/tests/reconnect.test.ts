import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeadline,
  createIdleDeadline,
  safeErrorMessage,
  type TimeoutScheduler,
} from "../src/resilience.js";
import { GoLLM } from "../src/providers/go-llm.js";
import { SessionContext } from "../src/session-context.js";
import { TurnAudioBuffer } from "../src/turn-audio-buffer.js";
import { TurnCommitter } from "../src/turn-committer.js";
import {
  liveVoiceFeatureEnabled,
  streamCommittedTurn,
} from "../src/worker.js";

class FakeScheduler implements TimeoutScheduler {
  callbacks = new Map<object, () => void>();

  setTimeout(callback: () => void): object {
    const handle = {};
    this.callbacks.set(handle, callback);
    return handle;
  }

  clearTimeout(handle: unknown): void {
    this.callbacks.delete(handle as object);
  }

  fireAll(): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of callbacks) callback();
  }
}

test("provider deadlines respect prior abort and reset on realtime activity", () => {
  const scheduler = new FakeScheduler();
  const parent = new AbortController();
  parent.abort(new Error("interrupted"));
  const deadline = createDeadline(parent.signal, 1_000, "provider", scheduler);
  assert.equal(deadline.signal.aborted, true);
  assert.match(String(deadline.signal.reason), /interrupted/);
  deadline.cleanup();

  const idle = createIdleDeadline(undefined, 1_000, "STT", scheduler);
  const firstHandle = [...scheduler.callbacks.keys()][0];
  assert.ok(firstHandle);
  idle.touch();
  assert.equal(scheduler.callbacks.has(firstHandle), false);
  assert.equal(idle.signal.aborted, false);
  idle.touch();
  assert.equal(idle.signal.aborted, false);
  scheduler.fireAll();
  assert.equal(idle.signal.aborted, true);
  assert.match(String(idle.signal.reason), /idle/);
  idle.cleanup();
});

test("an already aborted turn never starts a provider request", async () => {
  let requests = 0;
  const llm = new GoLLM({
    baseURL: "http://go.test",
    fetch: async () => {
      requests += 1;
      return new Response();
    },
  });
  const interrupted = new AbortController();
  interrupted.abort(new Error("interrupted"));
  await assert.rejects(
    llm.streamTurn(
      {
        actorUserID: "demo-user",
        threadID: "thread-1",
        liveSessionID: "live-1",
        turnID: "turn-1",
        clientMessageID: "client-1",
        transcript: "hello",
      },
      {},
      interrupted.signal,
    ),
    /interrupted/,
  );
  assert.equal(requests, 0);
});

test("attachment failure is observable without failing a committed text turn", async () => {
  const context = new SessionContext({
    actorUserID: "demo-user",
    threadID: "thread-1",
    liveSessionID: "live-1",
  });
  const turn = context.beginTurn({
    turnID: "turn-1",
    clientMessageID: "client-1",
  });
  context.finalizeTranscript("hello");
  const audio = new TurnAudioBuffer({
    maxBytes: 16,
    upload: async () => {
      throw new Error("upload failed sk-secret");
    },
    link: async () => undefined,
  });
  audio.append(turn.turnID, new Uint8Array([1, 2]));
  const committer = new TurnCommitter({
    streamTurn: async (_turn, callbacks = {}) => {
      const userMessage = {
        ID: "message-user",
        client_message_id: "client-1",
      };
      const assistantMessage = {
        ID: "message-assistant",
        Content: "Hi",
        client_message_id: "client-1",
      };
      await callbacks.onUserCommitted?.(userMessage);
      await callbacks.onAssistantDelta?.("Hi");
      await callbacks.onAssistantCommitted?.(assistantMessage);
      return { userMessage, assistantMessage, assistantText: "Hi" };
    },
  });
  const events: Record<string, unknown>[] = [];
  const background: Promise<void>[] = [];
  const deltas: string[] = [];
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
  assert.deepEqual(deltas, ["Hi"]);
  assert.equal(events.some((event) => event.type === "turn.failed"), false);
  await Promise.all(background);
  const attachmentFailure = events.find(
    (event) => event.type === "attachment.failed",
  );
  assert.ok(attachmentFailure);
  const payload = attachmentFailure.payload as Record<string, unknown>;
  assert.equal(payload.stage, "attachment.upload");
  assert.doesNotMatch(String(payload.error), /sk-secret/);
  assert.match(safeErrorMessage(new Error("Bearer abc")), /\[redacted\]/);
});

test("speech turns remain correlated when a newer turn starts first", () => {
  const context = new SessionContext({
    actorUserID: "demo-user",
    threadID: "thread-1",
    liveSessionID: "live-1",
  });
  const first = context.beginTurn({
    turnID: "turn-1",
    clientMessageID: "client-1",
  });
  context.finalizeTranscript("first");
  const second = context.beginTurn({
    turnID: "turn-2",
    clientMessageID: "client-2",
  });
  context.queueSpeechTurn(first);
  context.queueSpeechTurn(second);
  assert.equal(context.latestTurn?.turnID, "turn-2");
  assert.equal(context.claimSpeechTurn()?.turnID, "turn-1");
  assert.equal(context.claimSpeechTurn()?.turnID, "turn-2");
});

test("worker rollout flag matches backend and frontend values", () => {
  assert.equal(liveVoiceFeatureEnabled("true"), true);
  assert.equal(liveVoiceFeatureEnabled("1"), true);
  assert.equal(liveVoiceFeatureEnabled("false"), false);
  assert.equal(liveVoiceFeatureEnabled(undefined), false);
});
