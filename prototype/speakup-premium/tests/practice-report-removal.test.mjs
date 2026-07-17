import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../assets/panel-extension.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/panel-extension.css',import.meta.url),'utf8');
const core=readFileSync(new URL('../assets/spreak-prototype-v28.js',import.meta.url),'utf8');
const prototype=readFileSync(new URL('../pages/prototype.html',import.meta.url),'utf8');

test('左侧不再提供重复的练习报告入口',()=>{
  const drawer=source.slice(source.indexOf('function appDrawer'),source.indexOf('bottomNav=function'));
  assert.doesNotMatch(drawer,/practice-reports|练习报告/);
  assert.doesNotMatch(prototype,/class="route-btn" data-route="report"/);
  assert.doesNotMatch(core,/route-btn\[data-route="report"\]/);
  assert.match(drawer,/item\('home','练习记录'\)/);
  assert.match(drawer,/item\('mistakes','错题回顾'\)/);
});

test('删除独立报告归档页和专用样式',()=>{
  assert.doesNotMatch(source,/PRACTICE_REPORT_ARCHIVE|practiceReportDetail|open-practice-report|practice-report-detail/);
  assert.doesNotMatch(css,/practice-report-card|practice-report-entry|report-detail-hero/);
});

test('单场报告仍从练习记录的已完成轮次进入',()=>{
  const history=source.slice(source.indexOf('function completeHistoryView'),source.indexOf('function agentHistoryConversation'));
  assert.match(history,/mode=status\.active\?'continue':status\.done\?'report'/);
  assert.match(source,/mode==='report'.*state\.route='report'/s);
});
