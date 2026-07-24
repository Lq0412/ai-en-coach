import assert from "node:assert/strict";
import test from "node:test";

import {
  assessmentLanguage,
  normalizeSuntoneResult,
  pcm16Mono16KToMP3,
  suntoneSignedURL,
} from "../src/providers/xunfei-suntone.js";

test("Suntone signed URL carries deterministic HMAC authorization", () => {
  const url = new URL(suntoneSignedURL({
    appID: "app",
    apiKey: "key",
    apiSecret: "secret",
  }, new Date("2022-08-16T08:28:38Z")));
  assert.equal(url.protocol, "wss:");
  assert.equal(url.hostname, "cn-east-1.ws-api.xf-yun.com");
  assert.equal(url.searchParams.get("date"), "Tue, 16 Aug 2022 08:28:38 GMT");
  const authorization = Buffer.from(
    url.searchParams.get("authorization") ?? "",
    "base64",
  ).toString("utf8");
  assert.match(authorization, /api_key="key"/);
  assert.match(authorization, /algorithm="hmac-sha256"/);
  assert.match(authorization, /signature="/);
});

test("Suntone language selection handles English and Chinese", () => {
  assert.equal(assessmentLanguage("Hello, how are you?"), "en");
  assert.equal(assessmentLanguage("你好，今天怎么样？"), "cn");
});

test("PCM16 mono input is encoded as non-empty MP3", () => {
  const pcm = new Uint8Array(32_000);
  const view = new DataView(pcm.buffer);
  for (let sample = 0; sample < pcm.byteLength / 2; sample += 1) {
    view.setInt16(
      sample * 2,
      Math.round(Math.sin(sample / 12) * 12_000),
      true,
    );
  }
  const mp3 = pcm16Mono16KToMP3(pcm);
  assert.ok(mp3.byteLength > 1_000);
  assert.equal(mp3[0], 0xff);
});

test("Suntone result is normalized for the message assessment contract", () => {
  const assessment = normalizeSuntoneResult({
    result: {
      overall: 88,
      fluency: 91,
      pronunciation: 84,
      integrity: 100,
      rhythm: 79,
      speed: 146,
      words: [{
        word: "think",
        scores: { overall: 82, pronunciation: 78 },
        span: { start: 4, end: 38 },
        phonemes: [{
          phoneme: "TH",
          phone: "θ",
          pronunciation: 62,
          span: { start: 4, end: 10 },
        }],
      }],
    },
  });
  assert.equal(assessment.provider, "xunfei.suntone");
  assert.equal(assessment.pronunciation, 84);
  assert.equal(assessment.words?.[0]?.phonemes?.[0]?.phone, "θ");
  assert.match(assessment.explanations?.[0] ?? "", /think.*θ.*62/);
});
