import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const core=readFileSync(new URL('../assets/spreak-prototype-v28.js',import.meta.url),'utf8');
const panel=readFileSync(new URL('../assets/panel-extension.js',import.meta.url),'utf8');

test('HR 初面使用独立的四题数据，不复用技术深挖问题',()=>{
  const hr=core.slice(core.indexOf('const hrQuestions'),core.indexOf('const ms1Feedback'));
  assert.match(hr,/introduce yourself.*interested in this backend engineering role/is);
  assert.match(hr,/leave your current role.*next team/is);
  assert.match(hr,/disagreed with a teammate or stakeholder/is);
  assert.match(hr,/career goals.*questions do you have for us/is);
  assert.doesNotMatch(hr,/Kafka|idempotency|load and failure/);
});

test('问题、Mock 回答和页面标签按当前面试轮次选择',()=>{
  assert.match(core,/const isHrRound=.*roundTitle===['"]HR 初面['"]/s);
  assert.match(core,/const questionsForRound=.*isHrRound\(\)\?hrQuestions:ms1Questions/s);
  assert.match(core,/const transcriptsForRound=.*isHrRound\(\)\?hrTranscripts:ms1Transcripts/s);
  assert.match(core,/const roundLabels=.*自我介绍.*求职动机.*协作沟通.*职业规划/s);
  assert.match(core,/const currentQuestions=\(\)=>questionsForRound\(\)\.map/);
  assert.match(core,/const firstQuestionForPlan=\(\)=>questionsForRound\(\)\[0\]/);
  assert.match(core,/if\(isHrRound\(\)\)return hrQuestions\[turn\+1\]/);
});

test('HR 对话纠错来自同一份 HR Mock 转录',()=>{
  assert.match(panel,/const hrCorrections=/);
  assert.match(panel,/const correctionsForRound=.*isHrRound\(\)\?hrCorrections:singleCorrections/s);
  assert.match(panel,/correctionsForRound\(\)\[turn\]/);
  assert.match(panel,/transcriptsForRound\(\)\[i\]/);
});

test('HR 报告使用 HR 维度、真实时长和当天日期',()=>{
  const report=core.slice(core.indexOf('function alignedReport'),core.indexOf('views.report'));
  assert.match(report,/reportDate\(\)/);
  assert.match(report,/activeSession\(\)\?\.duration/);
  assert.match(report,/求职动机、岗位匹配和协作表达/);
  assert.doesNotMatch(report,/2026\.07\.14|30 分钟/);
});

test('HR 同题复练和历史记录继续使用 HR 数据',()=>{
  assert.match(core,/const hrRetryMocks=/);
  assert.match(core,/const retryMocksForRound=.*isHrRound\(\)\?hrRetryMocks:retryMocks/s);
  const retry=core.slice(core.indexOf('function alignedRetry'),core.indexOf('function alignedMistakes'));
  assert.match(retry,/retryMocksForRound\(\)\[i\]/);
  assert.match(core,/transcript:retryMocksForRound\(\)\[i\]\.transcript/);
  assert.match(core,/sessionsByInterviewer\[0\]\[0\]\.turnTranscripts=\[\.\.\.hrTranscripts\]/);
  assert.match(core,/sessionsByInterviewer\[0\]\[0\]\.dynamicQuestions=\[\.\.\.hrQuestions\]/);
  assert.match(panel,/messages=questionsForRound\(\)\.map/);
  assert.match(panel,/correctionsForRound\(\)\[i\]/);
  assert.match(core,/open-history-report.*alignBindSession\(session\)/s);
  assert.match(readFileSync(new URL('../assets/interview-alignment.js',import.meta.url),'utf8'),/technicalHrMock.*idempotency.*Kafka.*consumer retry/s);
});
