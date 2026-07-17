import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const core=readFileSync(new URL('../assets/spreak-prototype-v28.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/panel-extension.css',import.meta.url),'utf8');

test('同题复练顶部只保留返回和居中标题',()=>{
  const retry=core.slice(core.indexOf('function alignedRetry'),core.indexOf('function alignedInterviewersV2'));
  assert.match(retry,/class="align-page retry-page"/);
  assert.match(retry,/topbar\('同题复练','report'\)/);
  assert.doesNotMatch(retry,/class="chip"/);
  assert.match(css,/\.retry-page \.topbar\{[^}]*position:static!important[^}]*border-bottom:0!important[^}]*box-shadow:none!important/s);
});

test('同题复练使用单层内容和底部主操作',()=>{
  const retry=core.slice(core.indexOf('function alignedRetry'),core.indexOf('function alignedInterviewersV2'));
  assert.match(retry,/retry-question-panel/);
  assert.match(retry,/retry-target-panel/);
  assert.match(retry,/retry-page-actions/);
  assert.match(retry,/retry-page-primary/);
  assert.doesNotMatch(retry,/practice-controls|class="talk|retry-context/);
  assert.match(css,/\.retry-page-primary\{[^}]*width:100%[^}]*background:#151515/s);
});

test('复练页锁定外层滚动并在页内保留转录与版本',()=>{
  assert.match(core,/classList\.toggle\(['"]retry-canvas['"],state\.route===['"]retry['"]\)/);
  assert.match(css,/\.screen\.retry-canvas\{[^}]*overflow:hidden!important/);
  assert.match(css,/\.retry-page-content\{[^}]*flex:1[^}]*overflow-y:auto/s);
  assert.match(core,/retryMocksForRound\(\)\[i\]/);
  assert.match(core,/retry-transcript-panel/);
  assert.match(core,/retry-feedback/);
  assert.match(core,/retry-audio/);
});
