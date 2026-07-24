import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { xunfeiSuntoneFromEnv } from "./providers/xunfei-suntone.js";

const DEFAULT_ADDRESS = "127.0.0.1:8767";
const MAX_REQUEST_BYTES = 30 << 20;

const json = (
  response: ServerResponse,
  status: number,
  body: Record<string, unknown>,
) => {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
};

const readBody = async (request: IncomingMessage): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const data = Buffer.from(chunk);
    total += data.byteLength;
    if (total > MAX_REQUEST_BYTES) throw new Error("request body is too large");
    chunks.push(data);
  }
  return Buffer.concat(chunks);
};

export const wavPCM16Mono16K = (wav: Uint8Array): Uint8Array => {
  if (wav.byteLength < 44) throw new Error("WAV file is too short");
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const text = (offset: number, length: number) =>
    Buffer.from(wav.buffer, wav.byteOffset + offset, length).toString("ascii");
  if (text(0, 4) !== "RIFF" || text(8, 4) !== "WAVE") {
    throw new Error("audio must be a RIFF/WAVE file");
  }
  let format: {
    encoding: number;
    channels: number;
    sampleRate: number;
    bitsPerSample: number;
  } | undefined;
  let pcm: Uint8Array | undefined;
  for (let offset = 12; offset + 8 <= wav.byteLength;) {
    const kind = text(offset, 4);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + size;
    if (end > wav.byteLength) throw new Error("WAV chunk is truncated");
    if (kind === "fmt " && size >= 16) {
      format = {
        encoding: view.getUint16(start, true),
        channels: view.getUint16(start + 2, true),
        sampleRate: view.getUint32(start + 4, true),
        bitsPerSample: view.getUint16(start + 14, true),
      };
    } else if (kind === "data") {
      pcm = wav.slice(start, end);
    }
    offset = end + (size % 2);
  }
  if (!format || !pcm) throw new Error("WAV format or data chunk is missing");
  if (
    format.encoding !== 1 ||
    format.channels !== 1 ||
    format.sampleRate !== 16_000 ||
    format.bitsPerSample !== 16
  ) {
    throw new Error("audio must be PCM16 mono 16 kHz WAV");
  }
  if (pcm.byteLength === 0 || pcm.byteLength % 2 !== 0) {
    throw new Error("WAV PCM data is empty or misaligned");
  }
  return pcm;
};

const parseAddress = (value: string) => {
  const separator = value.lastIndexOf(":");
  if (separator <= 0) throw new Error("PRONUNCIATION_ASSESSMENT_ADDR must be host:port");
  const hostname = value.slice(0, separator);
  const port = Number(value.slice(separator + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PRONUNCIATION_ASSESSMENT_ADDR has an invalid port");
  }
  return { hostname, port };
};

export const startPronunciationSidecar = (
  environment: NodeJS.ProcessEnv = process.env,
) => {
  const scorer = xunfeiSuntoneFromEnv(environment);
  if (!scorer) throw new Error("Xunfei pronunciation assessment is not configured");
  const address = parseAddress(
    environment.PRONUNCIATION_ASSESSMENT_ADDR?.trim() || DEFAULT_ADDRESS,
  );
  const server = createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        json(response, 200, { status: "ok" });
        return;
      }
      if (request.method !== "POST" || request.url !== "/assess") {
        json(response, 404, { error: "not found" });
        return;
      }
      const payload = JSON.parse((await readBody(request)).toString("utf8")) as {
        audio_base64?: unknown;
        reference_text?: unknown;
      };
      const referenceText = String(payload.reference_text ?? "").trim();
      const audioBase64 = String(payload.audio_base64 ?? "");
      if (!referenceText || !audioBase64) {
        json(response, 400, { error: "audio_base64 and reference_text are required" });
        return;
      }
      const wav = Buffer.from(audioBase64, "base64");
      const assessment = await scorer.score(wavPCM16Mono16K(wav), referenceText);
      json(response, 200, assessment);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      json(response, 502, { error: message });
    }
  });
  server.listen(address.port, address.hostname, () => {
    console.log(`Pronunciation assessment sidecar listening on ${address.hostname}:${address.port}`);
  });
  return server;
};

if (process.argv[1]?.endsWith("pronunciation-sidecar.ts")) {
  startPronunciationSidecar();
}
