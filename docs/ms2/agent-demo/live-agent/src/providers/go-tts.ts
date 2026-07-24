import { AudioFrame } from "@livekit/rtc-node";
import {
  createDeadline,
  type TimeoutScheduler,
} from "../resilience.js";

export type GoTTSOptions = {
  baseURL: string;
  fetch?: typeof globalThis.fetch;
  timeoutMS?: number;
  scheduler?: TimeoutScheduler;
};

export class GoTTS {
  readonly sampleRate = 24_000;
  readonly channels = 1;
  readonly encoding = "pcm_s16le";

  #baseURL: string;
  #fetch: typeof globalThis.fetch;
  #timeoutMS: number;
  #scheduler: TimeoutScheduler | undefined;

  constructor(options: GoTTSOptions) {
    this.#baseURL = options.baseURL.replace(/\/$/, "");
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeoutMS = options.timeoutMS ?? 30_000;
    this.#scheduler = options.scheduler;
  }

  async *synthesize(text: string, signal?: AbortSignal): AsyncGenerator<Uint8Array> {
    const deadline = createDeadline(
      signal,
      this.#timeoutMS,
      "Go TTS",
      this.#scheduler,
    );
    try {
      if (deadline.signal.aborted) throw deadline.signal.reason;
      const response = await this.#fetch(`${this.#baseURL}/v1/audio/speech`, {
        method: "POST",
        headers: {
          accept: "audio/pcm",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          text,
          format: "pcm",
          sample_rate: this.sampleRate,
        }),
        signal: deadline.signal,
      });
      if (!response.ok) {
        throw new Error(`Go speech endpoint failed with HTTP ${response.status}`);
      }
      if (
        !response.headers
          .get("content-type")
          ?.toLowerCase()
          .startsWith("audio/pcm")
      ) {
        throw new Error("Go speech endpoint did not return PCM audio");
      }
      if (!response.body) {
        throw new Error("Go speech endpoint returned no response body");
      }

      const reader = response.body.getReader();
      try {
        while (true) {
          if (deadline.signal.aborted) throw deadline.signal.reason;
          const { value, done } = await reader.read();
          if (done) break;
          if (value.byteLength > 0) yield value;
        }
      } finally {
        reader.releaseLock();
      }
    } finally {
      deadline.cleanup();
    }
  }
}

export async function* pcm16AudioFrames(
  chunks: AsyncIterable<Uint8Array>,
  samplesPerFrame = 2_400,
): AsyncGenerator<AudioFrame> {
  if (samplesPerFrame <= 0) throw new Error("samplesPerFrame must be positive");
  const bytesPerFrame = samplesPerFrame * 2;
  let buffered = new Uint8Array(0);

  for await (const chunk of chunks) {
    const combined = new Uint8Array(buffered.byteLength + chunk.byteLength);
    combined.set(buffered);
    combined.set(chunk, buffered.byteLength);
    let offset = 0;
    while (combined.byteLength - offset >= bytesPerFrame) {
      const frameBytes = combined.slice(offset, offset + bytesPerFrame);
      yield new AudioFrame(
        new Int16Array(frameBytes.buffer),
        24_000,
        1,
        samplesPerFrame,
      );
      offset += bytesPerFrame;
    }
    buffered = combined.slice(offset);
  }

  if (buffered.byteLength % 2 !== 0) {
    throw new Error("PCM16 stream ended with an incomplete sample");
  }
  if (buffered.byteLength > 0) {
    const frameBytes = buffered.slice();
    yield new AudioFrame(
      new Int16Array(frameBytes.buffer),
      24_000,
      1,
      frameBytes.byteLength / 2,
    );
  }
}
