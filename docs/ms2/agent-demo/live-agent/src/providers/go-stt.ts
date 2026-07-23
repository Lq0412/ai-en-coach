export type GoTranscriptEvent = {
  type: "partial" | "final";
  transcript: string;
};

export type WebSocketLike = {
  readyState: number;
  send(data: string | ArrayBufferLike | ArrayBufferView): void;
  close(code?: number, reason?: string): void;
  addEventListener(
    type: "open" | "message" | "error" | "close",
    listener: (event: Event | MessageEvent) => void,
    options?: AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: "open" | "message" | "error" | "close",
    listener: (event: Event | MessageEvent) => void,
  ): void;
};

export type GoSTTOptions = {
  baseURL: string;
  openSocket?: (url: string) => WebSocketLike;
};

class AsyncEventQueue<T> {
  #values: T[] = [];
  #waiters: Array<(result: IteratorResult<T>) => void> = [];
  #closed = false;
  #error: unknown;

  push(value: T): void {
    if (this.#closed) return;
    const waiter = this.#waiters.shift();
    if (waiter) waiter({ value, done: false });
    else this.#values.push(value);
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }

  fail(error: unknown): void {
    this.#error = error;
    this.close();
  }

  async next(): Promise<IteratorResult<T>> {
    const value = this.#values.shift();
    if (value !== undefined) return { value, done: false };
    if (this.#error) throw this.#error;
    if (this.#closed) return { value: undefined, done: true };
    const result = await new Promise<IteratorResult<T>>((resolve) => this.#waiters.push(resolve));
    if (result.done && this.#error) throw this.#error;
    return result;
  }
}

const websocketURL = (baseURL: string): string => {
  const url = new URL(baseURL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/v1/audio/transcriptions/stream`;
  url.search = "";
  url.hash = "";
  return url.toString();
};

const textFromMessage = async (data: unknown): Promise<string> => {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }
  if (data instanceof Blob) return data.text();
  throw new Error("unsupported Go STT websocket message");
};

const transcriptFromPayload = (payload: Record<string, unknown>): string =>
  String(payload.transcript ?? payload.delta ?? payload.text ?? "").trim();

export class GoSTT {
  #url: string;
  #openSocket: (url: string) => WebSocketLike;

  constructor(options: GoSTTOptions) {
    this.#url = websocketURL(options.baseURL);
    this.#openSocket =
      options.openSocket ??
      ((url) => {
        if (typeof WebSocket === "undefined") {
          throw new Error("this Node runtime does not provide WebSocket");
        }
        return new WebSocket(url);
      });
  }

  async *stream(
    audio: AsyncIterable<Uint8Array>,
    signal?: AbortSignal,
  ): AsyncGenerator<GoTranscriptEvent> {
    const socket = this.#openSocket(this.#url);
    const events = new AsyncEventQueue<GoTranscriptEvent>();
    const opened = new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("Go STT websocket failed to open")), {
        once: true,
      });
    });

    const onMessage = (raw: Event | MessageEvent) => {
      void (async () => {
        try {
          const message = JSON.parse(
            await textFromMessage((raw as MessageEvent).data),
          ) as Record<string, unknown>;
          const type = String(message.type ?? "");
          if (type === "transcript.delta") {
            const transcript = transcriptFromPayload(message);
            if (transcript) events.push({ type: "partial", transcript });
          } else if (type === "transcript.completed") {
            const transcript = transcriptFromPayload(message);
            if (transcript) events.push({ type: "final", transcript });
          } else if (type === "transcription.error") {
            events.fail(new Error(String(message.error ?? message.message ?? "Go STT failed")));
          } else if (type === "transcription.done") {
            events.close();
          }
        } catch (error) {
          events.fail(error);
        }
      })();
    };
    const onError = () => events.fail(new Error("Go STT websocket disconnected"));
    socket.addEventListener("message", onMessage);
    socket.addEventListener("error", onError);

    const onAbort = () => {
      events.fail(signal?.reason ?? new Error("Go STT aborted"));
      socket.close(1000, "aborted");
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const writer = (async () => {
      await opened;
      for await (const chunk of audio) {
        if (signal?.aborted) throw signal.reason;
        socket.send(chunk);
      }
      socket.send(JSON.stringify({ type: "stop" }));
    })().catch((error: unknown) => events.fail(error));

    try {
      while (true) {
        const event = await events.next();
        if (event.done) break;
        yield event.value;
      }
      await writer;
    } finally {
      signal?.removeEventListener("abort", onAbort);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("error", onError);
      socket.close(1000, "complete");
    }
  }
}
