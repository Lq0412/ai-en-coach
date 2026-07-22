/* Panel interview, complete mock data, and final product UI alignment. */
Object.assign(state,{
  interviewMode:state.interviewMode||'single',
  panelSessions:state.panelSessions||[],
  panelActiveIndex:state.panelActiveIndex||0
});

const PANEL_QUESTIONS=[
  {speaker:0,label:'开场与动机',text:'Please introduce yourself and explain why you are interested in this role.'},
  {speaker:1,label:'经历深挖',text:'Which project best demonstrates your fit, and what did you personally own?'},
  {speaker:2,label:'技术取舍',text:'What alternative did you consider, and why did you reject it?'},
  {speaker:1,label:'结果验证',text:'How did you measure the outcome and manage production risk?'},
  {speaker:2,label:'可靠性',text:'If traffic increased tenfold, where would the system fail first?'},
  {speaker:0,label:'收尾提问',text:'What questions do you have for us about the team or the role?'}
];
const PANEL_SAMPLE_ANSWERS=[
  'I am a backend engineer with five years of experience building reliable commerce systems. I am interested in this role because it combines ownership, scale, and close product collaboration.',
  'I owned the order event pipeline from design through rollout. I defined the service boundary, implemented idempotency, and coordinated the migration with product and operations.',
  'We considered synchronous RPC, but rejected it because peak traffic created cascading latency. I chose Kafka with an outbox pattern to isolate failures and preserve consistency.',
  'We tracked processing latency, duplicate events, and recovery time. The release reduced timeout errors by 37 percent and we used a staged rollout with automatic rollback thresholds.',
  'The database write path would fail first. I would partition hot orders, add back-pressure, and validate the plan with replay traffic before increasing capacity.',
  'How does the team define strong ownership in the first ninety days, and which reliability problem would you want this person to solve first?'
];

function panelMembers(session=activeSession()){
  return session?.snapshot?.interviewers||state.interviewers.slice(0,3);
}
function panelQuestion(session=activeSession()){
  return PANEL_QUESTIONS[Math.min(session?.currentTurn||0,PANEL_QUESTIONS.length-1)];
}
function panelSessionList(){
  const plan=state.plans.find(x=>x.id===state.activePlanId);
  if(plan){plan.panelSessions??=[];state.panelSessions=plan.panelSessions}
  return state.panelSessions||[];
}

state.plans.forEach(plan=>{plan.interviewMode??='single';plan.panelSessions??=[]});

function panelMockTurn(index){
  const q=PANEL_QUESTIONS[index],member=['Mia','Ethan','Lena'][q.speaker];
  return {id:`mock-panel-turn-${index}`,question:q.text,transcript:PANEL_SAMPLE_ANSWERS[index],audioSaved:true,audioDuration:['00:42','01:04','00:58','00:51','00:56','00:44'][index],interviewerIndex:q.speaker,interviewerName:member,evidence:PANEL_SAMPLE_ANSWERS[index].split('.')[0],diagnosis:index===2?'技术取舍清晰，如能补充一项对比数据会更有说服力。':'回答包含明确的个人行动和可验证结果。',target:index===2?'补充同步方案与异步方案的延迟对比。':'用更简短的结论句开场。',retryAttempts:[]};
}
function panelMockPlan(){
  const interviewers=[
    {name:'Mia',role:'HR Manager',style:'温和清晰，关注动机与沟通',focus:'求职动机、英语沟通、团队匹配',voice:'清晰女声'},
    {name:'Ethan',role:'Engineering Lead',style:'连续追问，强调事实和所有权',focus:'个人贡献、技术判断、交付结果',voice:'沉稳男声'},
    {name:'Lena',role:'Senior Engineer',style:'严谨直接，深入架构与可靠性',focus:'架构边界、可靠性、工程质量',voice:'自然女声'}
  ].map(alignNormalizeInterviewer);
  const completedTurns=PANEL_QUESTIONS.map((_,i)=>panelMockTurn(i));
  const completed={id:'mock-panel-completed',interviewMode:'panel',status:'completed',time:'今天 12:08',ts:1784088480000,duration:'24 分钟',currentTurn:6,turns:completedTurns,turnTranscripts:completedTurns.map(x=>x.transcript),dynamicQuestions:PANEL_QUESTIONS.map(x=>x.text),retryAttempts:{0:[],1:[],2:[],3:[],4:[],5:[]},heardQuestions:[],interruptedTurns:[],practiceKey:'panel-full',practiceLabel:'群面模拟',practiceType:'panel',remainingMinutes:0,maxMain:6,reportStatus:'ready',snapshot:{interviewers:JSON.parse(JSON.stringify(interviewers)),plan:{jobName:'后端开发工程师'},practice:{label:'群面模拟',targets:['求职动机','项目所有权','技术取舍','可靠性'],minutes:25}}};
  const inProgressTurns=[panelMockTurn(0),panelMockTurn(1)];
  const inProgress={id:'mock-panel-progress',interviewMode:'panel',status:'in_progress',started:true,time:'今天 16:32',ts:1784104320000,duration:'已保存',currentTurn:2,turns:inProgressTurns,turnTranscripts:inProgressTurns.map(x=>x.transcript),dynamicQuestions:PANEL_QUESTIONS.map(x=>x.text),retryAttempts:{0:[],1:[],2:[],3:[],4:[],5:[]},heardQuestions:[],interruptedTurns:[],practiceKey:'panel-full',practiceLabel:'群面模拟',practiceType:'panel',remainingMinutes:17,maxMain:6,reportStatus:'pending',currentQuestion:PANEL_QUESTIONS[2].text,snapshot:{interviewers:JSON.parse(JSON.stringify(interviewers)),plan:{jobName:'后端开发工程师'},practice:{label:'群面模拟',targets:['简历深挖','技术取舍'],minutes:25}}};
  return alignNormalizePlan({id:'mock-panel-plan',mockData:true,interviewMode:'panel',createdAt:'今天 12:08',sampleMode:false,candidateSource:'已保存简历',focusTags:['简历深挖','岗位能力','英语表达'],snapshot:{jobName:'后端开发工程师',jobDescription:'负责高并发交易服务、异步工作流和生产可观测性。',resumeName:'Backend_Engineer_Resume.pdf',candidateProfile:ALIGN_SAMPLE_PROFILE,focusScope:'简历深挖、岗位能力、英语表达'},interviewers,sessions:interviewers.map(()=>[]),panelSessions:[inProgress,completed],status:'ready'});
}
if(!state.plans.some(x=>x.id==='mock-panel-plan')&&!localStorage.getItem('mock-plan-deleted'))state.plans.push(panelMockPlan());

const originalActivatePlan=alignActivatePlan;
alignActivatePlan=function(id){
  const ready=originalActivatePlan(id),plan=state.plans.find(x=>x.id===id);
  if(plan){state.interviewMode=plan.interviewMode||'single';state.panelSessions=plan.panelSessions||[]}
  return ready;
};
const originalFinishGeneration=alignFinishGeneration;
alignFinishGeneration=function(plan){
  plan.interviewMode=state.interviewMode||'single';plan.panelSessions??=[];
  originalFinishGeneration(plan);
  state.panelSessions=plan.panelSessions;
};
const originalBindSession=alignBindSession;
alignBindSession=function(session){
  if(session.interviewMode==='panel'){
    state.sessionsByInterviewer??=state.interviewers.map(()=>[]);
    state.sessionsByInterviewer[0]??=[];
    if(!state.sessionsByInterviewer[0].some(x=>x.id===session.id))state.sessionsByInterviewer[0].unshift(session);
    state.activeInterviewer=0;
  }
  originalBindSession(session);
  state.interviewMode=session.interviewMode||'single';
  state.panelActiveIndex=panelQuestion(session).speaker;
};

const originalCreatePlanView=alignedCreatePlanV3;
alignedCreatePlanV3=function(){
  const mode=`<section class="interview-mode-section"><span class="align-kicker">面试形式</span><div class="interview-mode-switch"><button class="interview-mode-card ${state.interviewMode==='single'?'active':''}" data-action="panel-mode" data-mode="single"><span class="mode-icon single"><i></i></span><b>单面</b><small>1 位面试官独立提问，约 15 分钟</small></button><button class="interview-mode-card ${state.interviewMode==='panel'?'active':''}" data-action="panel-mode" data-mode="panel"><span class="mode-icon panel"><i></i><i></i><i></i></span><b>群面</b><small>3 位面试官轮流追问你，约 25 分钟</small></button></div></section>`;
  return originalCreatePlanView().replace('<span class="align-kicker">练习重点</span>',`${mode}<span class="align-kicker">练习重点</span>`).replace('<dt>练习重点</dt>',`<dt>面试形式</dt><dd>${state.interviewMode==='panel'?'群面 · 3 位面试官':'单面 · 1 位面试官'}</dd><dt>练习重点</dt>`);
};
views['create-plan']=alignedCreatePlanV3;

const originalRoundsView=alignedRoundsV3;
function panelRoundsView(){
  const plan=alignNormalizePlan(alignCurrentPlan()),members=plan.interviewers.slice(0,3),recent=plan.panelSessions[0];
  return `<div class="align-page panel-plan-page">${alignTop('面试计划','home')}<header class="panel-plan-head"><span class="align-kicker">Panel Interview · 多面试官模拟</span><h1>${esc(plan.snapshot.jobName)}</h1><p>25 分钟 · 6 题 · 3 位面试官</p></header><section class="panel-plan-roster">${members.map(p=>`<div><span class="panel-member-initial">${esc(p.name.charAt(0))}</span><p><b>${esc(p.name)}</b><small>${esc(p.role)}</small></p></div>`).join('')}</section><section class="panel-plan-path"><small>本场追问路径</small><p>经历与动机 <i>→</i> 项目深挖 <i>→</i> 技术取舍 <i>→</i> 系统可靠性</p></section><p class="panel-plan-memory"><b>共享回答上下文</b>下一位面试官会沿用你刚才的回答继续深挖，不会重新从头提问。</p><button class="align-btn primary block panel-plan-start" data-action="panel-start-session">${recent?.status==='in_progress'?'继续多面试官模拟':'开始多面试官模拟'} · 约 25 分钟</button>${state.contextSheet?`<div class="specialty-sheet"><div class="specialty-panel"><div class="topbar"><h2>本计划背景资料</h2><button class="ghost-icon" data-action="align-close-context">×</button></div><div class="detail-card"><h3>${esc(plan.snapshot.jobName)}</h3><p>${esc(plan.snapshot.jobDescription)}</p></div></div></div>`:''}</div>`;
}
alignedRoundsV3=function(){const plan=alignCurrentPlan();if((plan?.interviewMode||state.interviewMode)==='panel')return panelRoundsView();const view=originalRoundsView();return plan?.id==='agent-mock-plan'?view.replace('完整模拟 · 约 15 分钟',`完整模拟 · 约 ${plan.mockDuration} 分钟`):view};
views.rounds=alignedRoundsV3;

function panelSessionsView(){
  const sessions=panelSessionList();
  return `<div class="align-page">${alignTop('群面历史','rounds')}<h1 class="align-title">多面试官场次</h1><p class="align-lead">续练、对话和报告都保留每一题的提问人。</p>${sessions.map(session=>`<section class="align-session"><div class="align-session-head"><span class="session-type">群面模拟 · 3 位面试官</span><span class="session-status ${session.status==='in_progress'?'active':''}">${session.status==='in_progress'?'进行中':'已完成'}</span></div><h3>${esc(session.time)} · ${esc(session.duration)}</h3><p>${session.turns.length} 个有效回答${session.status==='in_progress'?`，剩余 ${session.remainingMinutes} 分钟`:''}</p><div class="session-speaker-mini">${panelMembers(session).map((p,i)=>`<span>${characterAvatar(i)}<b>${esc(p.name)}</b></span>`).join('')}</div><div class="align-session-actions">${session.status==='in_progress'?`<button class="align-btn primary" data-action="panel-resume" data-session-id="${session.id}">继续群面</button>`:`<button class="align-btn primary" data-action="panel-report" data-session-id="${session.id}">查看报告</button>`}</div></section>`).join('')}</div>`;
}

function panelStartSession(){
  const existing=panelSessionList().find(x=>x.status==='in_progress');
  if(existing){alignBindSession(existing);existing.started=true;state.interviewPhase='ai';state.route='practice';render();return}
  const members=state.interviewers.slice(0,3),id=`panel-${Date.now()}`;
  const session={id,interviewMode:'panel',status:'in_progress',time:'刚刚',ts:Date.now(),duration:'已保存',currentTurn:0,turns:[],turnTranscripts:[],dynamicQuestions:PANEL_QUESTIONS.map(x=>x.text),retryAttempts:{0:[],1:[],2:[],3:[],4:[],5:[]},heardQuestions:[],interruptedTurns:[],practiceKey:'panel-full',practiceLabel:'群面模拟',practiceType:'panel',remainingMinutes:25,maxMain:6,reportStatus:'pending',currentQuestion:PANEL_QUESTIONS[0].text,snapshot:{plan:JSON.parse(JSON.stringify(alignCurrentPlan().snapshot)),interviewers:JSON.parse(JSON.stringify(members)),practice:{label:'群面模拟',targets:['求职动机','简历深挖','技术取舍','可靠性'],minutes:25}}};
  session.started=true;panelSessionList().unshift(session);alignBindSession(session);state.interviewPhase='ai';state.route='practice';render();
}

function panelCorrectionForTurn(turn){
  const correctionsMap=[
    {highlights:'I <span class="answer-mistake">am</span> a backend engineer with five years of experience building reliable commerce systems. I <span class="answer-mistake">is</span> interested in this role because it combines ownership, scale, and close product collaboration.',fixes:'<aside class="answer-corrections"><b>发现 2 处表达问题</b><div class="answer-fix-list"><span class="answer-fix"><del>am</del><i>→</i><strong>\'m</strong><em>口语自我介绍中，I am 常缩读为 I\'m，更自然流畅。</em></span><span class="answer-fix"><del>is</del><i>→</i><strong>am</strong><em>第一人称主语 I 后应使用 am，不是 is。</em></span></div></aside>'},
    {highlights:'I <span class="answer-mistake">owned</span> the order event pipeline from design through rollout. I <span class="answer-mistake">defined</span> the service boundary, <span class="answer-mistake">implemented</span> idempotency, and coordinated the migration with product and operations.',fixes:'<aside class="answer-corrections"><b>发现 3 处表达问题</b><div class="answer-fix-list"><span class="answer-fix"><del>owned</del><i>→</i><strong>was responsible for</strong><em>owned 在此语境偏非正式，用 was responsible for 更适合面试场景。</em></span><span class="answer-fix"><del>defined</del><i>→</i><strong>defined the</strong><em>可在 defined 后补充 the，使语义更完整。</em></span><span class="answer-fix"><del>implemented</del><i>→</i><strong>implemented</strong><em>此处可补充 "the" — implemented the idempotency 更准确。</em></span></div></aside>'},
    {highlights:'We <span class="answer-mistake">test</span> the system by <span class="answer-mistake">send</span> two thousand requests per second, and it <span class="answer-mistake">didn\'t failed</span> when Kafka was down.',fixes:'<aside class="answer-corrections"><b>发现 3 处表达问题</b><div class="answer-fix-list"><span class="answer-fix"><del>test</del><i>→</i><strong>tested</strong><em>描述已经完成的验证，应使用过去时。</em></span><span class="answer-fix"><del>send</del><i>→</i><strong>sending</strong><em>介词 by 后使用动名词。</em></span><span class="answer-fix"><del>didn\'t failed</del><i>→</i><strong>didn\'t fail</strong><em>助动词 did 后使用动词原形。</em></span></div></aside>'}
  ];
  const idx=(turn.interviewerIndex||0)%correctionsMap.length;
  return correctionsMap[idx];
}
function panelConversation(session){
  const current=panelQuestion(session),members=panelMembers(session);
  const messages=session.turns.map(turn=>{
    const correction=panelCorrectionForTurn(turn);
    return `<article class="chat-bubble interviewer-bubble"><small>${esc(turn.interviewerName||members[turn.interviewerIndex]?.name||'面试官')}</small><p>${esc(turn.question)}</p></article><article class="chat-bubble candidate-bubble"><small>你</small><p class="sample-answer">${correction.highlights}</p>${correction.fixes}</article>`;
  }).join('');
  return `<section class="interview-chat-view panel-chat-view"><header class="interview-chat-head"><span><small>群面完整上下文</small><h2>面试对话</h2></span><button class="ghost-icon" data-action="close-interview-chat" aria-label="关闭对话">×</button></header>${messages}<article class="chat-bubble interviewer-bubble current"><small>${esc(members[current.speaker]?.name||'面试官')} · 当前问题</small><p>${esc(current.text)}</p><button class="bubble-replay" data-action="replay-question">↻ 重新播放问题</button></article><button class="secondary btn-wide" data-action="close-interview-chat">返回面试</button></section>`;
}
function panelLiveSession(){
  const session=activeSession(),current=panelQuestion(session),members=panelMembers(session),speaker=members[current.speaker]||members[0];
  return `<section class="live-session panel-live-session"><div class="live-person"><div class="live-orb"><i></i><i></i>${characterAvatar(current.speaker,true)}</div><h2>正在和 ${esc(speaker.name)} 实时对话</h2><p>直接开口即可。系统会自动识别停顿，并在你说完后由下一位面试官提问。</p></div><div class="panel-interviewer-strip">${members.map((p,i)=>`<div class="panel-interviewer ${i===current.speaker?'active':''}">${characterAvatar(i)}<b>${esc(p.name)}</b><small>${esc(p.role)}</small></div>`).join('')}</div><div class="live-wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="live-listening-row"><small>正在聆听…</small><button data-action="interrupt-live">打断</button></div><div class="live-transcript-preview"><small>实时转录</small><p>${esc(state.currentTranscript||'')}</p></div><button class="end-live" data-action="toggle-live">结束实时对话</button></section>`;
}
function panelPractice(){
  const session=activeSession(),turn=Math.min(session?.currentTurn||0,5),phase=state.interviewPhase,current=panelQuestion(session),members=panelMembers(session),speaker=members[current.speaker]||members[0],answer=state.currentTranscript||'';
  const phaseCopy={connecting:['连接中','正在建立受保护的多面试官语音连接'],ai:[`${speaker.name} 正在提问`,'你开口后，当前面试官会自动停止播放'],user:['请回答','请用英文回答，其他面试官不会抢话'],processing:['正在处理回答','保存转录后，下一位面试官将继续提问']}[phase]||[`${speaker.name} 正在提问`,'请准备回答'];
  if(state.interviewChatOpen)return `<div class="practice panel-practice">${panelConversation(session)}</div>`;
  const contextLine=turn>0?`${speaker.name} 正在基于你刚才的回答继续追问`:`${speaker.name} 正在开始本场第一问`;
  return `<div class="practice panel-session-scene"><header class="single-scene-head"><button class="single-scene-back" data-route="rounds" aria-label="返回面试计划">‹</button><h1>多面试官模拟</h1><span class="single-scene-spacer" aria-hidden="true"></span></header><main class="panel-scene-main"><div class="panel-scene-members" aria-label="本场面试官">${members.map((p,i)=>`<div class="panel-scene-member ${i===current.speaker?'active':''}"><span class="panel-scene-initial">${esc(p.name.charAt(0))}</span><span><b>${esc(p.name)}</b><small>${esc(p.role)}</small></span></div>`).join('')}</div><section class="single-scene-person panel-scene-speaker"><span class="panel-scene-speaker-initial">${esc(speaker.name.charAt(0))}</span><h2>${esc(speaker.name)}</h2><p>${esc(speaker.role)}</p></section><section class="single-scene-question panel-scene-question"><small>第 ${turn+1} / 6 题 · ${esc(current.label)}</small><b>${esc(contextLine)}</b><p>${esc(current.text)}</p><em>${phaseCopy[0]}</em><div class="single-scene-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></section>${phase==='user'?`<textarea class="single-scene-transcript" data-answer-transcript aria-label="实时转录">${esc(answer)}</textarea>${state.answerError?`<div class="form-error">${esc(state.answerError)}</div>`:''}`:''}</main><footer class="single-scene-controls"><button class="single-scene-control" data-action="toggle-interview-chat" aria-label="查看对话"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v10H9l-4 3v-13Z"/></svg><small>对话</small></button><button class="single-scene-primary ${phase==='user'?'recording':''}" data-action="ms1-answer" ${['connecting','processing'].includes(phase)?'disabled':''}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4M9 21h6"/></svg><small>${phase==='user'?'提交回答':'开口回答'}</small></button><button class="single-scene-control" data-action="end-early" aria-label="结束多面试官模拟"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg><small>结束</small></button></footer></div>`;
}
const originalUnifiedPractice=unifiedInterviewPractice;
function singleLiveSession(){
  const p=state.interviewers[0]||state.interviewers[0];
  return `<section class="live-session panel-live-session"><div class="live-person"><div class="live-orb"><i></i><i></i>${characterAvatar(0,true)}</div><h2>正在和 ${esc(p?.name||'面试官')} 实时对话</h2><p>直接开口即可。系统会自动识别停顿，并在你说完后由面试官继续提问。</p></div><div class="live-wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="live-listening-row"><small>正在聆听…</small><button data-action="interrupt-live">打断</button></div><div class="live-transcript-preview"><small>实时转录</small><p>${esc(state.currentTranscript||'')}</p></div><button class="end-live" data-action="toggle-live">结束实时对话</button></section>`;
}
function singlePracticeAligned(){
  const interviewerIndex=state.activeInterviewer||0,p=state.interviewers[interviewerIndex]||state.interviewers[0],turn=Math.min(state.interviewTurn,3),phase=state.interviewPhase,question=currentQuestions()[turn],answer=state.turnTranscripts[turn]||(phase==='user'?state.currentTranscript:'');
  const phaseCopy={connecting:['连接中','正在建立受保护的语音连接'],ai:[`${p?.name||'面试官'} 正在提问`,'你开口后，面试官会自动停止播放'],user:['请回答','请用英文回答，面试官不会在你持续说话时抢话'],processing:['正在处理回答','保存转录后，面试官将继续提问']}[phase]||[`${p?.name||'面试官'} 正在提问`,'请准备回答'];
  if(state.interviewChatOpen){
    const correction=correctionsForRound()[turn]||{highlights:answer,fixes:''};
    return `<div class="practice panel-practice"><section class="interview-chat-view panel-chat-view"><header class="interview-chat-head"><span><small>${esc(p?.name||'面试官')} · ${esc(p?.role||'面试官')}</small><h2>面试对话</h2></span><button class="ghost-icon" data-action="close-interview-chat" aria-label="关闭对话">×</button></header>${Array.from({length:turn},(_,i)=>{const q=currentQuestions()[i],c=correctionsForRound()[i]||{highlights:state.turnTranscripts[i]||transcriptsForRound()[i],fixes:''};return `<article class="chat-bubble interviewer-bubble"><small>${esc(p?.name||'面试官')}</small><p>${esc(q)}</p></article><article class="chat-bubble candidate-bubble"><small>你</small><p class="sample-answer">${c.highlights}</p>${c.fixes}</article>`}).join('')}<article class="chat-bubble interviewer-bubble current"><small>${esc(p?.name||'面试官')} · 当前问题</small><p>${esc(question)}</p><button class="bubble-replay" data-action="replay-question">↻ 重新播放问题</button></article><button class="secondary btn-wide" data-action="close-interview-chat">返回面试</button></section></div>`;
  }
  const isRoleSession=activeSession()?.practiceKey==='role-chat';
  const turnLabels=isRoleSession?['开场','本地特色','旅行建议','深入交流']:roundLabels();
  if(state.liveMode)return `<div class="practice panel-practice">${singleLiveSession()}</div>`;
  return `<div class="practice single-interview-scene"><header class="single-scene-head"><button class="single-scene-back" data-route="rounds" aria-label="返回面试计划">‹</button><h1>${isRoleSession?'场景对话':esc(p?.roundTitle||activeSession()?.practiceLabel||'本轮面试')}</h1><span class="single-scene-spacer" aria-hidden="true"></span></header><main class="single-scene-main"><div class="single-scene-person">${characterAvatar(interviewerIndex,true)}<h2>${esc(p?.name||'面试官')}</h2><p>${esc(p?.role||'面试官')}</p></div><section class="single-scene-question"><small>${turnLabels[turn]}</small><p>${esc(question)}</p><em>${phase==='ai'?'正在播放':phase==='user'?'正在聆听':'正在处理'}</em><div class="single-scene-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></section>${phase==='user'?`<textarea class="single-scene-transcript" data-answer-transcript aria-label="实时转录">${esc(answer)}</textarea>${state.answerError?`<div class="form-error">${esc(state.answerError)}</div>`:''}`:''}</main><footer class="single-scene-controls"><button class="single-scene-control" data-action="toggle-interview-chat" aria-label="查看对话"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v10H9l-4 3v-13Z"/></svg><small>对话</small></button><button class="single-scene-primary ${phase==='user'?'recording':''}" data-action="ms1-answer" ${['connecting','processing'].includes(phase)?'disabled':''}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4M9 21h6"/></svg><small>${phase==='user'?'提交回答':'开口回答'}</small></button><button class="single-scene-control" data-action="end-early" aria-label="结束面试"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg><small>结束</small></button></footer></div>`;
}
unifiedInterviewPractice=function(){const session=activeSession();if(session?.interviewMode==='panel')return panelPractice();if(session&&(session.interviewMode||'single')==='single')return singlePracticeAligned();return originalUnifiedPractice()};
views.practice=()=>addSampleAnswerFeedback(unifiedInterviewPractice());

function panelSubmitAnswer(){
  const session=activeSession(),answer=state.currentTranscript.trim();
  if(answer.length<15){state.answerError='回答过短或无法识别，本题不会计数。';render();return}
  const current=panelQuestion(session),members=panelMembers(session),speaker=members[current.speaker];
  session.turns.push({id:`turn-${session.id}-${session.turns.length}`,question:current.text,transcript:answer,audioSaved:true,audioDuration:'00:48',interviewerIndex:current.speaker,interviewerName:speaker.name,evidence:answer.split(/[.!?]/)[0],diagnosis:answer.length>90?'回答包含具体行动，技术取舍可以更聚焦。':'已经说明主要行动，还需补充判断依据和结果。',target:'用一句话明确你的选择与验证结果。',retryAttempts:[]});
  session.currentTurn=session.turns.length;session.turnTranscripts=session.turns.map(x=>x.transcript);session.remainingMinutes=Math.max(0,25-session.turns.length*4);session.ts=Date.now();state.interviewTurn=session.currentTurn;state.turnTranscripts=[...session.turnTranscripts];state.interviewPhase='processing';state.currentTranscript='';render();
  setTimeout(()=>{if(session.currentTurn>=6){session.status='completed';session.duration='24 分钟';session.reportStatus='generating';state.sessionComplete=true;alignCompleteReport(session)}else{const next=panelQuestion(session);session.currentQuestion=next.text;state.panelActiveIndex=next.speaker;state.currentTranscript=PANEL_SAMPLE_ANSWERS[session.currentTurn];state.interviewPhase='ai';alignPersist();render()}},600);
}

const singleCorrections=[
  {highlights:'I <span class="answer-mistake">build</span> an e-commerce microservices system that <span class="answer-mistake">process</span> order, inventory, and payment events across three regions.',fixes:'<aside class="answer-corrections"><b>发现 2 处表达问题</b><div class="answer-fix-list"><span class="answer-fix"><del>build</del><i>→</i><strong>built</strong><em>描述已完成的项目应使用过去时。</em></span><span class="answer-fix"><del>process</del><i>→</i><strong>processed</strong><em>与主语保持时态一致，使用过去时。</em></span></div></aside>'},
  {highlights:'I designed the idempotency layer and <span class="answer-mistake">implemented</span> the Kafka consumer retry strategy, <span class="answer-mistake">include</span> transaction boundaries and duplicate-event handling.',fixes:'<aside class="answer-corrections"><b>发现 2 处表达问题</b><div class="answer-fix-list"><span class="answer-fix"><del>implemented</del><i>→</i><strong>implemented the</strong><em>补充冠词使语义更完整。</em></span><span class="answer-fix"><del>include</del><i>→</i><strong>including</strong><em>此处需要现在分词形式表示包含关系。</em></span></div></aside>'},
  {highlights:'We <span class="answer-mistake">choose</span> asynchronous messaging over synchronous service calls for decoupling and resilience, while <span class="answer-mistake">accept</span> eventual consistency and additional operational complexity.',fixes:'<aside class="answer-corrections"><b>发现 2 处表达问题</b><div class="answer-fix-list"><span class="answer-fix"><del>choose</del><i>→</i><strong>chose</strong><em>描述过去的决策应使用过去时。</em></span><span class="answer-fix"><del>accept</del><i>→</i><strong>accepting</strong><em>while 后应使用现在分词表示伴随状态。</em></span></div></aside>'},
  {highlights:'We <span class="answer-mistake">run</span> load tests and broker-failure drills, <span class="answer-mistake">sustained</span> two thousand events per second, and <span class="answer-mistake">reduce</span> duplicate payment alerts by eighty percent.',fixes:'<aside class="answer-corrections"><b>发现 3 处表达问题</b><div class="answer-fix-list"><span class="answer-fix"><del>run</del><i>→</i><strong>ran</strong><em>描述已完成的测试应使用过去时。</em></span><span class="answer-fix"><del>sustained</del><i>→</i><strong>sustaining</strong><em>并列动词应保持形式一致，使用现在分词。</em></span><span class="answer-fix"><del>reduce</del><i>→</i><strong>reduced</strong><em>描述已实现的结果应使用过去时。</em></span></div></aside>'}
];
const hrCorrections=[
  {highlights:'I have worked as a backend engineer <span class="answer-mistake">since five years</span>, and I am interested in this role because I want to build reliable products for global users.',fixes:'<aside class="answer-corrections"><b>发现 1 处表达问题</b><div class="answer-fix-list"><span class="answer-fix"><del>since five years</del><i>→</i><strong>for five years</strong><em>表示一段持续时间时使用 for。</em></span></div></aside>'},
  {highlights:'I am leaving because my current role has limited ownership. In my next team, I want <span class="answer-mistake">a bigger ownership</span>, clear feedback, and closer collaboration with product.',fixes:'<aside class="answer-corrections"><b>发现 1 处表达问题</b><div class="answer-fix-list"><span class="answer-fix"><del>a bigger ownership</del><i>→</i><strong>greater ownership</strong><em>ownership 通常不可数，使用 greater 更自然。</em></span></div></aside>'},
  {highlights:'I disagreed with a product manager about the release scope. I explained the reliability risk, listened to the deadline concern, and we agreed on a smaller staged launch.',fixes:''},
  {highlights:'In the next three years, I hope to grow into an engineer who can lead projects and mentor others. I would also like to <span class="answer-mistake">discuss about</span> how the team measures success in the first ninety days.',fixes:'<aside class="answer-corrections"><b>发现 1 处表达问题</b><div class="answer-fix-list"><span class="answer-fix"><del>discuss about</del><i>→</i><strong>discuss</strong><em>discuss 是及物动词，后面直接接讨论内容。</em></span></div></aside>'}
];
const correctionsForRound=()=>isHrRound()?hrCorrections:singleCorrections;
function historyConversationView(){
  const plan=state.plans.map(alignNormalizePlan).find(p=>p.id===state.historyChatPlanId);
  if(!plan)return completeHistoryView();
  const isPanel=plan.interviewMode==='panel';
  const jobName=esc(plan.snapshot.jobName||'面试');
  let messages='';
  if(isPanel){
    const session=(plan.panelSessions||[])[0]||{turns:[{question:PANEL_QUESTIONS[0].text,interviewerName:'Lena'},{question:PANEL_QUESTIONS[1].text,interviewerName:'Marcus'},{question:PANEL_QUESTIONS[2].text,interviewerName:'Lena'}],currentTurn:3};
    const members=panelMembers(session);
    messages=session.turns.map((turn,i)=>{
      const correction=panelCorrectionForTurn(turn);
      return `<article class="chat-bubble interviewer-bubble"><small>${esc(turn.interviewerName||members[turn.interviewerIndex]?.name||'面试官')}</small><p>${esc(turn.question)}</p></article><article class="chat-bubble candidate-bubble"><small>你</small><p class="sample-answer">${correction.highlights}</p>${correction.fixes}</article>`;
    }).join('');
  }else{
    const p=state.interviewers[0]||{name:'Mia',role:'项目深挖面试官'};
    messages=questionsForRound().map((q,i)=>{
      const c=correctionsForRound()[i]||{highlights:transcriptsForRound()[i],fixes:''};
      return `<article class="chat-bubble interviewer-bubble"><small>${esc(p.name)}</small><p>${esc(q)}</p></article><article class="chat-bubble candidate-bubble"><small>你</small><p class="sample-answer">${c.highlights}</p>${c.fixes}</article>`;
    }).join('');
  }
  return `<section class="interview-chat-view panel-chat-view"><header class="interview-chat-head"><span><small>${isPanel?'群面完整上下文':'面试完整上下文'}</small><h2>${jobName} · 面试对话</h2></span><button class="ghost-icon" data-action="close-history-chat" aria-label="关闭对话">×</button></header>${messages}<button class="secondary btn-wide" data-action="close-history-chat">返回面试历史</button></section>`;
}
function completeHistoryView(){
  const plans=state.plans.map(alignNormalizePlan),rawSceneRecords=state.scenePracticeHistory||[],sceneRecords=rawSceneRecords.filter((record,index,records)=>{const key=record.configId||`${record.title||''}|${record.partner||''}`;return records.findIndex(item=>(item.configId||`${item.title||''}|${item.partner||''}`)===key)===index});
  if(state.historyExpandedPlanId===undefined)state.historyExpandedPlanId=plans[0]?.id||'';
  const planCard=(plan,planIndex)=>{
    const isPanel=plan.interviewMode==='panel',rounds=isPanel?[{name:'群面模拟',role:`${plan.interviewers.length} 位面试官`,person:plan.interviewers.map(item=>item.name).join(' / '),sessions:plan.panelSessions||[]}]:plan.interviewers.map((person,index)=>({name:person.roundTitle||`第 ${index+1} 轮`,role:person.role,person:person.name,sessions:plan.sessions[index]||[]}));
    const roundState=round=>{const latest=[...round.sessions].sort((a,b)=>(b.ts||0)-(a.ts||0))[0],active=round.sessions.find(item=>item.status==='in_progress'),complete=round.sessions.find(item=>item.status==='completed');return {latest,active,complete,done:Boolean(complete)}};
    const states=rounds.map(roundState),completed=states.filter(item=>item.done).length,hasActive=states.some(item=>item.active),activeIndex=Math.max(0,states.findIndex(item=>item.active)>=0?states.findIndex(item=>item.active):states.findIndex(item=>!item.done)>=0?states.findIndex(item=>!item.done):rounds.length-1),expanded=state.historyExpandedPlanId===plan.id;
    const rows=rounds.map((round,index)=>{const status=states[index],isActive=index===activeIndex&&!status.done,mode=status.active?'continue':status.done?'report':isActive?'start':'locked',label=status.active?'进行中':status.done?'已完成':isActive?'下一轮':'未开始';return `<button class="history-round-row ${mode}" data-action="history-round-action" data-mode="${mode}" data-plan-id="${plan.id}" data-index="${index}" ${mode==='locked'?'disabled':''}><span class="history-round-index">${String(index+1).padStart(2,'0')}</span><span class="history-round-copy"><b>${esc(round.name)}</b><small>${esc(round.person)} · ${esc(round.role)}</small></span><em>${label}</em><i>${mode==='locked'?'':'›'}</i></button>`}).join('');
    const primaryState=states[activeIndex],primaryMode=hasActive?'continue':completed===rounds.length?'plan':primaryState?.done?'report':'start',activeRound=rounds[activeIndex],primaryLabel=hasActive?`继续${activeRound?.name||'本轮面试'}`:completed===rounds.length?'查看面试计划':`开始${activeRound?.name||'本轮面试'}`,progressLabel=hasActive?'进行中':completed===rounds.length?'已完成':`已完成 ${completed} / ${rounds.length} 轮`;
    return `<article class="history-plan-card ${expanded?'expanded':''}"><button class="history-plan-summary" data-action="toggle-history-plan" data-plan-id="${plan.id}" aria-expanded="${expanded}"><small>${isPanel?'群面':'单面'} · ${rounds.length} 轮 · ${esc(plan.createdAt||'刚刚')}</small><span><h2>${esc(plan.snapshot.jobName||'示例面试计划')}</h2><em>${progressLabel}</em></span><span class="history-plan-progress ${completed===rounds.length?'complete':''}"><i style="width:${rounds.length?completed/rounds.length*100:0}%"></i></span><b>${expanded?'收起':'展开'}</b></button>${expanded?`<div class="history-round-list">${rows}</div><button class="history-plan-primary" data-action="history-round-action" data-mode="${primaryMode}" data-plan-id="${plan.id}" data-index="${activeIndex}">${primaryLabel}</button>`:''}</article>`;
  };
  const sceneCard=record=>`<article class="history-plan-card scene-history-card"><div class="scene-history-summary"><small>场景练习 · ${esc(record.partner||'SpeakUp 角色')} · ${esc(record.createdAt||'刚刚')}</small><span><h2>${esc(record.title||'英语场景练习')}</h2><em>${record.status==='completed'?'已完成':'已保存'}</em></span><div class="scene-history-stats"><b>${record.turns.length} / 4 轮</b><b>${record.durationMinutes} 分钟</b><b>${record.correctionCount} 条建议</b></div></div><div class="scene-history-actions"><button data-action="open-scene-summary" data-scene-id="${record.id}">查看总结</button><button data-action="restart-scene-record" data-scene-id="${record.id}">再练一次</button></div></article>`;
  const allItems=[...sceneRecords.map(sceneCard),...plans.map(planCard)];
  return `<div class="history-page history-plans-page"><header class="history-plans-head"><div><h1>练习记录</h1><p>面试计划和场景口语练习都会保存在这里。</p></div><span>${allItems.length} 项练习</span></header>${allItems.length?`<section class="history-plan-list">${allItems.join('')}</section>`:'<div class="empty-state"><b>还没有练习记录</b><p>创建面试或完成场景练习后，会在这里统一展示。</p><button class="primary btn-wide" data-route="agent-chat">开始练习</button></div>'}</div>`;
}
alignedHomeV3=completeHistoryView;
window.historyConversationView=historyConversationView;
views.home=()=>{if(state.historyChatOpen)return historyConversationView();return completeHistoryView()};

function careerContextView(){
  return `<div class="career-context-page">${topbar('SpeakUp','agent-chat')}<main class="career-context-chat"><p class="career-context-date">周五 · 系统设计面试</p><article class="context-agent-turn"><span class="context-agent-mark">S</span><div><b>SpeakUp</b><p>我记得你在准备全球团队的后端岗位，也记得高并发订单系统是你最常用的项目。对比最近 6 次练习，这轮不用再练自我介绍，先补“技术取舍与量化依据”。</p></div></article><article class="context-user-turn">为什么是这个重点？</article><article class="context-agent-turn"><span class="context-agent-mark">S</span><div><b>SpeakUp</b><p>过去 3 轮，你都能先给结论，但回答“为什么没选另一个方案”时缺少流量、可靠性或业务结果。</p><p>同时，时态错误已经从每轮 3 处降到 1 处，所以我不会再把它排在最前面。</p><section class="context-evidence"><small>SpeakUp Memory 正在使用</small><dl><div><dt>目标岗位</dt><dd>后端开发工程师 · 全球团队</dd></div><div><dt>真实项目</dt><dd>高并发订单系统</dd></div><div><dt>已经改善</dt><dd>回答结构、时态一致性</dd></div><div><dt>反复卡点</dt><dd>量化结果、替代方案</dd></div></dl></section></div></article><article class="context-user-turn">那下一轮怎么练？</article><article class="context-agent-turn"><span class="context-agent-mark">S</span><div><b>SpeakUp</b><p>我会让技术负责人沿着这个真实项目连续追问，并要求你说明选择、替代方案和结果证据。</p><section class="context-next-action"><small>由 Memory 生成的下一轮</small><strong>系统设计 · 技术取舍深挖</strong><span>约 15 分钟 · 使用高并发订单系统经历</span><button data-route="practice">根据这些 Memory 继续练</button></section></div></article><p class="career-context-control">SpeakUp 使用的长期信息由你掌控，可以随时查看、修改和删除。</p></main></div>`;
}
views['career-context']=careerContextView;

function portalInterviewStartView(){
  const rounds=[['01','HR 初面','Mia · HR 经理','15 分钟'],['02','技术深挖','Ethan · 工程经理','20 分钟'],['03','系统设计','Noah · 系统设计面试官','20 分钟'],['04','综合终面','Lena · 技术负责人','15 分钟']];
  return `<div class="portal-start-page">${topbar('SpeakUp','agent-chat')}<main class="portal-start-thread"><article class="portal-start-user">我下周要面试后端开发工程师，JD 和简历已经发给你了。</article><article class="portal-start-agent"><span class="context-agent-mark">S</span><div><b>SpeakUp</b><p>收到。我会先按常见的一对一面试流程，结合岗位要求和你的项目经历安排四轮练习。</p></div></article><section class="portal-start-plan"><small>面试计划已生成</small><h1>后端开发工程师</h1><p>4 轮一对一面试 · 预计 70 分钟</p><ol>${rounds.map(([index,title,person,time])=>`<li><span>${index}</span><div><b>${title}</b><small>${person}</small></div><em>${time}</em></li>`).join('')}</ol><button data-route="rounds">从 HR 初面开始</button></section><p class="portal-start-note">所有轮次共用这次确认的 JD 与简历快照。</p></main></div>`;
}
views['portal-interview-start']=portalInterviewStartView;

function portalInterviewPracticeView(){
  return `<div class="interview-proof-page">${topbar('HR 初面 · Mia','portal-interview-start')}<main class="interview-proof-main"><header class="interview-proof-progress"><span>2 / 4 轮</span><i><b></b></i><small>项目经历深挖</small></header><section class="interview-proof-question"><small>Mia · 面试官</small><p>Tell me about a project you owned end to end.</p><div><button>▶ 发音</button><button>翻译</button></div></section><article class="interview-proof-answer"><header><span class="interview-proof-wave"><i></i><i></i><i></i><i></i><i></i><i></i></span><b>0:18</b><em>回听</em></header><p>I owned the product definition for five years and worked with design and engineering to ship it.</p></article><section class="interview-proof-followup"><small>根据你的回答继续追问</small><p>You said you owned the product definition. What was the hardest trade-off you made, and what evidence supported that decision?</p></section><button class="interview-proof-action" data-route="practice">继续回答这道追问</button></main></div>`;
}
views['portal-interview-practice']=portalInterviewPracticeView;

function portalAgentDebriefView(){
  return `<div class="agent-debrief-page">${topbar('SpeakUp','portal-interview-practice')}<main class="agent-debrief-main"><p class="agent-debrief-time">模拟结束 · 刚刚</p><article class="agent-debrief-user">这一轮结束了。先告诉我最应该改哪一点。</article><article class="agent-debrief-turn"><span class="context-agent-mark">S</span><div><b>SpeakUp</b><p class="agent-debrief-priority">这一轮先改一件事：讲技术方案时，先说为什么这样选，再用一个量化结果收尾。</p><p>你的架构和职责已经说清楚了，但两次都没有解释为什么不用另一个方案。下一轮我只追问这个取舍。</p><section class="agent-debrief-evidence"><small>我从刚才的回答里看到</small><dl><div><dt>已经说清</dt><dd>系统边界、个人职责</dd></div><div><dt>连续缺少</dt><dd>替代方案、量化依据</dd></div></dl></section></div></article><section class="agent-debrief-next"><small>下一道追问</small><p>What was the hardest trade-off you made, and what evidence supported that decision?</p><button data-route="portal-interview-practice">按这个重点再答一次</button></section></main></div>`;
}
views['portal-agent-debrief']=portalAgentDebriefView;
views['portal-evidence-report']=portalAgentDebriefView;

function portalPanelPracticeView(){
  const members=[['M','Mia','HR'],['E','Ethan','工程经理'],['N','Noah','系统设计']];
  return `<div class="panel-proof-page">${topbar('多面试官模拟','portal-interview-start')}<main class="panel-proof-main"><header class="panel-proof-meta"><span>后端开发工程师</span><b>第 3 / 6 题</b></header><section class="panel-proof-roster">${members.map(([initial,name,role],index)=>`<div class="${index===1?'active':''}"><span>${initial}</span><b>${name}</b><small>${role}</small></div>`).join('')}</section><article class="panel-proof-context"><small>Ethan 正在基于你刚才的 Kafka 回答继续追问</small><p>What alternative did you consider, and why did you reject it?</p><span><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span></article><section class="panel-proof-shared"><small>三位面试官共享同一段上下文</small><p>Mia 负责经历与动机，Ethan 深挖技术取舍，Noah 会继续追问系统边界和可靠性。</p></section><button class="panel-proof-action" data-action="portal-group-start">进入完整多面试官模拟</button></main></div>`;
}
views['portal-panel-practice']=portalPanelPracticeView;

function ieltsPart2PracticeView(){
  const bars='<span class="ielts-proof-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>';
  return `<div class="ielts-proof-page">${topbar('IELTS · Part 2','scenes')}<main class="ielts-proof-main"><section class="ielts-proof-topic"><small>TOPIC CARD</small><h1>Describe a challenging project you completed</h1><p>You should say what it was, why it was challenging, what you did, and explain what you learned.</p></section><div class="ielts-proof-timer"><span>已说</span><b>01:24</b><em>/ 建议 02:00</em></div><section class="ielts-proof-lines"><article><header>${bars}<span>句 1 · 0:12</span><em class="ok">表达清楚</em></header><p>The project involved several teams, and the deadline was extremely tight.</p></article><article><header>${bars}<span>句 2 · 0:14</span><em class="fix">1 处可优化</em></header><p>At first I felt <s>very nervously</s>, because I had never led a migration before.</p><div><s>very nervously</s><span>→</span><b>very nervous</b><small>be 动词后使用形容词</small></div></article><article><header>${bars}<span>句 3 · 0:16</span><em class="ok">证据具体</em></header><p>I clarified ownership, reduced the scope, and we launched without customer downtime.</p></article></section><section class="ielts-proof-summary"><small>本轮重点</small><p><b>继续补足最后 36 秒：</b>说明你学到了什么，并用一个具体变化收尾。</p><button data-action="portal-scenario-start" data-scene-id="ielts-part2">继续完成两分钟作答</button></section></main></div>`;
}
views['ielts-part2-practice']=ieltsPart2PracticeView;

function dailyDoctorBriefView(){
  return `<div class="scenario-proof-page daily-proof-page">${topbar('SpeakUp','agent-chat')}<main class="scenario-proof-thread"><article class="scenario-proof-user">下午第一次去英国诊所。我咳嗽一周了，晚上更严重，而且对青霉素过敏。</article><article class="scenario-proof-agent"><span class="context-agent-mark">S</span><div><b>SpeakUp</b><p>你可以先直接这样说：</p><blockquote class="daily-agent-expression">I've had a cough for a week. It gets worse at night, and I'm allergic to penicillin.</blockquote><p>我已经把三条不能漏的信息放进表达里。接下来我来扮演医生追问症状和用药，你直接回答就好。</p><section class="daily-agent-signals"><small>Agent 已识别</small><span>持续一周</span><span>夜间加重</span><span>青霉素过敏</span></section></div></article><section class="daily-agent-next"><small>医生会先问</small><p>“What brings you in today?”</p><button data-action="portal-scenario-start" data-scene-id="clinic">开始和医生对话</button></section><p class="scenario-proof-note">仅帮助准备英文沟通，不提供医疗判断。</p></main></div>`;
}
views['daily-doctor-brief']=dailyDoctorBriefView;

function workplaceClientBriefView(){
  return `<div class="scenario-proof-page workplace-proof-page">${topbar('SpeakUp','scenes')}<main class="scenario-proof-thread"><article class="scenario-proof-user">明天我要向海外客户解释发布延期两周，还要让对方接受新的恢复计划。</article><article class="scenario-proof-agent"><span class="context-agent-mark">S</span><div><b>SpeakUp</b><p>这次先给结论，再承担责任、说明补救方案和可以承诺的时间。我会让客户沿着风险继续追问。</p></div></article><section class="scenario-proof-brief"><header><small>工作沟通方案已生成</small><h1>海外客户进度会</h1><p>国际职场 · 约 12 分钟</p></header><div class="scenario-proof-person"><span>S</span><div><small>模拟角色</small><b>Sarah · 客户方项目经理</b><p>关注交付时间，会追问延期原因</p></div></div><ol class="scenario-proof-steps"><li><span>01</span><b>30 秒同步现状</b></li><li><span>02</span><b>解释延期并承担责任</b></li><li><span>03</span><b>给出补救方案与承诺</b></li></ol><blockquote>“What caused the delay, and why was it not identified earlier?”</blockquote><button data-action="portal-scenario-start" data-scene-id="project">开始客户压力排练</button></section></main></div>`;
}
views['workplace-client-brief']=workplaceClientBriefView;

const profileAvatarImage=(className='')=>`<img class="profile-avatar-image ${className}" src="../assets/profile-avatar.svg" alt="">`;
state.appMenuOpen=Boolean(state.appMenuOpen);
state.appAccountOpen=Boolean(state.appAccountOpen);
state.agentConversationTitle=state.agentConversationTitle||'';
state.drawerEntryRoute=state.drawerEntryRoute||'';
const AGENT_HISTORY=[
  {title:'后端开发模拟面试',prompt:'帮我创建一次后端开发工程师模拟面试，重点考察项目经历和系统设计。',reply:'已经为你整理了一场 20 分钟模拟面试，包含项目深挖、技术取舍和系统设计追问。'},
  {title:'项目经历深挖',prompt:'继续追问我的高并发订单系统项目。',reply:'上次练到技术取舍。下一步可以重点说明为什么选择异步消息，以及如何验证可靠性。'},
  {title:'系统设计表达复盘',prompt:'分析我刚才的系统设计回答。',reply:'整体结构清楚，但容量假设和故障恢复验证还不够具体。建议按流量、数据模型、核心链路和容灾顺序表达。'}
];
const drawerIcon=name=>{
  const paths={
    add:'<path d="M12 5v14M5 12h14"/>',
    chat:'<path d="M5 5.5h14v10H9l-4 3v-13Z"/>',
    history:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    report:'<path d="M6 3.5h9l3 3V20H6Z"/><path d="M15 3.5V7h3M9 16v-3M12 16v-5M15 16v-7"/>',
    bookmark:'<path d="M7 4h10v16l-5-3-5 3Z"/>',
    resume:'<path d="M6 3.5h9l3 3V20H6Z"/><path d="M15 3.5V7h3M9 11h6M9 15h6"/>',
    settings:'<path d="M4 7h16M4 17h16M8 4v6M16 14v6"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.add}</svg>`;
};
function appDrawer(){
  if(!state.appMenuOpen)return '';
  const item=(route,label,detail='')=>`<button class="app-drawer-item ${state.route===route?'active':''}" data-action="drawer-route" data-route-target="${route}"><b>${label}</b>${detail?`<small>${detail}</small>`:''}</button>`;
  return `<div class="app-drawer-backdrop" data-action="close-app-menu"><aside class="app-drawer" data-action="noop">
    <header><span class="app-drawer-brand"><img src="../assets/speakup-agent.png" alt=""><b>SpeakUp</b></span><button data-action="close-app-menu" aria-label="关闭菜单">×</button></header>
    <button class="app-drawer-new ${state.route==='agent-chat'&&!state.agentConversationTitle?'active':''}" data-action="drawer-route" data-route-target="agent-chat"><span class="drawer-new-icon" aria-hidden="true"></span>开始新对话</button>
    <button class="app-drawer-item ${state.route==='scenes'?'active':''}" data-action="drawer-route" data-route-target="scenes"><b>场景练习</b><small>浏览所有练习场景</small></button>
    <section><small>复盘</small>${item('home','练习记录')}${item('mistakes','错题回顾')}</section>
    <section class="app-drawer-recent"><small>最近对话</small>${AGENT_HISTORY.map(entry=>`<button class="${state.agentConversationTitle===entry.title?'active':''}" data-action="drawer-conversation" data-history-title="${entry.title}">${entry.title}</button>`).join('')}</section>
    <footer class="${state.appAccountOpen?'open':''}">
      ${state.appAccountOpen?`<div class="app-drawer-account-menu">${item('resumes','个人简历')}${item('settings','设置')}</div>`:''}
      <button data-action="toggle-account-menu" aria-expanded="${state.appAccountOpen}">${profileAvatarImage('drawer-profile-image')}<span><b>不鸽offer</b><small>${esc(state.authEmail)}</small></span><i class="drawer-account-chevron ${state.appAccountOpen?'open':''}" aria-hidden="true"></i></button>
    </footer>
  </aside></div>`;
}
bottomNav=function(){
  const activeVoice=state.route==='agent-chat'&&state.agentVoiceState!=='idle';
  if(activeVoice)return appDrawer();
  const title={home:'SpeakUp',profile:'我的','agent-chat':'SpeakUp'}[state.route]||'SpeakUp';
  return `<header class="app-global-head"><button class="app-menu-trigger" data-action="open-app-menu" aria-label="打开菜单" aria-expanded="${state.appMenuOpen}"><i></i><i></i></button><b class="app-title-pill">${title}</b><button class="app-new-chat" data-action="agent-new-chat" aria-label="开始新对话"><i></i></button></header>${appDrawer()}`;
};
ms1Profile=function(){return `<div class="tab-page mine-page"><div class="profile-top"><div class="profile-single-avatar">${profileAvatarImage('profile-hero-image')}</div><h1>不鸽offer</h1><p>${esc(state.authEmail)}</p></div><div class="profile-card"><button class="settings-row" data-route="resumes"><span class="settings-copy"><b>个人简历</b><small>管理简历文件与解析结果</small></span><span>${state.resumeCount} / 3　›</span></button><button class="settings-row" data-route="settings"><span class="settings-copy"><b>设置</b><small>账号、安全与隐私</small></span><span>›</span></button></div></div>`};
views.profile=ms1Profile;
ms1Settings=function(){return `${topbar('设置','agent-chat')}<section class="settings-identity">${profileAvatarImage('settings-profile-image')}<div><h1>不鸽offer</h1><p>${esc(state.authEmail)}</p></div></section><div class="profile-card settings-links"><button class="settings-row" data-route="resumes"><span class="settings-copy"><b>个人简历</b><small>管理简历文件与解析结果</small></span><span>${state.resumeCount} / 3　›</span></button><div class="settings-row settings-static-row"><span class="settings-copy"><b>当前版本</b><small>SpeakUp 移动端原型</small></span><span>1.0</span></div></div><button class="secondary btn-wide" data-action="logout">退出登录</button><button class="danger btn-wide" style="margin-top:10px" data-action="delete-account">注销账号</button>${state.dialogPanel==='delete'?`<div class="sheet"><div class="sheet-card"><h2>永久注销账号？</h2><p>将删除账户、简历、解析结果、经历、计划、面试官、场次、音频、转录、报告、反馈与全部复练记录，且无法恢复。</p>${state.deleteError?`<div class="form-error">${esc(state.deleteError)}</div>`:''}<label class="confirm-line"><input type="checkbox" data-action="confirm-delete" ${state.deleteConfirmed?'checked':''}> 我已了解并确认删除全部数据</label><button class="danger btn-wide" data-action="delete-final" ${state.deleteConfirmed&&!state.deletePending?'':'disabled'}>${state.deletePending?'正在删除…':state.deleteError?'重试永久注销':'确认永久注销'}</button><button class="secondary btn-wide" data-action="close-delete">取消</button></div></div>`:''}`};
views.settings=ms1Settings;

const originalPersonalResumesView=views.resumes;
views.resumes=()=>{
  const back=state.resumeReturnRoute==='create-plan'?'create-plan':'agent-chat';
  let html=originalPersonalResumesView();
  html=html.replace(/^<div class="topbar">.*?<\/div>/,topbar('个人简历',back));
  html=html.replace('<div class="resumes-page">','<div class="resumes-page clean-resumes-page">');
  html=html.replace(/<p class="page-intro">.*?<\/p>/,`<section class="resume-clean-overview"><div><b>简历资料</b><p>上传 PDF 或手动维护经历，SpeakUp 会用最新内容生成面试问题。</p></div><span>${state.resumeItems.length} / 3 份</span></section>`);
  html=html.replace('<div class="resume-list">',`<div class="resume-clean-section-head"><h2>已保存简历</h2><span>${state.resumeItems.length} 份</span></div><div class="resume-list">`);
  html=html.replace('<div class="manual-section ',`<div class="resume-clean-section-head resume-content-head"><h2>简历内容</h2><span>点击展开编辑</span></div><div class="manual-section `);
  html=html.replace('<div class="exp-section">','<div class="resume-clean-section-head resume-content-head"><h2>简历内容</h2><span>点击展开编辑</span></div><div class="exp-section">');
  return `<div class="align-page personal-resumes-page">${html}</div>`;
};

const ROLE_NAME='Bob',ROLE_AVATAR_INDEX=4;
Object.assign(state,{roleChatTranscript:'I would like order a local seafood dish.',roleFeedbackVisible:state.roleFeedbackVisible||false});
Object.assign(state,{
  agentVoiceState:state.agentVoiceState||'idle',
  agentTranscript:state.agentTranscript||'我负责的项目主要解决了新用户首次配置成本过高的问题…',
  agentFeedbackOpen:Boolean(state.agentFeedbackOpen),
  agentKeyboardOpen:Boolean(state.agentKeyboardOpen),
  agentIntent:state.agentIntent||'',
  agentOperation:state.agentOperation||'',
  agentVoiceMuted:Boolean(state.agentVoiceMuted),
  agentDictating:Boolean(state.agentDictating),
  agentConversationTitle:state.agentConversationTitle||'',
  agentCreateStep:Number(state.agentCreateStep)||0,
  agentCreateStatus:state.agentCreateStatus||'idle',
  agentCreateDraft:state.agentCreateDraft||{},
  sceneAgentReady:Boolean(state.sceneAgentReady),
  sceneConfigId:state.sceneConfigId||'restaurant',
  scenePracticeHistory:Array.isArray(state.scenePracticeHistory)?state.scenePracticeHistory:[],
  scenePracticeSession:state.scenePracticeSession||null,
  sceneActiveRecordId:state.sceneActiveRecordId||''
});
if(typeof state.roleConversationVisible!=='boolean')state.roleConversationVisible=true;
if(typeof state.roleAudioPlaying!=='boolean')state.roleAudioPlaying=false;
roleVoices.forEach(voice=>{if(voice.id==='warm-man')voice.note='沉稳、亲切，适合 Bob'});
const roleAvatar=(large=true)=>characterAvatar(ROLE_AVATAR_INDEX,large);
const SCENE_CONFIGS={
  restaurant:{id:'restaurant',request:'我想练习在英文餐厅点餐，希望难度日常一点。',title:'英文餐厅点餐',shortTitle:'餐厅点餐',partner:'Bob',role:'本地餐馆老板',voice:'温暖男声',level:'日常英语',duration:'约 10 分钟',agentReply:'好的。我已经准备了一个海边餐馆点餐场景，你会和店主 Bob 进行英语对话。',opening:'Welcome! What would you like to order today?',goal:'完成点餐、询问推荐，并确认口味。',questions:['Welcome! What would you like to order today?','Our grilled sea bass is popular. Would you like it with salad or roasted vegetables?','Would you like anything to drink with your meal?','How would you like your fish prepared?'],answers:['I would like order a local seafood dish.','The grilled sea bass sounds great. I would like it with roasted vegetables.','I would like sparkling water, please.','Please grill it well and serve the sauce on the side.'],labels:['完成点餐','确认配菜','选择饮品','确认口味'],summaryTitle:'点餐对话已完成',summaryCopy:'你已能完成点餐、配菜、饮品和口味确认。下一次可以尝试用更自然的完整句回答。'},
  project:{id:'project',request:'下周我要和海外客户开项目进度会，需要用英语说明延期和补救方案。',title:'海外客户进度会',shortTitle:'客户进度会',partner:'Sarah',role:'客户方项目经理',voice:'清晰女声',focus:'关注交付时间，会追问延期原因',level:'职场协作 · 中级',duration:'约 12 分钟',agentReply:'明白。这次先给结论，再说明延期原因和补救方案。我已经根据客户角色整理好一轮压力排练。',opening:'Thanks for joining. Could you walk me through where the project stands right now?',goal:'用 30 秒说清当前进度，主动解释延期并给出补救方案，再回应一次客户追问。',questions:['Could you walk me through where the project stands right now?','What caused the delay, and why was it not identified earlier?','What are you doing to get the project back on track?','What can you commit to before our next review?'],answers:['The core integration is complete, but final testing is running two weeks behind schedule.','The main issue was a late data migration. We should have surfaced the dependency earlier, and I take responsibility for that.','We have added a parallel test track and a daily risk review with clear owners.','I can commit to a verified recovery plan by Friday and a new release candidate next Wednesday.'],labels:['同步现状','解释延期','说明补救','确认承诺'],summaryTitle:'客户进度会排练完成',summaryCopy:'你已经完成进度说明、延期解释、补救方案和交付承诺。下一次重点练习客户追问下的边界表达。'},
  hotel:{id:'hotel',request:'我想练习入住酒店并询问设施。',title:'酒店入住沟通',shortTitle:'酒店入住',partner:'Emma',role:'酒店前台',voice:'温暖女声',level:'旅行英语',duration:'约 8 分钟',agentReply:'好的。我已经准备了一个酒店入住场景，你会和前台 Emma 确认预订、早餐和酒店设施。',opening:'Welcome to Harbor Hotel. May I have your name and reservation number?',goal:'完成入住、确认早餐，并询问酒店设施。',questions:['Welcome to Harbor Hotel. May I have your name and reservation number?','Would you prefer one key card or two?','Breakfast is served from seven to ten. Would you like me to add it to your stay?','Is there anything else you would like to know about our facilities?'],answers:['My name is Li Ming, and my reservation number is HZ2048.','Two key cards would be helpful, please.','Yes, please add breakfast for both mornings.','Could you tell me where the gym is and when it closes?'],labels:['确认预订','领取房卡','确认早餐','询问设施'],summaryTitle:'酒店入住已完成',summaryCopy:'你已完成预订确认、领取房卡、早餐安排和设施咨询。下一次可以练习处理房间问题或提出特殊需求。'},
  clinic:{id:'clinic',request:'下午第一次去英国诊所，我要说明咳嗽一周、夜里更严重，而且对青霉素过敏。',title:'诊所就医沟通',shortTitle:'诊所就医',partner:'Dr. Taylor',role:'全科医生',voice:'清晰英音',focus:'会追问症状变化和用药限制',level:'海外生活 · 中级',duration:'约 10 分钟',agentReply:'明白。我们先练清症状、持续时间和过敏史，再模拟医生对严重程度与用药的追问。',opening:'What brings you in today, and how long have you had these symptoms?',goal:'准确描述症状与持续时间，主动说明过敏史，并确认用药方法。',questions:['What brings you in today, and how long have you had these symptoms?','Has the cough changed or become worse at any particular time of day?','Do you have any allergies or medicines you cannot take?','Before you leave, what would you like to confirm about the treatment?'],answers:['I have had a dry cough for about a week, and it is keeping me awake at night.','It gets noticeably worse in the evening, but I have not had a high fever.','I am allergic to penicillin, so I need an alternative if antibiotics are necessary.','Could you explain how often I should take the medicine and when I should come back?'],labels:['说明症状','描述变化','说明过敏史','确认用药'],summaryTitle:'诊所沟通排练完成',summaryCopy:'你已经能说明症状、变化和过敏史，并主动确认用药。下一次可以练习回答更细的病史追问。'},
  airport:{id:'airport',request:'明天第一次在伦敦转机，我要确认行李是否直挂，并找到下一程登机口。',title:'机场转机沟通',shortTitle:'机场转机',partner:'Alex',role:'航空公司地勤',voice:'清晰英音',level:'海外生活 · 基础',duration:'约 8 分钟',agentReply:'好的。我们会练习确认行李、转机时间和登机口，再处理一次航班延误。',opening:'Hello. How can I help you with your connection today?',goal:'确认行李直挂、转机路径和新的登机时间。',questions:['Hello. How can I help you with your connection today?','May I see your boarding pass and baggage receipt?','Your next flight is delayed by forty minutes. Would you like directions to the new gate?','Is there anything else you need before continuing to security?'],answers:['I am connecting to Edinburgh, and I would like to confirm whether my bag is checked through.','Of course. Here are my boarding pass and baggage receipt.','Yes, please. Could you show me the fastest way to the new gate?','Could you also confirm the updated boarding time?'],labels:['说明需求','提供凭证','应对延误','确认时间'],summaryTitle:'机场转机排练完成',summaryCopy:'你已完成行李、路径与时间确认。下一次可以练习航班取消或行李未到的处理。'},
  'ielts-part1':{id:'ielts-part1',request:'我六周后考雅思，口语目标 7 分，想先练 Part 1 的工作与家乡话题。',title:'IELTS Speaking · Part 1',shortTitle:'IELTS Part 1',partner:'Ava',role:'IELTS 口语考官',voice:'标准英音',focus:'回答需要自然展开，而不是只给一句结论',level:'目标 7.0',duration:'约 8 分钟',agentReply:'收到。我会按真实 Part 1 节奏连续提问，并重点观察回答展开、时态一致性和自然度。',opening:'Let us talk about your work. What do you enjoy most about what you do?',goal:'用 2—3 句自然展开常见话题，保持时态一致并减少背诵感。',questions:['Let us talk about your work. What do you enjoy most about what you do?','Is there anything you would like to change about your current work?','Now let us talk about your hometown. What is it best known for?','Do you think you will live there again in the future?'],answers:['I enjoy solving complex problems with my team because I can see a clear result from our work.','I would like to have more opportunities to work with international colleagues.','My hometown is best known for its lakes and relaxed pace of life.','I may return later in life, but at the moment I want to experience living abroad.'],labels:['工作偏好','工作变化','介绍家乡','未来计划'],summaryTitle:'Part 1 模拟完成',summaryCopy:'你的回答已经能自然展开。下一次重点减少重复词，并在过去与现在之间保持时态一致。'},
  'ielts-part2':{id:'ielts-part2',request:'我六周后考雅思，口语目标 7 分，但 Part 2 经常说不到两分钟。',title:'IELTS Speaking · Part 2',shortTitle:'IELTS Part 2',partner:'Ava',role:'IELTS 口语考官',voice:'标准英音',focus:'重点观察持续表达、故事结构和词汇变化',level:'目标 7.0',duration:'约 10 分钟',agentReply:'我会先帮你把题卡拆成四段，再进行一次 1 分钟准备和 2 分钟限时作答。',opening:'Describe a challenging project you completed. You should say what it was, why it was challenging, what you did, and what you learned.',goal:'围绕同一题卡持续表达 90—120 秒，并用清晰结构连接经历、行动与结果。',questions:['Describe a challenging project you completed. You should say what it was, why it was challenging, what you did, and what you learned.','You have one minute to prepare. Which four points will you use to structure your answer?','Please begin your two-minute answer now.','Looking back, what would you do differently if you faced the same challenge again?'],answers:['I will cover the context, the main challenge, the actions I took, and the result.','The project was a payment migration with a very tight deadline and several teams involved.','I clarified ownership, reduced the migration scope, and introduced a daily risk review. As a result, we completed the launch without customer downtime.','I would involve the support team earlier because they understood the customer risks better than we did.'],labels:['读取题卡','一分钟准备','两分钟作答','考官追问'],summaryTitle:'Part 2 模拟完成',summaryCopy:'你的内容结构已经完整，但持续表达仍有两次明显停顿。下一次继续同题复练，并补充更具体的感受与结果。'},
  'ielts-part3':{id:'ielts-part3',request:'我想练雅思口语 Part 3，重点提升观点展开和举例。',title:'IELTS Speaking · Part 3',shortTitle:'IELTS Part 3',partner:'Ava',role:'IELTS 口语考官',voice:'标准英音',focus:'会追问原因、例外和社会层面的影响',level:'目标 7.0',duration:'约 12 分钟',agentReply:'好的。我会围绕同一主题连续追问，并要求你给出原因、例子和限定条件。',opening:'Why do some people find it difficult to work effectively in a team?',goal:'用观点、原因、例子和限定条件完成抽象讨论。',questions:['Why do some people find it difficult to work effectively in a team?','Do schools do enough to teach young people how to collaborate?','How has technology changed teamwork in the workplace?','Are there situations where individual work is more effective than teamwork?'],answers:['Some people struggle because responsibilities are unclear or they do not trust other members.','Schools provide group projects, but they rarely teach students how to resolve conflict.','Technology makes coordination faster, although constant messaging can also reduce deep work.','Individual work is more effective when a task requires concentration or a single clear point of view.'],labels:['提出观点','讨论教育','分析变化','补充例外'],summaryTitle:'Part 3 模拟完成',summaryCopy:'你能够给出清晰观点。下一次重点加入更具体的现实例子，并用限定词避免绝对化表达。'},
  'workplace-1on1':{id:'workplace-1on1',request:'下周要和海外主管做一对一，我想讨论工作成果和下一阶段发展。',title:'海外主管 1-on-1',shortTitle:'主管 1-on-1',partner:'Rachel',role:'直属主管',voice:'沉稳女声',focus:'会追问影响、优先级和发展诉求',level:'国际职场 · 中高级',duration:'约 10 分钟',agentReply:'我们会先把成果讲成影响，再练习提出清楚且不过度承诺的发展诉求。',opening:'Before we discuss the next quarter, what result from the past month are you most proud of?',goal:'说明成果与影响，回应反馈，并提出下一阶段的发展诉求。',questions:['Before we discuss the next quarter, what result from the past month are you most proud of?','What evidence shows that this work made a difference?','What is one area where you need to improve?','What support would help you take on more responsibility?'],answers:['I am most proud of stabilizing the checkout service before our seasonal campaign.','The failure rate dropped by forty percent and support tickets fell within two weeks.','I need to communicate technical risks earlier to non-technical partners.','I would like to lead a cross-functional project with regular feedback from you.'],labels:['说明成果','量化影响','回应反馈','提出诉求'],summaryTitle:'1-on-1 排练完成',summaryCopy:'你已经能把成果转化为影响，并提出具体发展诉求。下一次继续练习边界与优先级协商。'},
  'workplace-meeting':{id:'workplace-meeting',request:'明天的英文会议上我要反对当前方案，并提出风险更低的替代方案。',title:'英文会议表达异议',shortTitle:'会议表达',partner:'Daniel',role:'会议主持人',voice:'清晰男声',focus:'会追问替代方案的成本与交付影响',level:'国际职场 · 中高级',duration:'约 12 分钟',agentReply:'我会帮你先认可共同目标，再清楚表达风险、依据和替代方案。',opening:'You mentioned that you have concerns about the current proposal. Could you explain them?',goal:'专业表达不同意见，给出证据，并推动一个可执行的替代方案。',questions:['You mentioned that you have concerns about the current proposal. Could you explain them?','What evidence suggests that this risk is significant?','Would your alternative delay the launch?','What decision would you like the team to make today?'],answers:['I support the launch goal, but the current proposal creates a single point of failure.','Our last load test showed that one region would handle over eighty percent of peak traffic.','It adds three days, but it reduces the risk of a much longer production outage.','I would like approval to run the regional rollout first and review the data on Friday.'],labels:['表达异议','提供依据','回应成本','推动决策'],summaryTitle:'会议异议排练完成',summaryCopy:'你已经能兼顾共同目标、风险依据和替代方案。下一次重点练习在被打断时快速重申结论。'}
};
const PROJECT_SCENE_MOCK={
  id:'mock-scene-client-progress',configId:'project',title:SCENE_CONFIGS.project.title,partner:SCENE_CONFIGS.project.partner,status:'completed',createdAt:'昨天 16:40',
  turns:SCENE_CONFIGS.project.questions.map((question,index)=>({index,label:SCENE_CONFIGS.project.labels[index],question,answer:SCENE_CONFIGS.project.answers[index],suggestion:index===1?'先承担责任，再解释依赖风险。':''})),
  durationMinutes:12,correctionCount:1,completedAt:Date.now()-86400000
};
if(!state.scenePracticeHistory.some(item=>item.id===PROJECT_SCENE_MOCK.id))state.scenePracticeHistory.unshift(PROJECT_SCENE_MOCK);
const currentSceneSession=()=>state.scenePracticeSession;
const sceneConfig=(record=currentSceneSession())=>SCENE_CONFIGS[record?.configId||state.sceneConfigId]||SCENE_CONFIGS.restaurant;
function startScenePracticeSession(configId=state.sceneConfigId){
  const config=SCENE_CONFIGS[configId]||SCENE_CONFIGS.restaurant;state.sceneConfigId=config.id;
  state.scenePracticeSession={id:`scene-${Date.now()}`,configId:config.id,title:config.title,partner:config.partner,status:'in_progress',startedAt:Date.now(),completedAt:0,currentTurn:0,turns:[],durationMinutes:0,correctionCount:0};
  state.sceneActiveRecordId=state.scenePracticeSession.id;
  state.roleChatTranscript='';state.recording=false;state.roleFeedbackVisible=false;state.roleConversationVisible=false;
}
function finalizeScenePractice(status='completed'){
  const session=currentSceneSession();if(!session)return null;
  session.status=status;session.completedAt=Date.now();session.durationMinutes=Math.max(1,status==='completed'?6:session.turns.length*2||1);session.correctionCount=session.turns.filter(turn=>turn.suggestion).length;
  const record={...session,turns:session.turns.map(turn=>({...turn}))};
  const index=state.scenePracticeHistory.findIndex(item=>item.id===record.id);
  if(index>=0)state.scenePracticeHistory[index]=record;else state.scenePracticeHistory.unshift(record);
  state.sceneActiveRecordId=record.id;alignPersist();return record;
}
function activeSceneRecord(){return state.scenePracticeHistory.find(item=>item.id===state.sceneActiveRecordId)||currentSceneSession()||state.scenePracticeHistory[0]||null}

const sceneVoiceIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4"></path></svg>';
roleCreate=function(){
  const ready=state.sceneAgentReady,config=sceneConfig(null);
  const suggestions=[SCENE_CONFIGS.restaurant,SCENE_CONFIGS.project,SCENE_CONFIGS.hotel];
  return `<div class="scene-agent-page">${topbar('任务准备','agent-chat')}<main class="scene-agent-thread"><article class="scene-agent-turn"><span class="scene-agent-mark" aria-hidden="true">S</span><div><b>SpeakUp</b><p>告诉我下一场重要的英文沟通是什么。说清要面对谁、要解决什么，剩下的交给我。</p></div></article>${ready?`<article class="scene-user-turn">${esc(config.request)}</article><article class="scene-agent-turn"><span class="scene-agent-mark" aria-hidden="true">S</span><div><b>SpeakUp</b><p>${esc(config.agentReply)}</p></div></article><section class="scene-agent-result"><small>专项准备已生成</small><h2>${esc(config.title)}</h2><p>${esc(config.partner)} · ${esc(config.level)} · ${esc(config.duration)}</p><button data-route="role-preview">查看准备方案</button></section>`:`<div class="scene-agent-suggestions">${suggestions.map(item=>`<button data-action="scene-agent-example" data-scene-id="${item.id}">${esc(item.request.replace(/^我想练习/,''))}</button>`).join('')}</div>`}</main><footer class="scene-agent-composer"><button class="scene-agent-add" data-action="agent-more" aria-label="更多输入方式">＋</button><button class="scene-agent-placeholder" data-action="scene-agent-example" data-scene-id="${config.id}">${ready?'继续补充要求':'描述下一场英文沟通'}</button><button class="scene-agent-voice" data-action="scene-agent-example" data-scene-id="${config.id}" aria-label="用语音描述任务">${sceneVoiceIcon}</button></footer></div>`;
};

roleGenerating=function(){return `<div class="role-generating-page"><header class="role-create-head"><h1>创建一个角色</h1><button data-action="close-role" aria-label="关闭创建角色">×</button></header><div class="role-progress"><i style="width:100%"></i></div><div class="role-generating-center"><span class="role-loader"><i></i><i></i></span><h2>正在创建 Bob</h2><p>正在把你的回答整理成角色背景、性格与对话场景</p><div class="generation-steps"><span>✓ 人物身份与关系</span><span>✓ 性格和表达方式</span><span>••• 练习话题与开场白</span></div></div><button class="primary btn-wide role-generation-finish" data-route="role-preview">查看创建结果</button></div>`};

roleVoicePicker=function(){return `<div class="sheet" data-action="close-role-voice"><section class="sheet-card role-voice-sheet clean-voice-sheet" data-action="noop"><div class="role-voice-sheet-head"><span><small>Bob</small><h2>选择角色音色</h2></span><button data-action="close-role-voice" aria-label="关闭音色选择">×</button></div><p>点击整行即可选择，已选音色使用紫色边框标记。</p><div class="role-voice-list clean-voice-list">${roleVoices.map(v=>`<button class="role-voice-clean ${state.roleVoice===v.id?'selected':''}" data-action="select-role-voice" data-voice="${v.id}" aria-pressed="${state.roleVoice===v.id}"><strong>${v.name} · ${v.accent}</strong><small>${esc(v.note.replace('Marlowe','Bob'))}</small></button>`).join('')}</div></section></div>`};

rolePreview=function(){const config=sceneConfig(null);return `<div class="scene-confirm-page scene-confirm-card-page">${topbar('准备方案','role-create')}<main class="scene-confirm-stage"><section class="scene-confirm-card"><header class="scene-card-head"><small>专项准备已生成</small><h1>${esc(config.title)}</h1><p>${esc(config.level)} · ${esc(config.duration)}</p></header><div class="scene-card-partner"><span class="scene-partner-mark" aria-hidden="true">${esc(config.partner.slice(0,1))}</span><div><small>模拟角色</small><h2>${esc(config.partner)} · ${esc(config.role)}</h2><p>${esc(config.voice)}</p></div><em>${esc(config.focus||'会根据回答继续追问')}</em></div><div class="scene-card-goal"><small>本次目标</small><p>${esc(config.goal)}</p></div><div class="scene-card-opening"><small>开场追问</small><p>“${esc(config.opening)}”</p></div><footer class="scene-card-actions"><button class="scene-confirm-secondary" data-action="restart-role">修改任务</button><button class="scene-confirm-primary" data-action="role-start-chat">开始排练</button></footer></section></main></div>`};

function alignedRoleConversation(){
  const config=sceneConfig();return `<section class="interview-chat-view role-aligned-chat"><header class="interview-chat-head"><span><small>${esc(config.partner)} · 完整上下文</small><h2>练习对话</h2></span><button class="ghost-icon" data-action="toggle-bubble" aria-label="关闭对话">×</button></header><article class="chat-bubble interviewer-bubble"><small>${esc(config.partner)}</small><p>${esc(config.questions[0])}</p></article><article class="chat-bubble candidate-bubble"><small>你</small><p>${esc(state.roleChatTranscript)}</p></article><article class="chat-bubble interviewer-bubble"><small>${esc(config.partner)}</small><p>${esc(config.questions[1])}</p></article><button class="secondary btn-wide" data-action="toggle-bubble">返回语音练习</button></section>`;
}
function alignedRoleLiveSession(){
  const config=sceneConfig();return `<section class="live-session role-live-session"><div class="live-person"><div class="live-orb"><i></i><i></i>${roleAvatar(true)}</div><h2>正在和 ${esc(config.partner)} 实时对话</h2><p>直接开口即可。系统会自动识别停顿，并在你说完后回复。</p></div><div class="live-wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="live-listening-row"><small>正在聆听…</small><button data-action="interrupt-live">打断</button></div><div class="live-transcript-preview"><small>实时转录</small><p>${esc(state.roleChatTranscript)}</p></div><button class="end-live" data-action="toggle-live">结束实时对话</button></section>`;
}
function roleLiveCompactControl(){return `<button class="compact-live-toggle ${state.liveMode?'active':''}" data-action="toggle-live" aria-pressed="${state.liveMode}" aria-label="${state.liveMode?'关闭实时对话':'开启实时对话'}"><span>实时</span><i aria-hidden="true"></i></button>`}
const roleIcon=name=>name==='chat'?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v10H9l-4 3v-13Z"/></svg>':name==='mic'?'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4M9 21h6"/></svg>':name==='replay'?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 9H5V6M5.5 9A7 7 0 1 1 5 15"/><path d="M10 10.5v3l2.5 1.5"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>';
function roleConversationPanel(){
  const session=currentSceneSession(),config=sceneConfig(session),turns=session?.turns||[],latest=turns.at(-1),answered=Boolean(latest);
  if(!state.roleConversationVisible)return `<button class="role-session-transcript-toggle" data-action="toggle-role-conversation" aria-expanded="false">${roleIcon('chat')}<span><b>查看最近对话</b><small>${answered?`已完成 ${turns.length} / ${config.questions.length} 轮`:`${esc(config.partner)} 的开场白已保存`}</small></span><i>⌄</i></button>`;
  const messages=turns.slice(-2).map(turn=>`<article class="role-session-bubble bob"><small>${esc(config.partner)}</small><p>${esc(turn.question)}</p></article><article class="role-session-bubble mine"><small>你</small><p>${esc(turn.answer)}</p></article>`).join('');
  return `<section class="role-session-dialog"><header><b>最近对话</b><button data-action="toggle-role-conversation" aria-expanded="true">收起　⌃</button></header>${messages||`<article class="role-session-bubble bob"><small>${esc(config.partner)}</small><p>${esc(config.questions[0])}</p></article>`}${latest?.suggestion?`<button class="role-session-suggestion" data-action="save-mistake" data-mistake-id="role-order-infinitive"><span>Aa</span><p><b>1 条表达建议</b><small>I’d like <em>to order</em> a local seafood dish.</small></p><i>${isMistakeSaved('role-order-infinitive')?'已收藏':'收藏'}</i></button>`:''}</section>`;
}
function roleBottomControls(){const config=sceneConfig();return `<footer class="role-session-controls"><button class="role-session-side" data-action="role-replay" aria-label="重听 ${esc(config.partner)}">${roleIcon('replay')}<small>重听</small></button><button class="role-session-talk ${state.recording?'recording':''}" data-action="role-talk" aria-label="${state.recording?'提交回答':'开始说话'}">${roleIcon('mic')}<small>${state.recording?'提交回答':'开始说话'}</small></button><button class="role-session-side" data-action="end-role-chat" aria-label="结束并保存">${roleIcon('stop')}<small>结束</small></button></footer>`}
roleChat=function(){
  const session=currentSceneSession(),config=sceneConfig(session),turn=Math.min(session?.currentTurn||0,config.questions.length-1),answered=state.roleFeedbackVisible;
  const status=state.recording?'正在聆听':answered?`${config.partner} 正在回应`:`${config.partner} 正在说话`;
  const hint=state.recording?'自然说完，再点击麦克风提交':answered?`第 ${Math.min(turn+1,4)} / 4 轮，听完后继续回答`:`第 ${turn+1} / 4 轮，先听问题再回答`;
  const currentLine=config.questions[turn];
  const hasCorrections=session?.turns?.some(t=>t.suggestion);
  return `<div class="role-session-page"><header class="single-scene-head"><button class="single-scene-back" data-route="role-preview" aria-label="返回场景确认">‹</button><h1>${esc(config.shortTitle)}</h1>${hasCorrections?`<button class="single-scene-correction" data-action="open-correction-drawer" aria-label="查看表达建议"><span>Aa</span></button>`:'<span class="single-scene-spacer" aria-hidden="true"></span>'}</header><main class="role-session-main"><section class="role-session-person">${roleAvatar(true)}<h2>${status}</h2><p>${hint}</p></section><section class="role-session-prompt"><header><small>${esc(config.labels[turn])} · ${turn+1}/${config.questions.length}</small><button data-action="role-replay">${roleIcon('replay')}<span>重听</span></button></header><p>${esc(currentLine)}</p></section>${roleConversationPanel()}</main>${roleBottomControls()}${state.dialogPanel?dialogInfo():''}${state.correctionDrawerOpen?correctionDrawer():''}</div>`;
};
function correctionDrawer(){
  const session=currentSceneSession(),config=sceneConfig(session),turns=session?.turns||[];
  const corrections=turns.filter(t=>t.suggestion).map((turn,index)=>({
    id:`correction-${index}`,
    question:turn.question,
    original:turn.answer,
    suggestion:turn.suggestion,
    label:turn.label,
    type:'expression'
  }));
  if(!corrections.length)return '';
  const correctionItem=(c)=>`<article class="correction-item"><header><span class="correction-type">表达优化</span><span class="correction-label">${esc(c.label)}</span></header><div class="correction-content"><section class="correction-original"><small>你说的是</small><p>${esc(c.original)}</p></section><section class="correction-divider">→</section><section class="correction-suggestion"><small>建议这样说</small><p>${esc(c.suggestion)}</p></section></div><section class="correction-analysis"><small>为什么这样说更好</small><p>使用更自然的动词短语和连接词，让表达更流畅地道。</p></section><footer><button class="correction-action" data-action="save-mistake" data-mistake-id="${c.id}">${isMistakeSaved(c.id)?'已收藏':'收藏到错题'}</button><button class="correction-action correction-action-secondary">跟读练习</button></footer></article>`;
  return `<div class="correction-drawer-backdrop" data-action="close-correction-drawer"></div><aside class="correction-drawer" data-action="noop"><header class="correction-drawer-head"><h2>表达建议</h2><button data-action="close-correction-drawer" aria-label="关闭">×</button></header><main class="correction-drawer-body"><section class="correction-drawer-summary"><small>本轮练习共发现</small><b>${corrections.length} 条表达建议</b></section>${corrections.map(correctionItem).join('')}</main></aside>`;
}
function correctionMockView(){
  const mockCorrections=[
    {id:'mock-1',label:'Part 1 · Hometown',original:'My hometown is very beautiful, there have many trees and river.',suggestion:'My hometown is very beautiful; there are many trees and a river.',analysis:'Use "there are" instead of "there have" for existence. Also add articles and use semicolons to connect related clauses.'},
    {id:'mock-2',label:'Part 2 · Describe a book',original:'I read a book which name is The Old Man and the Sea.',suggestion:'I read a book called The Old Man and the Sea.',analysis:'"Which name is" is unnatural. Use "called" or "whose name is" to introduce titles more fluently.'},
    {id:'mock-3',label:'Part 3 · Technology',original:'I think technology is good for our life, it make things more easier.',suggestion:'I think technology is good for our lives; it makes things much easier.',analysis:'Subject-verb agreement: "it makes" (not "make"). Use "much" (not "more") with comparatives like "easier".'}
  ];
  const correctionItem=(c)=>`<article class="correction-item"><header><span class="correction-type">表达优化</span><span class="correction-label">${esc(c.label)}</span></header><div class="correction-content"><section class="correction-original"><small>你说的是</small><p>${esc(c.original)}</p></section><section class="correction-divider">→</section><section class="correction-suggestion"><small>建议这样说</small><p>${esc(c.suggestion)}</p></section></div><section class="correction-analysis"><small>为什么这样说更好</small><p>${esc(c.analysis)}</p></section><footer><button class="correction-action" data-action="save-mistake" data-mistake-id="${c.id}">${isMistakeSaved(c.id)?'已收藏':'收藏到错题'}</button><button class="correction-action correction-action-secondary">跟读练习</button></footer></article>`;
  return `<div class="correction-mock-page">${topbar('表达建议','home')}<main class="correction-mock-body"><section class="correction-drawer-summary"><small>本轮练习共发现</small><b>${mockCorrections.length} 条表达建议</b></section>${mockCorrections.map(correctionItem).join('')}</main></div>`;
}
function roleComplete(){
  const record=activeSceneRecord()||{configId:'restaurant',title:'英文餐厅点餐',partner:'Bob',status:'incomplete',turns:[],durationMinutes:1,correctionCount:0},config=sceneConfig(record);
  const turns=record.turns||[],completed=record.status==='completed',corrections=record.correctionCount||0;
  const completedLabels=turns.map(turn=>turn.label).filter(Boolean);
  return `<div class="role-complete-page">${topbar('练习总结','home')}<main class="role-complete-body"><header class="role-complete-hero"><span>${completed?'已完成':'已保存'}</span><h1>${completed?esc(config.summaryTitle):'本次练习已保存'}</h1><p>${completed?`你已经完成与 ${esc(config.partner)} 的四轮${esc(config.title)}对话。`:'当前进度已经保留，可以从记录中继续练习。'}</p></header><section class="role-complete-stats" aria-label="练习数据"><div><small>练习时长</small><b>${record.durationMinutes||1} 分钟</b></div><div><small>有效对话</small><b>${turns.length} / ${config.questions.length} 轮</b></div><div><small>表达建议</small><b>${corrections} 条</b></div></section><section class="role-complete-summary"><small>本次完成</small><h2>${completedLabels.length?completedLabels.join('、'):'还没有提交有效回答'}</h2><p>${completed?esc(config.summaryCopy):'继续完成剩余对话后，SpeakUp 会生成完整总结。'}</p></section>${corrections&&config.id==='restaurant'?`<section class="role-complete-correction"><span>Aa</span><div><small>本次表达建议</small><s>I would like order a local seafood dish.</s><b>I’d like to order a local seafood dish.</b></div></section>`:''}</main><footer class="role-complete-actions"><button class="secondary" data-route="home">返回记录</button><button class="primary" data-action="restart-role-chat">再练一次</button></footer></div>`
}
views['role-create']=roleCreate;
views['role-generating']=roleGenerating;
views['role-preview']=rolePreview;
views['role-chat']=roleChat;
views['role-complete']=roleComplete;

const agentStateCopy={
  idle:{label:'今天想练什么？',hint:'直接说出目标，我来帮你完成'},
  listening:{label:'正在聆听…',hint:'自然表达即可，我会在你停顿后回应'},
  thinking:{label:'正在理解你的回答',hint:'我在整理重点和下一步追问'},
  speaking:{label:'SpeakUp 正在回应',hint:'你可以随时开口打断我'}
};
const AGENT_COMMANDS={
  create:'帮我创建一次后端开发工程师模拟面试',
  scene:'我想练习在英文餐厅点餐',
  continue:'继续上次的项目经历深挖',
  review:'分析我最近一次练习'
};
const AGENT_CREATE_STEPS=[
  {key:'job',label:'目标岗位',question:'好，我们来创建一场模拟面试。先告诉我目标岗位，或者把 JD 发给我。',hint:'我会从 JD 中提取岗位职责和能力要求。',options:[
    {label:'粘贴示例 JD',value:'后端开发工程师',answer:'使用后端开发工程师示例 JD'},
    {label:'上传 JD 截图',value:'后端开发工程师',answer:'识别这张 JD 截图'},
    {label:'只填写岗位名称',value:'后端开发工程师',answer:'目标岗位是后端开发工程师'}
  ]},
  {key:'resume',label:'选择简历',question:'岗位信息已经整理好了。接下来选择用于这次面试的简历。',hint:'这里只使用创建时的资料快照，不会修改原简历。',options:[
    {label:'Backend_Developer_Resume.pdf',value:'Backend_Developer_Resume.pdf',answer:'使用 Backend_Developer_Resume.pdf'},
    {label:'上传一份新简历',value:'New_Backend_Resume.pdf',answer:'上传并使用一份新简历'},
    {label:'使用示例简历',value:'SpeakUp 示例简历',answer:'这次先使用示例简历'}
  ]},
  {key:'format',label:'面试形式',question:'最后选择面试形式：单面还是群面？',hint:'SpeakUp 会根据 JD 和简历自动生成面试问题。',options:[
    {label:'单面计划 · 4 轮 · 约 70 分钟',value:'单面计划 · 4 轮 · 约 70 分钟',answer:'创建 4 轮单面计划，预计 70 分钟'},
    {label:'群面模拟 · 1 场 · 约 25 分钟',value:'群面模拟 · 1 场 · 约 25 分钟',answer:'创建一场 3 位面试官参加的群面模拟'},
    {label:'自定义设置（mock）',value:'单面计划 · 4 轮 · 约 70 分钟',answer:'先使用推荐的 4 轮单面计划'}
  ]},
  {key:'confirm',label:'确认创建',question:'信息已经齐了。确认后我会生成面试计划和对应的面试官。',hint:''}
];
const agentCreateDefaults=()=>({job:'后端开发工程师',resume:'Backend_Developer_Resume.pdf',format:'单面计划 · 4 轮 · 约 70 分钟',answers:{}});
function createAgentMockPlan(){
  const d={...agentCreateDefaults(),...state.agentCreateDraft},isPanel=d.format.startsWith('群面');
  const interviewerPresets=[
    {name:'Mia',role:'HR 经理',roundTitle:'HR 初面',roundDuration:15,style:'清晰友好，关注岗位动机与沟通',focus:'求职动机、团队匹配、英语表达',responsibility:'了解求职动机、沟通表达和岗位匹配度。',voice:'清晰女声'},
    {name:'Ethan',role:'工程经理',roundTitle:'技术深挖',roundDuration:20,style:'连续追问，强调事实和技术取舍',focus:'项目所有权、技术判断、交付结果',responsibility:'围绕核心项目追问个人贡献、技术取舍和交付结果。',voice:'沉稳男声'},
    {name:'Noah',role:'系统设计面试官',roundTitle:'系统设计',roundDuration:20,style:'结构化追问，关注系统边界与演进',focus:'系统边界、可靠性、扩展能力',responsibility:'检查架构边界、可靠性设计和扩展方案。',voice:'自然男声'},
    {name:'Lena',role:'技术负责人',roundTitle:'综合终面',roundDuration:15,style:'严谨直接，关注判断与长期成长',focus:'综合判断、协作影响、反问收尾',responsibility:'综合评估工程判断、协作影响和岗位成长潜力。',voice:'自然女声'}
  ];
  const interviewers=interviewerPresets.slice(0,isPanel?3:4).map((item,index)=>alignNormalizeInterviewer({...item},index));
  const focusTags=['岗位匹配','简历深挖','系统设计'];
  const snapshot={jobName:d.job,jobDescription:'负责高并发交易服务、分布式系统设计、可靠性建设与跨团队交付。',resumeName:d.resume,candidateProfile:ALIGN_SAMPLE_PROFILE,experience:{title:'根据简历自动匹配'},focusScope:'根据 JD 和简历自动生成',requirements:'Agent mock 创建计划'};
  const plan=alignNormalizePlan({id:'agent-mock-plan',mockData:true,mockDuration:isPanel?25:70,estimatedDuration:isPanel?25:70,interviewMode:isPanel?'panel':'single',createdAt:'刚刚',sampleMode:true,candidateSource:d.resume,focusTags,snapshot,interviewers,sessions:interviewers.map(()=>[]),panelSessions:[],status:'ready'});
  const existingIndex=state.plans.findIndex(item=>item.id===plan.id);
  if(existingIndex>=0)state.plans.splice(existingIndex,1);
  state.plans.unshift(plan);state.historyExpandedPlanId=plan.id;alignActivatePlan(plan.id);state.interviewMode=plan.interviewMode;state.panelSessions=plan.panelSessions;alignPersist();
  return plan;
}
function resetAgentCreateFlow(){state.agentCreateStep=0;state.agentCreateStatus='idle';state.agentCreateDraft={}}
function startAgentCreateFlow(){state.agentCreateStep=1;state.agentCreateStatus='collecting';state.agentCreateDraft=agentCreateDefaults();state.agentVoiceState='idle';state.agentOperation='';state.agentKeyboardOpen=false;state.agentTranscript=''}
function agentCreateComposer(){return `${state.agentKeyboardOpen?`<label class="agent-text-entry agent-home-text"><span>回复 SpeakUp</span><textarea data-agent-transcript placeholder="输入你的回答">${esc(state.agentTranscript)}</textarea><button data-action="agent-send-text">发送</button></label>`:''}<footer class="agent-composer"><button class="agent-composer-add" data-action="agent-more" aria-label="更多输入方式">＋</button><button class="agent-composer-field" data-action="agent-keyboard">回复 SpeakUp</button><button class="agent-composer-mic ${state.agentDictating?'dictating':''}" data-action="agent-dictate" aria-label="语音转文字"><i></i></button><button class="agent-composer-voice" data-action="agent-cycle" aria-label="开始语音对话"><svg class="agent-voice-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 10v4"></path><path d="M8 7v10"></path><path d="M12 4v16"></path><path d="M16 7v10"></path><path d="M20 10v4"></path></svg></button></footer>`}
function agentCreateSummary(created=false){
  const d={...agentCreateDefaults(),...state.agentCreateDraft};
  if(created){
    const plan=alignNormalizePlan(alignCurrentPlan()),isPanel=plan.interviewMode==='panel';
    const overview=isPanel?'群面 · 3 位面试官 · 预计 25 分钟':'4 轮 · 4 位面试官 · 预计 70 分钟';
    return `<section class="agent-create-summary complete agent-plan-result"><small>面试计划已生成</small><h2>${esc(plan.snapshot.jobName||d.job)}</h2><p>${overview}</p>${isPanel?'':`<ol class="agent-plan-rounds">${plan.interviewers.map((person,index)=>`<li><span>${String(index+1).padStart(2,'0')}</span><b>${esc(person.roundTitle)}</b><em>${esc(person.name)}</em></li>`).join('')}</ol>`}<button class="agent-create-primary" data-route="rounds">查看面试计划</button></section>`;
  }
  return `<section class="agent-create-summary"><h2>确认创建模拟面试</h2><dl><div><dt>目标岗位 / JD</dt><dd>${esc(d.job)}</dd></div><div><dt>简历</dt><dd>${esc(d.resume)}</dd></div><div><dt>形式</dt><dd>${esc(d.format)}</dd></div></dl><div class="agent-create-summary-actions"><button data-action="agent-create-edit">修改信息</button><button class="agent-create-primary" data-action="agent-create-confirm">创建面试</button></div></section>`;
}
function agentCreateFlow(){
  const step=Math.max(1,Math.min(Number(state.agentCreateStep)||1,4)),active=AGENT_CREATE_STEPS[step-1],draft={...agentCreateDefaults(),...state.agentCreateDraft},answers=draft.answers||{};
  const completed=AGENT_CREATE_STEPS.slice(0,Math.min(step-1,3)).map(item=>answers[item.key]?`<article class="agent-create-user">${esc(answers[item.key])}</article>`:'').join('');
  const options=step<4?`<div class="agent-create-options">${active.options.map(option=>`<button data-action="agent-create-select" data-field="${active.key}" data-value="${esc(option.value)}" data-answer="${esc(option.answer)}">${esc(option.label)}</button>`).join('')}</div>`:'';
  const content=state.agentCreateStatus==='created'?`<article class="agent-create-agent"><img src="../assets/speakup-agent.png" alt=""><p><b>已经创建好了。</b><span>面试计划和问题结构都已准备完成。</span></p></article>${agentCreateSummary(true)}`:`${completed}<article class="agent-create-agent"><img src="../assets/speakup-agent.png" alt=""><p><b>SpeakUp</b><span>${esc(active.question)}</span>${active.hint?`<small>${esc(active.hint)}</small>`:''}</p></article>${step<4?options:agentCreateSummary(false)}`;
  return `<div class="agent-page agent-home agent-simple-home agent-create-flow agent-idle"><section class="agent-create-thread"><header class="agent-create-progress">创建模拟面试 · ${step}/4 <span>${state.agentCreateStatus==='created'?'已完成':esc(active.label)}</span></header>${content}</section>${agentCreateComposer()}</div>`;
}
function scenesView(){
  const featured=[{icon:'INT',title:'Job interviews',desc:'Full mock interviews with multiple interviewers, resume deep dive, and detailed reports.',duration:'15-25 min',route:'create-job',featured:true}];
  const ieltsScenes=[
    {icon:'P1',title:'Part 1 Q&A',desc:'Daily topic questions and answers',duration:'8 min',sceneId:'ielts-part1'},
    {icon:'P2',title:'Part 2 Long turn',desc:'2-minute monologue on a given topic',duration:'10 min',sceneId:'ielts-part2'},
    {icon:'P3',title:'Part 3 Discussion',desc:'In-depth discussion linked to Part 2',duration:'12 min',sceneId:'ielts-part3'}
  ];
  const workplaceScenes=[
    {icon:'1:1',title:'1-on-1 meeting',desc:'Discuss results and career growth',duration:'10 min',sceneId:'workplace-1on1'},
    {icon:'ME',title:'Meeting disagreement',desc:'Challenge a proposal with evidence',duration:'12 min',sceneId:'workplace-meeting'},
    {icon:'CL',title:'Client delay update',desc:'Explain a delay and recovery plan',duration:'12 min',sceneId:'project'}
  ];
  const dailyScenes=[
    {icon:'MD',title:'Doctor appointment',desc:'Describe symptoms and confirm treatment',duration:'10 min',sceneId:'clinic'},
    {icon:'DN',title:'Dining out',desc:'Order food at a restaurant',duration:'8 min',sceneId:'restaurant'},
    {icon:'HT',title:'Hotel check-in',desc:'Check in and ask about facilities',duration:'6 min',sceneId:'hotel'},
    {icon:'TR',title:'Airport & travel',desc:'Navigate airport and travel',duration:'8 min',sceneId:'airport'}
  ];
  const card=(scene)=>`<button class="scene-card" data-action="${scene.route?'scene-featured':'scene-select'}" ${scene.route?`data-route-target="${scene.route}"`:''} ${scene.sceneId?`data-scene-id="${scene.sceneId}"`:''}>
    <span class="scene-card-icon">${scene.icon}</span>
    <span class="scene-card-body"><b>${scene.title}</b><small>${scene.desc}</small><span class="scene-card-meta">${scene.duration}</span></span>
  </button>`;
  const featuredCard=(scene)=>`<button class="scene-card scene-card-featured" data-action="scene-featured" data-route-target="${scene.route}">
    <span class="scene-card-icon">${scene.icon}</span>
    <span class="scene-card-body"><b>${scene.title}</b><small>${scene.desc}</small><span class="scene-card-meta">${scene.duration}</span></span>
    <span class="scene-card-arrow">›</span>
  </button>`;
  const section=(title,scenes,featured=false)=>`<section class="scene-section">
    <small class="scene-section-title">${title}</small>
    <div class="scene-grid">${featured?scenes.map(featuredCard).join(''):scenes.map(card).join('')}</div>
  </section>`;
  return `<div class="scenes-page">${topbar('Scenes','agent-chat')}
    <div class="scenes-search"><span>🔍</span><input type="text" placeholder="Search scenes..." data-action="scene-search"></div>
    <main class="scenes-list">
      ${section('Featured',featured,true)}
      ${section('For IELTS / TOEFL',ieltsScenes)}
      ${section('For workplace',workplaceScenes)}
      ${section('Daily life',dailyScenes)}
    </main>
  </div>`;
}
function agentHome(){
  if(state.agentConversationTitle)return agentHistoryConversation();
  if(state.agentCreateStep>0)return agentCreateFlow();
  return `<div class="agent-page agent-home agent-simple-home agent-idle">
    <section class="agent-simple-hero">
      <h2>下一场重要的英文沟通是什么？</h2>
      <p>告诉我你要面对谁、要解决什么。我会帮你准备、排练，再一起复盘。</p>
    </section>
    <div class="agent-quick-actions">
      <div class="quick-chips">
        <button data-action="agent-command" data-command="create">模拟英文面试</button>
        <button data-action="agent-command" data-command="scene" data-scene-id="project">准备客户会议</button>
        <button data-action="agent-keyboard">说一件马上要办的事</button>
        <button data-action="agent-command" data-command="continue">继续上次任务</button>
      </div>
    </div>
    ${state.agentKeyboardOpen?`<label class="agent-text-entry agent-home-text"><span>告诉 SpeakUp 你想完成什么</span><textarea data-agent-transcript placeholder="例如：帮我创建一次后端开发模拟面试"></textarea><button data-action="agent-send-text">发送</button></label>`:''}
    <footer class="agent-composer">
      <button class="agent-composer-add" data-action="agent-more" aria-label="更多输入方式">＋</button>
      <button class="agent-composer-field" data-action="agent-keyboard">${state.agentDictating?'正在转录…':'问问 SpeakUp'}</button>
      <button class="agent-composer-mic ${state.agentDictating?'dictating':''}" data-action="agent-dictate" aria-label="${state.agentDictating?'结束语音转文字':'语音转文字'}"><i></i></button>
      <button class="agent-composer-voice" data-action="agent-cycle" aria-label="开始语音对话"><svg class="agent-voice-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 10v4"></path><path d="M8 7v10"></path><path d="M12 4v16"></path><path d="M16 7v10"></path><path d="M20 10v4"></path></svg></button>
    </footer>
  </div>`;
}
function agentHistoryConversation(){
  const entry=AGENT_HISTORY.find(item=>item.title===state.agentConversationTitle)||AGENT_HISTORY[0];
  return `<div class="agent-page agent-history-page">
    <section class="agent-history-thread">
      <small>最近对话</small>
      <h1>${esc(entry.title)}</h1>
      <article class="agent-history-message mine">${esc(entry.prompt)}</article>
      <article class="agent-history-message speakup"><img src="../assets/speakup-agent.png" alt=""><p><b>SpeakUp</b>${esc(entry.reply)}</p></article>
      <span class="agent-history-saved">对话已保存</span>
    </section>
  </div>`;
}
function agentOperationCard(){
  if(!state.agentOperation)return '';
  if(state.agentOperation==='created')return `<section class="agent-operation-card complete"><header><span>✓</span><div><small>操作已完成</small><h2>模拟面试已创建</h2></div></header><p>后端开发工程师 · 单人面试 · 20 分钟</p><button class="agent-operation-primary" data-action="agent-voice-enter-interview">开始面试</button></section>`;
  if(state.agentIntent==='continue')return `<section class="agent-operation-card"><header><span>↗</span><div><small>已找到上次进度</small><h2>继续项目经历深挖</h2></div></header><dl><div><dt>当前进度</dt><dd>2 / 4 轮</dd></div><div><dt>下一题</dt><dd>技术取舍与结果</dd></div></dl><button class="agent-operation-primary" data-route="practice">继续练习</button></section>`;
  if(state.agentIntent==='review')return `<section class="agent-operation-card"><header><span>⌁</span><div><small>分析已准备好</small><h2>最近一次练习表现</h2></div></header><p>项目职责表达清楚，下一步建议补充技术取舍的量化依据。</p><button class="agent-operation-primary" data-route="home">查看练习记录</button></section>`;
  return '';
}
const AGENT_VOICE_MOCK=[
  {role:'agent',text:'请先把 JD 发给我，或者告诉我目标岗位。'},
  {role:'user',text:'使用后端开发工程师示例 JD。'},
  {role:'agent',text:'好的。这次使用哪份简历？'},
  {role:'user',text:'使用 Backend_Developer_Resume.pdf。'},
  {role:'agent',text:'最后选择面试形式：单面还是群面？'},
  {role:'user',text:'这次选择单面。'},
  {role:'agent',text:'已为你创建 4 轮面试和 4 位面试官，第一轮是 Mia 的 HR 初面。点击即可开始。',action:'interview'}
];
function agentConversation(){
  if(state.agentVoiceState==='idle')return agentHome();
  return `<div class="agent-page agent-voice-simple agent-${state.agentVoiceState}">
    <header class="agent-voice-head"><button class="app-menu-trigger agent-voice-menu" data-action="open-app-menu" aria-label="打开菜单"><i></i><i></i></button><b>SpeakUp 语音</b><button class="agent-voice-info" data-action="agent-more" aria-label="语音说明">i</button></header>
    <section class="agent-voice-thread" aria-label="语音对话转录" aria-live="polite">${AGENT_VOICE_MOCK.map(item=>`<article class="agent-voice-turn ${item.role}"><p>${esc(item.text)}</p>${item.action==='interview'?'<button class="agent-voice-enter" data-action="agent-voice-enter-interview">进入模拟面试</button>':''}</article>`).join('')}</section>
    ${state.agentKeyboardOpen?`<label class="agent-text-entry agent-voice-text"><span>输入消息</span><textarea data-agent-transcript placeholder="问问 SpeakUp">${esc(state.agentTranscript)}</textarea><button data-action="agent-send-text">发送</button></label>`:''}
    <footer class="agent-voice-dock">
      <div class="agent-voice-input"><button data-action="agent-more" aria-label="更多输入方式">＋</button><button data-action="agent-keyboard">问问 SpeakUp</button></div>
      <button class="agent-voice-transcribe ${state.agentVoiceMuted?'muted':''}" data-action="agent-voice-mute" aria-label="${state.agentVoiceMuted?'打开麦克风':'关闭麦克风'}"><i></i></button>
      <button class="agent-voice-close" data-action="agent-exit" aria-label="结束语音">×</button>
    </footer>
  </div>`;
}
views['agent-chat']=agentConversation;

const originalCreateHub=ms1CreateHub;
ms1CreateHub=function(){
  const html=originalCreateHub().replace('role-create-feature','role-create-feature scene-practice-entry').replace('项目深挖 · 4 次语音问答','单面 / 群面 · 完整报告');
  const entry=`<section class="create-feature agent-create-entry"><div class="agent-entry-avatar"><img src="../assets/speakup-agent.png" alt=""></div><div class="create-feature-copy"><span><strong>SpeakUp 对话</strong><small>自然语音交流 · 实时建议</small></span><button class="primary-dark" data-route="agent-chat">开始对话</button></div></section>`;
  const index=html.lastIndexOf('</div>');
  return html.slice(0,index)+entry+html.slice(index);
};
views['create-hub']=ms1CreateHub;
views['scenes']=scenesView;
views['correction-mock']=correctionMockView;

function voiceChatView(){
  const micSvg='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  const bars='<span class="vc-bars"><i></i><i></i><i></i><i></i><i></i><i></i></span>';
  const voiceGlyph='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4"/></svg>';
  const aiBubble=(who,txt)=>`<div class="vc-ai"><div class="vc-who">${who}</div><div class="vc-txt">${txt}</div><div class="vc-ops"><button class="vc-pill" data-action="bubble-audio">▶ 发音</button><button class="vc-pill" data-action="bubble-translate">翻译</button></div></div>`;
  const userTurn=(dur,inner,chips,fix)=>`<div class="vc-user"><div class="vc-msg"><div class="vc-voice-row">${micSvg}${bars}<span class="vc-dur">${dur}</span><button class="vc-replay" data-action="bubble-audio">回听</button></div><div class="vc-txt">${inner}</div></div><div class="vc-chips">${chips}</div>${fix||''}</div>`;
  const fixCard=`<div class="vc-fix"><div class="vc-fix-diff"><s>since five years</s><span class="vc-arr">→</span><b>for five years</b></div><div class="vc-fix-rule">for + 一段时间；since + 具体起点（如 since 2019）</div><div class="vc-fix-ops"><button class="vc-fix-a" data-action="bubble-audio">▶ 听正确读法</button><button class="vc-fix-b" data-action="save-mistake">加入错题</button></div></div>`;
  return `<div class="vc-page">
    ${topbar('HR 初面 · Mia','rounds','<span class="vc-progress-tag">2 / 4 轮</span>')}
    <main class="vc-thread">
      ${aiBubble('Mia · 面试官','Tell me about a project you owned end to end.')}
      ${userTurn('0:08','I owned the product definition <span class="vc-err">since five years</span> and worked with design and engineering to ship it.','<span class="vc-chip-ok">发音自然</span><span class="vc-chip-err">1 处语法</span>',fixCard)}
      ${aiBubble('Mia · 面试官','Good overview. How does the system scale when traffic doubles?')}
      ${userTurn('0:12','We added a cache layer and moved the heavy jobs into an async queue, so the API stays fast under pressure.','<span class="vc-chip-ok">✓ 表达地道</span>','')}
    </main>
    <footer class="vc-composer"><button class="vc-add" data-action="agent-more" aria-label="更多输入方式">＋</button><button class="vc-field" data-action="agent-keyboard">按住说话</button><button class="vc-mic" data-action="agent-dictate" aria-label="语音转文字">${micSvg}</button><button class="vc-voice" data-action="agent-cycle" aria-label="开始语音对话">${voiceGlyph}</button></footer>
  </div>`;
}
views['voice-chat']=voiceChatView;

window.addEventListener('click',event=>{
  const drawerBack=event.target.closest('[data-route][aria-label="返回"]');
  if(drawerBack&&state.drawerEntryRoute===state.route){event.preventDefault();event.stopImmediatePropagation();state.drawerEntryRoute='';go('agent-chat');return}
  const el=event.target.closest('[data-action]');if(!el)return;const action=el.dataset.action;
  if(action==='close-role'&&state.drawerEntryRoute==='role-create'&&state.route==='role-create'){event.preventDefault();event.stopImmediatePropagation();state.drawerEntryRoute='';go('agent-chat')}
  else if(action==='panel-mode'){event.preventDefault();event.stopImmediatePropagation();state.interviewMode=el.dataset.mode;render()}
  else if(action==='panel-sessions'){event.preventDefault();event.stopImmediatePropagation();state.route='sessions';views.sessions=panelSessionsView;render()}
  else if(action==='panel-start-session'){event.preventDefault();event.stopImmediatePropagation();views.sessions=panelSessionsView;panelStartSession()}
  else if(action==='panel-resume'||action==='panel-report'){event.preventDefault();event.stopImmediatePropagation();const session=panelSessionList().find(x=>x.id===el.dataset.sessionId);alignBindSession(session);views.sessions=panelSessionsView;state.interviewPhase='ai';state.route=action==='panel-report'?'report':'practice';render()}
  else if(action==='ms1-answer'&&activeSession()?.interviewMode==='panel'){event.preventDefault();event.stopImmediatePropagation();if(state.interviewPhase==='ai'){state.interviewPhase='user';state.currentTranscript=PANEL_SAMPLE_ANSWERS[activeSession().currentTurn]||'';state.answerError='';render()}else if(state.interviewPhase==='user')panelSubmitAnswer()}
  else if(action==='select-role-voice'){event.preventDefault();event.stopImmediatePropagation();state.roleVoice=el.dataset.voice;state.roleVoiceOpen=false;render();toast('已更新 Bob 的角色音色')}
  else if(action==='open-app-menu'){event.preventDefault();event.stopImmediatePropagation();state.appMenuOpen=true;render()}
  else if(action==='close-app-menu'){event.preventDefault();event.stopImmediatePropagation();state.appMenuOpen=false;state.appAccountOpen=false;render()}
  else if(action==='toggle-history-plan'){event.preventDefault();event.stopImmediatePropagation();state.historyExpandedPlanId=state.historyExpandedPlanId===el.dataset.planId?'':el.dataset.planId;render()}
  else if(action==='open-scene-summary'){event.preventDefault();event.stopImmediatePropagation();state.sceneActiveRecordId=el.dataset.sceneId||'';state.route='role-complete';render()}
  else if(action==='restart-scene-record'){event.preventDefault();event.stopImmediatePropagation();state.sceneActiveRecordId=el.dataset.sceneId||'';const record=activeSceneRecord();startScenePracticeSession(record?.configId||'restaurant');state.route='role-chat';render()}
  else if(action==='history-round-action'){event.preventDefault();event.stopImmediatePropagation();const planId=el.dataset.planId,index=Number(el.dataset.index)||0,mode=el.dataset.mode;if(mode==='locked')return;const ready=alignActivatePlan(planId);if(!ready){render();return}state.activeInterviewer=index;state.planCarouselIndex=index;if(mode==='plan'){state.route='rounds';render();return}if(state.interviewMode==='panel'){state.route='rounds';render();return}const sessions=interviewerSessions(index),session=mode==='continue'?sessions.find(item=>item.status==='in_progress'):sessions.find(item=>item.status==='completed');if(mode==='report'&&session){alignBindSession(session);state.sessionComplete=true;state.reportStatus=session.reportStatus||'ready';state.reportFromHistory=true;state.route='report';render()}else if(mode==='continue'&&session){alignBindSession(session);session.started=true;state.interviewChatOpen=false;state.interviewPhase='ai';state.sessionComplete=false;state.route='practice';render()}else{state.practiceSelection={type:'full',specialtyId:null};alignStartSession()}}
  else if(action==='toggle-account-menu'){event.preventDefault();event.stopImmediatePropagation();state.appAccountOpen=!state.appAccountOpen;render()}
  else if(action==='drawer-route'){event.preventDefault();event.stopImmediatePropagation();const target=el.dataset.routeTarget;state.appMenuOpen=false;state.appAccountOpen=false;state.drawerEntryRoute=target==='agent-chat'?'':target;if(target==='agent-chat')state.agentConversationTitle='';if(target==='role-create')state.sceneAgentReady=false;go(target)}
  else if(action==='drawer-conversation'){event.preventDefault();event.stopImmediatePropagation();state.appMenuOpen=false;state.appAccountOpen=false;state.drawerEntryRoute='';resetAgentCreateFlow();state.agentConversationTitle=el.dataset.historyTitle||'';state.agentVoiceState='idle';state.agentVoiceMuted=false;state.agentDictating=false;state.agentKeyboardOpen=false;state.route='agent-chat';render()}
  else if(action==='agent-new-chat'){event.preventDefault();event.stopImmediatePropagation();state.appMenuOpen=false;state.drawerEntryRoute='';resetAgentCreateFlow();state.agentConversationTitle='';state.agentVoiceState='idle';state.agentVoiceMuted=false;state.agentDictating=false;state.agentIntent='';state.agentOperation='';state.agentTranscript='';state.agentKeyboardOpen=false;state.sceneAgentReady=false;state.route='agent-chat';render();toast('已开始新对话')}
  else if(action==='agent-dictate'){event.preventDefault();event.stopImmediatePropagation();state.agentDictating=!state.agentDictating;state.agentKeyboardOpen=false;render()}
  else if(action==='agent-command'){event.preventDefault();event.stopImmediatePropagation();const command=el.dataset.command;state.agentIntent=command;if(command==='create'){startAgentCreateFlow();render()}else if(command==='scene'){resetAgentCreateFlow();state.sceneConfigId=el.dataset.sceneId||'project';state.sceneAgentReady=false;state.drawerEntryRoute='role-create';state.route='role-create';render()}else if(command==='browse'){resetAgentCreateFlow();go('scenes')}else{resetAgentCreateFlow();state.agentTranscript=AGENT_COMMANDS[command]||state.agentTranscript;state.agentOperation='draft';state.agentKeyboardOpen=false;state.agentVoiceState='thinking';render();setTimeout(()=>{if(state.route==='agent-chat'&&state.agentVoiceState==='thinking'){state.agentVoiceState='speaking';render()}},650)}}
  else if(action==='scene-agent-example'){event.preventDefault();event.stopImmediatePropagation();state.sceneConfigId=el.dataset.sceneId||state.sceneConfigId||'restaurant';state.sceneAgentReady=true;state.recording=false;alignPersist();render()}
  else if(action==='portal-scenario-start'){event.preventDefault();event.stopImmediatePropagation();const configId=el.dataset.sceneId||'restaurant';state.sceneConfigId=SCENE_CONFIGS[configId]?configId:'restaurant';state.sceneAgentReady=true;startScenePracticeSession(state.sceneConfigId);state.liveMode=false;state.bubbleMode=false;state.route='role-chat';render()}
  else if(action==='portal-group-start'){event.preventDefault();event.stopImmediatePropagation();alignActivatePlan('mock-panel-plan');state.route='rounds';render()}
  else if(action==='restart-role'){event.preventDefault();event.stopImmediatePropagation();state.sceneAgentReady=false;state.recording=false;state.liveMode=false;state.roleConversationVisible=true;state.route='role-create';render()}
  else if(action==='agent-create-select'){event.preventDefault();event.stopImmediatePropagation();const field=el.dataset.field,value=el.dataset.value||'',answer=el.dataset.answer||value;state.agentCreateDraft[field]=value;state.agentCreateDraft.answers??={};state.agentCreateDraft.answers[field]=answer;state.agentCreateStep=Math.min(4,state.agentCreateStep+1);state.agentKeyboardOpen=false;state.agentTranscript='';render()}
  else if(action==='agent-create-edit'){event.preventDefault();event.stopImmediatePropagation();state.agentCreateStep=1;state.agentCreateStatus='collecting';state.agentCreateDraft.answers={};render()}
  else if(action==='agent-create-confirm'){event.preventDefault();event.stopImmediatePropagation();createAgentMockPlan();state.agentCreateStatus='created';render();toast('模拟面试已创建')}
  else if(action==='scene-featured'){event.preventDefault();event.stopImmediatePropagation();const target=el.dataset.routeTarget;state.appMenuOpen=false;go(target)}
  else if(action==='scene-select'){event.preventDefault();event.stopImmediatePropagation();const sceneId=el.dataset.sceneId;const configId=SCENE_CONFIGS[sceneId]?sceneId:'restaurant';state.sceneConfigId=configId;state.sceneAgentReady=true;startScenePracticeSession(configId);go('role-preview')}
  else if(action==='open-correction-drawer'){event.preventDefault();event.stopImmediatePropagation();state.correctionDrawerOpen=true;render()}
  else if(action==='close-correction-drawer'){event.preventDefault();event.stopImmediatePropagation();state.correctionDrawerOpen=false;render()}
  else if(action==='agent-cycle'){event.preventDefault();event.stopImmediatePropagation();if(state.agentVoiceState==='idle'){state.agentIntent='';state.agentOperation='';state.agentTranscript='';state.agentVoiceMuted=false;state.agentDictating=false;state.agentVoiceState='listening'}render()}
  else if(action==='agent-voice-enter-interview'){event.preventDefault();event.stopImmediatePropagation();createAgentMockPlan();state.agentVoiceState='idle';state.agentVoiceMuted=false;state.activeInterviewer=0;state.practiceSelection={type:'full',specialtyId:null};alignStartSession()}
  else if(action==='agent-voice-mute'){event.preventDefault();event.stopImmediatePropagation();state.agentVoiceMuted=!state.agentVoiceMuted;render();toast(state.agentVoiceMuted?'麦克风已关闭':'麦克风已打开')}
  else if(action==='agent-keyboard'){event.preventDefault();event.stopImmediatePropagation();state.agentDictating=false;state.agentKeyboardOpen=!state.agentKeyboardOpen;render()}
  else if(action==='agent-send-text'){event.preventDefault();event.stopImmediatePropagation();state.agentDictating=false;state.agentKeyboardOpen=false;if(state.agentCreateStep>0&&state.agentCreateStatus==='collecting'&&state.agentCreateStep<4){const current=AGENT_CREATE_STEPS[state.agentCreateStep-1],value=state.agentTranscript.trim()||current.options[0].value;state.agentCreateDraft[current.key]=value;state.agentCreateDraft.answers??={};state.agentCreateDraft.answers[current.key]=value;state.agentCreateStep+=1;state.agentTranscript='';render()}else{state.agentIntent='create';startAgentCreateFlow();render();toast('开始创建模拟面试')}}
  else if(action==='agent-confirm-create'){event.preventDefault();event.stopImmediatePropagation();state.agentOperation='created';render();toast('模拟面试已创建')}
  else if(action==='agent-edit-draft'){event.preventDefault();event.stopImmediatePropagation();state.route='create-plan';render()}
  else if(action==='toggle-agent-feedback'){event.preventDefault();event.stopImmediatePropagation();state.agentFeedbackOpen=!state.agentFeedbackOpen;render()}
  else if(action==='agent-more'){event.preventDefault();event.stopImmediatePropagation();toast('更多选项：切换音色、字幕与语速')}
  else if(action==='agent-exit'){event.preventDefault();event.stopImmediatePropagation();state.agentVoiceState='idle';state.agentVoiceMuted=false;state.agentDictating=false;state.agentIntent='';state.agentOperation='';state.agentKeyboardOpen=false;render();toast('对话已保存')}
  else if(action==='toggle-role-conversation'){event.preventDefault();event.stopImmediatePropagation();state.roleConversationVisible=!state.roleConversationVisible;render()}
  else if(action==='role-replay'){event.preventDefault();event.stopImmediatePropagation();toast(`正在重听 ${sceneConfig().partner} 的上一句话`)}
  else if(action==='role-talk'){event.preventDefault();event.stopImmediatePropagation();const session=currentSceneSession();if(!session)return;const config=sceneConfig(session);if(!state.recording){state.recording=true;state.roleFeedbackVisible=false;state.roleConversationVisible=false;render();toast('正在聆听，再次点击提交')}else{const index=Math.min(session.currentTurn,config.questions.length-1),answer=config.answers[index],suggestion=config.id==='restaurant'&&index===0?'would like 后面补上 to':'';session.turns.push({index,label:config.labels[index],question:config.questions[index],answer,suggestion});session.currentTurn+=1;state.roleChatTranscript=answer;state.recording=false;state.bubbleMode=false;if(session.currentTurn>=config.questions.length){finalizeScenePractice('completed');state.roleFeedbackVisible=false;state.roleConversationVisible=true;state.route='role-complete';render();toast('四轮场景练习已完成')}else{state.roleFeedbackVisible=true;state.roleConversationVisible=true;render();toast(`已完成第 ${session.currentTurn} / ${config.questions.length} 轮`)}}}
  else if(action==='end-role-chat'){event.preventDefault();event.stopImmediatePropagation();state.recording=false;state.liveMode=false;state.bubbleMode=false;state.roleFeedbackVisible=false;finalizeScenePractice('incomplete');state.route='role-complete';render()}
  else if(action==='restart-role-chat'){event.preventDefault();event.stopImmediatePropagation();state.liveMode=false;state.bubbleMode=false;const record=activeSceneRecord();startScenePracticeSession(record?.configId||state.sceneConfigId);state.route='role-chat';render()}
  else if(action==='role-start-chat'){event.preventDefault();event.stopImmediatePropagation();startScenePracticeSession();state.liveMode=false;state.bubbleMode=false;state.route='role-chat';render()}
},true);
window.addEventListener('input',event=>{if(event.target.matches('[data-role-chat-transcript]'))state.roleChatTranscript=event.target.value},true);
window.addEventListener('input',event=>{if(event.target.matches('[data-agent-transcript]'))state.agentTranscript=event.target.value},true);

function alignedCandidateAsResumes(){
  const prevReturn=state.resumeReturnRoute;
  state.resumeReturnRoute='create-plan';
  let html=alignedResumesV2();
  state.resumeReturnRoute=prevReturn;
  html=html.replace('个人简历','创建模拟面试').replace(/data-route="create-plan"/,'data-route="create-job"');
  const insertIdx=html.lastIndexOf('</div>');
  return html.slice(0,insertIdx)+'<div class="sticky-actions"><button class="secondary" data-route="create-job">返回</button><button class="primary" data-route="create-plan">继续选择重点</button></div>'+html.slice(insertIdx);
}
views['create-candidate']=alignedCandidateAsResumes;

const originalRender=render;
render=function(){
  state.authenticated=true;
  if(state.route==='auth')state.route='create-hub';
  if(state.route==='sessions'){state.route='home';state.reportFromHistory=false}
  originalRender();
  S.classList.toggle('agent-canvas',state.route==='agent-chat');
  S.classList.toggle('has-app-menu',['agent-chat','home','profile'].includes(state.route)&&!(state.route==='agent-chat'&&state.agentVoiceState!=='idle'));
  const createThread=S.querySelector('.agent-create-thread');
  if(createThread)requestAnimationFrame(()=>{createThread.scrollTop=createThread.scrollHeight});
};

const originalGo=go;
go=function(route){
  state.authenticated=true;
  if(route==='auth')route='create-hub';
  const panelRoutes=['rounds','sessions','mic-check','practice','report','retry'];
  if(state.authenticated&&panelRoutes.includes(route)&&!state.planSnapshot){
    const preferred=state.plans.find(x=>x.id==='mock-panel-plan')||state.plans[0];
    if(preferred)alignActivatePlan(preferred.id);
  }
  if(state.authenticated&&['practice','report','retry'].includes(route)){
    const currentSession=activeSession();
    if(currentSession&&currentSession.practiceKey==='role-chat')return originalGo(route);
    const plan=alignCurrentPlan();
    if(plan?.interviewMode==='panel'){
      const session=route==='practice'?(plan.panelSessions||[]).find(x=>x.status==='in_progress'):(plan.panelSessions||[]).find(x=>x.status==='completed');
      if(session)alignBindSession(session);
    }
  }
  originalGo(route);
};

const authenticatedSettingsView=views.settings;
views.settings=()=>authenticatedSettingsView()
  .replace('<span>登录邮箱</span>','<span>演示身份</span>')
  .replace(/<button class="secondary btn-wide" data-action="logout">退出登录<\/button>/,'');

alignPersist();
state.route='agent-chat';
state.agentVoiceState='idle';
state.agentIntent='';
state.agentOperation='';
state.agentVoiceMuted=false;
state.agentDictating=false;
state.agentConversationTitle='';
resetAgentCreateFlow();
state.appMenuOpen=false;
state.appAccountOpen=false;
render();

document.addEventListener('wheel',function(e){
  const chips=e.target.closest('.quick-chips');
  if(!chips)return;
  if(e.deltaY===0)return;
  e.preventDefault();
  chips.scrollLeft+=e.deltaY;
},{passive:false});

// Hash route support
function handleHashRoute(){
  const hash=window.location.hash.slice(1);
  if(hash&&views[hash]){
    state.route=hash;
    render();
  }
}
window.addEventListener('hashchange',handleHashRoute);
if(window.location.hash)handleHashRoute();
