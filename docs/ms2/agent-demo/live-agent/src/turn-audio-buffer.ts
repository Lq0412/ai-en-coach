export type TurnAudioBufferOptions = {
  maxBytes: number;
  maxRecentCommits?: number;
  upload: (audio: Uint8Array) => Promise<string>;
  link: (messageID: string, attachmentID: string) => Promise<void>;
};

type BufferedTurn = {
  chunks: Uint8Array[];
  bytes: number;
  cancelled: boolean;
};

export class TurnAudioBuffer {
  #options: TurnAudioBufferOptions;
  #turns = new Map<string, BufferedTurn>();
  #commits = new Map<string, Promise<void>>();
  #completed: string[] = [];
  #maxRecentCommits: number;

  constructor(options: TurnAudioBufferOptions) {
    if (options.maxBytes <= 0) throw new Error("maxBytes must be positive");
    this.#options = options;
    this.#maxRecentCommits = options.maxRecentCommits ?? 128;
    if (this.#maxRecentCommits <= 0) {
      throw new Error("maxRecentCommits must be positive");
    }
  }

  append(turnID: string, chunk: Uint8Array): void {
    const turn = this.#turns.get(turnID) ?? { chunks: [], bytes: 0, cancelled: false };
    if (turn.cancelled) return;
    if (turn.bytes + chunk.byteLength > this.#options.maxBytes) {
      this.#turns.delete(turnID);
      throw new Error("turn audio exceeded maximum buffer size");
    }
    turn.chunks.push(chunk.slice());
    turn.bytes += chunk.byteLength;
    this.#turns.set(turnID, turn);
  }

  cancel(turnID: string): void {
    this.#turns.delete(turnID);
  }

  commit(turnID: string, messageID: string): Promise<void> {
    const existing = this.#commits.get(turnID);
    if (existing) return existing;
    const turn = this.#turns.get(turnID);
    if (!turn || turn.cancelled || turn.bytes === 0) return Promise.resolve();

    const pending = (async () => {
      const audio = new Uint8Array(turn.bytes);
      let offset = 0;
      for (const chunk of turn.chunks) {
        audio.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const attachmentID = await this.#options.upload(audio);
      await this.#options.link(messageID, attachmentID);
      this.#turns.delete(turnID);
      this.#completed.push(turnID);
      while (this.#completed.length > this.#maxRecentCommits) {
        const expired = this.#completed.shift();
        if (expired) this.#commits.delete(expired);
      }
    })().catch((error: unknown) => {
      this.#commits.delete(turnID);
      throw error;
    });
    this.#commits.set(turnID, pending);
    return pending;
  }
}
