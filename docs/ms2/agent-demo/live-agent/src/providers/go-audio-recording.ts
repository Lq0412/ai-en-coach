import { TurnAudioBuffer } from "../turn-audio-buffer.js";
import type {
  LearningAssessment,
  XunfeiSuntoneScorer,
} from "./xunfei-suntone.js";

const WAV_HEADER_BYTES = 44;
const PCM16_MONO_16K_BYTES_PER_SECOND = 32_000;

export const pcm16Mono16KToWAV = (
  pcm: Uint8Array,
): Uint8Array<ArrayBuffer> => {
  const wav = new Uint8Array(WAV_HEADER_BYTES + pcm.byteLength);
  const view = new DataView(wav.buffer);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true);
  view.setUint32(28, PCM16_MONO_16K_BYTES_PER_SECOND, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  wav.set(pcm, WAV_HEADER_BYTES);
  return wav;
};

const responseJSON = async (
  response: Response,
): Promise<Record<string, unknown>> => {
  if (!response.ok) {
    throw new Error(`Go attachment endpoint failed with HTTP ${response.status}`);
  }
  return (await response.json()) as Record<string, unknown>;
};

export const createGoTurnAudioBuffer = (
  baseURL: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
  scorer?: XunfeiSuntoneScorer,
): TurnAudioBuffer => {
  const root = baseURL.replace(/\/$/, "");
  return new TurnAudioBuffer({
    maxBytes: 8 << 20,
    upload: async (pcm): Promise<string> => {
      const wav = pcm16Mono16KToWAV(pcm);
      const form = new FormData();
      form.append(
        "file",
        new Blob([wav.buffer], { type: "audio/wav" }),
        "voice-turn.wav",
      );
      const payload = await responseJSON(
        await fetchImpl(`${root}/v1/assistant/attachments`, {
          method: "POST",
          body: form,
        }),
      );
      const attachment = payload.attachment as
        | Record<string, unknown>
        | undefined;
      const id = String(attachment?.ID ?? attachment?.id ?? "");
      if (!id) throw new Error("Go attachment endpoint omitted attachment ID");
      return id;
    },
    link: async (messageID, attachmentID) => {
      const payload = await responseJSON(
        await fetchImpl(
          `${root}/v1/assistant/messages/${encodeURIComponent(messageID)}/attachments`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ attachment_id: attachmentID }),
          },
        ),
      );
      const message = payload.message;
      if (!message || typeof message !== "object" || !("ID" in message)) {
        throw new Error("Go attachment link endpoint omitted canonical message");
      }
      return message as Record<string, unknown>;
    },
    ...(scorer ? {
      assess: async (pcm, messageID, referenceText) => {
        const assessment: LearningAssessment = await scorer.score(
          pcm,
          referenceText,
        );
        const payload = await responseJSON(
          await fetchImpl(
            `${root}/v1/assistant/messages/${encodeURIComponent(messageID)}/assessment`,
            {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(assessment),
            },
          ),
        );
        const message = payload.message;
        if (!message || typeof message !== "object" || !("ID" in message)) {
          throw new Error("Go assessment endpoint omitted canonical message");
        }
        return message as Record<string, unknown>;
      },
    } : {}),
  });
};
