import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../assets/panel-extension.js',import.meta.url),'utf8');
const flowSource=source.slice(source.indexOf('const AGENT_COMMANDS'),source.indexOf("views['agent-chat']"));

test('点击创建模拟面试后进入 JD 收集步骤而不是旧确认卡',()=>{
  assert.match(source,/command===['"]create['"].*agentCreateStep=1/s);
  assert.match(source,/agentCreateStatus=['"]collecting['"]/);
  assert.match(flowSource,/创建模拟面试 · \$\{step\}\/4/);
  assert.match(flowSource,/先告诉我目标岗位，或者把 JD 发给我/);
});

test('Agent 创建链路只收集 JD、简历和单面或群面',()=>{
  assert.match(flowSource,/粘贴示例 JD/);
  assert.match(flowSource,/Backend_Developer_Resume\.pdf/);
  assert.match(flowSource,/单面计划 · 4 轮 · 约 70 分钟/);
  assert.match(flowSource,/群面模拟 · 1 场 · 约 25 分钟/);
  assert.doesNotMatch(flowSource,/key:'experience'|重点追问哪段经历/);
  assert.match(source,/action===['"]agent-create-select['"].*agentCreateStep/s);
});

test('最终确认使用紧凑摘要并支持修改和创建',()=>{
  assert.match(flowSource,/data-action="agent-create-edit"/);
  assert.match(flowSource,/data-action="agent-create-confirm"/);
  assert.doesNotMatch(flowSource,/严格追问型/);
  const summary=source.slice(source.indexOf('function agentCreateSummary'),source.indexOf('function agentCreateFlow'));
  assert.doesNotMatch(summary,/重点经历|练习重点/);
  assert.match(source,/action===['"]agent-create-confirm['"].*agentCreateStatus=['"]created['"]/s);
});

test('确认创建后生成与选择结果一致的 mock 面试计划',()=>{
  assert.match(source,/function createAgentMockPlan\(\)/);
  assert.match(source,/interviewMode:isPanel\?['"]panel['"]:['"]single['"]/);
  assert.match(source,/action===['"]agent-create-confirm['"].*createAgentMockPlan\(\)/s);
  assert.match(source,/mockDuration:isPanel\?25:70/);
  assert.match(source,/plan\.mockDuration/);
});

test('单面 mock 计划生成四个有顺序的面试轮次',()=>{
  assert.match(source,/roundTitle:'HR 初面'.*roundDuration:15/s);
  assert.match(source,/roundTitle:'技术深挖'.*roundDuration:20/s);
  assert.match(source,/roundTitle:'系统设计'.*roundDuration:20/s);
  assert.match(source,/roundTitle:'综合终面'.*roundDuration:15/s);
  assert.match(source,/slice\(0,isPanel\?3:4\)/);
  assert.match(source,/estimatedDuration:isPanel\?25:70/);
});

test('创建完成后展示四轮计划概要和唯一查看入口',()=>{
  assert.match(flowSource,/agent-plan-result/);
  assert.match(flowSource,/4 轮 · 4 位面试官/);
  assert.match(flowSource,/agent-plan-rounds/);
  assert.match(flowSource,/plan\.interviewers\.map/);
  assert.match(flowSource,/查看面试计划/);
});

test('历史页按计划展示真实轮次、面试官和场次数',()=>{
  const historySource=source.slice(source.indexOf('function completeHistoryView'),source.indexOf('function agentHistoryConversation'));
  assert.match(historySource,/allItems\.length\} 项练习/);
  assert.match(historySource,/scenePracticeHistory/);
  assert.match(historySource,/plan\.interviewers\.map/);
  assert.match(historySource,/sessions:plan\.sessions\[index\]/);
  assert.match(historySource,/history-round-row/);
  assert.match(historySource,/已完成 \$\{completed\} \/ \$\{rounds\.length\} 轮/);
  assert.match(historySource,/data-mode="\$\{mode\}"/);
  assert.doesNotMatch(historySource,/history-card-actions|open-history-chat|open-history-report|continue-interview/);
  assert.doesNotMatch(historySource,/1 位面试官项目深挖|3 场练习/);
});
