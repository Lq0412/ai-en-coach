import { createHmac } from "node:crypto";

import { Mp3Encoder } from "@breezystack/lamejs";
import WebSocket from "ws";

const DEFAULT_HOST = "cn-east-1.ws-api.xf-yun.com";
const DEFAULT_PATH = "/v1/private/s8e098720";
const SAMPLE_RATE = 16_000;
const MP3_KBPS = 64;
const MP3_BLOCK_SAMPLES = 1_152;
const SEND_CHUNK_BYTES = 1_024;

export type XunfeiSuntoneConfig = {
  appID: string;
  apiKey: string;
  apiSecret: string;
  host?: string;
  path?: string;
  timeoutMS?: number;
};

export type PronunciationPhoneme = {
  phoneme: string;
  phone?: string | undefined;
  pronunciation?: number | undefined;
  start?: number | undefined;
  end?: number | undefined;
};

export type PronunciationWord = {
  word: string;
  overall?: number | undefined;
  pronunciation?: number | undefined;
  tone?: number | undefined;
  read_type?: number | undefined;
  start?: number | undefined;
  end?: number | undefined;
  phonemes?: PronunciationPhoneme[] | undefined;
};

export type LearningAssessment = {
  provider: "xunfei.suntone";
  overall?: number | undefined;
  fluency?: number | undefined;
  pronunciation?: number | undefined;
  integrity?: number | undefined;
  rhythm?: number | undefined;
  tone?: number | undefined;
  speed?: number | undefined;
  words?: PronunciationWord[] | undefined;
  explanations?: string[] | undefined;
};

type JSONRecord = Record<string, unknown>;

const record = (value: unknown): JSONRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as JSONRecord
    : {};

const finite = (value: unknown): number | undefined => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : undefined;
};

const integer = (value: unknown): number | undefined => {
  const number = Number(value);
  return Number.isInteger(number) ? number : undefined;
};

export const pcm16Mono16KToMP3 = (pcm: Uint8Array): Uint8Array => {
  const aligned = pcm.byteLength - (pcm.byteLength % 2);
  const samples = new Int16Array(aligned / 2);
  const view = new DataView(pcm.buffer, pcm.byteOffset, aligned);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true);
  }
  const encoder = new Mp3Encoder(1, SAMPLE_RATE, MP3_KBPS);
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  for (let offset = 0; offset < samples.length; offset += MP3_BLOCK_SAMPLES) {
    const encoded = encoder.encodeBuffer(
      samples.subarray(offset, Math.min(samples.length, offset + MP3_BLOCK_SAMPLES)),
    );
    if (encoded.byteLength > 0) {
      chunks.push(encoded);
      byteLength += encoded.byteLength;
    }
  }
  const tail = encoder.flush();
  if (tail.byteLength > 0) {
    chunks.push(tail);
    byteLength += tail.byteLength;
  }
  const mp3 = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    mp3.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return mp3;
};

export const suntoneSignedURL = (
  config: XunfeiSuntoneConfig,
  date = new Date(),
): string => {
  const host = config.host ?? DEFAULT_HOST;
  const path = config.path ?? DEFAULT_PATH;
  const dateText = date.toUTCString();
  const signatureOrigin = `host: ${host}\ndate: ${dateText}\nGET ${path} HTTP/1.1`;
  const signature = createHmac("sha256", config.apiSecret)
    .update(signatureOrigin)
    .digest("base64");
  const authorization = Buffer.from(
    `api_key="${config.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`,
  ).toString("base64");
  const query = new URLSearchParams({
    host,
    date: dateText,
    authorization,
  });
  return `wss://${host}${path}?${query.toString()}`;
};

export const assessmentLanguage = (text: string): "cn" | "en" => {
  const han = text.match(/\p{Script=Han}/gu)?.length ?? 0;
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0;
  return han > latin ? "cn" : "en";
};

export const normalizeSuntoneResult = (payload: unknown): LearningAssessment => {
  const root = record(payload);
  const result = record(root.result);
  const words = Array.isArray(result.words) ? result.words : [];
  const normalizedWords = words.map((item): PronunciationWord => {
    const word = record(item);
    const scores = record(word.scores);
    const span = record(word.span);
    const phonemes = Array.isArray(word.phonemes) ? word.phonemes : [];
    return {
      word: String(word.word ?? ""),
      ...(finite(scores.overall) !== undefined ? { overall: finite(scores.overall) } : {}),
      ...(finite(scores.pronunciation) !== undefined
        ? { pronunciation: finite(scores.pronunciation) }
        : {}),
      ...(finite(scores.tone) !== undefined ? { tone: finite(scores.tone) } : {}),
      ...(integer(word.readType) !== undefined ? { read_type: integer(word.readType) } : {}),
      ...(integer(span.start) !== undefined ? { start: integer(span.start) } : {}),
      ...(integer(span.end) !== undefined ? { end: integer(span.end) } : {}),
      phonemes: phonemes.map((item): PronunciationPhoneme => {
        const phoneme = record(item);
        const phonemeSpan = record(phoneme.span);
        return {
          phoneme: String(phoneme.phoneme ?? ""),
          ...(phoneme.phone ? { phone: String(phoneme.phone) } : {}),
          ...(finite(phoneme.pronunciation) !== undefined
            ? { pronunciation: finite(phoneme.pronunciation) }
            : {}),
          ...(integer(phonemeSpan.start) !== undefined
            ? { start: integer(phonemeSpan.start) }
            : {}),
          ...(integer(phonemeSpan.end) !== undefined
            ? { end: integer(phonemeSpan.end) }
            : {}),
        };
      }),
    };
  }).filter((word) => word.word);
  const weakPhonemes = normalizedWords
    .flatMap((word) => (word.phonemes ?? []).map((phoneme) => ({ word: word.word, phoneme })))
    .filter(({ phoneme }) => phoneme.pronunciation !== undefined && phoneme.pronunciation < 80)
    .sort((left, right) =>
      (left.phoneme.pronunciation ?? 100) - (right.phoneme.pronunciation ?? 100))
    .slice(0, 3);
  return {
    provider: "xunfei.suntone",
    ...(finite(result.overall) !== undefined ? { overall: finite(result.overall) } : {}),
    ...(finite(result.fluency) !== undefined ? { fluency: finite(result.fluency) } : {}),
    ...(finite(result.pronunciation) !== undefined
      ? { pronunciation: finite(result.pronunciation) }
      : {}),
    ...(finite(result.integrity) !== undefined ? { integrity: finite(result.integrity) } : {}),
    ...(finite(result.rhythm) !== undefined ? { rhythm: finite(result.rhythm) } : {}),
    ...(finite(result.tone) !== undefined ? { tone: finite(result.tone) } : {}),
    ...(Number.isFinite(Number(result.speed)) ? { speed: Number(result.speed) } : {}),
    words: normalizedWords,
    explanations: weakPhonemes.map(({ word, phoneme }) =>
      `${word} 的 /${phoneme.phone || phoneme.phoneme}/ 音素得分 ${Math.round(phoneme.pronunciation ?? 0)}`),
  };
};

export class XunfeiSuntoneScorer {
  readonly #config: XunfeiSuntoneConfig;

  constructor(config: XunfeiSuntoneConfig) {
    for (const [name, value] of Object.entries({
      XUNFEI_APP_ID: config.appID,
      XUNFEI_API_KEY: config.apiKey,
      XUNFEI_API_SECRET: config.apiSecret,
    })) {
      if (!value.trim()) throw new Error(`${name} is required`);
    }
    this.#config = config;
  }

  score(pcm: Uint8Array, referenceText: string): Promise<LearningAssessment> {
    const text = referenceText.trim();
    if (!text) return Promise.reject(new Error("reference text is required"));
    const mp3 = pcm16Mono16KToMP3(pcm);
    if (mp3.byteLength === 0) return Promise.reject(new Error("audio is empty"));
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(suntoneSignedURL(this.#config));
      const audioDurationMS = pcm.byteLength / 32_000 * 1_000;
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error("Xunfei Suntone assessment timed out"));
      }, this.#config.timeoutMS ?? Math.max(30_000, audioDurationMS + 15_000));
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback();
      };
      socket.on("open", () => {
        void (async () => {
        const totalFrames = Math.ceil(mp3.byteLength / SEND_CHUNK_BYTES);
        for (let sequence = 0; sequence < totalFrames; sequence += 1) {
          const start = sequence * SEND_CHUNK_BYTES;
          const chunk = mp3.subarray(start, Math.min(mp3.byteLength, start + SEND_CHUNK_BYTES));
          const last = sequence === totalFrames - 1;
          const status = totalFrames === 1 ? 2 : sequence === 0 ? 0 : last ? 2 : 1;
          socket.send(JSON.stringify({
            header: {
              app_id: this.#config.appID,
              status,
            },
            ...(sequence === 0 ? {
              parameter: {
                st: {
                  lang: assessmentLanguage(text),
                  core: "sent",
                  refText: text.slice(0, 4096),
                  dict_type: "IPA88",
                  dict_dialect: "en_us",
                  phoneme_output: 1,
                  output_rawtext: 1,
                  scale: 100,
                  precision: 1,
                  result: {
                    encoding: "utf8",
                    compress: "raw",
                    format: "json",
                  },
                },
              },
            } : {}),
            payload: {
              data: {
                encoding: "lame",
                sample_rate: SAMPLE_RATE,
                channels: 1,
                bit_depth: 16,
                status,
                seq: sequence,
                audio: Buffer.from(chunk).toString("base64"),
                frame_size: chunk.byteLength,
              },
            },
          }));
          if (!last) {
            await new Promise((resume) => setTimeout(resume, 40));
          }
        }
        })().catch((error) => finish(() => reject(error)));
      });
      socket.on("message", (data) => {
        try {
          const response = JSON.parse(data.toString()) as JSONRecord;
          const header = record(response.header);
          if (Number(header.code ?? 0) !== 0) {
            finish(() => reject(new Error(
              `Xunfei Suntone ${String(header.code)}: ${String(header.message ?? "request failed")}`,
            )));
            return;
          }
          const result = record(record(response.payload).result);
          if (!result.text || Number(result.status) !== 2) return;
          const decoded = Buffer.from(String(result.text), "base64").toString("utf8");
          finish(() => resolve(normalizeSuntoneResult(JSON.parse(decoded))));
          socket.close();
        } catch (error) {
          finish(() => reject(error));
        }
      });
      socket.on("error", (error) => finish(() => reject(error)));
      socket.on("unexpected-response", (_request, response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          const detail = Buffer.concat(chunks).toString("utf8").trim();
          finish(() => reject(new Error(
            `Xunfei Suntone HTTP ${response.statusCode}${detail ? `: ${detail}` : ""}`,
          )));
          socket.terminate();
        });
      });
      socket.on("close", () => {
        if (!settled) finish(() => reject(new Error("Xunfei Suntone closed without a result")));
      });
    });
  }
}

export const xunfeiSuntoneFromEnv = (
  environment: NodeJS.ProcessEnv,
): XunfeiSuntoneScorer | undefined => {
  const enabled = environment.XUNFEI_ASSESSMENT_ENABLED?.toLowerCase();
  if (enabled !== "1" && enabled !== "true") return undefined;
  const appID = environment.XUNFEI_APP_ID?.trim() ?? "";
  const apiKey = environment.XUNFEI_API_KEY?.trim() ?? "";
  const apiSecret = environment.XUNFEI_API_SECRET?.trim() ?? "";
  if (!appID && !apiKey && !apiSecret) return undefined;
  return new XunfeiSuntoneScorer({ appID, apiKey, apiSecret });
};
