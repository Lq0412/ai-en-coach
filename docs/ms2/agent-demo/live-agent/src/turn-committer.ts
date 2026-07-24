import type { GoLLMCallbacks, GoLLMResult } from "./providers/go-llm.js";
import type { TurnContext } from "./session-context.js";

export type TurnStream = {
  streamTurn(
    turn: TurnContext,
    callbacks?: GoLLMCallbacks,
    signal?: AbortSignal,
  ): Promise<GoLLMResult>;
};

export class TurnCommitter {
  #stream: TurnStream;
  #commits = new Map<string, Promise<GoLLMResult>>();
  #completed: string[] = [];
  #maxRecent: number;

  constructor(stream: TurnStream, options: { maxRecent?: number } = {}) {
    this.#stream = stream;
    this.#maxRecent = options.maxRecent ?? 128;
    if (this.#maxRecent <= 0) throw new Error("maxRecent must be positive");
  }

  commit(
    turn: TurnContext,
    callbacks: GoLLMCallbacks = {},
    signal?: AbortSignal,
  ): Promise<GoLLMResult> {
    const key = `${turn.threadID}:${turn.clientMessageID}`;
    const existing = this.#commits.get(key);
    if (existing) return existing;

    const pending = this.#stream
      .streamTurn(turn, callbacks, signal)
      .then((result) => {
        this.#completed.push(key);
        while (this.#completed.length > this.#maxRecent) {
          const expired = this.#completed.shift();
          if (expired) this.#commits.delete(expired);
        }
        return result;
      })
      .catch((error: unknown) => {
        this.#commits.delete(key);
        throw error;
      });
    this.#commits.set(key, pending);
    return pending;
  }
}
