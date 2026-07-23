(function () {
  window.SPEAKUP_REAL_AGENT_BRIDGE = true;
  const requestedAPIBase = new URLSearchParams(window.location.search).get("api_base");
  const API_BASE = /^https?:\/\//.test(requestedAPIBase || "")
    ? requestedAPIBase.replace(/\/$/, "")
    : "http://localhost:8080";
  const ACTOR_ID = "demo-user";
  const THREAD_ID = "thread-demo-001";
  const LIVE_BRIDGE_SOURCE = "speakup-agent-bridge";
  const LIVE_HOST_SOURCE = "speakup-livekit-host";
  const LIVE_BRIDGE_VERSION = 1;
  const LIVE_EVENT_TYPES = new Set([
    "transcript.partial",
    "turn.user_committed",
    "turn.assistant_committed",
    "attachment.linked",
    "latency.point",
  ]);
  const LIVE_CANONICAL_EVENT_TYPES = new Set([
    "turn.user_committed",
    "turn.assistant_committed",
    "attachment.linked",
  ]);
  const CONVERSATION_MODES = new Set(["normal", "live"]);
  const liveEventSequences = new Map();

  let snapshot = null;
  let loading = true;
  let bridgeError = "";
  let inputValue = "";
  let recorder = null;
  let recordingStream = null;
  let recordingChunks = [];
  let speaking = false;
  let speechQueue = [];
  let speechQueueRunning = false;
  let currentSpeechAudio = null;
  let currentSpeechAbort = null;
  let sentenceBuffer = "";
  let lastSpokenSentence = "";
  let autoVoiceEnabled = true;
  let asrSocket = null;
  let asrAudioContext = null;
  let asrProcessor = null;
  let asrSource = null;
  let recordingStartedAt = 0;
  let recordingElapsedSeconds = 0;
  let recordingTimer = null;
  let liveTranscript = "";
  let discardRecording = false;
  let asrStreamingFailed = false;
  let fallbackRecordingBlob = null;
  let fallbackTranscriptionStarted = false;
  let recordingStatus = "实时识别中";
  let activeRealRoute = "agent-chat";
  let streamingText = "";
  let optimisticUserMessage = null;
  let contextLimitExceeded = false;
  let rejectedContextTokenCount = 0;
  let deadlineTimer = null;
  let endingInterview = false;
  let selectedHistorySessionID = "";
  let preparationProfile = null;
  let pendingAttachments = [];
  let attachmentUploading = false;
  let managedResumes = [];
  let managedResumeLimit = 3;
  let resumeLoading = false;
  let resumeError = "";
  let resumeMenuID = "";
  let resumeRenaming = false;
  let resumeDeleteConfirmID = "";
  let resumeEditingID = "";
  let resumeEditDraft = null;
  let conversationArchives = [];
  let selectedConversationArchive = null;
  let archiveDeleteConfirm = false;
  let interviewHistorySessions = [];
  let selectedInterviewSessionDetail = null;
  let interviewHistoryDeleteConfirm = false;
  let practiceTranscriptVisible = false;
  let practiceTextInputVisible = false;
  let practiceCoachVisible = false;
  let answerCoachQuestion = "";
  let answerCoachText = "";
  let answerCoachLoading = false;
  let answerCoachError = "";
  let pendingVoiceAnswerSubmit = false;
  let voiceAnswerSubmitting = false;
  let voiceTranscriptFinal = false;
  let voiceSubmissionInProgress = false;
  let failedVoiceRecordingBlob = null;
  let lastAutoPlayedQuestion = "";
  let memoryFacts = [];
  let memoryLoading = false;
  let memoryError = "";
  let selectedMemoryFact = null;
  let memoryEditDraft = null;
  const languageAssistanceCache = new Map();
  const languageAssistanceLoading = new Set();
  const languageAssistanceErrors = new Map();
  let expandedTranslationID = "";
  let expandedCorrectionID = "";
  let correctionDetailMessageID = "";

  function liveIdentityKey(identity) {
    return [
      identity.thread_id,
      identity.live_session_id,
      identity.turn_id,
      identity.client_message_id,
    ].join(":");
  }

  function nextLiveEventSequence(identity) {
    const key = liveIdentityKey(identity);
    const sequence = (liveEventSequences.get(key) || 0) + 1;
    liveEventSequences.set(key, sequence);
    return sequence;
  }

  function validateLiveEvent(event) {
    if (!event || !LIVE_EVENT_TYPES.has(event.type)) return false;
    if (!CONVERSATION_MODES.has(event.mode)) return false;
    if (
      !event.thread_id ||
      !event.live_session_id ||
      !event.turn_id ||
      !event.client_message_id ||
      !event.occurred_at ||
      !Number.isInteger(event.sequence) ||
      event.sequence < 1
    ) return false;
    if (event.type === "transcript.partial" && event.message) return false;
    if (LIVE_CANONICAL_EVENT_TYPES.has(event.type)) {
      return Boolean(
        event.message?.ID &&
        event.message?.client_message_id === event.client_message_id,
      );
    }
    return true;
  }

  function postLiveBridgeMessage(event) {
    if (!validateLiveEvent(event) || window.parent === window) return false;
    window.parent.postMessage(
      {
        source: LIVE_BRIDGE_SOURCE,
        version: LIVE_BRIDGE_VERSION,
        event,
      },
      window.location.origin,
    );
    return true;
  }

  function recordLiveLatencyPoint(
    identity,
    stage,
    source = "browser",
    occurredAt = new Date(),
  ) {
    const occurred_at = occurredAt.toISOString();
    const sequence = nextLiveEventSequence(identity);
    const point = {
      ...identity,
      stage,
      source,
      occurred_at,
      sequence,
    };
    const event = {
      type: "latency.point",
      ...identity,
      occurred_at,
      sequence,
      latency: point,
    };
    postLiveBridgeMessage(event);
    return point;
  }

  function reconcileCanonicalMessage(message) {
    const clientMessageID = message?.client_message_id;
    if (!clientMessageID) return false;
    if (optimisticUserMessage?.client_message_id === clientMessageID) {
      optimisticUserMessage = null;
    }
    if (!snapshot) snapshot = { messages: [] };
    if (!Array.isArray(snapshot.messages)) snapshot.messages = [];
    const canonicalIndex = snapshot.messages.findIndex(
      (item) =>
        item.ID === message.ID ||
        item.client_message_id === clientMessageID,
    );
    if (canonicalIndex >= 0) snapshot.messages[canonicalIndex] = message;
    else snapshot.messages.push(message);
    return true;
  }

  function applyLiveEvent(event) {
    if (!validateLiveEvent(event)) return false;
    if (event.type === "transcript.partial") {
      liveTranscript = event.transcript || "";
      if (activeRealRoute !== "practice") inputValue = liveTranscript;
      rerender(activeRealRoute);
      return true;
    }
    if (LIVE_CANONICAL_EVENT_TYPES.has(event.type)) {
      reconcileCanonicalMessage(event.message);
      rerender(activeRealRoute);
    }
    return true;
  }

  window.addEventListener("message", (messageEvent) => {
    if (
      messageEvent.origin !== window.location.origin ||
      messageEvent.source !== window.parent ||
      messageEvent.data?.source !== LIVE_HOST_SOURCE ||
      messageEvent.data?.version !== LIVE_BRIDGE_VERSION
    ) return;
    applyLiveEvent(messageEvent.data.event);
  });

  const escapeHTML = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  const formatAssistantText = (value) =>
    escapeHTML(value)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");

  const soundIconHTML = (badge = "") => `<span class="real-sound-glyph" aria-hidden="true">
    <svg viewBox="0 0 24 24"><path d="M5 9v6h4l5 4V5L9 9H5Z"></path><path d="M17 9.2c1.4 1.5 1.4 4.1 0 5.6"></path><path d="M19.5 6.8c2.8 2.8 2.8 7.6 0 10.4"></path></svg>
    ${badge ? `<b>${escapeHTML(badge)}</b>` : ""}
  </span>`;

  const translationIconHTML = () => `<span class="real-translation-glyph" aria-hidden="true"><b>文</b><i>A</i></span>`;

  async function request(path, init) {
    const response = await fetch(API_BASE + path, init);
    if (!response.ok) {
      const body = await response.text();
      try {
        const parsed = JSON.parse(body);
        throw new Error(parsed.error || body);
      } catch (error) {
        if (error instanceof SyntaxError) throw new Error(body);
        throw error;
      }
    }
    if (response.status === 204) return null;
    return response.json();
  }

  function currentConfirmation() {
    return snapshot?.confirmations?.find((item) => item.Status === "pending");
  }

  function isRecording() {
    return Boolean(recordingStream);
  }

  function conversationVoiceState() {
    if (isRecording()) return { key: "listening", label: "正在听你说话" };
    if (speaking) return { key: "speaking", label: "正在说话" };
    if (loading) return { key: "thinking", label: streamingText ? "正在组织表达" : "正在理解" };
    return { key: "ready", label: activeRealRoute === "practice" ? "等待你的回答" : "随时可以开始说话" };
  }

  function taskRuns(intent) {
    return (snapshot?.taskRuns || []).filter((item) => !intent || item.Intent === intent);
  }

  function hasInterview() {
    return taskRuns("start_mock_interview").length > 0;
  }

  function interviewContext() {
    const start = taskRuns("start_mock_interview")[0];
    const plan = start ? snapshot?.plans?.[start.ID] : null;
    const createStep = plan?.Steps?.find((item) => item.ToolName === "practice.create_plan");
    return {
      targetRole:
        snapshot?.targetRole ||
        createStep?.Arguments?.role ||
        "Software Engineer",
      interviewer: snapshot?.interviewer || "Senior Hiring Manager",
      maxTurns:
        snapshot?.maxInterviewTurns ||
        createStep?.Arguments?.max_turns ||
        10,
      durationMinutes:
        snapshot?.interviewDurationMinutes ||
        createStep?.Arguments?.duration_minutes ||
        15,
    };
  }

  function interviewTiming() {
    const deadline = Date.parse(snapshot?.interviewDeadline || "");
    const remainingSeconds = Number.isFinite(deadline)
      ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      : null;
    return {
      remainingSeconds,
      expired: remainingSeconds === 0,
      label:
        remainingSeconds === null
          ? "计时将在开始后启动"
          : remainingSeconds === 0
            ? "时间已到，本轮提交后结束"
            : `剩余 ${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`,
    };
  }

  function interviewFinished() {
    const { maxTurns } = interviewContext();
    const hasFeedback = taskRuns("submit_interview_answer").some(
      (item) => item.Result?.summary,
    ) || taskRuns("end_interview").some((item) => item.Result?.summary);
    return hasInterview() &&
      !snapshot?.activeQuestion &&
      (hasFeedback ||
        (snapshot?.completedQuestionCount || 0) >= maxTurns ||
        interviewTiming().expired);
  }

  function latestAssistantMessage() {
    return [...(snapshot?.messages || [])]
      .reverse()
      .find((item) => item.Role === "assistant");
  }

  function selectedInterviewSession() {
    if (selectedInterviewSessionDetail) return selectedInterviewSessionDetail;
    const sessions = snapshot?.interviewSessions || [];
    if (selectedHistorySessionID) {
      const selected = sessions.find((item) => item.id === selectedHistorySessionID);
      if (selected) return selected;
    }
    return sessions[sessions.length - 1] || null;
  }

  function latestInterviewFeedback(session = selectedInterviewSession()) {
    if (session?.feedback) return session.feedback;
    const feedbackRun = (snapshot?.taskRuns || []).find(
      (item) =>
        ["review_latest_practice", "submit_interview_answer", "end_interview"].includes(item.Intent) &&
        item.Result?.summary,
    );
    return feedbackRun?.Result?.summary || latestAssistantMessage()?.Content;
  }

  function realErrorHTML() {
    return bridgeError
      ? `<section class="real-agent-error"><small>请求失败</small><h2>当前操作没有完成</h2><p>${escapeHTML(bridgeError)}</p></section>`
      : "";
  }

  function contextLimitHTML() {
    if (!contextLimitExceeded && !snapshot?.requiresNewThread) return "";
    const tokenCount =
      rejectedContextTokenCount || snapshot?.contextTokenCount || 10000;
    const tokenLimit = snapshot?.contextTokenLimit || 10000;
    return `<section class="real-context-limit">
      <small>CONTEXT LIMIT</small>
      <h2>当前会话已达到上下文上限</h2>
      <p>当前约 ${escapeHTML(tokenCount.toLocaleString())} tokens，限制为 ${escapeHTML(tokenLimit.toLocaleString())} tokens。为保证完整上下文不会被截断，请新建会话后继续。</p>
      <button data-real-action="reset">新建会话</button>
    </section>`;
  }

  function thinkingHTML(label = "SpeakUp 正在思考") {
    return loading
      ? `<div class="real-thinking"><i></i><i></i><i></i><span>${escapeHTML(label)}</span></div>`
      : "";
  }

  function preparationStatusHTML() {
    if (!preparationProfile?.id) return "";
    const skills = (preparationProfile.skills || []).slice(0, 3).join(" · ");
    return `<section class="real-preparation-status">
      <span><small>已确认候选人背景</small><b>${escapeHTML(preparationProfile.jobTitle || preparationProfile.headline || preparationProfile.candidateName || "简历已记住")}</b><em>${escapeHTML(skills || preparationProfile.resumeName || "资料已保存")}</em></span>
      <button type="button" disabled>已记住</button>
    </section>`;
  }

  function attachmentCardsHTML(attachments, removable = false) {
    const visibleAttachments = (attachments || []).filter(
      (attachment) => !String(attachment.mediaType || "").startsWith("audio/"),
    );
    if (!visibleAttachments.length) return "";
    return `<div class="real-attachments ${removable ? "pending" : ""}">
      ${visibleAttachments.map((attachment) => {
        const isRenderableImage = attachment.mediaType?.startsWith("image/") && attachment.contentAvailable;
        if (isRenderableImage) {
          const source = `${API_BASE}/v1/assistant/attachments/${encodeURIComponent(attachment.id)}/content`;
          return `<figure class="real-image-attachment">
            <button class="real-image-open" type="button" data-real-action="view-attachment" data-attachment-id="${escapeHTML(attachment.id)}" aria-label="查看图片 ${escapeHTML(attachment.name)}"><img src="${escapeHTML(source)}" alt="${escapeHTML(attachment.name)}" ${removable ? "" : "loading=\"lazy\""}></button>
            <figcaption><b>${escapeHTML(attachment.name)}</b><small>${escapeHTML(attachment.summary || "图片已解析")}</small></figcaption>
            ${removable ? `<button class="real-image-remove" type="button" data-real-action="remove-attachment" data-attachment-id="${escapeHTML(attachment.id)}" aria-label="移除图片">×</button>` : ""}
          </figure>`;
        }
        return `<span class="real-attachment-card">
          <i>${attachment.mediaType === "application/pdf" ? "PDF" : "IMG"}</i>
          <span><b>${escapeHTML(attachment.name)}</b><small>${escapeHTML(attachment.summary || (attachmentUploading ? "正在由模型理解…" : "附件已解析"))}</small></span>
          ${removable ? `<button type="button" data-real-action="remove-attachment" data-attachment-id="${escapeHTML(attachment.id)}" aria-label="移除附件">×</button>` : ""}
        </span>`;
      }).join("")}
    </div>`;
  }

  const languageAssistanceKey = (messageID, operation) =>
    `${operation}:${messageID}`;

  function languageAssistanceState(messageID, operation) {
    const key = languageAssistanceKey(messageID, operation);
    return {
      result: languageAssistanceCache.get(key),
      loading: languageAssistanceLoading.has(key),
      error: languageAssistanceErrors.get(key) || "",
    };
  }

  function translationPreviewHTML(message) {
    if (expandedTranslationID !== message.ID) return "";
    const { result, loading: isLoading, error } = languageAssistanceState(message.ID, "translate");
    if (isLoading) {
      return `<div class="real-inline-assistance loading"><i></i><span>正在翻译…</span></div>`;
    }
    if (error) {
      return `<div class="real-inline-assistance error"><span>${escapeHTML(error)}</span><button data-real-action="retry-language-assistance" data-message-id="${escapeHTML(message.ID)}" data-operation="translate">重试</button></div>`;
    }
    if (!result?.translation) return "";
    return `<div class="real-inline-assistance translation"><small>中文翻译</small><p>${escapeHTML(result.translation)}</p></div>`;
  }

  function correctionPreviewHTML(message) {
    if (expandedCorrectionID !== message.ID) return "";
    const { result, loading: isLoading, error } = languageAssistanceState(message.ID, "correct");
    if (isLoading) {
      return `<div class="real-inline-assistance loading"><i></i><span>正在检查表达…</span></div>`;
    }
    if (error) {
      return `<div class="real-inline-assistance error"><span>${escapeHTML(error)}</span><button data-real-action="retry-language-assistance" data-message-id="${escapeHTML(message.ID)}" data-operation="correct">重试</button></div>`;
    }
    const correction = result?.correction;
    if (!correction) return "";
    return `<div class="real-inline-assistance correction ${correction.has_issues ? "has-issues" : "is-correct"}">
      <small>${correction.has_issues ? "建议修改" : "表达检查"}</small>
      <p>${escapeHTML(correction.brief)}</p>
      ${correction.has_issues ? `<strong>${escapeHTML(correction.corrected_text)}</strong>` : ""}
    </div>`;
  }

  function messageAssessment(message) {
    // Scoring integration point:
    // { overall, fluency, pronunciation, naturalness, native_expression, explanations }
    const correction = languageAssistanceState(message?.ID, "correct").result?.correction;
    const original = String(message?.Content || "");
    const demoNativeExpression = original
      .replace(/\bvery successfully\b/gi, "very successful")
      .replace(/^Good morning,\s*good morning\.?$/i, "Good morning!");
    const demoChanged = demoNativeExpression !== original;
    return message?.learning_assessment ||
      languageAssistanceState(message?.ID, "correct").result?.assessment || {
        overall: 90,
        fluency: 100,
        pronunciation: 99,
        naturalness: 70,
        native_expression: correction?.corrected_text || demoNativeExpression,
        explanations: correction?.items?.map((item) => item.explanation) || [
          demoChanged
            ? "当前为演示数据：推荐表达用于展示卡片效果，后续由真实评分模块替换。"
            : "当前为演示评分，后续由真实语音评分模块提供分析说明。",
        ],
        is_demo: true,
      };
  }

  function scoreBarHTML(message) {
    const assessment = messageAssessment(message);
    if (!assessment) return "";
    const scores = [
      ["流利", assessment.fluency],
      ["发音", assessment.pronunciation],
      ["地道", assessment.naturalness],
    ].filter(([, score]) => Number.isFinite(Number(score)));
    if (!scores.length) return "";
    return `<button class="real-message-score-bar ${assessment.is_demo ? "demo" : ""}" data-real-action="open-language-analysis" data-message-id="${escapeHTML(message.ID)}" aria-label="查看表达评分详情" ${assessment.is_demo ? 'title="演示评分"' : ""}>
      <span>${scores.map(([label, score]) => `<b>${label} <em>${escapeHTML(Math.round(Number(score)))}</em></b>`).join("")}</span>
      <i aria-hidden="true">›</i>
    </button>`;
  }

  function standardConversationMessageHTML(message, archived = false) {
    if (message.Role === "user") {
      const optimisticStatus = message.optimisticStatus || "";
      const optimisticLabel = {
        transcribing: "正在识别语音",
        sending: "已发送，等待 SpeakUp 回复",
        failed: "发送失败",
      }[optimisticStatus] || "";
      return `<div class="real-user-message-group ${optimisticStatus ? "optimistic" : ""}">
        <article class="real-message user" data-language-message-id="${escapeHTML(message.ID)}">
          ${attachmentCardsHTML(message.attachments)}
          <p>${escapeHTML(message.Content)}</p>
          ${optimisticStatus ? `<small class="real-optimistic-status ${optimisticStatus}">${optimisticLabel}</small>` : ""}
          <div class="real-message-tools user-tools">
            <button class="real-bubble-tool" data-real-action="speak-text" data-text="${escapeHTML(message.Content)}" aria-label="AI 发音" title="AI 发音">${soundIconHTML("AI")}</button>
            <button class="real-bubble-tool" data-real-action="play-user-recording" data-message-id="${escapeHTML(message.ID)}" aria-label="播放我的录音" title="播放我的录音">${soundIconHTML("ME")}</button>
            ${optimisticStatus ? "" : `<button class="real-correction-tool" data-real-action="toggle-correction" data-message-id="${escapeHTML(message.ID)}" aria-expanded="${expandedCorrectionID === message.ID}"><strong>!!</strong><span>纠错</span></button>`}
          </div>
          ${optimisticStatus ? "" : correctionPreviewHTML(message)}
        </article>
        ${optimisticStatus ? "" : scoreBarHTML(message)}
      </div>`;
    }
    const speechAction = archived
      ? `data-real-action="speak-text" data-text="${escapeHTML(message.Content)}"`
      : `data-real-action="speak" data-message-id="${escapeHTML(message.ID)}"`;
    return `<article class="real-message assistant" data-language-message-id="${escapeHTML(message.ID)}">
      <img src="../assets/speakup-agent.png" alt="">
      <div class="real-message-copy">
        <header><b>SpeakUp</b></header>
        <p>${formatAssistantText(message.Content)}</p>
        <div class="real-message-tools">
          <button class="real-bubble-tool" ${speechAction} aria-label="重读" title="重读">${soundIconHTML()}</button>
          <button class="real-bubble-tool" data-real-action="toggle-translation" data-message-id="${escapeHTML(message.ID)}" aria-expanded="${expandedTranslationID === message.ID}" aria-label="翻译" title="翻译">${translationIconHTML()}</button>
        </div>
        ${translationPreviewHTML(message)}
      </div>
    </article>`;
  }

  function correctionDetailSheetHTML() {
    if (!correctionDetailMessageID) return "";
    const message = findLanguageMessage(correctionDetailMessageID);
    const result = languageAssistanceState(correctionDetailMessageID, "correct").result;
    const correction = result?.correction;
    const assessment = messageAssessment(message);
    if (!message || !assessment) return "";
    const scoreRows = [
      ["fluency", "流利", assessment.fluency],
      ["pronunciation", "发音", assessment.pronunciation],
      ["naturalness", "地道", assessment.naturalness],
    ].filter(([, , score]) => Number.isFinite(Number(score)));
    const overall = Number.isFinite(Number(assessment.overall))
      ? Math.max(0, Math.min(100, Math.round(Number(assessment.overall))))
      : null;
    const nativeExpression = assessment.native_expression ||
      correction?.natural_version ||
      correction?.corrected_text ||
      message.Content;
    const explanations = (assessment.explanations || [])
      .map((item) => typeof item === "string" ? item : item?.explanation)
      .filter(Boolean);
    const correctionExplanations = correction?.items?.map((item) => item.explanation).filter(Boolean) || [];
    const details = explanations.length ? explanations : correctionExplanations;
    return `<div class="real-correction-sheet" role="dialog" aria-modal="true" aria-labelledby="real-correction-title">
      <button class="real-correction-backdrop" data-real-action="close-language-analysis" aria-label="关闭分析详情"></button>
      <section class="real-correction-card">
        <div class="real-correction-handle" aria-hidden="true"></div>
        <header><span>${assessment.is_demo ? "<small>演示评分</small>" : ""}<h2 id="real-correction-title">分析</h2></span><button data-real-action="close-language-analysis" aria-label="关闭">×</button></header>
        <div class="real-analysis-original"><p>${escapeHTML(message.Content)}</p><button data-real-action="speak-text" data-text="${escapeHTML(message.Content)}">↻ 重读</button></div>
        <div class="real-analysis-scores ${overall === null ? "without-overall" : ""}">
          ${overall === null ? "" : `<div class="real-analysis-overall" style="--score:${overall}"><strong>${overall}</strong></div>`}
          <div class="real-analysis-score-rows">${scoreRows.map(([key, label, score]) => {
            const value = Math.max(0, Math.min(100, Math.round(Number(score))));
            return `<div class="${key}"><span>${label} <b>${value}</b></span><i><em style="width:${value}%"></em></i></div>`;
          }).join("")}</div>
        </div>
        <h3 class="real-analysis-section-title">地道表达</h3>
        <div class="real-correction-natural"><p>${escapeHTML(nativeExpression)}</p><button data-real-action="speak-text" data-text="${escapeHTML(nativeExpression)}">↻ 朗读</button></div>
        ${details.length ? `<div class="real-analysis-explanations"><h3>说明</h3><ul>${details.map((detail) => `<li>${escapeHTML(detail)}</li>`).join("")}</ul></div>` : ""}
      </section>
    </div>`;
  }

  function messageHTML(message) {
    if (message.kind === "interview_report" && message.report) {
      const report = message.report;
      return `<article class="real-interview-report-card">
        <header><span>面试报告</span><small>已完成</small></header>
        <h2>${escapeHTML(report.targetRole || "模拟面试")}</h2>
        <p>${escapeHTML(report.summary || "本次面试报告已生成。")}</p>
        <footer>
          <span>${escapeHTML(report.completedTurns || 0)} / ${escapeHTML(report.maxTurns || 0)} 个有效回答</span>
          <button data-real-action="open-report-card" data-session-id="${escapeHTML(report.sessionId)}">查看详细报告</button>
        </footer>
      </article>`;
    }
    return standardConversationMessageHTML(message);
  }

  function mainConversationMessages(messages) {
    const result = [];
    let legacyInterviewOpen = false;
    for (const message of messages || []) {
      if (message.Role === "assistant" && String(message.Content || "").startsWith("面试开始。")) {
        legacyInterviewOpen = true;
        continue;
      }
      if (message.kind === "interview_report") {
        legacyInterviewOpen = false;
        result.push(message);
        continue;
      }
      if (!legacyInterviewOpen) result.push(message);
    }
    if (optimisticUserMessage) result.push(optimisticUserMessage);
    return result;
  }

  function streamingMessageHTML() {
    if (!streamingText) return "";
    return `<article class="real-message assistant real-streaming-message">
      <img src="../assets/speakup-agent.png" alt="">
      <div class="real-message-copy">
        <header><b>SpeakUp</b><small class="real-speaking-label"><i></i><i></i><i></i>正在说</small></header>
        <p>${formatAssistantText(streamingText)}<i class="real-stream-caret"></i></p>
      </div>
    </article>`;
  }

  function confirmationHTML(confirmation) {
    if (!confirmation) return "";
    const { targetRole, interviewer, maxTurns, durationMinutes } = interviewContext();
    const profile = snapshot?.candidateProfile || {};
    const background = profile.resumeName || profile.headline || "本次对话中已确认的信息";
    return `<section class="real-confirmation">
      <small>面试卡片 · 待确认</small>
      <h2>${escapeHTML(targetRole)} 模拟面试</h2>
      <div class="real-interview-card-grid">
        <span><small>面试官</small><b>${escapeHTML(interviewer)}</b></span>
        <span><small>练习规模</small><b>${escapeHTML(maxTurns)} 轮 · ${escapeHTML(durationMinutes)} 分钟</b></span>
        <span><small>候选人信息</small><b>${escapeHTML(background)}</b></span>
        <span><small>开始方式</small><b>确认后立即开始</b></span>
      </div>
      <p>${escapeHTML(confirmation.Summary)}</p>
      <footer>
        <button data-real-action="reject" data-task-id="${escapeHTML(confirmation.TaskRunID)}">取消</button>
        <button class="primary" data-real-action="approve" data-task-id="${escapeHTML(confirmation.TaskRunID)}">确认开始面试</button>
      </footer>
    </section>`;
  }

  function composerHTML() {
    const hasPending = pendingAttachments.length > 0;
    if (isRecording()) {
      return `<footer class="real-voice-capture">
        <div class="real-voice-capture-head"><span class="real-live-dot"></span><b>${formatRecordingTime(recordingElapsedSeconds)}</b><small>${escapeHTML(recordingStatus)}</small></div>
        <div class="real-live-wave" aria-hidden="true">${Array.from({ length: 12 }, () => "<i></i>").join("")}</div>
        <p>${escapeHTML(liveTranscript || "正在听你说话…")}</p>
        <div><button data-real-action="cancel-record">取消</button><button class="primary" data-real-action="record">结束并使用</button></div>
      </footer>`;
    }
    if (voiceSubmissionInProgress) {
      return `<footer class="real-voice-capture processing">
        <div class="real-voice-capture-head"><span class="real-live-dot"></span><b>正在发送</b><small>${escapeHTML(recordingStatus)}</small></div>
        <div class="real-live-wave" aria-hidden="true">${Array.from({ length: 12 }, () => "<i></i>").join("")}</div>
        <p>${escapeHTML(liveTranscript || "正在整理语音和文字…")}</p>
      </footer>`;
    }
    return `${attachmentCardsHTML(pendingAttachments, true)}
    ${attachmentUploading ? `<div class="real-attachment-uploading"><i></i><span>正在上传并由真实模型理解附件…</span></div>` : ""}
    ${failedVoiceRecordingBlob ? `<div class="real-voice-send-retry"><span><b>录音尚未发送</b><small>本次录音已保留，可以直接重试。</small></span><button data-real-action="discard-voice-recording">删除</button><button class="primary" data-real-action="retry-voice-send">重试发送</button></div>` : ""}
    ${voiceStateHTML()}
    <footer class="real-agent-composer">
      <input data-attachment-input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" multiple hidden>
      <button class="real-add" data-real-action="more" aria-label="上传图片或 PDF" ${attachmentUploading ? "disabled" : ""}>＋</button>
      <textarea data-real-input rows="1" placeholder="点击麦克风说话，或输入文字">${escapeHTML(inputValue)}</textarea>
      <button class="real-mic" data-real-action="record" aria-label="开始实时语音输入"><i></i></button>
      <button class="real-send" data-real-action="send" aria-label="发送" ${loading || attachmentUploading || (!inputValue.trim() && !hasPending) || currentConfirmation() || contextLimitExceeded || snapshot?.requiresNewThread ? "disabled" : ""}>↑</button>
    </footer>`;
  }

  function voiceStateHTML() {
    const status = conversationVoiceState();
    return `<div class="real-voice-state ${status.key}"><span><i></i>${escapeHTML(status.label)}</span><div>${speaking ? `<button data-real-action="stop-speech">停止</button>` : ""}${lastSpokenSentence && !speaking ? `<button data-real-action="replay-last-sentence">重听上一句</button>` : ""}<button data-real-action="toggle-auto-voice">${autoVoiceEnabled ? "自动朗读已开" : "自动朗读已关"}</button></div></div>`;
  }

  function formatRecordingTime(seconds) {
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function realAgentView() {
    const messages = mainConversationMessages(snapshot?.messages || []);
    const hasConversation =
      messages.length > 1 ||
      currentConfirmation() ||
      bridgeError ||
      contextLimitExceeded ||
      snapshot?.requiresNewThread;
    const content = !hasConversation
      ? `<section class="real-agent-welcome">
          <div class="real-agent-hero">
            <img src="../assets/speakup-agent.png" alt="SpeakUp">
            <h1>今天想练什么？</h1>
            <p>告诉我目标，我来创建面试、陪你自由对话或继续练习。</p>
          </div>
          <div class="real-agent-actions">
            <button data-real-action="quick" data-message="帮我创建一次软件工程师模拟面试"><span>＋</span><b>创建模拟面试</b></button>
            <button data-real-action="scene"><span>→</span><b>场景口语练习</b></button>
            <button data-real-action="continue" ${snapshot?.activeQuestion ? "" : "disabled"}><span>↗</span><b>${snapshot?.activeQuestion ? "继续上次练习" : "暂无进行中的练习"}</b></button>
          </div>
        </section>`
      : `${messages.map(messageHTML).join("")}
        ${streamingMessageHTML()}
        ${confirmationHTML(currentConfirmation())}
        ${contextLimitHTML()}
        ${realErrorHTML()}
        ${thinkingHTML()}`;
    return `<div class="agent-page real-agent-page">
      <section class="real-agent-thread">${content}</section>
      ${composerHTML()}
      ${correctionDetailSheetHTML()}
    </div>`;
  }

  function practiceComposerHTML() {
    if (isRecording()) {
      return `<section class="real-practice-recording">
        <span><i></i><b>${formatRecordingTime(recordingElapsedSeconds)}</b></span>
        <p>${escapeHTML(liveTranscript || recordingStatus)}</p>
        <button data-real-action="cancel-record">取消</button>
      </section>`;
    }
    if (!practiceTextInputVisible) return "";
    return `<section class="real-practice-answer compact">
      <textarea id="real-practice-input" class="field" data-real-input rows="4" placeholder="输入你的回答">${escapeHTML(inputValue)}</textarea>
      <div class="real-practice-actions">
        <button class="secondary" data-real-action="toggle-practice-input">收起</button>
        <button class="primary" data-real-action="submit-answer" ${loading || !inputValue.trim() || contextLimitExceeded || snapshot?.requiresNewThread ? "disabled" : ""}>提交回答</button>
      </div>
    </section>`;
  }

  function answerCoachHTML(question) {
    const currentQuestion = String(question || "").trim();
    const hasCurrentAnswer = answerCoachQuestion === currentQuestion && answerCoachText;
    let content = `<p class="real-answer-coach-status">正在帮你组织一段可以直接说的回答…</p>`;
    if (answerCoachError) {
      content = `<div class="real-answer-coach-error"><p>${escapeHTML(answerCoachError)}</p><button data-real-action="retry-answer-coach">重新生成</button></div>`;
    } else if (!answerCoachLoading && hasCurrentAnswer) {
      content = `<p class="real-answer-coach-label">可以直接照着说</p><p class="real-answer-coach-text">${escapeHTML(answerCoachText)}</p>`;
    }
    return `<section class="real-answer-coach">
      <header><span>帮我组织</span><button data-real-action="practice-coach" aria-label="收起示范回答">×</button></header>
      ${content}
    </section>`;
  }

  async function loadAnswerCoach(force = false) {
    const question = String(snapshot?.activeQuestion || "").trim();
    if (!question || answerCoachLoading) return;
    if (!force && answerCoachQuestion === question && answerCoachText) return;
    answerCoachQuestion = question;
    answerCoachText = "";
    answerCoachError = "";
    answerCoachLoading = true;
    rerender("practice");
    try {
      const result = await request("/v1/practice/answer-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor_user_id: ACTOR_ID }),
      });
      if (String(snapshot?.activeQuestion || "").trim() !== question) return;
      answerCoachQuestion = String(result.question || question).trim();
      answerCoachText = String(result.answer || "").trim();
      if (!answerCoachText) throw new Error("没有生成可用的示范回答");
    } catch (error) {
      if (String(snapshot?.activeQuestion || "").trim() === question) {
        answerCoachError = error.message || "示范回答生成失败";
      }
    } finally {
      answerCoachLoading = false;
      rerender("practice");
    }
  }

  function realPracticeView() {
    const completed = snapshot?.completedQuestionCount || 0;
    const question = streamingText || snapshot?.activeQuestion || "正在准备下一题…";
    const { targetRole, interviewer, maxTurns, durationMinutes } = interviewContext();
    const timing = interviewTiming();
    const currentTurn = Math.min(completed + 1, maxTurns);
    return `<div class="practice real-practice-page voice-first">
      <header class="real-practice-header">
        <button class="real-practice-icon-button back" data-real-action="back-chat" aria-label="返回对话" title="返回对话">←</button>
        <h1>${escapeHTML(targetRole)}</h1>
        <span class="real-practice-progress" aria-label="面试进度 ${currentTurn} / ${maxTurns}">${currentTurn} / ${maxTurns}</span>
      </header>
      <section class="real-interviewer-stage">
        <img src="../assets/speakup-agent.png" alt="${escapeHTML(interviewer)}">
        <h2>${escapeHTML(interviewer)}</h2>
        <p>${loading ? "正在分析你的回答" : `${escapeHTML(timing.label)} · 最长 ${durationMinutes} 分钟`}</p>
      </section>
      <section class="real-practice-audio-controls">
        <button class="real-transcript-toggle ${practiceTranscriptVisible ? "active" : ""}" data-real-action="toggle-practice-transcript" aria-label="${practiceTranscriptVisible ? "隐藏问题文字" : "显示问题文字"}" title="${practiceTranscriptVisible ? "隐藏问题文字" : "显示问题文字"}"><span aria-hidden="true">文</span></button>
        <button class="real-audio-wave" data-real-action="speak-text" data-text="${escapeHTML(question)}" aria-label="播放当前问题" title="播放当前问题"><i></i><i></i><i></i><i></i><i></i><i></i></button>
        <span>${speaking ? "播放中" : "播放问题"}</span>
      </section>
      ${practiceTranscriptVisible ? `<section class="real-question-transcript"><small>第 ${currentTurn} 轮问题</small><p>${escapeHTML(question)}</p></section>` : ""}
      ${practiceCoachVisible ? answerCoachHTML(question) : ""}
      ${realErrorHTML()}
      ${contextLimitHTML()}
      ${thinkingHTML("正在生成下一步追问")}
      ${practiceComposerHTML()}
      <footer class="real-practice-dock">
        <button class="real-practice-secondary ${practiceTextInputVisible ? "active" : ""}" data-real-action="toggle-practice-input" aria-label="${practiceTextInputVisible ? "收起文字输入" : "打开文字输入"}" title="${practiceTextInputVisible ? "收起文字输入" : "打开文字输入"}"><span aria-hidden="true">⌨</span></button>
        <button class="real-practice-mic ${isRecording() ? "recording" : ""}" data-real-action="record" aria-label="${isRecording() ? "结束语音回答" : "开始语音回答"}" title="${isRecording() ? "结束语音回答" : "开始语音回答"}"><i></i></button>
        <button class="real-practice-secondary coach ${practiceCoachVisible ? "active" : ""}" data-real-action="practice-coach" aria-label="教我怎么说，帮我组织回答" title="教我怎么说，帮我组织回答">帮我组织</button>
      </footer>
      <button class="real-practice-end" data-real-action="end-interview" ${loading ? "disabled" : ""}>结束面试</button>
    </div>`;
  }

  function realReportView() {
    const session = selectedInterviewSession();
    const feedback = latestInterviewFeedback(session) || "面试已完成，反馈正在整理。";
    const completed = session?.completedTurns ?? snapshot?.completedQuestionCount ?? 0;
    const current = interviewContext();
    const targetRole = session?.targetRole || current.targetRole;
    const maxTurns = session?.maxTurns || current.maxTurns;
    const durationMinutes = session?.durationMinutes || current.durationMinutes;
    const questions = session?.questions || [];
    const answers = session?.answers || [];
    const isActive = session?.status === "in_progress" && Boolean(snapshot?.activeQuestion);
    return `<div class="align-page report-page real-report-page">
      <div class="practice-head">
        <button class="ghost-icon" data-real-action="history" aria-label="返回历史">‹</button>
        <h1>面试报告</h1>
        <span class="chip">${isActive ? "进行中" : "已完成"}</span>
      </div>
      <header class="real-report-hero">
        <img src="../assets/speakup-agent.png" alt="">
        <small>PROJECT DEEP DIVE</small>
        <h1>${escapeHTML(targetRole)}</h1>
        <p>本次完成 ${completed} 轮真实对话 · 限时 ${durationMinutes} 分钟</p>
      </header>
      <section class="real-report-metrics">
        <div><small>轮次使用率</small><b>${Math.round((completed / maxTurns) * 100)}%</b></div>
        <div><small>有效回答</small><b>${completed}</b></div>
        <div><small>轮次上限</small><b>${maxTurns}</b></div>
      </section>
      <section class="real-report-feedback">
        <small>AI 证据反馈</small>
        <h2>本次总结</h2>
        <p>${formatAssistantText(feedback)}</p>
        <button data-real-action="speak-text" data-text="${escapeHTML(feedback)}">▶ 朗读反馈</button>
      </section>
      ${session?.startedAt ? `<section class="real-history-metadata"><span><small>开始时间</small><b>${escapeHTML(formatHistoryDate(session.startedAt, true))}</b></span><span><small>结束时间</small><b>${escapeHTML(session.endedAt ? formatHistoryDate(session.endedAt, true) : "尚未结束")}</b></span></section>` : ""}
      ${questions.length ? `<section class="real-history-transcript"><div class="real-history-section-head"><small>真实问答记录</small><b>${answers.length} 个有效回答</b></div>${questions.map((question, index) => `<article><header><span>Q${index + 1}</span><b>${escapeHTML(question)}</b></header>${answers[index] ? `<div><span>A${index + 1}</span><p>${escapeHTML(answers[index])}</p></div>` : `<div class="unanswered"><span>—</span><p>本题未回答，不计入有效 Turn</p></div>`}</article>`).join("")}</section>` : ""}
      ${realErrorHTML()}
      ${interviewHistoryDeleteConfirm && session ? `<section class="real-history-delete-confirm"><b>删除这场面试历史？</b><p>问题、回答和反馈将永久删除，且无法恢复。</p><div><button class="secondary" data-real-action="cancel-delete-interview-history">取消</button><button class="danger" data-real-action="confirm-delete-interview-history" data-session-id="${escapeHTML(session.id)}">确认删除</button></div></section>` : ""}
      <div class="real-report-actions">
        <button class="secondary" data-real-action="history">返回历史</button>
        ${!isActive && session?.id ? `<button class="danger" data-real-action="request-delete-interview-history">删除记录</button>` : ""}
      </div>
    </div>`;
  }

  function realHistoryView() {
    const cards = interviewHistorySessions;
    const completedSessions = cards.filter((session) => session.status !== "in_progress");
    const sessionCount = cards.length;
    const effectiveAnswers = cards.reduce((total, session) => total + (session.completedTurns || 0), 0);
    return `<div class="history-page real-history-page">
      <header class="history-head">
        <div><small>INTERVIEW HISTORY</small><h1>面试历史</h1><p>查看由 Go Agent 创建的真实面试进度与报告。</p></div>
        <span class="history-count">${sessionCount} 场面试</span>
      </header>
      <section class="history-overview">
        <div><small>面试场次</small><b>${sessionCount} 场</b></div>
        <div><small>已完成场次</small><b>${completedSessions.length} 场</b></div>
        <div><small>有效回答</small><b>${effectiveAnswers} 个</b></div>
      </section>
      ${cards.length
        ? `<section class="history-list">
            ${cards.map((session) => {
              const progress = session.completedTurns || 0;
              const maxTurns = session.maxTurns || 10;
              const active = session.status === "in_progress" && Boolean(snapshot?.activeQuestion);
              const status = active
                ? `第 ${Math.min(progress + 1, maxTurns)} 轮 · ${interviewTiming().label}`
                : `${formatHistoryDate(session.endedAt || session.startedAt)} · ${progress} 个有效回答`;
              return `<button class="history-card interview" data-real-action="${active ? "continue" : "report"}" data-session-id="${escapeHTML(session.id)}">
                <span class="history-art interview-icon">◎</span>
                <span class="history-copy">
                  <small>真实 Agent 面试 · ${formatHistoryDate(session.startedAt, true)}</small>
                  <strong>${escapeHTML(session.targetRole || "Software Engineer")}</strong>
                  <em><span>${escapeHTML(session.interviewer || "Senior Hiring Manager")}</span><span>${escapeHTML(status)}</span></em>
                  <span class="history-progress"><i style="width:${Math.min((progress / maxTurns) * 100, 100)}%"></i></span>
                </span>
                <span class="history-open">${active ? "继续" : "详情"}</span>
              </button>`;
            }).join("")}
          </section>`
        : `<div class="empty-state"><b>还没有真实面试计划</b><p>在自由对话中告诉 SpeakUp 你想进行模拟面试。</p><button class="primary btn-wide" data-real-action="back-chat">去找 SpeakUp</button></div>`}
      ${realErrorHTML()}
    </div>`;
  }

  function formatFileSize(size) {
    const bytes = Number(size || 0);
    if (!bytes) return "已解析";
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function formatResumeDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "刚刚更新";
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  function formatHistoryDate(value, includeTime = false) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "时间未知";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(date);
  }

  function activeManagedResume() {
    return managedResumes.find((resume) => resume.active) || null;
  }

  function syncManagedResumeState() {
    const active = activeManagedResume();
    preparationProfile = active?.candidateProfile || null;
    state.resumeCount = managedResumes.length;
    state.resumeItems = managedResumes.map((resume) => ({
      name: resume.name,
      size: formatFileSize(resume.size),
      status: "可用",
      experiences: resume.candidateProfile?.experiences?.length || 0,
    }));
    state.defaultResume = Math.max(0, managedResumes.findIndex((resume) => resume.active));
  }

  function resumeDetailHTML(resume) {
    const profile = resume.candidateProfile || {};
    const skills = profile.skills || [];
    const experiences = profile.experiences || [];
    if (!resume.active) return "";
    return `<div class="real-resume-detail">
      ${(profile.candidateName || profile.headline) ? `<div class="real-resume-person"><small>当前用于 Agent 上下文</small><b>${escapeHTML(profile.candidateName || "候选人")}</b><span>${escapeHTML(profile.headline || profile.jobTitle || "已解析候选人背景")}</span></div>` : ""}
      ${profile.summary ? `<p>${escapeHTML(profile.summary)}</p>` : ""}
      ${skills.length ? `<div class="real-resume-skills">${skills.map((skill) => `<span>${escapeHTML(skill)}</span>`).join("")}</div>` : ""}
      ${experiences.length ? `<div class="real-resume-experiences"><small>模型识别的经历 · ${experiences.length} 条</small>${experiences.map((experience) => `<p>${escapeHTML(experience)}</p>`).join("")}</div>` : ""}
    </div>`;
  }

  function beginResumeEdit(resume) {
    const profile = resume.candidateProfile || {};
    resumeEditingID = resume.id;
    resumeEditDraft = {
      candidateName: profile.candidateName || "",
      headline: profile.headline || "",
      summary: profile.summary || "",
      skillsText: (profile.skills || []).join("，"),
      experiences: [...(profile.experiences || [])],
    };
    if (!resumeEditDraft.experiences.length) resumeEditDraft.experiences.push("");
  }

  function resumeEditorHTML(resume) {
    if (!resume || !resumeEditDraft) return "";
    return `<div class="sheet real-resume-editor"><div class="sheet-card">
      <div class="topbar"><h2>编辑简历内容</h2><button class="ghost-icon" data-real-action="cancel-resume-edit">×</button></div>
      <p class="snapshot-footnote">这里编辑的是 Agent 使用的结构化档案，不会改写原始 PDF。保存后，当前简历的修改会立即进入对话和面试上下文。</p>
      ${resumeError ? `<div class="form-error">${escapeHTML(resumeError)}</div>` : ""}
      <div class="real-resume-edit-fields">
        <label><span>姓名</span><input data-resume-edit-field="candidateName" maxlength="120" value="${escapeHTML(resumeEditDraft.candidateName)}" placeholder="候选人姓名"></label>
        <label><span>职业标题</span><input data-resume-edit-field="headline" maxlength="200" value="${escapeHTML(resumeEditDraft.headline)}" placeholder="例如：Go 后端工程师"></label>
        <label><span>个人摘要</span><textarea data-resume-edit-field="summary" maxlength="4000" rows="5" placeholder="概括你的方向、优势与代表成果">${escapeHTML(resumeEditDraft.summary)}</textarea></label>
        <label><span>技能</span><textarea data-resume-edit-field="skillsText" rows="3" placeholder="使用逗号或换行分隔，例如：Go，Kafka，Redis">${escapeHTML(resumeEditDraft.skillsText)}</textarea><small>最多 30 项，每项不超过 80 个字符</small></label>
      </div>
      <div class="real-resume-edit-experiences">
        <div class="real-resume-edit-head"><b>经历</b><small>${resumeEditDraft.experiences.length} / 30</small></div>
        ${resumeEditDraft.experiences.map((experience, index) => `<label><span>经历 ${index + 1}</span><textarea data-resume-edit-experience="${index}" maxlength="2000" rows="4" placeholder="描述职责、行动、技术方案和量化结果">${escapeHTML(experience)}</textarea><button type="button" data-real-action="remove-resume-experience" data-index="${index}" ${resumeEditDraft.experiences.length === 1 ? "disabled" : ""}>删除此项</button></label>`).join("")}
        <button class="secondary btn-wide" data-real-action="add-resume-experience" ${resumeEditDraft.experiences.length >= 30 ? "disabled" : ""}>＋ 添加经历</button>
      </div>
      <div class="real-resume-edit-actions"><button class="secondary" data-real-action="cancel-resume-edit">取消</button><button class="primary" data-real-action="save-resume-profile" data-resume-id="${escapeHTML(resume.id)}" ${resumeLoading ? "disabled" : ""}>${resumeLoading ? "保存中…" : "保存修改"}</button></div>
    </div></div>`;
  }

  function realResumeView() {
    const atLimit = managedResumes.length >= managedResumeLimit;
    const menuResume = managedResumes.find((resume) => resume.id === resumeMenuID);
    const deleteResume = managedResumes.find((resume) => resume.id === resumeDeleteConfirmID);
    const editResume = managedResumes.find((resume) => resume.id === resumeEditingID);
    return `${topbar("个人简历", state.resumeReturnRoute || "profile", `<span class="chip">${managedResumes.length} / ${managedResumeLimit}</span>`)}
      <div class="resumes-page real-resumes-page">
        <p class="page-intro">上传真实 PDF 简历后，模型会解析候选人、技能与经历。标记为“当前使用”的简历会进入自由对话和模拟面试的 Agent 上下文。</p>
        <input data-resume-input type="file" accept="application/pdf" hidden>
        <button class="resume-method real-resume-upload" data-real-action="upload-managed-resume" ${atLimit || resumeLoading ? "disabled" : ""}>
          <span class="method-icon">＋</span><strong>${resumeLoading ? "正在上传并解析…" : "上传 PDF 简历"}</strong><small>${atLimit ? "已达到 3 份上限，请先删除一份" : "最大 10 MB，上传后自动设为当前简历"}</small>
        </button>
        ${resumeLoading ? `<div class="real-resume-loading"><i></i><span>真实模型正在读取简历并建立候选人档案，这可能需要几十秒…</span></div>` : ""}
        ${resumeError ? `<div class="form-error">${escapeHTML(resumeError)}</div>` : ""}
        <div class="resume-list">
          ${managedResumes.map((resume) => `<section class="resume-card ${resume.active ? "active" : ""}">
            <div class="resume-main">
              <div class="resume-icon">PDF</div>
              <div class="resume-info"><h3>${escapeHTML(resume.name)}</h3><p>${escapeHTML(formatFileSize(resume.size))} · ${escapeHTML(formatResumeDate(resume.updatedAt))}</p><div class="resume-badges"><span class="resume-state">${resume.active ? "当前使用 · " : ""}可用</span><span class="real-resume-exp-count">${resume.candidateProfile?.experiences?.length || 0} 条经历</span></div></div>
              <button class="resume-menu-btn" data-real-action="resume-menu" data-resume-id="${escapeHTML(resume.id)}" aria-label="简历操作">•••</button>
            </div>
            ${resumeDetailHTML(resume)}
          </section>`).join("")}
        </div>
        ${!managedResumes.length && !resumeLoading ? `<div class="empty-state"><b>还没有简历</b><p>上传第一份 PDF，模型解析成功后才会保存；不会使用模拟数据。</p></div>` : ""}
      </div>
      ${menuResume ? `<div class="sheet"><div class="sheet-card"><div class="topbar"><h2>简历操作</h2><button class="ghost-icon" data-real-action="close-resume-menu">×</button></div>
        ${resumeRenaming ? `<div class="exp-field"><label>简历名称</label><input data-resume-rename value="${escapeHTML(menuResume.name)}" maxlength="120"></div><div class="exp-card-actions"><button data-real-action="cancel-resume-rename">取消</button><button class="primary" data-real-action="save-resume-rename" data-resume-id="${escapeHTML(menuResume.id)}">保存</button></div>` : `<strong>${escapeHTML(menuResume.name)}</strong><p class="snapshot-footnote">${escapeHTML(menuResume.candidateProfile?.candidateName || "候选人信息已解析")} · ${menuResume.candidateProfile?.skills?.length || 0} 项技能</p><button class="primary btn-wide" data-real-action="start-resume-edit" data-resume-id="${escapeHTML(menuResume.id)}">编辑简历内容</button>${menuResume.attachmentId ? `<button class="secondary btn-wide" data-real-action="download-resume" data-resume-id="${escapeHTML(menuResume.id)}">下载原始 PDF</button>` : ""}<button class="secondary btn-wide" data-real-action="start-resume-rename">重命名</button><button class="secondary btn-wide" data-real-action="activate-resume" data-resume-id="${escapeHTML(menuResume.id)}" ${menuResume.active ? "disabled" : ""}>${menuResume.active ? "当前正在使用" : "设为当前简历"}</button><button class="danger btn-wide" data-real-action="request-delete-resume" data-resume-id="${escapeHTML(menuResume.id)}">删除这份简历</button><p class="snapshot-footnote">切换后，新对话与后续面试问题将使用所选简历；历史消息和报告不回写。</p>`}
      </div></div>` : ""}
      ${deleteResume ? `<div class="sheet"><div class="sheet-card"><div class="topbar"><h2>确认删除</h2><button class="ghost-icon" data-real-action="cancel-delete-resume">×</button></div><p>将永久删除「${escapeHTML(deleteResume.name)}」及其解析档案。${deleteResume.active ? "删除当前简历后，系统会自动启用最近上传的另一份简历。" : ""}</p><button class="danger btn-wide" data-real-action="confirm-delete-resume" data-resume-id="${escapeHTML(deleteResume.id)}">确认删除</button><button class="secondary btn-wide" data-real-action="cancel-delete-resume">取消</button></div></div>` : ""}
      ${resumeEditorHTML(editResume)}`;
  }

  function recentConversationHTML() {
    const firstUserMessage = (snapshot?.messages || []).find((item) => item.Role === "user");
    if (!firstUserMessage && !conversationArchives.length) {
      return '<section class="app-drawer-recent"><small>最近对话</small><p class="real-drawer-empty">暂无对话</p></section>';
    }
    const currentTitle = firstUserMessage
      ? String(firstUserMessage.Content).replace(/\s+/g, " ").slice(0, 18)
      : "";
    return `<section class="app-drawer-recent"><small>最近对话</small>
      ${firstUserMessage ? `<button class="${selectedConversationArchive ? "" : "active"}" data-real-action="back-chat">${escapeHTML(currentTitle)}${firstUserMessage.Content.length > 18 ? "…" : ""}<em>当前</em></button>` : ""}
      ${conversationArchives.slice(0, 8).map((archive) => `<button class="${selectedConversationArchive?.id === archive.id ? "active" : ""}" data-real-action="open-conversation-history" data-conversation-id="${escapeHTML(archive.id)}">${escapeHTML(archive.title)}<em>${archive.messageCount} 条</em></button>`).join("")}
    </section>`;
  }

  function archivedMessageHTML(message) {
    return standardConversationMessageHTML(message, true);
  }

  function realConversationArchiveView() {
    const archive = selectedConversationArchive;
    if (!archive) {
      return `<div class="real-archive-page"><div class="practice-head"><button class="ghost-icon" data-real-action="back-chat">‹</button><h1>历史对话</h1></div><div class="empty-state"><b>没有找到这次对话</b><button class="primary btn-wide" data-real-action="back-chat">返回当前对话</button></div></div>`;
    }
    return `<div class="real-archive-page">
      <div class="practice-head"><button class="ghost-icon" data-real-action="back-chat" aria-label="返回当前对话">‹</button><h1>${escapeHTML(archive.title)}</h1><span class="chip">历史</span></div>
      <p class="real-archive-note">这是已归档的完整上下文，只读展示，不会注入当前新会话。</p>
      <section class="real-archive-thread">${(archive.messages || []).map(archivedMessageHTML).join("")}</section>
      ${archiveDeleteConfirm ? `<section class="real-archive-delete-confirm"><b>删除这次历史对话？</b><p>删除后无法恢复，当前对话和简历不会受影响。</p><div><button data-real-action="cancel-delete-conversation">取消</button><button class="danger" data-real-action="confirm-delete-conversation" data-conversation-id="${escapeHTML(archive.id)}">确认删除</button></div></section>` : `<div class="real-archive-actions"><button class="secondary" data-real-action="back-chat">返回当前对话</button><button class="danger" data-real-action="request-delete-conversation">删除历史</button></div>`}
      ${correctionDetailSheetHTML()}
    </div>`;
  }

  const memoryCategoryLabel = (category) => ({ profile: "个人信息", preference: "偏好", learning: "学习表现", memory: "长期记忆" })[category] || "长期记忆";

  function memoryHistoryHTML(item) {
    if (!selectedMemoryFact || selectedMemoryFact.id !== item.id) return "";
    const history = selectedMemoryFact.history || [];
    return `<section class="real-memory-evidence"><header><b>变更历史</b><button data-real-action="close-memory-detail" aria-label="关闭">×</button></header>
      ${history.length ? history.map((entry) => `<article><span>Mem0 · ${escapeHTML(entry.action || "记录")}</span><p>${escapeHTML(entry.newValue || entry.previousValue || "")}</p></article>`).join("") : "<p>暂无变更历史。</p>"}
    </section>`;
  }

  function memoryCardHTML(item) {
    const editing = memoryEditDraft?.id === item.id;
    return `<article class="real-memory-card">
      <header><span>${escapeHTML(memoryCategoryLabel(item.metadata?.category))}</span><small>Mem0</small></header>
      ${editing ? `<label>内容<input data-memory-edit="memory" value="${escapeHTML(memoryEditDraft.memory)}"></label>` : `<h3>${escapeHTML(item.memory)}</h3>`}
      <footer>${editing ? `<button data-real-action="cancel-memory-edit">取消</button><button class="primary" data-real-action="save-memory-edit" data-fact-id="${escapeHTML(item.id)}">保存</button>` : `<button data-real-action="edit-memory" data-fact-id="${escapeHTML(item.id)}">编辑</button><button class="danger" data-real-action="delete-memory" data-fact-id="${escapeHTML(item.id)}">删除</button><button data-real-action="open-memory-detail" data-fact-id="${escapeHTML(item.id)}">查看历史</button>`}</footer>
      ${memoryHistoryHTML(item)}
    </article>`;
  }

  function realMemoryView() {
    return `<div class="real-memory-page">
      ${topbar("记忆", "profile", `<span class="chip">${memoryFacts.length} 条</span>`)}
      ${memoryError ? `<p class="real-memory-error">${escapeHTML(memoryError)}</p>` : ""}
      ${memoryLoading ? `<div class="real-memory-empty">正在读取记忆…</div>` : memoryFacts.length ? `<section class="real-memory-list">${memoryFacts.map(memoryCardHTML).join("")}</section>` : `<div class="real-memory-empty"><b>还没有长期记忆</b></div>`}
    </div>`;
  }

  const prototypeBottomNav = bottomNav;
  bottomNav = function () {
    return prototypeBottomNav()
      .replaceAll('data-action="agent-new-chat"', 'data-real-action="reset"')
      .replace(
        'data-action="drawer-route" data-route-target="agent-chat"',
        'data-real-action="reset"',
      )
      .replace(
        /<section class="app-drawer-recent">.*?<\/section>/s,
        recentConversationHTML(),
      );
  };
  views["agent-chat"] = realAgentView;
  views["practice"] = realPracticeView;
  views["report"] = realReportView;
  views["home"] = realHistoryView;
  views["resumes"] = realResumeView;
  views["conversation-history"] = realConversationArchiveView;
  views["memory"] = realMemoryView;

  async function loadMemory() {
    memoryLoading = true;
    memoryError = "";
    rerender("memory");
    try {
      const memories = await request("/v1/memories");
      memoryFacts = memories.results || [];
    } catch (error) {
      memoryError = error.message || "读取记忆失败";
    } finally {
      memoryLoading = false;
      rerender("memory");
    }
  }

  async function memoryAction(path, method = "POST", body) {
    memoryLoading = true;
    rerender("memory");
    try {
      await request(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      selectedMemoryFact = null;
      memoryEditDraft = null;
      await loadMemory();
    } catch (error) {
      memoryError = error.message || "记忆操作失败";
      memoryLoading = false;
      rerender("memory");
    }
  }

  async function openMemoryDetail(id) {
    try {
      const [item, history] = await Promise.all([
        request(`/v1/memories/${encodeURIComponent(id)}`),
        request(`/v1/memories/${encodeURIComponent(id)}/history`),
      ]);
      selectedMemoryFact = { ...item, history: history.results || [] };
      rerender("memory");
    }
    catch (error) { memoryError = error.message; rerender("memory"); }
  }

  function findLanguageMessage(messageID) {
    return (snapshot?.messages || []).find((message) => message.ID === messageID) ||
      (selectedConversationArchive?.messages || []).find((message) => message.ID === messageID) ||
      (optimisticUserMessage?.ID === messageID ? optimisticUserMessage : null);
  }

  async function loadLanguageAssistance(messageID, operation, force = false) {
    const message = findLanguageMessage(messageID);
    if (!message) return;
    const key = languageAssistanceKey(messageID, operation);
    if (languageAssistanceLoading.has(key)) return;
    if (!force && languageAssistanceCache.has(key)) return;
    languageAssistanceLoading.add(key);
    languageAssistanceErrors.delete(key);
    rerender(activeRealRoute, { preserveThread: true });
    try {
      const result = await request("/v1/language-assistance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation,
          text: message.Content,
          ...(operation === "translate" ? { target_language: "zh-CN" } : {}),
        }),
      });
      languageAssistanceCache.set(key, result);
    } catch (error) {
      languageAssistanceErrors.set(
        key,
        operation === "translate"
          ? `翻译失败：${error.message || "请稍后重试"}`
          : `纠错失败：${error.message || "请稍后重试"}`,
      );
    } finally {
      languageAssistanceLoading.delete(key);
      rerender(activeRealRoute, { preserveThread: true });
    }
  }

  function toggleTranslation(messageID) {
    const opening = expandedTranslationID !== messageID;
    expandedTranslationID = opening ? messageID : "";
    expandedCorrectionID = "";
    correctionDetailMessageID = "";
    rerender(activeRealRoute, { preserveThread: true });
    if (opening) void loadLanguageAssistance(messageID, "translate");
  }

  function toggleCorrection(messageID) {
    const opening = expandedCorrectionID !== messageID;
    expandedCorrectionID = opening ? messageID : "";
    expandedTranslationID = "";
    correctionDetailMessageID = "";
    rerender(activeRealRoute, { preserveThread: true });
    if (opening) void loadLanguageAssistance(messageID, "correct");
  }

  function retryLanguageAssistance(messageID, operation) {
    const key = languageAssistanceKey(messageID, operation);
    languageAssistanceCache.delete(key);
    languageAssistanceErrors.delete(key);
    void loadLanguageAssistance(messageID, operation, true);
  }

  function rerender(route = activeRealRoute, options = {}) {
    const previousThread = document.querySelector(".real-agent-thread");
    const previousScrollTop = previousThread?.scrollTop || 0;
    activeRealRoute = route;
    state.route = route;
    state.agentVoiceState = conversationVoiceState().key;
    render();
    requestAnimationFrame(() => {
      const thread = document.querySelector(".real-agent-thread");
      if (thread) {
        thread.scrollTop = options.preserveThread
          ? previousScrollTop
          : thread.scrollHeight;
      }
      const input = document.querySelector("[data-real-input]");
      if (input && inputValue) input.focus();
      maybeAutoPlayActiveQuestion();
    });
    scheduleInterviewDeadline();
  }

  function maybeAutoPlayActiveQuestion() {
    const question = String(snapshot?.activeQuestion || "").trim();
    if (
      activeRealRoute !== "practice" ||
      loading ||
      !autoVoiceEnabled ||
      !question ||
      question === lastAutoPlayedQuestion
    ) return;
    lastAutoPlayedQuestion = question;
    stopSpeechPlayback(false);
    enqueueSpeechText(question, true);
  }

  function scheduleInterviewDeadline() {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    deadlineTimer = null;
    if (
      activeRealRoute !== "practice" ||
      loading ||
      endingInterview ||
      !snapshot?.activeQuestion
    ) return;
    const deadline = Date.parse(snapshot?.interviewDeadline || "");
    if (!Number.isFinite(deadline)) return;
    const delay = deadline - Date.now();
    if (delay <= 0) {
      void endInterview("time_limit");
      return;
    }
    deadlineTimer = setTimeout(
      () => void endInterview("time_limit"),
      Math.min(delay, 2147483647),
    );
  }

  function routeAfterTask(originRoute) {
    if (originRoute === "practice") {
      return interviewFinished() ? "report" : "practice";
    }
    return originRoute;
  }

  async function loadSnapshot() {
    loading = true;
    bridgeError = "";
    rerender();
    try {
      const [threadSnapshot, resumes, conversations, interviewHistory] = await Promise.all([
        request(`/v1/assistant/threads/${THREAD_ID}?actor_user_id=${ACTOR_ID}`),
        request("/v1/preparation/resumes"),
        request("/v1/assistant/conversations"),
        request("/v1/practice/sessions"),
      ]);
      snapshot = threadSnapshot;
      managedResumes = resumes.items || [];
      managedResumeLimit = resumes.limit || 3;
      conversationArchives = conversations.items || [];
      interviewHistorySessions = interviewHistory.items || [];
      syncManagedResumeState();
      contextLimitExceeded = Boolean(snapshot?.requiresNewThread);
    } catch (error) {
      bridgeError = error.message || "无法连接 Go assistant server";
    } finally {
      loading = false;
      rerender();
    }
  }

  async function reloadConversationArchives() {
    const response = await request("/v1/assistant/conversations");
    conversationArchives = response.items || [];
  }

  async function reloadInterviewHistory() {
    const response = await request("/v1/practice/sessions");
    interviewHistorySessions = response.items || [];
  }

  async function openInterviewHistory(id) {
    if (!id) return;
    loading = true;
    bridgeError = "";
    selectedHistorySessionID = id;
    selectedInterviewSessionDetail = null;
    interviewHistoryDeleteConfirm = false;
    rerender("home");
    try {
      selectedInterviewSessionDetail = await request(`/v1/practice/sessions/${encodeURIComponent(id)}`);
      rerender("report");
    } catch (error) {
      bridgeError = error.message || "读取面试历史失败";
      selectedHistorySessionID = "";
      rerender("home");
    } finally {
      loading = false;
      rerender(activeRealRoute);
    }
  }

  async function deleteInterviewHistory(id) {
    if (!id || loading) return;
    loading = true;
    bridgeError = "";
    try {
      await request(`/v1/practice/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
      await reloadInterviewHistory();
      snapshot = await request(`/v1/assistant/threads/${THREAD_ID}?actor_user_id=${ACTOR_ID}`);
      selectedHistorySessionID = "";
      selectedInterviewSessionDetail = null;
      interviewHistoryDeleteConfirm = false;
      toast("面试历史已删除");
      rerender("home");
    } catch (error) {
      bridgeError = error.message || "删除面试历史失败";
      rerender("report");
    } finally {
      loading = false;
      rerender(activeRealRoute);
    }
  }

  async function openConversationArchive(id) {
    loading = true;
    bridgeError = "";
    state.appMenuOpen = false;
    state.appAccountOpen = false;
    try {
      selectedConversationArchive = await request(`/v1/assistant/conversations/${encodeURIComponent(id)}`);
      archiveDeleteConfirm = false;
      rerender("conversation-history");
    } catch (error) {
      bridgeError = error.message || "读取历史对话失败";
      rerender("agent-chat");
    } finally {
      loading = false;
    }
  }

  async function deleteConversationArchive(id) {
    loading = true;
    bridgeError = "";
    try {
      await request(`/v1/assistant/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
      await reloadConversationArchives();
      selectedConversationArchive = null;
      archiveDeleteConfirm = false;
      toast("历史对话已删除");
      rerender("agent-chat");
    } catch (error) {
      bridgeError = error.message || "删除历史对话失败";
      rerender("conversation-history");
    } finally {
      loading = false;
    }
  }

  async function reloadManagedResumes() {
    const response = await request("/v1/preparation/resumes");
    managedResumes = response.items || [];
    managedResumeLimit = response.limit || 3;
    syncManagedResumeState();
  }

  async function uploadManagedResume(files) {
    const file = files?.[0];
    if (!file || resumeLoading) return;
    resumeLoading = true;
    resumeError = "";
    rerender("resumes");
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      await request("/v1/preparation/resumes", { method: "POST", body: form });
      await reloadManagedResumes();
      toast("简历解析完成，已设为当前简历");
    } catch (error) {
      resumeError = error.message || "简历上传或解析失败";
    } finally {
      resumeLoading = false;
      rerender("resumes");
    }
  }

  async function renameManagedResume(id) {
    const input = document.querySelector("[data-resume-rename]");
    const name = input?.value.trim();
    if (!name) {
      resumeError = "简历名称不能为空";
      rerender("resumes");
      return;
    }
    resumeLoading = true;
    resumeError = "";
    try {
      await request(`/v1/preparation/resumes/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      await reloadManagedResumes();
      resumeMenuID = "";
      resumeRenaming = false;
      toast("简历已重命名");
    } catch (error) {
      resumeError = error.message || "重命名失败";
    } finally {
      resumeLoading = false;
      rerender("resumes");
    }
  }

  async function saveManagedResumeProfile(id) {
    if (!resumeEditDraft || resumeLoading) return;
    const skills = resumeEditDraft.skillsText
      .split(/[,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    const experiences = resumeEditDraft.experiences
      .map((item) => item.trim())
      .filter(Boolean);
    if (skills.length > 30 || experiences.length > 30) {
      resumeError = "技能和经历均最多保存 30 项";
      rerender("resumes");
      return;
    }
    resumeLoading = true;
    resumeError = "";
    rerender("resumes");
    try {
      await request(`/v1/preparation/resumes/${encodeURIComponent(id)}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateName: resumeEditDraft.candidateName.trim(),
          headline: resumeEditDraft.headline.trim(),
          summary: resumeEditDraft.summary.trim(),
          skills,
          experiences,
        }),
      });
      await reloadManagedResumes();
      resumeEditingID = "";
      resumeEditDraft = null;
      toast("简历内容已保存，Agent 上下文已同步");
    } catch (error) {
      resumeError = error.message || "保存简历内容失败";
    } finally {
      resumeLoading = false;
      rerender("resumes");
    }
  }

  async function activateManagedResume(id) {
    resumeLoading = true;
    resumeError = "";
    rerender("resumes");
    try {
      await request(`/v1/preparation/resumes/${encodeURIComponent(id)}/activate`, { method: "POST" });
      await reloadManagedResumes();
      resumeMenuID = "";
      toast("已切换当前简历，Agent 上下文已同步");
    } catch (error) {
      resumeError = error.message || "切换简历失败";
    } finally {
      resumeLoading = false;
      rerender("resumes");
    }
  }

  async function deleteManagedResume(id) {
    resumeLoading = true;
    resumeError = "";
    rerender("resumes");
    try {
      await request(`/v1/preparation/resumes/${encodeURIComponent(id)}`, { method: "DELETE" });
      await reloadManagedResumes();
      resumeMenuID = "";
      resumeDeleteConfirmID = "";
      toast("简历和解析档案已删除");
    } catch (error) {
      resumeError = error.message || "删除简历失败";
    } finally {
      resumeLoading = false;
      rerender("resumes");
    }
  }

  async function sendMessage(value, additionalAttachmentIDs = [], additionalAttachments = []) {
    const message = String(value || inputValue).trim();
    const attachmentIDs = [
      ...pendingAttachments.map((attachment) => attachment.id),
      ...additionalAttachmentIDs,
    ];
    if (
      (!message && attachmentIDs.length === 0) ||
      loading ||
      attachmentUploading ||
      currentConfirmation() ||
      contextLimitExceeded ||
      snapshot?.requiresNewThread
    ) return;
    const originRoute = activeRealRoute;
    const clientMessageID =
      optimisticUserMessage?.client_message_id || crypto.randomUUID();
    const liveIdentity = {
      thread_id: THREAD_ID,
      live_session_id:
        optimisticUserMessage?.live_session_id || `normal-${THREAD_ID}`,
      turn_id:
        optimisticUserMessage?.turn_id || `turn-${clientMessageID}`,
      client_message_id: clientMessageID,
      mode: "normal",
    };
    if (originRoute === "agent-chat") {
      optimisticUserMessage = optimisticUserMessage || {
        ID: `optimistic-message-${clientMessageID}`,
        Role: "user",
        Content: message,
        attachments: [],
      };
      optimisticUserMessage.Content = message;
      optimisticUserMessage.attachments = [...pendingAttachments, ...additionalAttachments];
      optimisticUserMessage.optimisticStatus = "sending";
      Object.assign(optimisticUserMessage, liveIdentity);
    }
    if (originRoute === "practice") {
      practiceCoachVisible = false;
      answerCoachQuestion = "";
      answerCoachText = "";
      answerCoachError = "";
    }
    stopSpeechPlayback(false);
    sentenceBuffer = "";
    inputValue = "";
    streamingText = "";
    loading = true;
    bridgeError = "";
    recordLiveLatencyPoint(liveIdentity, "turn.submitted");
    rerender();
    try {
      await streamTask(message, attachmentIDs, liveIdentity);
      pendingAttachments = [];
      optimisticUserMessage = null;
      if (originRoute === "practice" && interviewFinished()) {
        await reloadInterviewHistory();
        const completedSession = [...(snapshot?.interviewSessions || [])]
          .reverse()
          .find((session) => session.status !== "in_progress");
        if (completedSession) {
          selectedHistorySessionID = completedSession.id;
          selectedInterviewSessionDetail = completedSession;
        }
      }
      activeRealRoute = routeAfterTask(originRoute);
    } catch (error) {
      if (optimisticUserMessage) optimisticUserMessage.optimisticStatus = "failed";
      bridgeError = contextLimitExceeded
        ? ""
        : error.message || "Agent 请求失败";
    } finally {
      loading = false;
      streamingText = "";
      rerender(activeRealRoute);
    }
  }

  function submitRecognizedVoiceAnswer(text) {
    const answer = String(text || "").trim();
    if (
      activeRealRoute !== "practice" ||
      !pendingVoiceAnswerSubmit ||
      voiceAnswerSubmitting ||
      !answer
    ) return;
    pendingVoiceAnswerSubmit = false;
    voiceAnswerSubmitting = true;
    inputValue = "";
    liveTranscript = "";
    void sendMessage(answer).finally(() => {
      voiceAnswerSubmitting = false;
    });
  }

  async function streamTask(message, attachmentIDs = [], liveIdentity) {
    const clientMessageID = liveIdentity?.client_message_id || crypto.randomUUID();
    const response = await fetch(
      `${API_BASE}/v1/assistant/threads/${THREAD_ID}/tasks/stream`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          actor_user_id: ACTOR_ID,
          user_message: message,
          attachment_ids: attachmentIDs,
          interaction_mode: activeRealRoute === "practice" ? "interview" : "conversation",
          client_message_id: clientMessageID,
          idempotency_key: clientMessageID,
        }),
      },
    );
    await consumeTaskStream(response, liveIdentity);
  }

  async function consumeTaskStream(response, liveIdentity) {
    if (!response.ok || !response.body) {
      throw new Error(await response.text());
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completed = false;
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      buffer = buffer.replaceAll("\r\n", "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const eventName = block
          .split("\n")
          .find((line) => line.startsWith("event:"))
          ?.slice(6)
          .trim();
        const dataText = block
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (dataText) {
          const data = JSON.parse(dataText);
          if (eventName === "assistant.delta") {
            const delta = data.delta || "";
            streamingText += delta;
            queueStreamingSpeechDelta(delta);
            rerender(activeRealRoute);
          } else if (eventName === "task.completed") {
            snapshot = data.snapshot;
            contextLimitExceeded = Boolean(snapshot?.requiresNewThread);
            if (liveIdentity) {
              const canonicalMessage = [...(snapshot?.messages || [])]
                .reverse()
                .find(
                  (message) =>
                    message.client_message_id === liveIdentity.client_message_id,
                );
              if (canonicalMessage) reconcileCanonicalMessage(canonicalMessage);
              recordLiveLatencyPoint(liveIdentity, "turn.persisted");
            }
            flushStreamingSpeech();
            if (activeRealRoute === "practice" && streamingText.trim() && snapshot?.activeQuestion) {
              lastAutoPlayedQuestion = String(snapshot.activeQuestion).trim();
            }
            completed = true;
          } else if (eventName === "task.failed") {
            if (data.code === "context_limit_exceeded") {
              contextLimitExceeded = true;
              rejectedContextTokenCount = data.token_count || 10000;
            }
            throw new Error(data.error || "Agent 流式请求失败");
          }
        }
        boundary = buffer.indexOf("\n\n");
      }
      if (done) break;
    }
    if (!completed) {
      throw new Error("Agent 流式响应未返回最终状态");
    }
  }

  async function endInterview(reason = "user_requested") {
    if (endingInterview || loading || !snapshot?.activeQuestion) return;
    stopSpeechPlayback(false);
    sentenceBuffer = "";
    endingInterview = true;
    loading = true;
    streamingText = "";
    bridgeError = "";
    rerender("practice");
    try {
      const response = await fetch(
        `${API_BASE}/v1/assistant/threads/${THREAD_ID}/interview/end/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            actor_user_id: ACTOR_ID,
            reason,
            idempotency_key: crypto.randomUUID(),
          }),
        },
      );
      await consumeTaskStream(response);
      await reloadInterviewHistory();
      const completedSession = [...(snapshot?.interviewSessions || [])]
        .reverse()
        .find((session) => session.status !== "in_progress");
      if (completedSession) {
        selectedHistorySessionID = completedSession.id;
        selectedInterviewSessionDetail = await request(`/v1/practice/sessions/${encodeURIComponent(completedSession.id)}`);
      }
      activeRealRoute = "report";
    } catch (error) {
      bridgeError = error.message || "结束面试失败";
    } finally {
      endingInterview = false;
      loading = false;
      streamingText = "";
      rerender(activeRealRoute);
    }
  }

  async function resolveConfirmation(taskID, approved) {
    loading = true;
    bridgeError = "";
    rerender();
    try {
      const path = approved ? "resume" : "reject";
      const response = await request(
        `/v1/assistant/task-runs/${encodeURIComponent(taskID)}/${path}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actor_user_id: ACTOR_ID }),
        },
      );
      snapshot = response.snapshot;
      activeRealRoute = approved && snapshot?.activeQuestion ? "practice" : "agent-chat";
    } catch (error) {
      bridgeError = error.message || "确认操作失败";
    } finally {
      loading = false;
      rerender(activeRealRoute);
    }
  }

  async function resetConversation() {
    if (isRecording()) await stopLiveRecording(true);
    stopSpeechPlayback(false);
    const pendingAttachmentIDs = pendingAttachments.map((attachment) => attachment.id);
    loading = true;
    bridgeError = "";
    inputValue = "";
    contextLimitExceeded = false;
    rejectedContextTokenCount = 0;
    selectedHistorySessionID = "";
    selectedInterviewSessionDetail = null;
    interviewHistoryDeleteConfirm = false;
    pendingAttachments = [];
    activeRealRoute = "agent-chat";
    rerender();
    try {
      for (const id of pendingAttachmentIDs) {
        await request(`/v1/assistant/attachments/${encodeURIComponent(id)}`, { method: "DELETE" });
      }
      snapshot = await request("/v1/assistant/demo/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      await reloadConversationArchives();
      await reloadInterviewHistory();
      selectedConversationArchive = null;
    } catch (error) {
      bridgeError = error.message || "无法开始新对话";
    } finally {
      loading = false;
      rerender();
    }
  }

  async function uploadAttachments(files) {
    const selected = [...files].slice(0, 4 - pendingAttachments.length);
    if (!selected.length || attachmentUploading) return;
    attachmentUploading = true;
    bridgeError = "";
    rerender();
    try {
      for (const file of selected) {
        const form = new FormData();
        form.append("file", file, file.name);
        const response = await request("/v1/assistant/attachments", {
          method: "POST",
          body: form,
        });
        pendingAttachments.push(response.attachment);
        if (response.candidate_profile?.id) {
          preparationProfile = response.candidate_profile;
        }
      }
      await reloadManagedResumes();
    } catch (error) {
      bridgeError = error.message || "附件上传或模型解析失败";
    } finally {
      attachmentUploading = false;
      rerender();
    }
  }

  async function uploadVoiceRecording(blob) {
    const mediaType = String(blob?.type || "audio/webm").split(";")[0];
    const extension = {
      "audio/ogg": "ogg",
      "audio/mp4": "m4a",
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
      "audio/x-wav": "wav",
    }[mediaType] || "webm";
    const form = new FormData();
    form.append("file", blob, `voice-${Date.now()}.${extension}`);
    const response = await request("/v1/assistant/attachments", {
      method: "POST",
      body: form,
    });
    return response.attachment;
  }

  async function removePendingAttachment(id) {
    const attachment = pendingAttachments.find((item) => item.id === id);
    if (!attachment) return;
    bridgeError = "";
    try {
      await request(`/v1/assistant/attachments/${encodeURIComponent(id)}`, { method: "DELETE" });
      pendingAttachments = pendingAttachments.filter((item) => item.id !== id);
    } catch (error) {
      bridgeError = error.message || "移除附件失败";
    } finally {
      rerender();
    }
  }

  function cleanSpeechText(text) {
    return String(text)
      .replace(/[*_#`>|]/g, "")
      .replace(/\[(.*?)\]\(.*?\)/g, "$1")
      .trim();
  }

  async function speakMessage(messageID) {
    const message = snapshot?.messages?.find((item) => item.ID === messageID);
    if (!message) return;
    stopSpeechPlayback(false);
    enqueueSpeechText(message.Content, true);
  }

  async function playUserRecording(messageID) {
    const message = findLanguageMessage(messageID);
    const audioAttachment = message?.Attachments?.find(
      (attachment) => String(attachment.mediaType || "").startsWith("audio/"),
    ) || message?.attachments?.find(
      (attachment) => String(attachment.mediaType || "").startsWith("audio/"),
    );
    const recordingURL = message?.recording_url ||
      message?.audio_url ||
      (audioAttachment?.id
        ? `/v1/assistant/attachments/${encodeURIComponent(audioAttachment.id)}/content`
        : "");
    if (!recordingURL) {
      toast("这条消息没有保存用户录音");
      return;
    }
    stopSpeechPlayback(false);
    const source = recordingURL.startsWith("/")
      ? API_BASE + recordingURL
      : recordingURL;
    const audio = new Audio(source);
    currentSpeechAudio = audio;
    speaking = true;
    rerender(activeRealRoute, { preserveThread: true });
    try {
      const ended = new Promise((resolve, reject) => {
        audio.onended = resolve;
        audio.onerror = () => reject(new Error("用户录音播放失败"));
      });
      await audio.play();
      await ended;
    } catch (error) {
      toast(error.message || "用户录音播放失败");
    } finally {
      if (currentSpeechAudio === audio) {
        currentSpeechAudio = null;
        speaking = false;
        rerender(activeRealRoute, { preserveThread: true });
      }
    }
  }

  async function speakText(text) {
    if (!text) return;
    stopSpeechPlayback(false);
    enqueueSpeechText(text, true);
  }

  function enqueueSpeechText(text, force = false) {
    if ((!autoVoiceEnabled && !force) || !String(text).trim()) return;
    const sentences = cleanSpeechText(text).match(/[^。！？!?；;\n]+[。！？!?；;\n]?/g) || [];
    speechQueue.push(...sentences.map((sentence) => sentence.trim()).filter(Boolean));
    void drainSpeechQueue();
  }

  function queueStreamingSpeechDelta(delta) {
    if (!autoVoiceEnabled) return;
    sentenceBuffer += delta;
    while (true) {
      const match = sentenceBuffer.match(/^([\s\S]*?[。！？!?；;\n])/);
      if (!match) break;
      sentenceBuffer = sentenceBuffer.slice(match[1].length);
      enqueueSpeechText(match[1]);
    }
  }

  function flushStreamingSpeech() {
    if (sentenceBuffer.trim()) enqueueSpeechText(sentenceBuffer);
    sentenceBuffer = "";
  }

  async function drainSpeechQueue() {
    if (speechQueueRunning) return;
    speechQueueRunning = true;
    try {
      while (speechQueue.length) {
        const sentence = speechQueue.shift();
        lastSpokenSentence = sentence;
        await playSpeechSegment(sentence);
      }
    } finally {
      speechQueueRunning = false;
      speaking = false;
      currentSpeechAudio = null;
      currentSpeechAbort = null;
      rerender(activeRealRoute);
    }
  }

  function stopSpeechPlayback(shouldRender = true) {
    speechQueue = [];
    sentenceBuffer = "";
    currentSpeechAbort?.abort();
    if (currentSpeechAudio) {
      currentSpeechAudio.pause();
      currentSpeechAudio.src = "";
    }
    currentSpeechAbort = null;
    currentSpeechAudio = null;
    speaking = false;
    if (shouldRender) rerender(activeRealRoute);
  }

  async function playSpeechSegment(text) {
    if (!text) return;
    const controller = new AbortController();
    currentSpeechAbort = controller;
    speaking = true;
    bridgeError = "";
    rerender(activeRealRoute);
    try {
      const response = await fetch(API_BASE + "/v1/audio/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error((await response.text()) || "TTS 请求失败");
      if (!response.body) throw new Error("TTS 响应不支持流式读取");
      const audio = new Audio();
      currentSpeechAudio = audio;
      const ended = new Promise((resolve, reject) => {
        audio.onended = resolve;
        audio.onerror = () => reject(new Error("TTS 音频播放失败"));
      });
      if (!window.MediaSource || !MediaSource.isTypeSupported("audio/mpeg")) {
        const url = URL.createObjectURL(await response.blob());
        audio.src = url;
        await audio.play();
        await ended;
        URL.revokeObjectURL(url);
        return;
      }

      const mediaSource = new MediaSource();
      const url = URL.createObjectURL(mediaSource);
      await new Promise((resolve) => {
        mediaSource.addEventListener("sourceopen", resolve, { once: true });
        audio.src = url;
      });
      const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
      const reader = response.body.getReader();
      let playbackStarted = false;
      while (true) {
        const { value, done } = await reader.read();
        if (value?.length) {
          await new Promise((resolve, reject) => {
            sourceBuffer.addEventListener("updateend", resolve, { once: true });
            sourceBuffer.addEventListener("error", reject, { once: true });
            sourceBuffer.appendBuffer(value);
          });
          if (!playbackStarted) {
            playbackStarted = true;
            await audio.play();
          }
        }
        if (done) break;
      }
      if (mediaSource.readyState === "open") mediaSource.endOfStream();
      await ended;
      URL.revokeObjectURL(url);
    } catch (error) {
      if (error.name === "AbortError") return;
      speechQueue = [];
      toast("语音播放失败，请稍后点击重读");
      rerender(activeRealRoute);
    }
  }

  async function convertToWAV(blob) {
    const sourceContext = new AudioContext();
    try {
      const decoded = await sourceContext.decodeAudioData(await blob.arrayBuffer());
      const sampleRate = 16000;
      const frameCount = Math.max(1, Math.ceil(decoded.duration * sampleRate));
      const offline = new OfflineAudioContext(1, frameCount, sampleRate);
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start();
      const rendered = await offline.startRendering();
      const samples = rendered.getChannelData(0);
      const buffer = new ArrayBuffer(44 + samples.length * 2);
      const view = new DataView(buffer);
      const ascii = (offset, value) => {
        for (let index = 0; index < value.length; index += 1) {
          view.setUint8(offset + index, value.charCodeAt(index));
        }
      };
      ascii(0, "RIFF");
      view.setUint32(4, 36 + samples.length * 2, true);
      ascii(8, "WAVE");
      ascii(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      ascii(36, "data");
      view.setUint32(40, samples.length * 2, true);
      samples.forEach((sample, index) => {
        const value = Math.max(-1, Math.min(1, sample));
        view.setInt16(
          44 + index * 2,
          value < 0 ? value * 0x8000 : value * 0x7fff,
          true,
        );
      });
      return new Blob([buffer], { type: "audio/wav" });
    } finally {
      await sourceContext.close();
    }
  }

  async function requestTranscription(blob) {
    const form = new FormData();
    form.append("audio", await convertToWAV(blob), "message.wav");
    const response = await fetch(API_BASE + "/v1/audio/transcriptions", {
      method: "POST",
      body: form,
    });
    if (!response.ok) throw new Error(await response.text());
    return String((await response.json()).text || "").trim();
  }

  async function transcribe(blob) {
    loading = true;
    bridgeError = "";
    rerender();
    try {
      const transcript = await requestTranscription(blob);
      if (activeRealRoute === "practice" && pendingVoiceAnswerSubmit) {
        submitRecognizedVoiceAnswer(transcript);
      } else {
        inputValue = transcript;
      }
    } catch (error) {
      bridgeError = "语音识别失败：" + (error.message || "未知错误");
    } finally {
      loading = false;
      rerender();
    }
  }

  function resampleToPCM16(input, inputRate) {
    const ratio = inputRate / 16000;
    const length = Math.max(1, Math.floor(input.length / ratio));
    const pcm = new Int16Array(length);
    for (let index = 0; index < length; index += 1) {
      const sample = input[Math.min(input.length - 1, Math.floor(index * ratio))];
      const value = Math.max(-1, Math.min(1, sample));
      pcm[index] = value < 0 ? value * 0x8000 : value * 0x7fff;
    }
    return pcm.buffer;
  }

  async function transcribeFallbackOnce() {
    if (discardRecording || fallbackTranscriptionStarted || !fallbackRecordingBlob) return;
    fallbackTranscriptionStarted = true;
    await transcribe(fallbackRecordingBlob);
  }

  function handleASREvent(event) {
    if (event.type === "transcript.delta") {
      liveTranscript += event.text || "";
      if (activeRealRoute !== "practice") inputValue = liveTranscript;
      rerender(activeRealRoute);
    } else if (event.type === "transcript.completed" || event.type === "transcription.done") {
      liveTranscript = event.text || liveTranscript;
      voiceTranscriptFinal = true;
      if (activeRealRoute !== "practice") inputValue = liveTranscript;
      recordingStatus = activeRealRoute === "practice" ? "识别完成，正在提交" : "识别完成，可编辑后发送";
      if (event.type === "transcription.done") {
        asrSocket?.close();
        asrSocket = null;
      }
      if (activeRealRoute === "practice" && pendingVoiceAnswerSubmit) {
        submitRecognizedVoiceAnswer(liveTranscript);
      } else {
        rerender(activeRealRoute);
      }
    } else if (event.type === "transcription.error") {
      asrStreamingFailed = true;
      recordingStatus = "实时连接中断，结束后自动识别";
      void transcribeFallbackOnce();
      rerender(activeRealRoute);
    }
  }

  async function startLiveRecording() {
    stopSpeechPlayback(false);
    failedVoiceRecordingBlob = null;
    discardRecording = false;
    asrStreamingFailed = false;
    fallbackRecordingBlob = null;
    fallbackTranscriptionStarted = false;
    liveTranscript = "";
    pendingVoiceAnswerSubmit = false;
    voiceTranscriptFinal = false;
    recordingStatus = "正在连接实时识别…";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStream = stream;
      recordingChunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size) recordingChunks.push(event.data);
      };
      recorder.onstop = () => {
        fallbackRecordingBlob = new Blob(recordingChunks, { type: recorder.mimeType });
        if (asrStreamingFailed) void transcribeFallbackOnce();
        recorder = null;
      };
      recorder.start(250);

      const socketURL = API_BASE.replace(/^http/, "ws") + "/v1/audio/transcriptions/stream";
      asrSocket = new WebSocket(socketURL);
      asrSocket.binaryType = "arraybuffer";
      asrSocket.onmessage = (event) => {
        try {
          handleASREvent(JSON.parse(event.data));
        } catch (_error) {
          // Ignore malformed provider events; the final event remains authoritative.
        }
      };
      asrSocket.onerror = () => {
        asrStreamingFailed = true;
        recordingStatus = "实时连接失败，结束后自动识别";
        rerender(activeRealRoute);
      };
      await new Promise((resolve, reject) => {
        asrSocket.onopen = resolve;
        asrSocket.addEventListener("error", () => reject(new Error("实时识别连接失败")), { once: true });
      });

      asrAudioContext = new AudioContext();
      asrSource = asrAudioContext.createMediaStreamSource(stream);
      asrProcessor = asrAudioContext.createScriptProcessor(4096, 1, 1);
      asrProcessor.onaudioprocess = (event) => {
        if (asrSocket?.readyState !== WebSocket.OPEN) return;
        const pcm = resampleToPCM16(event.inputBuffer.getChannelData(0), asrAudioContext.sampleRate);
        asrSocket.send(pcm);
      };
      asrSource.connect(asrProcessor);
      asrProcessor.connect(asrAudioContext.destination);
      recordingStartedAt = Date.now();
      recordingElapsedSeconds = 0;
      recordingStatus = "实时识别中";
      recordingTimer = setInterval(() => {
        const next = Math.floor((Date.now() - recordingStartedAt) / 1000);
        if (next !== recordingElapsedSeconds) {
          recordingElapsedSeconds = next;
          rerender(activeRealRoute);
        }
      }, 250);
      bridgeError = "";
      rerender(activeRealRoute);
    } catch (error) {
      asrStreamingFailed = true;
      if (recordingStream) {
        recordingStatus = "实时连接失败，结束后自动识别";
        recordingStartedAt = Date.now();
        recordingTimer = setInterval(() => {
          recordingElapsedSeconds = Math.floor((Date.now() - recordingStartedAt) / 1000);
          rerender(activeRealRoute);
        }, 1000);
      } else {
        bridgeError = "无法使用麦克风：" + (error.message || "权限被拒绝");
      }
      rerender(activeRealRoute);
    }
  }

  async function stopLiveRecording(cancel = false) {
    if (!recordingStream) return;
    discardRecording = cancel;
    pendingVoiceAnswerSubmit = !cancel;
    voiceSubmissionInProgress = !cancel;
    fallbackTranscriptionStarted = !cancel;
    recordingStatus = cancel ? "已取消" : "正在识别并发送…";
    clearInterval(recordingTimer);
    recordingTimer = null;
    asrProcessor?.disconnect();
    asrSource?.disconnect();
    asrProcessor = null;
    asrSource = null;
    if (asrAudioContext) await asrAudioContext.close();
    asrAudioContext = null;
    if (asrSocket?.readyState === WebSocket.OPEN && !cancel) {
      asrSocket.send(JSON.stringify({ type: "stop" }));
    }
    asrSocket?.close();
    asrSocket = null;
    const stream = recordingStream;
    recordingStream = null;
    stream.getTracks().forEach((track) => track.stop());
    const stoppedRecording = recorder?.state === "recording"
      ? new Promise((resolve) => recorder.addEventListener("stop", () => resolve(fallbackRecordingBlob), { once: true }))
      : Promise.resolve(fallbackRecordingBlob);
    if (recorder?.state === "recording") recorder.stop();
    const recordingBlob = await stoppedRecording;
    if (cancel) {
      inputValue = "";
      liveTranscript = "";
      fallbackRecordingBlob = null;
      pendingVoiceAnswerSubmit = false;
      voiceSubmissionInProgress = false;
      recordingElapsedSeconds = 0;
      rerender(activeRealRoute);
      return;
    }
    recordingElapsedSeconds = 0;
    if (activeRealRoute === "agent-chat") {
      optimisticUserMessage = {
        ID: `optimistic-message-${Date.now()}`,
        Role: "user",
        Content: liveTranscript.trim() || "语音消息",
        attachments: [],
        optimisticStatus: "transcribing",
      };
    }
    rerender(activeRealRoute);
    await submitVoiceRecording(recordingBlob);
  }

  async function submitVoiceRecording(recordingBlob) {
    voiceSubmissionInProgress = true;
    if (optimisticUserMessage) optimisticUserMessage.optimisticStatus = "transcribing";
    recordingStatus = "正在识别并发送…";
    rerender(activeRealRoute);
    try {
      if (!recordingBlob?.size) throw new Error("没有录到有效语音");
      const transcript = voiceTranscriptFinal && liveTranscript.trim()
        ? liveTranscript.trim()
        : await requestTranscription(recordingBlob);
      if (!transcript) throw new Error("没有识别到可发送的文字");
      liveTranscript = transcript;
      if (optimisticUserMessage) optimisticUserMessage.Content = transcript;
      recordingStatus = "正在上传原始录音…";
      rerender(activeRealRoute);
      const recordingAttachment = await uploadVoiceRecording(recordingBlob);
      if (optimisticUserMessage) optimisticUserMessage.attachments = [recordingAttachment];
      pendingVoiceAnswerSubmit = false;
      voiceSubmissionInProgress = false;
      failedVoiceRecordingBlob = null;
      inputValue = "";
      liveTranscript = "";
      fallbackRecordingBlob = null;
      await sendMessage(
        transcript,
        [recordingAttachment.id],
        [recordingAttachment],
      );
    } catch (error) {
      failedVoiceRecordingBlob = recordingBlob?.size ? recordingBlob : null;
      if (optimisticUserMessage) optimisticUserMessage.optimisticStatus = "failed";
      toast("语音发送失败，本次录音已保留");
    } finally {
      pendingVoiceAnswerSubmit = false;
      voiceSubmissionInProgress = false;
      rerender(activeRealRoute);
    }
  }

  async function toggleRecording() {
    if (voiceSubmissionInProgress || voiceAnswerSubmitting) return;
    if (isRecording()) {
      await stopLiveRecording(false);
      return;
    }
    await startLiveRecording();
  }

  window.addEventListener("input", (event) => {
    if (event.target.matches("[data-memory-edit]") && memoryEditDraft) {
      memoryEditDraft[event.target.dataset.memoryEdit] = event.target.value;
      return;
    }
    if (event.target.matches("[data-resume-edit-field]") && resumeEditDraft) {
      resumeEditDraft[event.target.dataset.resumeEditField] = event.target.value;
      return;
    }
    if (event.target.matches("[data-resume-edit-experience]") && resumeEditDraft) {
      resumeEditDraft.experiences[Number(event.target.dataset.resumeEditExperience)] = event.target.value;
      return;
    }
    if (!event.target.matches("[data-real-input]")) return;
    inputValue = event.target.value;
    const action = activeRealRoute === "practice" ? "submit-answer" : "send";
    const submit = document.querySelector(`[data-real-action="${action}"]`);
    if (submit) {
      submit.disabled =
        loading ||
        attachmentUploading ||
        (!inputValue.trim() && pendingAttachments.length === 0) ||
        Boolean(currentConfirmation()) ||
        contextLimitExceeded ||
        Boolean(snapshot?.requiresNewThread);
    }
  });

  window.addEventListener("change", (event) => {
    if (event.target.matches("[data-attachment-input]")) {
      void uploadAttachments(event.target.files || []);
    } else if (event.target.matches("[data-resume-input]")) {
      void uploadManagedResume(event.target.files || []);
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && correctionDetailMessageID) {
      correctionDetailMessageID = "";
      rerender(activeRealRoute, { preserveThread: true });
      return;
    }
    if (
      event.target.matches("[data-real-input]") &&
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      void sendMessage();
    }
  });

  window.addEventListener("click", (event) => {
    const target = event.target.closest("[data-real-action]");
    if (!target) {
      const routeTarget = event.target.closest("[data-route]");
      if (routeTarget && ["agent-chat", "home", "practice", "report", "memory"].includes(routeTarget.dataset.route)) {
        activeRealRoute = routeTarget.dataset.route;
        if (activeRealRoute === "memory") void loadMemory();
      }
      return;
    }
    const action = target.dataset.realAction;
    if (action === "send") void sendMessage();
    else if (action === "submit-answer") void sendMessage();
    else if (action === "quick") void sendMessage(target.dataset.message);
    else if (action === "toggle-translation") toggleTranslation(target.dataset.messageId);
    else if (action === "toggle-correction") toggleCorrection(target.dataset.messageId);
    else if (action === "play-user-recording") void playUserRecording(target.dataset.messageId);
    else if (action === "retry-language-assistance") retryLanguageAssistance(target.dataset.messageId, target.dataset.operation);
    else if (action === "open-language-analysis") {
      correctionDetailMessageID = target.dataset.messageId;
      rerender(activeRealRoute, { preserveThread: true });
    }
    else if (action === "close-language-analysis") {
      correctionDetailMessageID = "";
      rerender(activeRealRoute, { preserveThread: true });
    }
    else if (action === "approve") void resolveConfirmation(target.dataset.taskId, true);
    else if (action === "reject") void resolveConfirmation(target.dataset.taskId, false);
    else if (action === "reset") void resetConversation();
    else if (action === "speak") void speakMessage(target.dataset.messageId);
    else if (action === "speak-text") void speakText(target.dataset.text);
    else if (action === "record") void toggleRecording();
    else if (action === "cancel-record") void stopLiveRecording(true);
    else if (action === "retry-voice-send") {
      const recording = failedVoiceRecordingBlob;
      failedVoiceRecordingBlob = null;
      bridgeError = "";
      if (recording) void submitVoiceRecording(recording);
    }
    else if (action === "discard-voice-recording") {
      failedVoiceRecordingBlob = null;
      fallbackRecordingBlob = null;
      bridgeError = "";
      if (optimisticUserMessage?.optimisticStatus === "failed") optimisticUserMessage = null;
      rerender(activeRealRoute);
    }
    else if (action === "stop-speech") stopSpeechPlayback();
    else if (action === "replay-last-sentence") {
      stopSpeechPlayback(false);
      enqueueSpeechText(lastSpokenSentence, true);
    }
    else if (action === "toggle-auto-voice") {
      autoVoiceEnabled = !autoVoiceEnabled;
      if (!autoVoiceEnabled) stopSpeechPlayback(false);
      rerender(activeRealRoute);
      toast(autoVoiceEnabled ? "已开启自动朗读" : "已关闭自动朗读");
    }
    else if (action === "toggle-practice-transcript") {
      practiceTranscriptVisible = !practiceTranscriptVisible;
      rerender("practice");
    }
    else if (action === "delete-memory") void memoryAction(`/v1/memories/${encodeURIComponent(target.dataset.factId)}`, "DELETE");
    else if (action === "open-memory-detail") void openMemoryDetail(target.dataset.factId);
    else if (action === "close-memory-detail") { selectedMemoryFact = null; rerender("memory"); }
    else if (action === "edit-memory") { const item = memoryFacts.find((memory) => memory.id === target.dataset.factId); if (item) { memoryEditDraft = { id: item.id, memory: item.memory }; rerender("memory"); } }
    else if (action === "cancel-memory-edit") { memoryEditDraft = null; rerender("memory"); }
    else if (action === "save-memory-edit") void memoryAction(`/v1/memories/${encodeURIComponent(target.dataset.factId)}`, "PUT", { memory: memoryEditDraft?.memory || "" });
    else if (action === "toggle-practice-input") {
      practiceTextInputVisible = !practiceTextInputVisible;
      rerender("practice");
      if (practiceTextInputVisible) {
        requestAnimationFrame(() => document.querySelector("#real-practice-input")?.focus());
      }
    }
    else if (action === "practice-coach") {
      if (practiceCoachVisible) {
        practiceCoachVisible = false;
      } else {
        practiceCoachVisible = true;
        void loadAnswerCoach();
      }
      rerender("practice");
    }
    else if (action === "retry-answer-coach") void loadAnswerCoach(true);
    else if (action === "end-interview") void endInterview("user_requested");
    else if (action === "more") document.querySelector("[data-attachment-input]")?.click();
    else if (action === "upload-managed-resume") document.querySelector("[data-resume-input]")?.click();
    else if (action === "resume-menu") {
      resumeMenuID = target.dataset.resumeId;
      resumeRenaming = false;
      resumeDeleteConfirmID = "";
      rerender("resumes");
    }
    else if (action === "close-resume-menu") {
      resumeMenuID = "";
      resumeRenaming = false;
      rerender("resumes");
    }
    else if (action === "start-resume-edit") {
      const resume = managedResumes.find((item) => item.id === target.dataset.resumeId);
      if (resume) {
        beginResumeEdit(resume);
        resumeMenuID = "";
        resumeError = "";
        rerender("resumes");
      }
    }
    else if (action === "cancel-resume-edit") {
      resumeEditingID = "";
      resumeEditDraft = null;
      resumeError = "";
      rerender("resumes");
    }
    else if (action === "add-resume-experience" && resumeEditDraft) {
      if (resumeEditDraft.experiences.length < 30) resumeEditDraft.experiences.push("");
      rerender("resumes");
    }
    else if (action === "remove-resume-experience" && resumeEditDraft) {
      const index = Number(target.dataset.index);
      if (resumeEditDraft.experiences.length > 1 && Number.isInteger(index)) {
        resumeEditDraft.experiences.splice(index, 1);
      }
      rerender("resumes");
    }
    else if (action === "save-resume-profile") void saveManagedResumeProfile(target.dataset.resumeId);
    else if (action === "start-resume-rename") {
      resumeRenaming = true;
      rerender("resumes");
      requestAnimationFrame(() => document.querySelector("[data-resume-rename]")?.focus());
    }
    else if (action === "cancel-resume-rename") {
      resumeRenaming = false;
      rerender("resumes");
    }
    else if (action === "save-resume-rename") void renameManagedResume(target.dataset.resumeId);
    else if (action === "activate-resume") void activateManagedResume(target.dataset.resumeId);
    else if (action === "download-resume") window.open(`${API_BASE}/v1/preparation/resumes/${encodeURIComponent(target.dataset.resumeId)}/file`, "_blank", "noopener");
    else if (action === "view-attachment") window.open(`${API_BASE}/v1/assistant/attachments/${encodeURIComponent(target.dataset.attachmentId)}/content`, "_blank", "noopener");
    else if (action === "open-conversation-history") void openConversationArchive(target.dataset.conversationId);
    else if (action === "request-delete-conversation") {
      archiveDeleteConfirm = true;
      rerender("conversation-history");
    }
    else if (action === "cancel-delete-conversation") {
      archiveDeleteConfirm = false;
      rerender("conversation-history");
    }
    else if (action === "confirm-delete-conversation") void deleteConversationArchive(target.dataset.conversationId);
    else if (action === "request-delete-resume") {
      resumeDeleteConfirmID = target.dataset.resumeId;
      resumeMenuID = "";
      rerender("resumes");
    }
    else if (action === "cancel-delete-resume") {
      resumeDeleteConfirmID = "";
      rerender("resumes");
    }
    else if (action === "confirm-delete-resume") void deleteManagedResume(target.dataset.resumeId);
    else if (action === "remove-attachment") {
      void removePendingAttachment(target.dataset.attachmentId);
    }
    else if (action === "continue") rerender("practice");
    else if (action === "open-report-card") void openInterviewHistory(target.dataset.sessionId);
    else if (action === "report") void openInterviewHistory(target.dataset.sessionId);
    else if (action === "history") {
      selectedHistorySessionID = "";
      selectedInterviewSessionDetail = null;
      interviewHistoryDeleteConfirm = false;
      rerender("home");
    }
    else if (action === "request-delete-interview-history") {
      interviewHistoryDeleteConfirm = true;
      rerender("report");
    }
    else if (action === "cancel-delete-interview-history") {
      interviewHistoryDeleteConfirm = false;
      rerender("report");
    }
    else if (action === "confirm-delete-interview-history") void deleteInterviewHistory(target.dataset.sessionId);
    else if (action === "back-chat") {
      state.appMenuOpen = false;
      state.appAccountOpen = false;
      selectedConversationArchive = null;
      archiveDeleteConfirm = false;
      rerender("agent-chat");
    }
    else if (action === "scene") {
      state.drawerEntryRoute = "role-create";
      state.sceneAgentReady = false;
      go("role-create");
    }
  });

  void loadSnapshot();
})();
