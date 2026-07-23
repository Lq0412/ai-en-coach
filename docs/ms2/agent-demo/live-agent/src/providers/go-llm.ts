import type { TurnContext } from "../session-context.js";

export type CanonicalUserMessage = {
  ID: string;
  client_message_id?: string;
  [key: string]: unknown;
};

export type GoLLMResult = {
  userMessage: CanonicalUserMessage;
  assistantText: string;
};

export type GoLLMOptions = {
  baseURL: string;
  fetch?: typeof globalThis.fetch;
};

type SSEBlock = {
  event: string;
  data: unknown;
};

const parseSSEBlock = (block: string): SSEBlock | undefined => {
  let event = "";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (!event) return undefined;
  const serialized = data.join("\n");
  return {
    event,
    data: serialized ? JSON.parse(serialized) : {},
  };
};

const readSSE = async function* (
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<SSEBlock> {
  if (!response.body) throw new Error("Go task stream returned no response body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) throw signal.reason;
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const parsed = parseSSEBlock(block);
        if (parsed) yield parsed;
      }
      if (done) break;
    }
    if (buffer.trim()) {
      const parsed = parseSSEBlock(buffer);
      if (parsed) yield parsed;
    }
  } finally {
    reader.releaseLock();
  }
};

export class GoLLM {
  #baseURL: string;
  #fetch: typeof globalThis.fetch;

  constructor(options: GoLLMOptions) {
    this.#baseURL = options.baseURL.replace(/\/$/, "");
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  async streamTurn(
    turn: TurnContext,
    onDelta: (delta: string) => void = () => undefined,
    signal?: AbortSignal,
  ): Promise<GoLLMResult> {
    const response = await this.#fetch(
      `${this.#baseURL}/v1/assistant/threads/${encodeURIComponent(turn.threadID)}/tasks/stream`,
      {
        method: "POST",
        headers: {
          accept: "text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          actor_user_id: turn.actorUserID,
          user_message: turn.transcript,
          interaction_mode: "conversation",
          idempotency_key: turn.clientMessageID,
          client_message_id: turn.clientMessageID,
          live_session_id: turn.liveSessionID,
          turn_id: turn.turnID,
          mode: "live",
        }),
        ...(signal ? { signal } : {}),
      },
    );
    if (!response.ok) {
      throw new Error(`Go task stream failed with HTTP ${response.status}`);
    }

    let userMessage: CanonicalUserMessage | undefined;
    let assistantText = "";
    let completed = false;
    for await (const block of readSSE(response, signal)) {
      const data = block.data as Record<string, unknown>;
      if (block.event === "turn.user_committed") {
        userMessage = data.message as CanonicalUserMessage;
      } else if (block.event === "assistant.delta") {
        if (!userMessage) {
          throw new Error("assistant delta arrived before canonical user commit");
        }
        const delta = String(data.delta ?? "");
        assistantText += delta;
        onDelta(delta);
      } else if (block.event === "task.failed") {
        throw new Error(String(data.error ?? data.message ?? "Go task failed"));
      } else if (block.event === "task.completed") {
        completed = true;
      }
    }

    if (!completed) throw new Error("Go task stream ended before task.completed");
    if (!userMessage?.ID) throw new Error("Go task stream omitted canonical user message");
    return { userMessage, assistantText };
  }
}
