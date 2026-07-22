import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../assets/panel-extension.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/panel-extension.css',import.meta.url),'utf8');

test('右侧语音模式入口使用竖向声波图标而不是文字符号',()=>{
  const composer=source.slice(source.indexOf('function agentCreateComposer'),source.indexOf('function agentCreateSummary'));
  const home=source.slice(source.indexOf('function agentHome'),source.indexOf('function agentHistoryConversation'));
  for(const view of [composer,home]){
    assert.match(view,/class="agent-voice-glyph"/);
    assert.match(view,/viewBox="0 0 24 24"/);
    assert.doesNotMatch(view,/≋/);
  }
});

test('麦克风图形校正视觉基线，声波图标在黑色按钮内居中',()=>{
  const final=css.slice(css.indexOf('/* Final voice control alignment. */'));
  assert.match(final,/\.agent-simple-home \.agent-composer-mic i\{[^}]*transform:translateY\(-4px\)/s);
  assert.match(final,/\.agent-voice-glyph\{[^}]*width:18px[^}]*height:18px[^}]*display:block/s);
  assert.match(final,/\.agent-composer-voice\{[^}]*display:grid[^}]*place-items:center/s);
});

test('进入语音模式后展示简洁的 Mock 一问一答气泡',()=>{
  const voice=source.slice(source.indexOf('const AGENT_VOICE_MOCK'),source.indexOf("views['agent-chat']"));
  assert.match(voice,/role:'agent'/);
  assert.match(voice,/role:'user'/);
  assert.match(voice,/class="agent-voice-thread"/);
  assert.match(voice,/voiceMock=state\.agentSceneVoiceMock\|\|AGENT_VOICE_MOCK/);
  assert.match(voice,/voiceMock\.map/);
  assert.match(voice,/agent-voice-turn \$\{item\.role\}/);
  assert.doesNotMatch(voice,/agent-voice-orb|agent-operation-card/);
});

test('语音 Mock 对话只使用左右气泡，不附加播放、评价或复制工具栏',()=>{
  const final=css.slice(css.indexOf('/* Voice mock conversation. */'));
  assert.match(final,/\.agent-voice-thread\{[^}]*display:flex[^}]*flex-direction:column[^}]*overflow-y:auto/s);
  assert.match(final,/\.agent-voice-turn\.agent\{[^}]*align-self:flex-start[^}]*background:#f3f3f1/s);
  assert.match(final,/\.agent-voice-turn\.user\{[^}]*align-self:flex-end[^}]*background:#e7f2f3/s);
  assert.doesNotMatch(source,/agent-voice-(?:copy|like|dislike|replay|share)/);
});

test('语音 Mock 对话最终提供直接进入模拟面试的真实入口',()=>{
  const voice=source.slice(source.indexOf('const AGENT_VOICE_MOCK'),source.indexOf("views['agent-chat']"));
  assert.match(voice,/action:'interview'/);
  assert.match(voice,/data-action="agent-voice-enter-interview"/);
  assert.match(voice,/进入模拟面试/);
  assert.match(source,/action===['"]agent-voice-enter-interview['"].*createAgentMockPlan\(\).*alignStartSession\(\)/s);
  assert.doesNotMatch(source,/agent-voice-enter-interview[^\n]*state\.route=['"]preparation['"]/);
  const final=css.slice(css.indexOf('/* Voice mock conversation. */'));
  assert.match(final,/\.agent-voice-enter\{[^}]*background:#151515[^}]*color:#fff/s);
});

test('语音 Mock 完整演示 JD、简历和单面选择，不追问重点经历',()=>{
  const voice=source.slice(source.indexOf('const AGENT_VOICE_MOCK'),source.indexOf('function agentConversation'));
  assert.match(voice,/JD/);
  assert.match(voice,/Backend_Developer_Resume\.pdf/);
  assert.match(voice,/单面还是群面/);
  assert.match(voice,/这次选择单面/);
  assert.doesNotMatch(voice,/项目经历深挖|重点追问|最有代表性的项目/);
});

test('语音创建完成后明确提示多轮和多位面试官',()=>{
  const voice=source.slice(source.indexOf('const AGENT_VOICE_MOCK'),source.indexOf('function agentConversation'));
  assert.match(voice,/4 轮面试和 4 位面试官/);
  assert.match(voice,/第一轮是 Mia 的 HR 初面/);
});
