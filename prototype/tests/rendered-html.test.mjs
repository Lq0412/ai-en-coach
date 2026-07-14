import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the SpeakUp prototype shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /<title>SpeakUp 产品原型<\/title>/i);
  assert.match(html, /<iframe[^>]+src="\/spreak-prototype\.html"/i);
  assert.match(html, /title="SpeakUp 产品原型"/i);
});

test("keeps the product shell linked to the interactive prototype", async () => {
  const [page, layout, prototypeHtml, prototypeScript] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/spreak-prototype.html", import.meta.url), "utf8"),
    readFile(new URL("../public/spreak-prototype.js", import.meta.url), "utf8"),
  ]);

  assert.match(page, /src="\/spreak-prototype\.html"/);
  assert.match(page, /title="SpeakUp 产品原型"/);
  assert.match(layout, /title:\s*"SpeakUp 产品原型"/);
  assert.match(layout, /lang="zh-CN"/);
  assert.match(prototypeHtml, /id="screen"/);
  assert.match(prototypeHtml, /src="spreak-prototype\.js\?v=3"/);
  assert.match(prototypeHtml, /data-route="interviewers"/);
  assert.match(prototypeScript, /'interviewers':interviewers/);
  assert.match(prototypeScript, /'conversation-history':conversationHistory/);
  assert.match(prototypeScript, /'mistake-practice':mistakePractice/);
});
