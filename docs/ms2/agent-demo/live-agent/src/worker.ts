import {
  ServerOptions,
  cli,
  defineAgent,
  llm,
  normalizeLanguage,
  stt,
  tts,
  voice,
  type JobContext,
} from "@livekit/agents";
import { AudioFrame, AudioResampler } from "@livekit/rtc-node";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { GoLLM } from "./providers/go-llm.js";
import { GoSTT } from "./providers/go-stt.js";
import { GoTTS, pcm16AudioFrames } from "./providers/go-tts.js";
import { GoRealtimeContext } from "./providers/go-realtime-context.js";
import {
  configuredTimeoutMS,
  safeErrorMessage,
} from "./resilience.js";
import {
  SessionContext,
  type TurnContext,
} from "./session-context.js";
import { TurnAudioBuffer } from "./turn-audio-buffer.js";
import { TurnCommitter } from "./turn-committer.js";
import { OmniConversationOrchestrator } from "./omni-orchestrator.js";

const JobMetadata = z.object({
  actor_user_id: z.string().min(1),
  thread_id: z.string().min(1),
  live_session_id: z.string().min(1),
  voice: z.enum(["Tina", "Jennifer", "Mione", "Aiden", "Ethan", "Raymond"]).optional(),
});

export type WorkerJobMetadata = z.infer<typeof JobMetadata>;

export const TTS_AUDIO_FRAME_BRIDGE_READY = true;

export const standardTTSVoiceForRealtimeVoice = (
  voice: WorkerJobMetadata["voice"],
): string => {
  switch (voice) {
    case "Jennifer":
    case "Mione":
      return "loongeva_v3.6";
    case "Aiden":
      return "loongjohn";
    case "Ethan":
    case "Raymond":
      return "longjielidou_v3.6";
    case "Tina":
    default:
      return "longanhuan_v3.6";
  }
};

export const parseJobMetadata = (
  metadata: string,
  participantMetadata = "",
): WorkerJobMetadata => {
  const selected = metadata.trim() || participantMetadata.trim();
  if (!selected) {
    throw new Error(
      "LiveKit job metadata is missing actor_user_id, thread_id, and live_session_id",
    );
  }
  return JobMetadata.parse(JSON.parse(selected));
};

const speechEvent = (type: stt.SpeechEventType, text: string): stt.SpeechEvent => ({
  type,
  alternatives: [
    {
      language: normalizeLanguage("en"),
      text,
      startTime: 0,
      endTime: 0,
      confidence: 1,
    },
  ],
});

class HookBackedGoSTT extends stt.STT {
  readonly label = "go-stt";

  constructor() {
    super({
      streaming: true,
      interimResults: true,
      alignedTranscript: false,
    });
  }

  override get provider(): string {
    return "go";
  }

  override get model(): string {
    return "qwen3-asr-flash-realtime";
  }

  protected override async _recognize(): Promise<stt.SpeechEvent> {
    throw new Error("Go STT is only available through the streaming agent hook");
  }

  override stream(): stt.SpeechStream {
    throw new Error("Go STT streaming is provided by the agent sttNode hook");
  }
}

class HookBackedGoLLM extends llm.LLM {
  override label(): string {
    return "go-llm";
  }

  override get provider(): string {
    return "go";
  }

  override get model(): string {
    return "qwen";
  }

  override chat(): llm.LLMStream {
    throw new Error("Go LLM is only available through the agent llmNode hook");
  }
}

class HookBackedGoTTS extends tts.TTS {
  override label = "go-tts";

  constructor() {
    super(24_000, 1, { streaming: true });
  }

  override get provider(): string {
    return "go";
  }

  override get model(): string {
    return "qwen3-tts-flash-realtime";
  }

  override synthesize(): tts.ChunkedStream {
    throw new Error("Go TTS is only available through the agent ttsNode hook");
  }

  override stream(): tts.SynthesizeStream {
    throw new Error("Go TTS streaming is provided by the agent ttsNode hook");
  }
}

const pcmBytes = (frame: AudioFrame): Uint8Array =>
  new Uint8Array(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength).slice();

const wavPCM16Mono16K = (pcm: Uint8Array): Uint8Array<ArrayBuffer> => {
  const wav = new Uint8Array(44 + pcm.byteLength);
  const view = new DataView(wav.buffer);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true);
  view.setUint32(28, 32_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  wav.set(pcm, 44);
  return wav;
};

const responseJSON = async (response: Response): Promise<Record<string, unknown>> => {
  if (!response.ok) throw new Error(`Go attachment endpoint failed with HTTP ${response.status}`);
  return (await response.json()) as Record<string, unknown>;
};

const attachmentCallbacks = (baseURL: string) => {
  const root = baseURL.replace(/\/$/, "");
  return {
    maxBytes: 8 << 20,
    upload: async (pcm: Uint8Array): Promise<string> => {
      const wav = wavPCM16Mono16K(pcm);
      const form = new FormData();
      form.append("file", new Blob([wav.buffer], { type: "audio/wav" }), "voice-turn.wav");
      const payload = await responseJSON(
        await fetch(`${root}/v1/assistant/attachments`, { method: "POST", body: form }),
      );
      const attachment = payload.attachment as Record<string, unknown> | undefined;
      const id = String(attachment?.ID ?? attachment?.id ?? "");
      if (!id) throw new Error("Go attachment endpoint omitted attachment ID");
      return id;
    },
    link: async (
      messageID: string,
      attachmentID: string,
    ): Promise<Record<string, unknown>> => {
      const payload = await responseJSON(
        await fetch(
          `${root}/v1/assistant/messages/${encodeURIComponent(messageID)}/attachments`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ attachment_id: attachmentID }),
          },
        ),
      );
      const message = payload.message;
      if (!message || typeof message !== "object" || !("ID" in message)) {
        throw new Error("Go attachment link endpoint omitted canonical message");
      }
      return message as Record<string, unknown>;
    },
  };
};

type CommittedTurnStreamOptions = {
  context: SessionContext;
  committer: TurnCommitter;
  audio: TurnAudioBuffer;
  publish: (event: Record<string, unknown>) => Promise<void>;
  onBackgroundTask?: (task: Promise<void>) => void;
};

export async function* streamCommittedTurn({
  context,
  committer,
  audio,
  publish,
  onBackgroundTask,
}: CommittedTurnStreamOptions): AsyncGenerator<string> {
  const turn = context.takeFinalizedTurn();
  if (!turn?.transcript) {
    throw new Error("LLM node invoked without a finalized transcript");
  }

  const deltas: string[] = [];
  let wake: (() => void) | undefined;
  let completed = false;
  let failure: unknown;
  let speechTurnQueued = false;
  const operation = new AbortController();
  const committed = committer
    .commit(
      turn,
      {
        onUserCommitted: async (message) => {
          await publish(context.event(turn, "turn.user_committed", { message }));
          await publish(context.latencyEvent(turn, "turn.persisted"));
        },
        onAssistantDelta: async (delta) => {
          deltas.push(delta);
          wake?.();
          wake = undefined;
        },
        onAssistantCommitted: async (message) => {
          await publish(
            context.event(turn, "turn.assistant_committed", { message }),
          );
        },
      },
      operation.signal,
    )
    .then((result) => {
      const attachmentTask = audio
        .commit(turn.turnID, result.userMessage.ID, turn.transcript)
        .then(async (linked) => {
          if (!linked?.message) return;
          if (linked.message.client_message_id !== turn.clientMessageID) {
            throw new Error("linked recording message correlation mismatch");
          }
          await publish(
            context.event(turn, "attachment.linked", {
              attachment_id: linked.attachmentID,
              message: linked.message,
            }),
          );
          if (linked.assessmentMessage) {
            await publish(
              context.event(turn, "assessment.completed", {
                message: linked.assessmentMessage,
              }),
            );
          } else if (linked.assessmentError) {
            await publish(
              context.event(turn, "assessment.failed", {
                error: linked.assessmentError,
              }),
            );
          }
        })
        .catch(async (error: unknown) => {
          try {
            await publish(
              context.event(turn, "attachment.failed", {
                stage: "attachment.upload",
                error: safeErrorMessage(error),
              }),
            );
          } catch {
            // The canonical text turn remains successful even if observation fails.
          }
        });
      if (onBackgroundTask) {
        onBackgroundTask(attachmentTask);
      } else {
        void attachmentTask;
      }
      completed = true;
      wake?.();
      return result;
    })
    .catch(async (error: unknown) => {
      failure = error;
      completed = true;
      audio.cancel(turn.turnID);
      wake?.();
      try {
        await publish(
          context.event(turn, "turn.failed", {
            error: safeErrorMessage(error),
          }),
        );
      } catch {
        // Publishing recovery state must never hide the adapter failure.
      }
      throw error;
    });

  try {
    while (!completed || deltas.length > 0) {
      const delta = deltas.shift();
      if (delta !== undefined) {
        if (!speechTurnQueued) {
          speechTurnQueued = true;
          context.queueSpeechTurn(turn);
        }
        yield delta;
      } else if (!completed) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    }
    await committed;
    if (failure) throw failure;
  } finally {
    if (!completed) {
      operation.abort(new Error("Go LLM turn interrupted"));
      await committed.catch(() => undefined);
    }
    context.completeTurn(turn.turnID);
  }
}

export class ConversationOrchestrator {
  readonly context: SessionContext;
  readonly audio: TurnAudioBuffer;
  readonly committer: TurnCommitter;
  readonly stt: GoSTT;
  readonly tts: GoTTS;

  #job: JobContext;

  constructor(
    job: JobContext,
    metadata: WorkerJobMetadata,
    goBaseURL: string,
    providerTimeoutMS = configuredTimeoutMS(
      process.env.LIVE_AGENT_PROVIDER_TIMEOUT_MS,
    ),
  ) {
    this.#job = job;
    this.context = new SessionContext({
      actorUserID: metadata.actor_user_id,
      threadID: metadata.thread_id,
      liveSessionID: metadata.live_session_id,
    });
    this.stt = new GoSTT({
      baseURL: goBaseURL,
      idleTimeoutMS: Math.max(providerTimeoutMS, 45_000),
    });
    this.tts = new GoTTS({
      baseURL: goBaseURL,
      timeoutMS: providerTimeoutMS,
      voice: standardTTSVoiceForRealtimeVoice(metadata.voice),
    });
    this.committer = new TurnCommitter(
      new GoLLM({ baseURL: goBaseURL, timeoutMS: providerTimeoutMS }),
    );
    this.audio = new TurnAudioBuffer(attachmentCallbacks(goBaseURL));
  }

  createAgent(): voice.Agent {
    return voice.Agent.create({
      instructions: "",
      turnHandling: {
        turnDetection: "stt",
        endpointing: {},
        interruption: {
          enabled: true,
          mode: "adaptive",
          falseInterruptionTimeout: 2_000,
          resumeFalseInterruption: true,
        },
        preemptiveGeneration: {
          enabled: false,
          preemptiveTts: false,
        },
      },
      stt: new HookBackedGoSTT(),
      llm: new HookBackedGoLLM(),
      tts: new HookBackedGoTTS(),
      sttNode: (_hook, audio) => this.#transcribe(audio),
      llmNode: () => this.#generateReply(),
      ttsNode: (_hook, text) => this.#synthesize(text),
    });
  }

  async start(): Promise<void> {
    const session = new voice.AgentSession({
      turnHandling: {
        turnDetection: "stt",
        endpointing: {},
        interruption: {
          enabled: true,
          mode: "adaptive",
          falseInterruptionTimeout: 2_000,
          resumeFalseInterruption: true,
        },
        preemptiveGeneration: {
          enabled: false,
          preemptiveTts: false,
        },
      },
    });
    await session.start({ agent: this.createAgent(), room: this.#job.room, record: false });
  }

  async *#transcribe(audio: AsyncIterable<AudioFrame>): AsyncGenerator<stt.SpeechEvent> {
    const context = this.context;
    const buffer = this.audio;
    let resampler: AudioResampler | undefined;
    let started = false;

    const pcm = async function* (): AsyncGenerator<Uint8Array> {
      try {
        for await (const input of audio) {
          if (input.channels !== 1) {
            throw new Error(`Go STT requires mono audio; received ${input.channels} channels`);
          }
          const frames =
            input.sampleRate === 16_000
              ? [input]
              : (resampler ??= new AudioResampler(input.sampleRate, 16_000, 1)).push(input);
          for (const frame of frames) {
            const turn = context.requireTurn();
            const bytes = pcmBytes(frame);
            buffer.append(turn.turnID, bytes);
            yield bytes;
          }
        }
        for (const frame of resampler?.flush() ?? []) {
          const turn = context.requireTurn();
          const bytes = pcmBytes(frame);
          buffer.append(turn.turnID, bytes);
          yield bytes;
        }
      } finally {
        resampler?.close();
      }
    };

    try {
      for await (const event of this.stt.stream(pcm())) {
        const turn = context.requireTurn();
        if (!started) {
          started = true;
          yield speechEvent(stt.SpeechEventType.START_OF_SPEECH, "");
        }
        if (event.type === "partial") {
          void this.#publish(
            context.event(turn, "transcript.partial", { transcript: event.transcript }),
          );
          yield speechEvent(stt.SpeechEventType.INTERIM_TRANSCRIPT, event.transcript);
        } else {
          context.finalizeTranscript(event.transcript);
          await this.#publish(
            context.latencyEvent(turn, "transcript.committed"),
          );
          yield speechEvent(stt.SpeechEventType.FINAL_TRANSCRIPT, event.transcript);
          yield speechEvent(stt.SpeechEventType.END_OF_SPEECH, event.transcript);
        }
      }
    } catch (error) {
      const turn = context.currentTurn;
      if (turn) {
        buffer.cancel(turn.turnID);
        context.completeTurn(turn.turnID);
        void this.#publish(
          context.event(turn, "turn.failed", {
            error: safeErrorMessage(error),
          }),
        );
      }
      throw error;
    }
  }

  async *#generateReply(): AsyncGenerator<string> {
    yield* streamCommittedTurn({
      context: this.context,
      committer: this.committer,
      audio: this.audio,
      publish: (event) => this.#publish(event),
    });
  }

  async *#synthesize(text: AsyncIterable<string>): AsyncGenerator<AudioFrame> {
    const speech = this.context.startSpeech();
    let turn: TurnContext | undefined;
    let started = false;
    try {
      for await (const segment of boundedTextSegments(text)) {
        turn ??= this.context.claimSpeechTurn();
        for await (const frame of pcm16AudioFrames(
          this.tts.synthesize(segment, speech.signal),
        )) {
          if (!started && turn) {
            started = true;
            await this.#publish(
              this.context.latencyEvent(turn, "assistant.audio_first"),
            );
          }
          yield frame;
        }
      }
    } finally {
      if (started && turn) {
        await this.#publish(
          this.context.latencyEvent(turn, "assistant.audio_stopped"),
        ).catch(() => undefined);
      }
      if (!speech.signal.aborted) {
        speech.abort(new Error("speech synthesis completed"));
      }
    }
  }

  async #publish(event: Record<string, unknown>): Promise<void> {
    const payload = new TextEncoder().encode(JSON.stringify(event));
    const participant = this.#job.room.localParticipant;
    if (!participant) throw new Error("LiveKit room has no local participant");
    await participant.publishData(payload, { reliable: true });
  }
}

export async function* boundedTextSegments(
  text: AsyncIterable<string>,
  maxCharacters = 240,
): AsyncGenerator<string> {
  if (maxCharacters <= 0) throw new Error("maxCharacters must be positive");
  let buffered = "";
  for await (const delta of text) {
    buffered += delta;
    while (buffered.length > 0) {
      const punctuation = buffered.search(/[.!?。！？；;\n]/u);
      const boundary =
        punctuation >= 0 && punctuation + 1 <= maxCharacters
          ? punctuation + 1
          : buffered.length >= maxCharacters
            ? maxCharacters
            : 0;
      if (boundary === 0) break;
      const segment = buffered.slice(0, boundary).trim();
      buffered = buffered.slice(boundary).trimStart();
      if (segment) yield segment;
    }
  }
  const tail = buffered.trim();
  if (tail) yield tail;
}

const worker = defineAgent({
  entry: async (job) => {
    if (!liveVoiceFeatureEnabled(process.env.LIVEKIT_VOICE_ENABLED)) {
      throw new Error("Live voice worker is disabled");
    }
    const goBaseURL = process.env.GO_BACKEND_URL ?? "http://127.0.0.1:8080";
    const apiKey = process.env.DASHSCOPE_API_KEY?.trim() ?? "";
    if (!apiKey) throw new Error("DASHSCOPE_API_KEY is required for Qwen Omni realtime");
    await job.connect();
    const participantMetadata = job.job.metadata.trim()
      ? ""
      : (await job.waitForParticipant()).metadata;
    const metadata = parseJobMetadata(job.job.metadata, participantMetadata);
    const websocketURL = omniWebsocketURL(process.env);
    const realtimeContextClient = new GoRealtimeContext(goBaseURL);
    const realtimeContext = await realtimeContextClient.load(metadata);
    const voice = metadata.voice ?? process.env.DASHSCOPE_OMNI_VOICE?.trim();
    await new OmniConversationOrchestrator(job, metadata, goBaseURL, {
      apiKey,
      websocketURL,
      realtimeContext,
      realtimeContextClient,
      ...(voice ? { voice } : {}),
    }).start();
  },
});

export const omniWebsocketURL = (
  environment: NodeJS.ProcessEnv,
): string => {
  const override = environment.DASHSCOPE_OMNI_WEBSOCKET_URL?.trim();
  if (override) return override;
  const workspaceID = environment.DASHSCOPE_WORKSPACE_ID?.trim();
  if (workspaceID) {
    return `wss://${workspaceID}.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime`;
  }
  return "wss://dashscope.aliyuncs.com/api-ws/v1/realtime";
};

export const liveVoiceFeatureEnabled = (value: string | undefined): boolean =>
  value === "1" || value?.toLowerCase() === "true";

export default worker;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url) }));
}
