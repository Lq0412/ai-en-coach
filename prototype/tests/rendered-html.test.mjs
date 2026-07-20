import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

async function readActivePrototype() {
  return Promise.all([
    readFile(new URL("speakup-premium/pages/prototype.html", root), "utf8"),
    readFile(new URL("speakup-premium/assets/spreak-prototype-v28.js", root), "utf8"),
    readFile(new URL("speakup-premium/assets/interview-alignment.js", root), "utf8"),
    readFile(new URL("speakup-premium/assets/panel-extension.js", root), "utf8"),
    readFile(new URL("speakup-premium/assets/panel-extension.css", root), "utf8"),
  ]);
}

test("renders the current SpeakUp prototype shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /SpeakUp 产品原型/);
  assert.match(html, /pages\/prototype\.html/);
});

test("loads only the current prototype extension assets", async () => {
  const [html] = await readActivePrototype();
  for (const asset of [
    "spreak-prototype-v28.js",
    "interview-alignment.js",
    "interview-alignment.css",
    "panel-extension.js",
    "panel-extension.css",
    "enterprise-theme.css",
  ]) assert.match(html, new RegExp(asset.replace(".", "\\.")));
  assert.doesNotMatch(html, /spreak-prototype-v2[567]\.js/);
  assert.doesNotMatch(html, /data-route="auth"/);
});

test("keeps the Agent interview creation and multi-round plan connected", async () => {
  const [, core, alignment, panel] = await readActivePrototype();
  assert.match(panel, /views\['agent-chat'\]=agentConversation/);
  assert.match(panel, /function startAgentCreateFlow/);
  assert.match(panel, /function createAgentMockPlan/);
  assert.match(panel, /创建模拟面试/);
  assert.match(panel, /模拟面试已创建/);
  assert.match(panel, /state\.plans\.unshift\(plan\)/);
  assert.match(alignment, /data-plan-carousel/);
  assert.match(alignment, /data-action="align-carousel-to"/);
  assert.match(alignment, /面试计划/);
});

test("keeps interview, report, retry and mistake review in one flow", async () => {
  const [, core, alignment, panel] = await readActivePrototype();
  for (const route of ["practice", "report", "retry", "mistakes", "mistake-practice"])
    assert.match(core + alignment + panel, new RegExp(`['\"]${route}['\"]`));
  assert.match(alignment, /session\.status='completed'/);
  assert.match(core + alignment, /turnTranscripts/);
  assert.match(core + alignment, /同题复练/);
  assert.match(panel, /错题回顾/);
});

test("groups practice history by interview plan and deduplicates scene records", async () => {
  const [, , , panel, styles] = await readActivePrototype();
  const history = panel.match(/function completeHistoryView\(\)[\s\S]*?alignedHomeV3=completeHistoryView/)?.[0] || "";
  assert.match(history, /history-plan-card/);
  assert.match(history, /history-round-row/);
  assert.match(history, /state\.scenePracticeHistory/);
  assert.match(history, /records\.findIndex/);
  assert.match(history, /查看面试计划/);
  assert.doesNotMatch(history, /practice-report-entry|practice-reports/);
  assert.match(styles, /\.history-plan-card/);
});

test("uses the SpeakUp agent and profile images in the active navigation", async () => {
  const [, , , panel, styles] = await readActivePrototype();
  assert.match(panel, /speakup-agent\.png/);
  assert.match(panel, /profile-avatar\.svg/);
  assert.match(panel, /app-drawer-brand/);
  assert.match(styles, /\.sidebar-login-logo/);
  assert.match(styles, /speakup-agent\.png/);
});
