import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const core=readFileSync(new URL('../assets/spreak-prototype-v28.js',import.meta.url),'utf8');
const panel=readFileSync(new URL('../assets/panel-extension.js',import.meta.url),'utf8');
const alignment=readFileSync(new URL('../assets/interview-alignment.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/panel-extension.css',import.meta.url),'utf8');
const page=readFileSync(new URL('../pages/prototype.html',import.meta.url),'utf8');

test('场景练习从 SpeakUp 首页作为 Agent 指令进入',()=>{
  assert.match(panel,/data-command="scene"/);
  assert.match(panel,/场景口语练习/);
  assert.match(panel,/command==='scene'.*state\.route='role-create'/s);
});

test('场景创建收敛为一句话描述而不是五步角色问卷',()=>{
  const flow=panel.slice(panel.indexOf('roleCreate=function()'),panel.indexOf('roleGenerating=function()'));
  assert.match(flow,/告诉我下一场重要的英文沟通/);
  assert.match(panel,/request:'我想练习在英文餐厅点餐/);
  assert.match(panel,/request:'下周我要和海外客户开项目进度会/);
  assert.match(panel,/request:'我想练习入住酒店并询问设施/);
  assert.match(flow,/data-scene-id=/);
  assert.match(flow,/data-action="scene-agent-example"/);
  assert.match(flow,/data-route="role-preview"/);
  assert.doesNotMatch(flow,/roleQuestions|创建进度|切换文字输入|Tip/);
  assert.match(panel,/views\['role-create'\]=roleCreate/);
});

test('场景确认使用整页场景卡，突出角色、开场白和开始入口',()=>{
  const confirm=panel.slice(panel.indexOf('rolePreview=function()'),panel.indexOf('function alignedRoleConversation'));
  assert.match(confirm,/准备方案/);
  assert.match(confirm,/config\.title/);
  assert.match(confirm,/scene-confirm-card/);
  assert.match(confirm,/config\.partner/);
  assert.match(confirm,/本次目标/);
  assert.match(confirm,/config\.level/);
  assert.match(confirm,/config\.duration/);
  assert.match(confirm,/data-action="role-start-chat"/);
  assert.doesNotMatch(confirm,/角色介绍|更换音色|重新创建/);
});

test('开始场景练习直接进入语音对话且侧栏不暴露中间页面',()=>{
  const drawer=panel.slice(panel.indexOf('function appDrawer'),panel.indexOf('bottomNav=function'));
  assert.match(panel,/action==='role-start-chat'.*state\.route='role-chat'/s);
  assert.doesNotMatch(panel,/action==='role-start-chat'.*state\.route='mic-check'/s);
  assert.doesNotMatch(drawer,/item\('role-chat'/);
  assert.doesNotMatch(drawer,/item\('role-create'/);
  assert.doesNotMatch(drawer,/item\('role-preview'/);
  assert.match(panel,/data-command="scene"/);
});

test('场景语音页以说话为主并与模拟面试共用统一页头',()=>{
  const practice=panel.slice(panel.indexOf('roleChat=function()'),panel.indexOf('function roleComplete'));
  assert.match(practice,/role-session-page/);
  assert.match(practice,/single-scene-head/);
  assert.match(practice,/single-scene-spacer/);
  assert.match(practice,/config\.shortTitle/);
  assert.match(practice,/data-action="role-replay"/);
  assert.match(panel,/function roleBottomControls\(\).*data-action="role-talk".*data-action="end-role-chat"/s);
  assert.doesNotMatch(practice,/turn-progress|roleLiveCompactControl|实时/);
});

test('场景语音页进入时不伪造用户回答，提交后再展示对话和建议',()=>{
  const conversation=panel.slice(panel.indexOf('function roleConversationPanel'),panel.indexOf('function roleBottomControls'));
  assert.match(conversation,/answered=Boolean\(latest\)/);
  assert.match(conversation,/turns\.slice\(-2\)\.map/);
  assert.match(conversation,/latest\?\.suggestion/);
  assert.match(conversation,/1 条表达建议/);
  assert.match(panel,/action==='role-start-chat'.*startScenePracticeSession\(\)/s);
});

test('场景练习使用独立 Session，不覆盖模拟面试计划状态',()=>{
  const start=panel.slice(panel.indexOf("action==='role-start-chat'"),panel.indexOf("},true);",panel.indexOf("action==='role-start-chat'")));
  assert.match(start,/startScenePracticeSession\(\)/);
  assert.doesNotMatch(start,/state\.interviewers=|state\.sessionsByInterviewer|state\.planSnapshot=|alignBindSession/);
  assert.match(panel,/scenePracticeHistory:Array\.isArray/);
  assert.match(panel,/finalizeScenePractice\('completed'\)/);
  assert.match(panel,/finalizeScenePractice\('incomplete'\)/);
  assert.match(panel,/state\.sceneActiveRecordId=record\.id;alignPersist\(\)/);
  assert.match(alignment,/scenePracticeHistory:state\.scenePracticeHistory\|\|\[\]/);
  assert.match(alignment,/state\.scenePracticeHistory=Array\.isArray\(saved\.scenePracticeHistory\)/);
});

test('场景练习按四轮推进并写入练习记录',()=>{
  assert.match(panel,/const SCENE_CONFIGS=\{/);
  assert.match(panel,/restaurant:\{[^}]*title:'英文餐厅点餐'/s);
  assert.match(panel,/project:\{[^}]*title:'海外客户进度会'/s);
  assert.match(panel,/hotel:\{[^}]*title:'酒店入住沟通'/s);
  assert.match(panel,/clinic:\{[^}]*title:'诊所就医沟通'/s);
  assert.match(panel,/'ielts-part2':\{[^}]*title:'IELTS Speaking · Part 2'/s);
  assert.match(panel,/'workplace-1on1':\{[^}]*title:'海外主管 1-on-1'/s);
  assert.match(panel,/session\.currentTurn\+=1/);
  assert.match(panel,/session\.currentTurn>=config\.questions\.length/);
  assert.match(panel,/scenePracticeHistory\.unshift/);
  assert.match(panel,/class="history-plan-card scene-history-card"/);
  assert.match(panel,/data-action="open-scene-summary"/);
});

test('场景总结读取实际记录，提前结束不会伪造四轮完成数据',()=>{
  const summary=panel.slice(panel.indexOf('function roleComplete'),panel.indexOf("views['role-create']"));
  assert.match(summary,/record=activeSceneRecord\(\)/);
  assert.match(summary,/turns\.length\} \/ \$\{config\.questions\.length\} 轮/);
  assert.match(summary,/record\.durationMinutes/);
  assert.match(summary,/corrections/);
  assert.match(summary,/config\.summaryTitle/);
  assert.doesNotMatch(summary,/>6 分钟<|>4 轮<|>1 处</);
  assert.match(summary,/topbar\('练习总结','home'\)/);
});

test('场景选择贯穿确认、练习、总结和历史记录',()=>{
  assert.match(panel,/state\.sceneConfigId=el\.dataset\.sceneId/);
  assert.match(panel,/startScenePracticeSession\(configId=state\.sceneConfigId\)/);
  assert.match(panel,/configId:config\.id,title:config\.title,partner:config\.partner/);
  assert.match(panel,/record\.partner\|\|'SpeakUp 角色'/);
  assert.match(panel,/startScenePracticeSession\(record\?\.configId\|\|'restaurant'\)/);
  assert.match(alignment,/sceneConfigId:state\.sceneConfigId\|\|'restaurant'/);
});

test('练习记录按场景保留最新一条避免重复 Mock 卡片',()=>{
  const history=panel.slice(panel.indexOf('function completeHistoryView'),panel.indexOf('alignedHomeV3=completeHistoryView'));
  assert.match(history,/rawSceneRecords=state\.scenePracticeHistory\|\|\[\]/);
  assert.match(history,/record\.configId\|\|`\$\{record\.title/);
  assert.match(history,/records\.findIndex/);
  assert.match(history,/sceneRecords\.map\(sceneCard\)/);
  assert.match(history,/allItems\.length\} 项练习/);
});

test('场景总结为单层黑白灰信息页',()=>{
  assert.match(css,/\.role-complete-page\{[^}]*background:#fff/s);
  assert.match(css,/\.role-complete-summary\{[^}]*border:0[^}]*background:#f3f3f1/s);
  assert.match(css,/\.role-complete-actions \.primary\{[^}]*background:#151515/s);
  const summaryCss=css.slice(css.indexOf('.role-complete-page{'),css.indexOf('@media(max-width:420px)'));
  assert.doesNotMatch(summaryCss,/gradient|box-shadow|#7c3aed|#6d28d9/i);
});

test('新场景页面保持单层扁平样式且不使用渐变或发光',()=>{
  const sceneCss=css.slice(css.indexOf('/* Agent-driven scene practice'),css.indexOf('/* Scene voice practice:'));
  assert.match(sceneCss,/\.scene-agent-suggestions button\{[^}]*background:transparent/s);
  assert.match(sceneCss,/\.scene-confirm-card\{[^}]*background:#f3f3f1/s);
  assert.match(sceneCss,/\.scene-card-opening,.scene-card-goal\{[^}]*border-top/s);
  assert.doesNotMatch(sceneCss,/gradient|glow|#7c3aed|#6d28d9|#a78bfa/i);
  assert.match(core,/告诉 SpeakUp 你想练什么/);
});
