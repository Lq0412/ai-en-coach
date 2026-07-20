import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../assets/interview-alignment.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/panel-extension.css',import.meta.url),'utf8');

test('计划页按轮次渲染横向卡片而不是单个面试官面板',()=>{
  const view=source.slice(source.indexOf('function alignedRoundsV3'),source.indexOf('function alignedInterviewerConfigV3'));
  assert.match(view,/data-plan-carousel/);
  assert.match(view,/plan\.interviewers\.map/);
  assert.match(view,/data-round-index="\$\{i\}"/);
  assert.doesNotMatch(view,/位面试官|预计 \$\{totalMinutes\} 分钟/);
});

test('计划页去掉独立岗位概要，将岗位收进每张轮次卡',()=>{
  const view=source.slice(source.indexOf('function alignedRoundsV3'),source.indexOf('function alignedInterviewerConfigV3'));
  assert.doesNotMatch(view,/interview-plan-overview/);
  assert.doesNotMatch(view,/<h1 class="align-title">\$\{esc\(plan\.snapshot\.jobName/);
  assert.doesNotMatch(view,/interview-plan-summary/);
  assert.match(view,/interview-round-job">\$\{esc\(plan\.snapshot\.jobName/);
  assert.doesNotMatch(view,/interview-round-goal/);
});

test('卡片右上角用星级数字表达本轮问题进度',()=>{
  const view=source.slice(source.indexOf('function alignedRoundsV3'),source.indexOf('function alignedInterviewerConfigV3'));
  assert.match(view,/const progressDone=/);
  assert.match(view,/const progressTotal=4/);
  assert.match(view,/interview-round-progress/);
  assert.match(view,/★/);
  assert.match(view,/\$\{progressDone\}\/\$\{progressTotal\}/);
});

test('每张轮次卡根据场次状态提供对应的进入动作',()=>{
  const view=source.slice(source.indexOf('function alignedRoundsV3'),source.indexOf('function alignedInterviewerConfigV3'));
  assert.match(view,/开始本轮面试/);
  assert.match(view,/继续本轮面试/);
  assert.match(view,/再练一场/);
  assert.match(view,/data-action="align-prepare"[^>]*data-index="\$\{i\}"/);
  assert.match(source,/action===['"]align-prepare['"].*el\.dataset\.index/s);
});

test('点击开始本轮直接进入面试，不经过准备和麦克风检查',()=>{
  const handler=source.slice(source.indexOf("else if(action==='align-prepare')"),source.indexOf("else if(action==='align-interviewer-detail')"));
  const starter=source.slice(source.indexOf('function alignStartSession'),source.indexOf('function alignCompleteReport'));
  assert.match(handler,/alignStartSession\(\)/);
  assert.doesNotMatch(handler,/state\.route=['"]preparation['"]/);
  assert.match(starter,/session\.started=true/);
  assert.match(starter,/state\.route=['"]practice['"]/);
  assert.doesNotMatch(starter,/state\.route=['"]mic-check['"]/);
});

test('开始本轮使用当前轮次配置的面试时长',()=>{
  assert.match(source,/minutes:isFull\?interviewer\.roundDuration:8/);
});

test('轮次卡支持触摸滑动、鼠标滚轮、圆点定位和当前轮次同步',()=>{
  assert.match(source,/action===['"]align-carousel-to['"]/);
  assert.match(source,/addEventListener\(['"]scroll['"].*data-plan-carousel/s);
  assert.match(source,/addEventListener\(['"]wheel['"].*data-plan-carousel/s);
  assert.match(source,/event\.preventDefault\(\)/);
  assert.match(source,/track\.scrollTo\(\{left:card\.offsetLeft-track\.offsetLeft,behavior:['"]smooth['"]\}\)/);
  const view=source.slice(source.indexOf('function alignedRoundsV3'),source.indexOf('function alignedInterviewerConfigV3'));
  assert.match(view,/requestAnimationFrame\(\(\)=>.*planCarouselIndex.*scrollLeft/s);
  assert.match(css,/\.interview-plan-track\{[^}]*scroll-snap-type:x mandatory/s);
  assert.match(css,/\.interview-round-card\{[^}]*scroll-snap-align:start/s);
});

test('新计划卡保持单层浅灰样式且不使用渐变和发光',()=>{
  const section=css.slice(css.indexOf('/* SpeakUp interview plan carousel */'));
  assert.match(section,/\.interview-round-card\{[^}]*background:#f3f3f1/s);
  assert.match(section,/\.interview-round-primary\{[^}]*background:#151515/s);
  assert.doesNotMatch(section,/linear-gradient|radial-gradient|filter:drop-shadow|box-shadow:[^;]*(?:purple|124,58,237)/);
});

test('计划卡独占一页宽度并填满可用高度',()=>{
  const section=css.slice(css.indexOf('/* SpeakUp interview plan carousel */'));
  assert.match(section,/\.interview-plan-page\{[^}]*height:100%[^}]*display:flex[^}]*flex-direction:column[^}]*overflow:hidden/s);
  assert.match(section,/\.interview-plan-track\{[^}]*flex:1[^}]*min-height:0[^}]*margin-right:0[^}]*padding:0/s);
  assert.match(section,/\.interview-round-card\{[^}]*flex:0 0 100%[^}]*height:100%/s);
  assert.match(section,/\.interview-plan-page \.interview-round-card\{[^}]*height:100%!important[^}]*min-height:0!important[^}]*border:0!important[^}]*background:#f3f3f1!important[^}]*box-shadow:none!important/s);
  assert.match(section,/\.interview-round-job\{/);
  assert.match(section,/\.interview-round-progress\{/);
  assert.doesNotMatch(section,/\.interview-plan-overview|\.interview-plan-summary|\.interview-round-goal/);
});
