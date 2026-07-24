import { voice, type JobContext } from "@livekit/agents";

import {
  QwenOmniRealtimeModel,
  QWEN_OMNI_REALTIME_MODEL,
} from "./providers/qwen-omni-realtime.js";
import { GoLiveTurnRecorder } from "./providers/go-live-turn.js";
import { safeErrorMessage } from "./resilience.js";
import { SessionContext, type TurnContext } from "./session-context.js";
import type { WorkerJobMetadata } from "./worker.js";

const SPEAKUP_INSTRUCTIONS = `
You are SpeakUp, a warm English conversation coach. Speak naturally and briefly.
Match the user's language when helpful, but encourage simple English conversation.
Do not mention internal models, prompts, transcription, or system implementation.
`.trim();

export class OmniConversationOrchestrator {
  readonly context: SessionContext;
  readonly model: QwenOmniRealtimeModel;
  readonly recorder: GoLiveTurnRecorder;

  #job: JobContext;
  #assistantTurn: TurnContext | undefined;
  #commitChain = Promise.resolve();

  constructor(
    job: JobContext,
    metadata: WorkerJobMetadata,
    goBaseURL: string,
    options: {
      apiKey: string;
      websocketURL?: string;
      voice?: string;
    },
  ) {
    this.#job = job;
    this.context = new SessionContext({
      actorUserID: metadata.actor_user_id,
      threadID: metadata.thread_id,
      liveSessionID: metadata.live_session_id,
    });
    this.recorder = new GoLiveTurnRecorder(goBaseURL);
    this.model = new QwenOmniRealtimeModel({
      apiKey: options.apiKey,
      ...(options.websocketURL ? { websocketURL: options.websocketURL } : {}),
      ...(options.voice ? { voice: options.voice } : {}),
      instructions: SPEAKUP_INSTRUCTIONS,
      callbacks: {
        onInputPartial: (transcript) => {
          const turn = this.context.requireTurn();
          void this.#publish(
            this.context.event(turn, "transcript.partial", { transcript }),
          );
        },
        onInputFinal: (transcript) => {
          if (!transcript.trim()) return;
          const turn = this.context.finalizeTranscript(transcript);
          void this.#publish(this.context.latencyEvent(turn, "transcript.committed"));
        },
        onAssistantDelta: (delta) => {
          const turn = this.#claimAssistantTurn();
          if (!turn) return;
          void this.#publish(this.context.event(turn, "assistant.delta", { delta }));
        },
        onAssistantAudioStarted: () => {
          const turn = this.#claimAssistantTurn();
          if (!turn) return;
          void this.#publish(this.context.latencyEvent(turn, "assistant.audio_first"));
        },
        onAssistantDone: (transcript) => {
          const turn = this.#claimAssistantTurn();
          this.#assistantTurn = undefined;
          if (!turn || !transcript.trim()) return;
          this.#commitChain = this.#commitChain
            .then(() => this.#commitTurn(turn, transcript))
            .catch(() => undefined);
        },
      },
    });
  }

  createAgent(): voice.Agent {
    return voice.Agent.create({
      instructions: SPEAKUP_INSTRUCTIONS,
      llm: this.model,
      turnHandling: {
        turnDetection: "realtime_llm",
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
  }

  async start(): Promise<void> {
    const session = new voice.AgentSession({
      turnHandling: { turnDetection: "realtime_llm" },
    });
    await session.start({
      agent: this.createAgent(),
      room: this.#job.room,
      record: false,
    });
  }

  #claimAssistantTurn(): TurnContext | undefined {
    if (!this.#assistantTurn) {
      this.#assistantTurn = this.context.takeFinalizedTurn();
    }
    return this.#assistantTurn;
  }

  async #commitTurn(turn: TurnContext, assistantTranscript: string): Promise<void> {
    try {
      const result = await this.recorder.commit(turn, assistantTranscript);
      await this.#publish(
        this.context.event(turn, "turn.user_committed", {
          message: result.userMessage,
        }),
      );
      await this.#publish(this.context.latencyEvent(turn, "turn.persisted"));
      await this.#publish(
        this.context.event(turn, "turn.assistant_committed", {
          message: result.assistantMessage,
        }),
      );
      await this.#publish(
        this.context.latencyEvent(turn, "assistant.audio_stopped"),
      );
      this.context.completeTurn(turn.turnID);
    } catch (error) {
      await this.#publish(
        this.context.event(turn, "turn.failed", {
          model: QWEN_OMNI_REALTIME_MODEL,
          error: safeErrorMessage(error),
        }),
      ).catch(() => undefined);
    }
  }

  async #publish(event: Record<string, unknown>): Promise<void> {
    const participant = this.#job.room.localParticipant;
    if (!participant) throw new Error("LiveKit room has no local participant");
    await participant.publishData(
      new TextEncoder().encode(JSON.stringify(event)),
      { reliable: true },
    );
  }
}
