import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const core=readFileSync(new URL('../assets/spreak-prototype-v28.js',import.meta.url),'utf8');
const alignment=readFileSync(new URL('../assets/interview-alignment.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/panel-extension.css',import.meta.url),'utf8');

test('面试报告一题一卡并提供横向分页',()=>{
  const report=core.slice(core.indexOf('const reportCard='),core.indexOf('function alignedRetry'));
  assert.match(report,/report-question-card/);
  assert.match(report,/data-report-index="\$\{i\}"/);
  assert.match(report,/data-report-carousel/);
  assert.match(report,/report-question-dots/);
  assert.match(report,/data-action="align-report-carousel-to"/);
  assert.match(report,/requestAnimationFrame\(\(\)=>.*reportCarouselIndex.*scrollLeft/s);
});

test('报告分页支持触摸、鼠标滚轮和圆点定位',()=>{
  assert.match(alignment,/action===['"]align-report-carousel-to['"]/);
  assert.match(alignment,/addEventListener\(['"]scroll['"].*data-report-carousel/s);
  assert.match(alignment,/addEventListener\(['"]wheel['"].*data-report-carousel/s);
  assert.match(alignment,/alignCarouselConfig/);
  assert.match(alignment,/state\[config\.stateKey\]=index/);
  assert.match(css,/\.report-question-track\{[^}]*scroll-snap-type:x mandatory/s);
  assert.match(css,/\.report-question-card\{[^}]*flex:0 0 100%[^}]*height:100%[^}]*scroll-snap-align:start/s);
});

test('报告内容超高时先滚动卡片再切换题目',()=>{
  assert.match(core,/class="report-question-scroll" data-report-scroll/);
  assert.match(core,/class="report-scroll-cue"/);
  assert.match(core,/const syncReportScrollState=/);
  assert.match(css,/\.report-question-card\{[^}]*overflow:hidden/s);
  assert.match(css,/\.report-question-scroll\{[^}]*overflow-y:auto/s);
  assert.match(css,/\.report-question-card\.is-scrollable:not\(\.at-end\) \.report-scroll-cue\{[^}]*display:flex/s);
  assert.match(alignment,/const canScrollDown=/);
  assert.match(alignment,/const canScrollUp=/);
  assert.match(alignment,/scroller\.scrollTop=.*event\.deltaY/);
  assert.match(alignment,/syncReportScrollState\(scroller\)/);
});

test('报告页锁定外层安全区并统一顶部样式',()=>{
  assert.match(core,/classList\.toggle\(['"]report-canvas['"],state\.route===['"]report['"]\)/);
  assert.match(css,/\.screen\.report-canvas\{[^}]*overflow:hidden!important[^}]*overscroll-behavior:none!important/s);
  assert.match(css,/\.report-page\{[^}]*height:100%[^}]*display:flex[^}]*overflow:hidden/s);
  assert.match(css,/\.report-page \.topbar\{[^}]*position:static!important[^}]*border-bottom:0!important[^}]*box-shadow:none!important/s);
  assert.match(css,/\.align-page \.topbar h2\{[^}]*text-align:center!important/s);
});

test('报告顶部不再重复展示旧版大标题和指标卡',()=>{
  const report=core.slice(core.indexOf('function alignedReport'),core.indexOf('function alignedRetry'));
  assert.doesNotMatch(report,/hero-title/);
  assert.doesNotMatch(report,/metric-row/);
  assert.doesNotMatch(report,/report-hero/);
  assert.match(report,/class="align-page report-page"/);
});
