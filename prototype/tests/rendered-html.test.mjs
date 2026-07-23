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

test("routes unfinished product actions to an honest early-access application", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  const visibleText = html.replace(/<[^>]+>/g, "");
  assert.match(html, /面向真实任务的英语沟通 Agent/);
  assert.doesNotMatch(html, /href="\/pages\/prototype\.html/);
  assert.match(html, /申请首批体验/);
  assert.match(visibleText, /下一场重要的英文沟通/);
  assert.match(html, /portal-interview-start\.jpg/);
  assert.match(html, /portal-panel-practice\.jpg/);
  assert.match(html, /portal-evidence-report\.jpg/);
  assert.match(html, /portal-memory-chat\.jpg/);
  assert.match(html, /portal-ielts-part2\.jpg/);
  assert.match(html, /portal-daily-doctor\.jpg/);
  assert.match(html, /portal-workplace-client\.jpg/);
  assert.match(html, /SpeakUp 正在招募首批体验用户/);
  assert.doesNotMatch(html, /SpeakUp 模拟面试现已开放/);
  assert.match(html, /结合目标、经历和过往练习/);
  assert.match(visibleText, /考出去、面进去，.*适应好/s);
  assert.match(html, /雅思口语/);
  assert.match(html, /海外日常/);
  assert.match(html, /国际职场/);
  assert.match(html, /它记得的，是你的目标和能力变化/);
  assert.match(html, /完整演示 · 后端开发工程师英文面试/);
  assert.match(html, /Memory 会持续记住岗位、真实项目、反复卡点和已经改善的能力/);
  assert.match(html, /单面之外，也能应对多人连续追问/);
  assert.match(html, /英文面试完整演示步骤/);
  assert.doesNotMatch(html, /class="feature-card"/);
  assert.match(html, /id="early-access"/);
  assert.match(html, /<dialog/);
  assert.match(html, /href="#early-access"/);
  assert.match(html, /产品仍在开发中/);
  assert.match(html, /不会自动注册账号/);
  assert.doesNotMatch(html, /验证入口|方向验证|产品行为占位|待验证|产品验证门户|体验现有原型/);
  assert.doesNotMatch(html, /portal-task-intake\.jpg|portal-task-brief\.jpg/);
  assert.doesNotMatch(html, /portal-career-history\.jpg|portal-career-context\.jpg|portal-interview-plan\.jpg/);
  assert.doesNotMatch(html, /职业上下文|职业英语联系人|群面计划/);
});

test("uses native dialog behavior and records the early-access funnel", async () => {
  const source = await readFile(new URL("app/EarlyAccessDialog.tsx", root), "utf8");
  assert.match(source, /dialog\.showModal\(\)/);
  assert.match(source, /document\.addEventListener\("click"/);
  assert.match(source, /trackPortalEvent\("page_view"\)/);
  assert.match(source, /trackPortalEvent\("cta_click"/);
  assert.match(source, /fetch\("\/api\/waitlist"/);
  assert.match(source, /name="consent"/);
});

test("centers the application dialog and keeps the mobile demo fully visible", async () => {
  const styles = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(styles, /\.early-access-modal\s*\{[\s\S]*?inset:\s*50% auto auto 50%/);
  assert.match(styles, /\.early-access-modal\[open\]\s*\{[\s\S]*?translate\(-50%, -50%\)/);

  const mobileStyles = styles.slice(styles.indexOf("@media (max-width: 640px)"));
  assert.match(mobileStyles, /\.demo-sequence\s*\{[\s\S]*?height:\s*auto/);
  assert.match(mobileStyles, /\.demo-step-list\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/);
  assert.match(mobileStyles, /\.demo-stage-frame\s*\{[\s\S]*?aspect-ratio:\s*4 \/ 5/);
  assert.doesNotMatch(mobileStyles, /\.demo-step-list\s*\{[\s\S]*?overflow-x:\s*auto/);
});

test("balances marketing headlines without hard-coded line breaks", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  assert.doesNotMatch(source, /<br\s*\/?>/);
  assert.doesNotMatch(source, /journey-title-line/);
  assert.match(styles, /\.hero h1\s*\{[\s\S]*?text-wrap:\s*balance/);
  assert.match(styles, /\.section-intro h2,[\s\S]*?\.final-cta h2\s*\{[\s\S]*?text-wrap:\s*balance/);
  assert.match(styles, /\.section-intro\s*\{\s*max-width:\s*960px/);
  assert.match(styles, /\.title-phrase\s*\{[\s\S]*?display:\s*inline-block[\s\S]*?white-space:\s*nowrap/);

  const mobileStyles = styles.slice(styles.indexOf("@media (max-width: 640px)"));
  assert.match(mobileStyles, /\.hero h1\s*\{[\s\S]*?font-size:\s*clamp\(36px, 9\.7vw, 44px\)/);
  assert.match(mobileStyles, /\.section-intro h2,[\s\S]*?\.final-cta h2\s*\{[\s\S]*?font-size:\s*clamp\(38px, 10\.5vw, 42px\)/);
  assert.match(mobileStyles, /\.title-line\s*\{[\s\S]*?display:\s*inline[\s\S]*?white-space:\s*normal/);
});

test("keeps contact data behind a password-protected admin API", async () => {
  const [summary, exportRoute, auth, schema] = await Promise.all([
    readFile(new URL("app/api/admin/summary/route.ts", root), "utf8"),
    readFile(new URL("app/api/admin/export/route.ts", root), "utf8"),
    readFile(new URL("lib/admin-auth.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
  ]);
  assert.match(summary, /isAdminRequest/);
  assert.match(exportRoute, /isAdminRequest/);
  assert.match(auth, /PORTAL_ADMIN_PASSWORD/);
  assert.match(auth, /SHA-256/);
  assert.match(schema, /portal_events/);
  assert.match(schema, /portal_waitlist/);
  assert.doesNotMatch(schema, /ip_address|user_agent/);
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
