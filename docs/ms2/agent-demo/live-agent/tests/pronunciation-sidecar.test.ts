import assert from "node:assert/strict";
import test from "node:test";

import { pcm16Mono16KToWAV } from "../src/providers/go-audio-recording.js";
import { wavPCM16Mono16K } from "../src/pronunciation-sidecar.js";

test("pronunciation sidecar extracts PCM from the stored WAV recording", () => {
  const pcm = Uint8Array.from([0, 1, 2, 3, 4, 5]);
  const wav = pcm16Mono16KToWAV(pcm);
  assert.deepEqual(wavPCM16Mono16K(wav), pcm);
});

test("pronunciation sidecar rejects unsupported WAV sample rates", () => {
  const wav = pcm16Mono16KToWAV(Uint8Array.from([0, 1]));
  new DataView(wav.buffer).setUint32(24, 48_000, true);
  assert.throws(() => wavPCM16Mono16K(wav), /PCM16 mono 16 kHz/);
});
