import type { TurnContext } from "../session-context.js";
import type {
  CanonicalAssistantMessage,
  CanonicalUserMessage,
} from "./go-llm.js";

export type CommittedOmniTurn = {
  userMessage: CanonicalUserMessage;
  assistantMessage: CanonicalAssistantMessage;
};

export class GoLiveTurnRecorder {
  #baseURL: string;
  #fetch: typeof globalThis.fetch;

  constructor(baseURL: string, fetchImpl: typeof globalThis.fetch = globalThis.fetch) {
    this.#baseURL = baseURL.replace(/\/$/, "");
    this.#fetch = fetchImpl;
  }

  async commit(turn: TurnContext, assistantTranscript: string): Promise<CommittedOmniTurn> {
    const response = await this.#fetch(
      `${this.#baseURL}/v1/assistant/live-sessions/${encodeURIComponent(turn.liveSessionID)}/turns`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actor_user_id: turn.actorUserID,
          thread_id: turn.threadID,
          turn_id: turn.turnID,
          client_message_id: turn.clientMessageID,
          user_transcript: turn.transcript,
          assistant_transcript: assistantTranscript,
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Go live turn endpoint failed with HTTP ${response.status}`);
    }
    const payload = (await response.json()) as Record<string, unknown>;
    return {
      userMessage: payload.user_message as CanonicalUserMessage,
      assistantMessage: payload.assistant_message as CanonicalAssistantMessage,
    };
  }
}
