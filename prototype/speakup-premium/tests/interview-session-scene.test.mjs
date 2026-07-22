import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const panel=readFileSync(new URL('../assets/panel-extension.js',import.meta.url),'utf8');
const alignment=readFileSync(new URL('../assets/interview-alignment.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/panel-extension.css',import.meta.url),'utf8');

test('单面页使用整页场景，只保留统一页头、中部面试官和问题',()=>{
  const view=panel.slice(panel.indexOf('function singlePracticeAligned'),panel.indexOf('unifiedInterviewPractice=function'));
  assert.match(view,/single-interview-scene/);
  assert.match(view,/single-scene-head/);
  assert.match(view,/single-scene-spacer/);
  assert.match(view,/p\?\.roundTitle/);
  assert.match(view,/single-scene-person/);
  assert.match(view,/single-scene-question/);
  assert.doesNotMatch(view,/single-scene-progress|single-interviewer-bar|question-card|turn-progress|compact-live-toggle/);
});

test('本轮面试页头与其他二级页一致：返回、居中标题、无分隔线',()=>{
  const sceneStart=css.indexOf('/* Full-page single interview scene. */');
  const sceneCss=css.slice(sceneStart,css.indexOf('/* Practice records:',sceneStart));
  assert.match(sceneCss,/\.single-interview-scene\{[^}]*padding:0 0 max\(14px,env\(safe-area-inset-bottom\)\)/s);
  assert.match(sceneCss,/\.single-scene-head\{[^}]*grid-template-columns:44px minmax\(0,1fr\) 44px/s);
  assert.match(sceneCss,/\.single-scene-head h1\{[^}]*text-align:center/s);
  assert.match(sceneCss,/\.single-scene-back\{[^}]*border:0[^}]*background:transparent/s);
  assert.match(sceneCss,/\.single-scene-main\{[^}]*padding:38px 22px 12px/s);
  assert.match(sceneCss,/\.single-scene-controls\{[^}]*padding:12px 22px 2px/s);
  assert.doesNotMatch(sceneCss,/\.single-scene-progress/);
});

test('对话、开口回答和结束三个操作沉入页面底部',()=>{
  const view=panel.slice(panel.indexOf('function singlePracticeAligned'),panel.indexOf('unifiedInterviewPractice=function'));
  assert.match(view,/single-scene-controls/);
  assert.match(view,/data-action="toggle-interview-chat"/);
  assert.match(view,/data-action="ms1-answer"/);
  assert.match(view,/data-action="end-early"/);
  const sceneStart=css.indexOf('/* Full-page single interview scene. */');
  const sceneCss=css.slice(sceneStart,css.indexOf('/* Practice records:',sceneStart));
  assert.match(sceneCss,/\.single-interview-scene\{[^}]*height:100%[^}]*display:flex[^}]*flex-direction:column/s);
  assert.match(sceneCss,/\.single-scene-controls\{[^}]*margin-top:auto[^}]*grid-template-columns:1fr 1\.35fr 1fr/s);
  assert.match(sceneCss,/\.single-scene-primary\{[^}]*width:82px[^}]*height:82px[^}]*border-radius:50%/s);
  assert.match(view,/<rect x="9" y="3" width="6" height="11" rx="3"\/>/);
});

test('面试场景不使用渐变、发光和套娃卡片',()=>{
  const sceneStart=css.indexOf('/* Full-page single interview scene. */');
  const sceneCss=css.slice(sceneStart,css.indexOf('/* Practice records:',sceneStart));
  assert.match(sceneCss,/\.single-interview-scene\{[^}]*background:#fff/s);
  assert.match(sceneCss,/\.single-scene-question\{[^}]*border:0[^}]*background:transparent/s);
  assert.doesNotMatch(sceneCss,/linear-gradient|radial-gradient|box-shadow|backdrop-filter/);
});

test('群面页复用统一语音场景和底部三项操作',()=>{
  const view=panel.slice(panel.indexOf('function panelPractice'),panel.indexOf('const originalUnifiedPractice'));
  assert.match(view,/panel-session-scene/);
  assert.match(view,/single-scene-head/);
  assert.match(view,/panel-scene-members/);
  assert.match(view,/第 \$\{turn\+1\} \/ 6 题/);
  assert.match(view,/single-scene-controls/);
  assert.match(view,/data-action="toggle-interview-chat"/);
  assert.match(view,/data-action="ms1-answer"/);
  assert.match(view,/data-action="end-early"/);
  assert.match(view,/基于你刚才的回答继续追问/);
  assert.match(view,/panel-scene-initial/);
  assert.doesNotMatch(view,/characterAvatar/);
  assert.doesNotMatch(view,/panel-practice-head|turn-progress|compact-live-toggle|💬|⏹/);
});

test('群面页保持黑白灰与轻量青色选中态',()=>{
  const formalStart=css.indexOf('/* Formal panel interview plan and live session. */');
  const formalCss=css.slice(formalStart,css.indexOf('html.portal-capture-3x',formalStart));
  assert.match(css,/\.panel-session-scene\{[^}]*background:#fff/s);
  assert.match(formalCss,/\.panel-scene-member\{[^}]*background:transparent/s);
  assert.match(formalCss,/\.panel-scene-member\.active\{[^}]*background:transparent/s);
  assert.match(formalCss,/\.panel-scene-speaker-initial\{[^}]*background:#171717/s);
  assert.doesNotMatch(formalCss,/gradient|box-shadow|#7c3aed|#6d28d9/i);
});

test('已绕过的面试前准备页代码被删除',()=>{
  assert.doesNotMatch(alignment,/function alignedPreparationV3|views\.preparation/);
  assert.doesNotMatch(panel,/originalPreparationView|panel-prepare|views\.preparation/);
});
