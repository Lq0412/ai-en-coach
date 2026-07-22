import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const core=readFileSync(new URL('../assets/spreak-prototype-v28.js',import.meta.url),'utf8');
const panel=readFileSync(new URL('../assets/panel-extension.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/panel-extension.css',import.meta.url),'utf8');

test('每张面试报告卡展示一条可收藏的语言问题',()=>{
  const reportCard=core.slice(core.indexOf('const reportCard='),core.indexOf('const reportDate='));
  assert.match(reportCard,/currentReportLanguageIssues\(\)\[i\]/);
  assert.match(reportCard,/class="report-language-issue/);
  assert.match(reportCard,/data-action="toggle-report-mistake"/);
  assert.match(reportCard,/已加入.*加入错题/);
});

test('错题收藏状态会更新并持久化',()=>{
  assert.match(core,/state\.savedMistakeIds=loadSavedMistakeIds\(\)/);
  assert.match(core,/const toggleSavedMistake=/);
  assert.match(core,/localStorage\.setItem\(MISTAKE_STORAGE_KEY/);
  assert.match(core,/a==='toggle-report-mistake'.*toggleSavedMistake/s);
});

test('错题页展示最近收藏的来源并使用动态数量',()=>{
  const mistakes=core.slice(core.indexOf('function mistakes()'),core.indexOf('function mistakePractice()'));
  assert.match(mistakes,/最近收藏/);
  assert.match(mistakes,/latest\.source/);
  assert.match(mistakes,/key:'interview'/);
  assert.match(mistakes,/key:'conversation'/);
  assert.match(mistakes,/data-mistake-scope="\$\{scope\.key\}"/);
  assert.match(mistakes,/模拟面试中的表达/);
  assert.match(mistakes,/场景对话中的表达/);
  assert.match(css,/\.latest-mistake-source/);
});

test('错题页改为黑白灰扁平布局而不再使用旧版 Banner 和紫色入口',()=>{
  const mistakes=core.slice(core.indexOf('function mistakes()'),core.indexOf('function mistakePractice()'));
  const redesign=css.slice(css.indexOf('/* Mistake review: source-led tasks with a fixed page header. */'),css.indexOf('/* Mistake practice: voice-first review with segmented progress. */'));
  assert.match(mistakes,/class="mistake-redesign"/);
  assert.match(mistakes,/class="mistake-source-list"/);
  assert.doesNotMatch(mistakes,/mistake-hero|review-definition|mistake-types|mistake-summary-count|条语言收藏|按类型复习|mistake-category-list/);
  assert.match(redesign,/\.mistake-start\{[^}]*background:#171717/);
  assert.match(redesign,/\.screen\.mistake-canvas\{[^}]*overflow:hidden/);
  assert.match(redesign,/\.mistake-page-scroll\{[^}]*overflow-y:auto/);
  assert.match(redesign,/\.mistake-redesign \.topbar[^\{]*\{[^}]*position:static[^}]*border-bottom:0/s);
  assert.doesNotMatch(redesign,/gradient|#7c3aed|#6d28d9|#a78bfa/i);
});

test('场景对话的纠错也使用同一收藏链路',()=>{
  assert.match(panel,/data-action="save-mistake" data-mistake-id="role-order-infinitive"/);
  assert.match(core,/id:'role-order-infinitive'.*source:'场景对话 · Bob'/s);
  assert.match(core,/a==='save-mistake'.*toggleSavedMistake/s);
});

test('错题练习以语音作答为主而不是要求键盘输入',()=>{
  const practice=core.slice(core.indexOf('function mistakePractice()'),core.indexOf('function mistakeComplete()'));
  assert.match(practice,/data-action="mistake-record"/);
  assert.match(practice,/点击说英语/);
  assert.match(practice,/我说的 · 自动转写/);
  assert.match(practice,/再说一次/);
  assert.doesNotMatch(practice,/textarea|data-mistake-answer|输入你的答案/);
});

test('错题进度移出顶部右侧并改为留有间隔的分段进度',()=>{
  const practice=core.slice(core.indexOf('function mistakePractice()'),core.indexOf('function mistakeComplete()'));
  const redesign=css.slice(css.indexOf('/* Mistake practice: voice-first review with segmented progress. */'));
  assert.match(practice,/topbar\('错题练习','mistakes'\)/);
  assert.match(practice,/class="mistake-step-progress"/);
  assert.doesNotMatch(practice,/class="chip"|mistake-progress/);
  assert.match(redesign,/\.mistake-step-progress\{[^}]*gap:5px/);
  assert.match(redesign,/\.mistake-step-progress i\.active\{[^}]*background:#83c9d7/);
});

test('错题语音 Mock 支持录音、自动转写、解析和重说',()=>{
  assert.match(core,/mistakeRecording:false/);
  assert.match(core,/mistakeTranscripts:\[\]/);
  assert.match(core,/a==='mistake-record'.*语音已转写/s);
  assert.match(core,/a==='mistake-retry'.*mistakeTranscripts\[state\.mistakeIndex\]=''/s);
  assert.match(core,/\['mistakes','mistake-practice','mistake-complete'\]\.includes\(state\.route\)/);
});
