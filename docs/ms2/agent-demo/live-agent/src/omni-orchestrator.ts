import { voice, type JobContext } from "@livekit/agents";

import {
  QwenOmniRealtimeModel,
  QWEN_OMNI_REALTIME_MODEL,
} from "./providers/qwen-omni-realtime.js";
import { GoLiveTurnRecorder } from "./providers/go-live-turn.js";
import { createGoTurnAudioBuffer } from "./providers/go-audio-recording.js";
import { safeErrorMessage } from "./resilience.js";
import { SessionContext, type TurnContext } from "./session-context.js";
import { TurnAudioBuffer } from "./turn-audio-buffer.js";
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
  readonly audio: TurnAudioBuffer;

  #job: JobContext;
  #assistantTurn: TurnContext | undefined;
  #commitChain = Promise.resolve();
  #recordingTurnID: string | undefined;
  #preRoll: Uint8Array[] = [];
  #preRollBytes = 0;
  #audioFailedTurns = new Set<string>();
  #audioStartedTurns = new Set<string>();

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
    this.audio = createGoTurnAudioBuffer(goBaseURL, globalThis.fetch);
    this.model = new QwenOmniRealtimeModel({
      apiKey: options.apiKey,
      ...(options.websocketURL ? { websocketURL: options.websocketURL } : {}),
      ...(options.voice ? { voice: options.voice } : {}),
      instructions: SPEAKUP_INSTRUCTIONS,
      callbacks: {
        onInputAudio: (pcm) => this.#captureInputAudio(pcm),
        onSpeechStarted: () => this.#startAudioTurn(),
        onSpeechStopped: () => {
          this.#recordingTurnID = undefined;
        },
        onInputPartial: (transcript) => {
          const turn = this.context.requireTurn();
          this.#startAudioTurn(turn, false);
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
          if (!turn) return;
          if (!transcript.trim()) {
            this.audio.cancel(turn.turnID);
            this.#audioStartedTurns.delete(turn.turnID);
            return;
          }
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

  #captureInputAudio(pcm: Uint8Array): void {
    if (this.#recordingTurnID) {
      this.#appendTurnAudio(this.#recordingTurnID, pcm);
      return;
    }
    this.#preRoll.push(pcm.slice());
    this.#preRollBytes += pcm.byteLength;
    const maxPreRollBytes = 32_000;
    while (this.#preRollBytes > maxPreRollBytes && this.#preRoll.length > 1) {
      const expired = this.#preRoll.shift();
      if (expired) this.#preRollBytes -= expired.byteLength;
    }
  }

  #startAudioTurn(
    turn = this.context.requireTurn(),
    resumeCapture = true,
  ): void {
    if (this.#recordingTurnID === turn.turnID) return;
    if (this.#audioStartedTurns.has(turn.turnID) && !resumeCapture) return;
    this.#recordingTurnID = turn.turnID;
    this.#audioStartedTurns.add(turn.turnID);
    for (const chunk of this.#preRoll) {
      this.#appendTurnAudio(turn.turnID, chunk);
    }
    this.#preRoll = [];
    this.#preRollBytes = 0;
  }

  #appendTurnAudio(turnID: string, pcm: Uint8Array): void {
    if (this.#audioFailedTurns.has(turnID)) return;
    try {
      this.audio.append(turnID, pcm);
    } catch (error) {
      this.#audioFailedTurns.add(turnID);
      this.audio.cancel(turnID);
      const turn = this.context.latestTurn;
      if (turn?.turnID === turnID) {
        void this.#publish(
          this.context.event(turn, "attachment.failed", {
            stage: "attachment.buffer",
            error: safeErrorMessage(error),
          }),
        );
      }
    }
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
      if (!this.#audioFailedTurns.has(turn.turnID)) {
        try {
          const linked = await this.audio.commit(
            turn.turnID,
            String(result.userMessage.ID),
            turn.transcript,
          );
          if (linked?.message) {
            await this.#publish(
              this.context.event(turn, "attachment.linked", {
                attachment_id: linked.attachmentID,
                message: linked.message,
              }),
            );
          }
          if (linked?.assessmentMessage) {
            await this.#publish(
              this.context.event(turn, "assessment.completed", {
                message: linked.assessmentMessage,
              }),
            );
          } else if (linked?.assessmentError) {
            await this.#publish(
              this.context.event(turn, "assessment.failed", {
                error: linked.assessmentError,
              }),
            );
          }
        } catch (error) {
          await this.#publish(
            this.context.event(turn, "attachment.failed", {
              stage: "attachment.upload",
              error: safeErrorMessage(error),
            }),
          ).catch(() => undefined);
        }
      }
      this.#audioFailedTurns.delete(turn.turnID);
      this.#audioStartedTurns.delete(turn.turnID);
      await this.#publish(
        this.context.latencyEvent(turn, "assistant.audio_stopped"),
      );
      this.context.completeTurn(turn.turnID);
    } catch (error) {
      this.audio.cancel(turn.turnID);
      this.#audioFailedTurns.delete(turn.turnID);
      this.#audioStartedTurns.delete(turn.turnID);
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
