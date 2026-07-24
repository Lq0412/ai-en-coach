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

test("presents SpeakUp as a long-term Agent teacher connected to real outcomes", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  const flowMarkup = html.match(/<div class="scenario-flow"[\s\S]*?<div class="hero-product"/)?.[0] || "";
  assert.match(html, /<h1><span class="headline-muted">下一场重要的英文沟通，<\/span><br\/>先和 SpeakUp 练一遍。<\/h1>/);
  assert.match(html, /<p class="hero-subtitle">一个有记忆、越用越懂你的 AI 口语老师。<\/p>/);
  assert.match(html, /告诉 SpeakUp，我要准备什么/);
  assert.doesNotMatch(html, /<p class="eyebrow">有记忆的 AI Agent 口语老师<\/p>/);
  assert.match(html, /scenario-flow/);
  assert.match(html, /我下周有一场英文面试/);
  assert.match(html, /明天要第一次独自去医院/);
  assert.match(html, /我要向海外客户汇报项目/);
  assert.match(html, /帮我准备 IELTS Part 2/);
  assert.match(html, /我要参加第一次全英文会议/);
  assert.match(html, /帮我和房东说明维修问题/);
  assert.match(html, /下周要做一次英文产品演示/);
  assert.match(html, /我要准备海外大学课堂发言/);
  assert.doesNotMatch(html, /英文面试……|独自去医院……|汇报项目……|IELTS Part 2……/);
  assert.match(html, /<textPath/);
  assert.match(html, /scenario-flow-input-path/);
  assert.match(flowMarkup, /M -40 196 C 180 208 330 190 470 158 C 610 126 720 102 840 108 C 980 116 1100 82 1240 48/);
  assert.doesNotMatch(flowMarkup, /　·　/);
  assert.doesNotMatch(html, /scenario-flow-output-path|scenario-flow-ribbon|scenario-flow-copy-bright/);
  assert.doesNotMatch(flowMarkup, /<strong>SpeakUp<\/strong>|把下一件真实的事说给我听/);
  assert.doesNotMatch(html, /scenario-flow-viewport/);
  assert.doesNotMatch(html, /href="\/pages\/prototype\.html/);
  assert.match(html, /href="#early-access"/);
  assert.match(html, /敬请期待/);
  assert.match(html, /下一场重要的英文沟通/);
  assert.match(html, /越用越懂你/);
  assert.match(html, /把岗位 JD 和简历发给我/);
  assert.match(html, /portal-interview-start\.jpg/);
  assert.match(html, /portal-memory-chat\.jpg/);
  assert.doesNotMatch(html, /portal-interview-practice\.jpg|portal-panel-practice\.jpg/);
  assert.doesNotMatch(html, /portal-ielts-part2\.jpg|portal-daily-doctor\.jpg|portal-workplace-client\.jpg/);
  assert.doesNotMatch(html, /SpeakUp 正在招募首批体验用户/);
  assert.doesNotMatch(html, /SpeakUp 模拟面试现已开放/);
  assert.match(html, /先理解你，不急着开练/);
  assert.match(html, /先教会你，再邀请实战/);
  assert.match(html, /面试官接管真实追问/);
  assert.match(html, /模拟结束，陪你复盘/);
  assert.match(html, /真实面试回来，继续一起准备/);
  assert.match(html, /从一句“下周有面试”，.*面试结束后继续进步/s);
  assert.match(html, /考出去、面进去，.*适应好/s);
  assert.match(html, /雅思口语/);
  assert.match(html, /海外日常/);
  assert.match(html, /国际职场/);
  assert.match(html, /每一次练习，.*都留给下一次/s);
  assert.doesNotMatch(html, /Memory 正在使用/);
  assert.match(html, /老师，你压中 Kafka 了/);
  assert.match(html, /数据库迁移/);
  assert.match(html, /SpeakUp 陪伴一次真实任务的五个阶段/);
  assert.doesNotMatch(html, /一次面试任务，.*Agent 的四种能力/s);
  assert.doesNotMatch(html, /同一个 Agent，.*接住不同的真实任务/s);
  assert.doesNotMatch(html, /class="feature-card"/);
  assert.match(html, /id="coming-soon"/);
  assert.match(html, /id="early-access"/);
  assert.match(html, /<dialog/);
  assert.match(html, /method="dialog"/);
  assert.match(html, /href="#coming-soon"/);
  assert.doesNotMatch(html, /验证入口|方向验证|产品行为占位|待验证|产品验证门户|体验现有原型/);
  assert.doesNotMatch(html, /portal-task-intake\.jpg|portal-task-brief\.jpg/);
  assert.doesNotMatch(html, /portal-career-history\.jpg|portal-career-context\.jpg|portal-interview-plan\.jpg/);
  assert.doesNotMatch(html, /职业上下文|职业英语联系人|群面计划/);
});

test("renders five interactive product states instead of cropped screenshots", async () => {
  const [source, styles, pageSource] = await Promise.all([
    readFile(new URL("app/InterviewDemo.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
  ]);
  assert.match(source, /demo-product-screen/);
  assert.doesNotMatch(source, /<img/);
  assert.match(source, /我下周有一场外企后端面试，好紧张/);
  assert.match(source, /进入模拟面试/);
  assert.match(source, /Why did you choose Kafka/);
  assert.match(source, /demo-interviewer-bubble/);
  assert.match(source, />翻译</);
  assert.match(source, /aria-label="重播问题"/);
  assert.match(source, />提示</);
  assert.match(source, /模拟面试已完成/);
  assert.match(source, /今天的面试怎么样/);
  assert.doesNotMatch(source, /duration="0:00"/);
  assert.match(source, /数据库迁移与回滚 · 专项模拟/);
  assert.match(source, /进入专项练习/);
  assert.doesNotMatch(source, /和老师还原这道题/);
  assert.match(source, /IntersectionObserver/);
  assert.match(source, /scrollIntoView/);
  assert.match(source, /demo-mobile-story/);
  assert.match(pageSource, /M -40 196 C 180 208 330 190 470 158 C 610 126 720 102 840 108 C 980 116 1100 82 1240 48/);
  assert.match(pageSource, /attributeName="startOffset"[\s\S]*?dur="2\.2s"/);
  const practicePanel = source.match(/if \(kind === "practice"\)[\s\S]*?if \(kind === "interview"\)/)?.[0] || "";
  assert.equal(practicePanel.match(/<VoiceBubble/g)?.length, 2);
  assert.match(styles, /\.demo-step-list[\s\S]*?border-right:\s*2px solid var\(--ink\)/);

  const demoStyles = styles.slice(
    styles.indexOf(".demo-sequence"),
    styles.indexOf(".scenario-proof-section"),
  );
  assert.doesNotMatch(demoStyles, /gradient|glow/i);
  assert.doesNotMatch(styles, /@keyframes scenario-flow/);
  assert.match(styles, /\.scenario-flow-stage/);
  assert.doesNotMatch(styles, /\.scenario-flow-ribbon|\.scenario-flow-copy-bright/);
  assert.match(styles, /\.scenario-flow-stage[\s\S]*?height:\s*clamp\(200px,\s*20vw,\s*240px\)/);
  assert.match(styles, /\.scenario-flow-stage svg[\s\S]*?width:\s*100%[\s\S]*?height:\s*100%/);
  assert.equal(styles.match(/\.scenario-flow-stage svg\s*\{/g)?.length, 1);
  assert.match(styles, /\.hero h1[\s\S]*?font-size:\s*clamp\(48px,\s*5\.4vw,\s*70px\)/);
  assert.match(styles, /\.headline-muted[\s\S]*?rgba\(26,\s*26,\s*26,\s*0\.52\)/);
  assert.match(styles, /--section-space:/);
  assert.match(styles, /prefers-reduced-motion[\s\S]*\.scenario-flow-copy-motion/);
  assert.match(styles, /prefers-reduced-motion[\s\S]*\.scenario-flow-copy-static/);
});

test("uses one responsive layout scale across the portal", async () => {
  const [styles, source] = await Promise.all([
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/InterviewDemo.tsx", root), "utf8"),
  ]);
  assert.match(styles, /--section-space:\s*clamp\(80px,\s*8vw,\s*120px\)/);
  assert.match(styles, /--section-heading:\s*clamp\(44px,\s*5\.2vw,\s*68px\)/);
  assert.match(styles, /\.section-intro h2,[\s\S]*?font-size:\s*var\(--section-heading\)/);
  assert.match(styles, /\.demo-stage[\s\S]*?position:\s*sticky[\s\S]*?top:\s*24px/);
  assert.match(styles, /\.demo-step[\s\S]*?min-height:\s*clamp\(260px,\s*36vh,\s*320px\)[\s\S]*?gap:\s*12px[\s\S]*?padding:\s*28px 24px/);
  assert.match(styles, /\.demo-tone-1\s*\{[\s\S]*?var\(--glow\)/);
  assert.match(styles, /\.demo-tone-2\s*\{[\s\S]*?var\(--lumen-dark\)/);
  assert.match(styles, /\.demo-tone-3\s*\{[\s\S]*?var\(--dawn\)/);
  assert.match(styles, /\.demo-tone-4\s*\{[\s\S]*?var\(--lumen\)/);
  assert.match(styles, /\.demo-tone-5\s*\{[\s\S]*?#d7eadf/);
  assert.match(styles, /\.demo-screen-bar\s*\{[\s\S]*?font-size:\s*14px/);
  assert.match(styles, /\.demo-user-message\s*\{[\s\S]*?font-size:\s*15px/);
  assert.match(styles, /\.demo-coach-turn p\s*\{[\s\S]*?font-size:\s*15px/);
  assert.match(styles, /\.demo-interviewer-bubble > p\s*\{[\s\S]*?font-size:\s*18px/);
  assert.match(styles, /\.demo-question-actions button\s*\{[\s\S]*?font-size:\s*12px/);
  assert.match(styles, /\.demo-session-summary\s*\{[\s\S]*?font-size:\s*13px/);
  assert.match(source, /demo-sequence demo-tone-\$\{activeIndex \+ 1\}/);
  assert.match(source, /demo-mobile-chapter demo-tone-\$\{index \+ 1\}/);
  assert.match(styles, /\.context-section[\s\S]*?border-radius:\s*64px/);
  assert.match(styles, /@media \(min-width:\s*641px\)[\s\S]*?\.site-nav\s*\{[\s\S]*?position:\s*sticky[\s\S]*?top:\s*16px[\s\S]*?min-height:\s*73px[\s\S]*?border:\s*2px solid var\(--lumen-dark\)[\s\S]*?border-radius:\s*12px/);
  assert.match(styles, /@media \(min-width:\s*641px\)[\s\S]*?\.hero\s*\{[\s\S]*?padding:\s*clamp\(150px,\s*12vw,\s*170px\) 0 var\(--section-space\)/);
  assert.match(styles, /@media \(min-width:\s*641px\)[\s\S]*?\.hero h1\s*\{[\s\S]*?max-width:\s*var\(--content-width\)[\s\S]*?font-size:\s*clamp\(74px,\s*6\.7vw,\s*96px\)/);
  assert.match(styles, /@media \(min-width:\s*641px\)[\s\S]*?\.hero-subtitle\s*\{[\s\S]*?margin-top:\s*56px/);
  assert.match(styles, /@media \(min-width:\s*641px\)[\s\S]*?\.scenario-flow\s*\{[\s\S]*?margin-top:\s*20px/);
  assert.match(styles, /@media \(min-width:\s*641px\) and \(max-height:\s*800px\)[\s\S]*?\.hero\s*\{[\s\S]*?padding-top:\s*88px/);
  assert.match(styles, /@media \(min-width:\s*641px\) and \(max-height:\s*800px\)[\s\S]*?\.scenario-flow-stage\s*\{[\s\S]*?height:\s*146px/);
  assert.match(styles, /@media \(max-width:\s*640px\)[\s\S]*?\.hero h1\s*\{[\s\S]*?width:\s*calc\(100vw - 20px\)[\s\S]*?font-size:\s*clamp\(32px,\s*9\.1vw,\s*38px\)/);
  assert.match(styles, /@media \(max-width:\s*640px\)[\s\S]*?\.hero-subtitle\s*\{[\s\S]*?margin-top:\s*44px/);
  assert.match(styles, /\.hero-product\s*\{[\s\S]*?width:\s*calc\(100vw - 32px\)[\s\S]*?transform:\s*translateX\(-50%\)/);
  assert.match(styles, /@media \(max-width:\s*640px\)[\s\S]*?\.scenario-flow\s*\{[\s\S]*?margin:\s*8px -18px 16px/);
  assert.match(styles, /@media \(max-width:\s*640px\)[\s\S]*?\.hero-product\s*\{[\s\S]*?width:\s*calc\(100vw - 16px\)/);
  assert.match(styles, /@media \(min-width:\s*641px\)[\s\S]*?\.hero \.button-secondary\s*\{[\s\S]*?border:\s*0/);
  assert.match(styles, /@media \(max-width:\s*640px\)[\s\S]*?--section-space:\s*72px/);
  assert.match(styles, /@media \(max-width:\s*640px\)[\s\S]*?\.site-nav\s*\{[\s\S]*?position:\s*sticky[\s\S]*?top:\s*8px[\s\S]*?min-height:\s*54px[\s\S]*?border:\s*2px solid var\(--lumen-dark\)/);
  assert.match(styles, /@media \(max-width:\s*640px\)[\s\S]*?\.hero\s*\{[\s\S]*?padding:\s*98px 0 var\(--section-space\)/);
  assert.match(styles, /@media \(max-width:\s*640px\)[\s\S]*?\.hero \.button-secondary\s*\{[\s\S]*?border:\s*0/);
  assert.match(styles, /@media \(max-width:\s*640px\)[\s\S]*?\.features-section \.section-intro h2\s*\{[\s\S]*?font-size:\s*clamp\(24px,\s*7\.5vw,\s*28px\)[\s\S]*?white-space:\s*nowrap/);
  assert.match(styles, /@media \(max-width:\s*640px\)[\s\S]*?\.demo-question\s*\{[\s\S]*?font-size:\s*28px/);
  assert.match(styles, /@media \(max-width:\s*640px\)[\s\S]*?\.demo-sequence\s*\{\s*display:\s*none/);
  assert.match(styles, /@media \(max-width:\s*640px\)[\s\S]*?\.demo-mobile-story\s*\{[\s\S]*?display:\s*grid/);
});

test("uses one consistent font system across the portal", async () => {
  const styles = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(styles, /--font-sans:\s*-apple-system,\s*BlinkMacSystemFont/);
  assert.match(styles, /--font-serif:\s*Georgia,\s*"Times New Roman",\s*"Songti SC",\s*STSong,\s*serif/);
  assert.match(styles, /--font-mark:\s*Georgia,\s*"Times New Roman",\s*serif/);
  assert.match(styles, /body\s*\{[\s\S]*?font-family:\s*var\(--font-sans\)/);
  assert.match(styles, /h1,[\s\S]*?h2\s*\{[\s\S]*?font-family:\s*var\(--font-serif\)/);
  assert.match(styles, /\.brand-mark\s*\{[\s\S]*?font-family:\s*var\(--font-mark\)/);
});

test("opens the original information collection form from primary calls to action", async () => {
  const source = await readFile(new URL("app/EarlyAccessDialog.tsx", root), "utf8");
  assert.match(source, /dialog\.showModal\(\)/);
  assert.match(source, /fetch\("\/api\/waitlist"/);
  assert.match(source, /name="scenario"/);
  assert.match(source, /name="urgency"/);
  assert.match(source, /name="targetRole"/);
  assert.match(source, /name="challenge"/);
  assert.match(source, /name="contact"/);
  assert.match(source, /name="consent"/);
});

test("uses native dialog behavior for the coming-soon prompt", async () => {
  const source = await readFile(new URL("app/ComingSoonDialog.tsx", root), "utf8");
  assert.match(source, /dialog\.showModal\(\)/);
  assert.match(source, /document\.addEventListener\("click"/);
  assert.match(source, /<form method="dialog">/);
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

test("uses an evidence-backed conversation to reveal evolving memory", async () => {
  const [, , , panel, styles] = await readActivePrototype();
  assert.match(panel, /views\['career-context'\]=careerContextView/);
  assert.match(panel, /为什么是这个重点/);
  assert.match(panel, /过去 3 轮/);
  assert.match(panel, /时态错误已经从每轮 3 处降到 1 处/);
  assert.match(panel, /SpeakUp Memory 正在使用/);
  assert.match(panel, /高并发订单系统/);
  assert.match(panel, /反复卡点/);
  assert.match(panel, /那下一轮怎么练/);
  assert.doesNotMatch(panel, /item\('career-context'/);
  assert.match(styles, /context-agent-turn/);
  assert.match(styles, /context-evidence/);
  assert.match(styles, /context-next-action/);
});

test("starts the portal demo with a standard four-round one-to-one plan", async () => {
  const [, , , panel, styles] = await readActivePrototype();
  const startView = panel.match(/function portalInterviewStartView\(\)[\s\S]*?views\['portal-interview-start'\]=portalInterviewStartView/)?.[0] || "";
  const debriefView = panel.match(/function portalAgentDebriefView\(\)[\s\S]*?views\['portal-evidence-report'\]=portalAgentDebriefView/)?.[0] || "";
  const panelView = panel.match(/function portalPanelPracticeView\(\)[\s\S]*?views\['portal-panel-practice'\]=portalPanelPracticeView/)?.[0] || "";
  assert.match(startView, /4 轮一对一面试/);
  assert.match(startView, /HR 初面/);
  assert.match(startView, /技术深挖/);
  assert.match(startView, /系统设计/);
  assert.match(startView, /综合终面/);
  assert.doesNotMatch(startView, /群面|3 位面试官|25 分钟/);
  assert.match(styles, /portal-start-plan/);
  assert.match(panel, /views\['portal-interview-practice'\]=portalInterviewPracticeView/);
  assert.match(panel, /views\['portal-agent-debrief'\]=portalAgentDebriefView/);
  assert.match(panel, /views\['portal-panel-practice'\]=portalPanelPracticeView/);
  assert.match(panel, /根据你的回答继续追问/);
  assert.match(debriefView, /这一轮先改一件事/);
  assert.match(debriefView, /按这个重点再答一次/);
  assert.doesNotMatch(debriefView, /面试报告总结|你的原回答|12 分钟 · 4 \/ 4/);
  assert.match(panelView, /三位面试官共享同一段上下文/);
  assert.match(panel, /action==='portal-group-start'/);
  assert.match(styles, /interview-proof-followup/);
  assert.match(styles, /agent-debrief-next/);
  assert.match(styles, /panel-proof-roster/);
});

test("adds credible IELTS, overseas-life and workplace proof routes", async () => {
  const [, , , panel, styles] = await readActivePrototype();
  const ieltsView = panel.match(/function ieltsPart2PracticeView\(\)[\s\S]*?views\['ielts-part2-practice'\]=ieltsPart2PracticeView/)?.[0] || "";
  const dailyView = panel.match(/function dailyDoctorBriefView\(\)[\s\S]*?views\['daily-doctor-brief'\]=dailyDoctorBriefView/)?.[0] || "";
  const workplaceView = panel.match(/function workplaceClientBriefView\(\)[\s\S]*?views\['workplace-client-brief'\]=workplaceClientBriefView/)?.[0] || "";
  assert.match(ieltsView, /IELTS · Part 2/);
  assert.match(ieltsView, /01:24/);
  assert.match(ieltsView, /建议 02:00/);
  assert.match(ieltsView, /very nervously/);
  assert.match(ieltsView, /very nervous/);
  assert.doesNotMatch(ieltsView, /官方成绩|保证提分/);
  assert.match(dailyView, /I've had a cough for a week/);
  assert.match(dailyView, /Agent 已识别/);
  assert.match(dailyView, /开始和医生对话/);
  assert.match(dailyView, /青霉素过敏/);
  assert.match(dailyView, /不提供医疗判断/);
  assert.doesNotMatch(dailyView, /专项准备已生成|模拟角色|餐厅点餐|后端开发|客户进度会/);
  assert.match(panel, /说一件马上要办的事/);
  assert.match(workplaceView, /海外客户进度会/);
  assert.match(workplaceView, /解释延期并承担责任/);
  assert.match(panel, /action==='portal-scenario-start'/);
  assert.match(styles, /ielts-proof-topic/);
  assert.match(styles, /daily-agent-expression/);
});

test("maps every visible scene card to its own scenario configuration", async () => {
  const [, , , panel] = await readActivePrototype();
  for (const id of ["ielts-part1", "ielts-part2", "ielts-part3", "workplace-1on1", "workplace-meeting", "project", "clinic", "restaurant", "hotel", "airport"])
    assert.match(panel, new RegExp(`(?:id:|sceneId:)['"]${id}['"]`));
  assert.match(panel, /const configId=SCENE_CONFIGS\[sceneId\]\?sceneId:'restaurant'/);
  assert.doesNotMatch(panel, /const sceneMap=\{restaurant:'restaurant',hotel:'hotel',airport:'project'\}/);
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
