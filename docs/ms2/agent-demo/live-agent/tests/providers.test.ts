import assert from "node:assert/strict";
import test from "node:test";

import { GoLLM } from "../src/providers/go-llm.js";
import { GoSTT, type WebSocketLike } from "../src/providers/go-stt.js";
import { GoTTS, pcm16AudioFrames } from "../src/providers/go-tts.js";
import { TurnCommitter } from "../src/turn-committer.js";

const sseResponse = (blocks: string[]) =>
  new Response(blocks.join("\n\n") + "\n\n", {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });

test("Go LLM streams one canonical user message before assistant deltas", async () => {
  const requests: Record<string, unknown>[] = [];
  const llm = new GoLLM({
    baseURL: "http://go.test",
    fetch: async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return sseResponse([
        "event: task.started\ndata: {}",
        'event: turn.user_committed\ndata: {"message":{"ID":"message-1","Role":"user","Content":"hello","client_message_id":"client-1"}}',
        'event: assistant.delta\ndata: {"delta":"Hi"}',
        'event: assistant.delta\ndata: {"delta":" there"}',
        'event: turn.assistant_committed\ndata: {"message":{"ID":"message-2","Role":"assistant","Content":"Hi there","client_message_id":"client-1"}}',
        'event: task.completed\ndata: {"task_run":{"ID":"run-1"}}',
      ]);
    },
  });
  const deltas: string[] = [];
  const result = await llm.streamTurn(
    {
      actorUserID: "demo-user",
      threadID: "thread-1",
      liveSessionID: "live-1",
      turnID: "turn-1",
      clientMessageID: "client-1",
      transcript: "hello",
    },
    {
      onAssistantDelta: (delta) => {
        deltas.push(delta);
      },
    },
  );
  assert.equal(result.userMessage.ID, "message-1");
  assert.equal(result.assistantMessage.ID, "message-2");
  assert.equal(result.assistantText, "Hi there");
  assert.deepEqual(deltas, ["Hi", " there"]);
  assert.equal(requests[0]?.idempotency_key, "client-1");
  assert.equal(requests[0]?.mode, "live");
});

test("turn committer coalesces concurrent and retried final transcripts", async () => {
  let calls = 0;
  const committer = new TurnCommitter({
    streamTurn: async () => {
      calls += 1;
      return {
        userMessage: { ID: "message-1", client_message_id: "client-1" },
        assistantMessage: { ID: "message-2", client_message_id: "client-1" },
        assistantText: "Hi",
      };
    },
  });
  const turn = {
    actorUserID: "demo-user",
    threadID: "thread-1",
    liveSessionID: "live-1",
    turnID: "turn-1",
    clientMessageID: "client-1",
    transcript: "hello",
  };
  const [first, second] = await Promise.all([
    committer.commit(turn),
    committer.commit(turn),
  ]);
  assert.equal(first.userMessage.ID, second.userMessage.ID);
  assert.equal((await committer.commit(turn)).userMessage.ID, "message-1");
  assert.equal(calls, 1);
});

test("turn committer bounds completed idempotency entries", async () => {
  let calls = 0;
  const committer = new TurnCommitter(
    {
      streamTurn: async (turn) => {
        calls += 1;
        return {
          userMessage: {
            ID: `message-user-${turn.turnID}`,
            client_message_id: turn.clientMessageID,
          },
          assistantMessage: {
            ID: `message-assistant-${turn.turnID}`,
            client_message_id: turn.clientMessageID,
          },
          assistantText: "Hi",
        };
      },
    },
    { maxRecent: 2 },
  );
  const turn = (turnID: string) => ({
    actorUserID: "demo-user",
    threadID: "thread-1",
    liveSessionID: "live-1",
    turnID,
    clientMessageID: `client-${turnID}`,
    transcript: "hello",
  });
  await committer.commit(turn("1"));
  await committer.commit(turn("2"));
  await committer.commit(turn("3"));
  await committer.commit(turn("1"));
  assert.equal(calls, 4);
});

test("Go TTS requests fixed PCM24K and frames split PCM16 samples correctly", async () => {
  const tts = new GoTTS({
    baseURL: "http://go.test",
    fetch: async (_input, init) => {
      assert.deepEqual(JSON.parse(String(init?.body)), {
        text: "Hello",
        format: "pcm",
        sample_rate: 24000,
      });
      return new Response(new Uint8Array([1, 0, 2, 0, 3, 0]), {
        status: 200,
        headers: { "content-type": "audio/pcm" },
      });
    },
  });
  async function* splitPCM() {
    for await (const chunk of tts.synthesize("Hello")) {
      yield chunk.slice(0, 1);
      yield chunk.slice(1, 5);
      yield chunk.slice(5);
    }
  }
  const frames = [];
  for await (const frame of pcm16AudioFrames(splitPCM(), 2)) frames.push(frame);
  assert.equal(tts.sampleRate, 24000);
  assert.deepEqual(frames.map((frame) => [...frame.data]), [[1, 2], [3]]);
});

test("Go STT forwards PCM and emits partial before final transcript", async () => {
  class FakeSocket extends EventTarget implements WebSocketLike {
    readyState = 1;
    sent: Array<string | ArrayBufferLike | ArrayBufferView> = [];

    send(data: string | ArrayBufferLike | ArrayBufferView) {
      this.sent.push(data);
      if (typeof data === "string") {
        queueMicrotask(() => {
          this.dispatchEvent(
            new MessageEvent("message", {
              data: '{"type":"transcript.delta","transcript":"hel"}',
            }),
          );
          this.dispatchEvent(
            new MessageEvent("message", {
              data: '{"type":"transcript.completed","transcript":"hello"}',
            }),
          );
          this.dispatchEvent(
            new MessageEvent("message", {
              data: '{"type":"transcription.done"}',
            }),
          );
        });
      }
    }

    close() {}
  }

  const socket = new FakeSocket();
  const stt = new GoSTT({
    baseURL: "http://go.test",
    openSocket: () => {
      queueMicrotask(() => socket.dispatchEvent(new Event("open")));
      return socket;
    },
  });
  const events = [];
  async function* audio() {
    yield new Uint8Array([1, 2]);
  }
  for await (const event of stt.stream(audio())) events.push(event);
  assert.deepEqual(events, [
    { type: "partial", transcript: "hel" },
    { type: "final", transcript: "hello" },
  ]);
  assert.deepEqual([...(socket.sent[0] as Uint8Array)], [1, 2]);
  assert.equal(socket.sent[1], '{"type":"stop"}');
});
