import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
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

test("server-renders the SpeakUp product prototype host", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>SpeakUp 产品原型<\/title>/i);
  assert.match(html, /SpeakUp 产品原型/);
  assert.match(html, /\/prototype\/pages\/prototype\.html\?api_base=/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("prototype bridges the original interaction to the Go assistant", async () => {
  const [prototype, bridge, panelExtension] = await Promise.all([
    readFile(
      new URL("../public/prototype/pages/prototype.html", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../public/prototype/assets/agent-backend-bridge.js",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../public/prototype/assets/panel-extension.js", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(prototype, /spreak-prototype-v28\.js/);
  assert.match(prototype, /panel-extension\.js/);
  assert.match(prototype, /agent-backend-bridge\.js/);
  assert.match(bridge, /\/v1\/assistant\/threads\//);
  assert.match(bridge, /\/tasks\/stream/);
  assert.match(bridge, /\/v1\/audio\/transcriptions/);
  assert.match(bridge, /\/v1\/audio\/transcriptions\/stream/);
  assert.match(bridge, /\/v1\/audio\/speech/);
  assert.match(bridge, /\/v1\/language-assistance/);
  assert.match(bridge, /data-real-action="toggle-translation"/);
  assert.match(bridge, /data-real-action="toggle-correction"/);
  assert.match(bridge, /data-real-action="open-language-analysis"/);
  assert.match(bridge, /data-real-action="play-user-recording"/);
  assert.match(bridge, /aria-label="AI 发音"/);
  assert.match(bridge, /aria-label="播放我的录音"/);
  assert.match(bridge, /is_demo:\s*true/);
  assert.match(bridge, /real-message-score-bar/);
  assert.match(bridge, /learning_assessment/);
  assert.match(bridge, /native_expression/);
  assert.match(bridge, /real-correction-sheet/);
  assert.doesNotMatch(bridge, /data-real-action="open-correction-detail"/);
  assert.match(bridge, /target_language:\s*"zh-CN"/);
  assert.match(bridge, /MediaSource\.isTypeSupported\("audio\/mpeg"\)/);
  assert.match(bridge, /queueStreamingSpeechDelta/);
  assert.match(bridge, /flushStreamingSpeech/);
  assert.match(bridge, /stopSpeechPlayback/);
  assert.match(bridge, /real-voice-capture/);
  assert.match(bridge, /transcript\.delta/);
  assert.match(bridge, /interview_paused|interaction_mode/);
  assert.match(bridge, /context_limit_exceeded/);
  assert.match(bridge, /当前会话已达到上下文上限/);
  assert.match(bridge, /views\["practice"\]\s*=\s*realPracticeView/);
  assert.match(bridge, /views\["report"\]\s*=\s*realReportView/);
  assert.match(bridge, /views\["home"\]\s*=\s*realHistoryView/);
  assert.match(bridge, /completedQuestionCount/);
  assert.match(bridge, /snapshot\?\.targetRole/);
  assert.match(bridge, /recentConversationHTML/);
  assert.match(bridge, /\/v1\/assistant\/conversations/);
  assert.match(bridge, /realConversationArchiveView/);
  assert.match(bridge, /open-conversation-history/);
  assert.match(bridge, /confirm-delete-conversation/);
  assert.match(bridge, /\/v1\/practice\/sessions/);
  assert.match(bridge, /openInterviewHistory/);
  assert.match(bridge, /real-history-transcript/);
  assert.match(bridge, /confirm-delete-interview-history/);
  assert.match(bridge, /data-real-action="submit-answer"/);
  assert.match(bridge, /data-real-action="toggle-practice-transcript"/);
  assert.match(bridge, /data-real-action="toggle-practice-input"/);
  assert.match(bridge, /real-practice-mic/);
  assert.match(bridge, /data-real-action="practice-coach"/);
  assert.match(bridge, /教我怎么说，帮我组织回答/);
  assert.match(bridge, /\/v1\/practice\/answer-coach/);
  assert.match(bridge, /可以直接照着说/);
  assert.doesNotMatch(bridge, /播放示范回答/);
  assert.doesNotMatch(bridge, /In that project, the main challenge was/);
  assert.match(bridge, /real-interview-report-card/);
  assert.match(bridge, /data-real-action="open-report-card"/);
  assert.match(bridge, /mainConversationMessages/);
  assert.match(bridge, /maybeAutoPlayActiveQuestion/);
  assert.match(bridge, /submitRecognizedVoiceAnswer/);
  assert.match(bridge, /pendingVoiceAnswerSubmit/);
  assert.match(bridge, /uploadVoiceRecording/);
  assert.match(bridge, /voiceSubmissionInProgress/);
  assert.match(bridge, /正在识别并发送/);
  assert.match(bridge, /optimisticUserMessage/);
  assert.match(bridge, /optimisticStatus: "transcribing"/);
  assert.match(bridge, /正在识别语音/);
  assert.match(bridge, /已发送，等待 SpeakUp 回复/);
  assert.match(bridge, /语音播放失败，请稍后点击重读/);
  assert.match(bridge, /sendMessage\(\s*transcript,\s*\[recordingAttachment\.id\]/);
  assert.match(bridge, /startsWith\("audio\/"\)/);
  assert.match(bridge, /data-real-action="retry-voice-send"/);
  assert.match(bridge, /本次录音已保留/);
  assert.doesNotMatch(bridge, /⭐|★|☆/);
  assert.match(bridge, /data-attachment-input/);
  assert.match(bridge, /accept="application\/pdf,image\/png,image\/jpeg,image\/webp"/);
  assert.match(bridge, /\/v1\/assistant\/attachments/);
  assert.match(bridge, /attachment_ids/);
  assert.match(bridge, /interaction_mode:\s*activeRealRoute === "practice" \? "interview" : "conversation"/);
  assert.match(bridge, /aria-label="返回对话"/);
  assert.match(bridge, /contentAvailable/);
  assert.match(bridge, /\/v1\/assistant\/attachments\/\$\{encodeURIComponent\(attachment\.id\)\}\/content/);
  assert.match(bridge, /real-image-attachment/);
  assert.match(bridge, /\/v1\/preparation\/resumes/);
  assert.match(bridge, /views\["resumes"\] = realResumeView/);
  assert.match(bridge, /activate-resume/);
  assert.match(bridge, /start-resume-edit/);
  assert.match(bridge, /save-resume-profile/);
  assert.match(bridge, /\/profile/);
  assert.match(bridge, /confirm-delete-resume/);
  assert.match(bridge, /SPEAKUP_REAL_AGENT_BRIDGE\s*=\s*true/);
  assert.match(bridge, /URLSearchParams\(window\.location\.search\)\.get\("api_base"\)/);
  assert.match(bridge, /\/v1\/memories/);
  assert.doesNotMatch(bridge, /\/v1\/memory\/facts/);
  assert.match(panelExtension, /aria-label="打开菜单"/);
  assert.match(panelExtension, /aria-label="开始新对话"/);
  assert.match(panelExtension, /usesDedicatedAgentVoiceHeader/);
  assert.doesNotMatch(bridge, /preparationEditorHTML|savePreparationProfile/);
});

test("keeps Go assistant contracts aligned with the XE3-ESL scaffold", async () => {
  const [model, ports, service, client] = await Promise.all([
    readFile(
      new URL("../../backend/internal/assistant/model.go", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../backend/internal/assistant/ports.go", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../backend/internal/assistant/service.go", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/lib/assistant.ts", import.meta.url), "utf8"),
  ]);
  const source = [model, ports, service].join("\n");

  for (const contract of [
    "AssistantThread",
    "TaskRun",
    "ToolCall",
    "ConfirmationRequest",
    "Plan",
    "PlanStep",
    "ToolResult",
    "AssistantService",
    "Planner",
    "ToolRegistry",
    "ConversationStore",
    "StartTaskCommand",
    "ResumeTaskCommand",
    "GetThreadQuery",
  ]) {
    assert.match(source, new RegExp(`\\b${contract}\\b`));
  }

  for (const method of [
    "StartTask",
    "ResumeTask",
    "GetThread",
    "Execute",
    "GetPendingConfirmationRequest",
    "SaveConfirmationRequest",
  ]) {
    assert.match(source, new RegExp(`\\b${method}\\s*\\(`));
  }

  assert.match(source, /ActorUserID\s+string/);
  assert.match(source, /IdempotencyKey\s+string/);
  assert.match(source, /TaskRunStatusAwaitingConfirm/);
  assert.match(client, /class RemoteAssistantService implements AssistantService/);
  assert.doesNotMatch(client, /class MockPlanner|class MockToolRegistry/);
  assert.match(client, /async Transcribe\(audio: Blob\)/);
  assert.match(client, /async Synthesize\(text: string/);
  assert.match(client, /convertRecordingToWAV/);
});

test("defines realtime event, reconciliation, and latency bridge contracts", async () => {
  const bridge = await readFile(
    new URL(
      "../public/prototype/assets/agent-backend-bridge.js",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(bridge, /transcript\.partial/);
  assert.match(bridge, /turn\.user_committed/);
  assert.match(bridge, /turn\.assistant_committed/);
  assert.match(bridge, /attachment\.linked/);
  assert.match(bridge, /latency\.point/);
  assert.match(bridge, /thread_id/);
  assert.match(bridge, /live_session_id/);
  assert.match(bridge, /turn_id/);
  assert.match(bridge, /client_message_id/);
  assert.match(bridge, /occurred_at/);
  assert.match(bridge, /sequence/);
  assert.match(bridge, /postMessage\(/);
  assert.match(bridge, /reconcileCanonicalMessage/);
  assert.match(bridge, /recordLiveLatencyPoint/);
  assert.match(bridge, /client_message_id:\s*clientMessageID/);
  assert.match(bridge, /idempotency_key:\s*clientMessageID/);
});

test("removes disposable starter artifacts", async () => {
  const packageJson = await readFile(
    new URL("../package.json", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(
    access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)),
  );
});
