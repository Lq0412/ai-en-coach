import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../assets/panel-extension.js',import.meta.url),'utf8');
const page=readFileSync(new URL('../pages/prototype.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/panel-extension.css',import.meta.url),'utf8');

test('演示页面移除桌面介绍栏并使用全高移动端画布',()=>{
  assert.doesNotMatch(page,/<aside class="prototype-nav"/);
  assert.doesNotMatch(page,/左侧为后续 Web 端拓展预留/);
  assert.match(page,/<style id="presentation-mode">/);
  assert.match(page,/\.app-shell\{[^}]*height:100dvh[^}]*display:block[^}]*padding:0/s);
  assert.match(page,/\.phone\{[^}]*max-width:430px[^}]*height:100dvh[^}]*border-radius:0[^}]*box-shadow:none/s);
});

test('Agent 创建完成后直接进入面试，不再经过已删除的麦克风检查页',()=>{
  const card=source.slice(source.indexOf("agentOperation==='created'"),source.indexOf("agentOperation==='executing'"));
  assert.match(card,/data-action="agent-voice-enter-interview"/);
  assert.doesNotMatch(card,/data-route="mic-check"/);
});

test('设置页将身份改为静态信息，只保留真实可用入口',()=>{
  const settings=source.slice(source.indexOf('ms1Settings=function'),source.indexOf('views.settings=ms1Settings'));
  assert.match(settings,/topbar\('设置','agent-chat'\)/);
  assert.match(settings,/settings-identity/);
  assert.match(settings,/data-route="resumes"/);
  assert.match(settings,/data-action="delete-account"/);
  assert.doesNotMatch(settings,/<button class="settings-row"><span>头像/);
  assert.doesNotMatch(settings,/<button class="settings-row"><span>昵称/);
  assert.doesNotMatch(settings,/隐私政策|关于产品/);
  assert.match(css,/\.settings-identity\{[^}]*border:0[^}]*background:#f3f3f1/s);
});
