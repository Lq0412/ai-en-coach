import type { WorkerJobMetadata } from "../worker.js";

export type RealtimeContextPayload = {
  instructions: string;
  context_version: string;
};

export type CreateLearningScenarioInput = {
  type: "interview" | "meeting" | "client" | "presentation" | "other";
  title: string;
  goal: string;
  participants?: string[] | undefined;
};

export class GoRealtimeContext {
  #baseURL: string;
  #fetch: typeof globalThis.fetch;

  constructor(baseURL: string, fetchImpl: typeof globalThis.fetch = globalThis.fetch) {
    this.#baseURL = baseURL.replace(/\/$/, "");
    this.#fetch = fetchImpl;
  }

  async load(metadata: WorkerJobMetadata): Promise<RealtimeContextPayload> {
    const query = new URLSearchParams({ actor_user_id: metadata.actor_user_id });
    const response = await this.#fetch(
      `${this.#baseURL}/v1/assistant/threads/${encodeURIComponent(metadata.thread_id)}/realtime-context?${query}`,
    );
    if (!response.ok) {
      throw new Error(`Go realtime context endpoint failed with HTTP ${response.status}`);
    }
    const payload = (await response.json()) as Partial<RealtimeContextPayload>;
    const instructions = String(payload.instructions ?? "").trim();
    const contextVersion = String(payload.context_version ?? "").trim();
    if (!instructions || !contextVersion || instructions.length > 32_000) {
      throw new Error("Go realtime context endpoint returned an invalid prompt");
    }
    return {
      instructions,
      context_version: contextVersion,
    };
  }

  async createLearningScenario(
    metadata: WorkerJobMetadata,
    sourceMessageID: string,
    toolCallID: string,
    input: CreateLearningScenarioInput,
  ): Promise<Record<string, unknown>> {
    const response = await this.#fetch(`${this.#baseURL}/v1/scenarios`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": `live-scenario:${metadata.live_session_id}:${toolCallID}`,
      },
      body: JSON.stringify({
        source_thread_id: metadata.thread_id,
        created_from_message_id: sourceMessageID,
        type: input.type,
        title: input.title,
        goal: input.goal,
        participants: input.participants ?? [],
        facts: [],
        material_ids: [],
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(
        `Go scenario endpoint failed with HTTP ${response.status}: ${String(payload.error ?? "request failed")}`,
      );
    }
    return payload;
  }
}
