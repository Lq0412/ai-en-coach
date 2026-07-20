/* Complete simulation interview flow for the interactive prototype. */
const ALIGN_FOCUS_TAGS=['自我介绍','简历深挖','岗位能力','项目取舍','情景题','英语表达'];
const ALIGN_VOICES=['沉稳男声','清晰女声','自然男声'];
const ALIGN_SAMPLE_PROFILE={
  basic:'Alex Chen，后端开发工程师，5 年经验',
  education:'同济大学，计算机科学本科',
  work:'全球电商平台后端工程师，负责订单与支付服务',
  projects:'高并发电商微服务系统、实时消息与故障恢复',
  skills:'Java、Spring Boot、Kafka、PostgreSQL、Redis'
};
const ALIGN_SPECIALTIES=[
  {id:'resume',name:'简历深挖',description:'围绕经历、个人贡献和成果连续追问。',targets:['项目背景','个人贡献','量化结果']},
  {id:'system',name:'系统设计',description:'讨论架构边界、扩展能力和可靠性取舍。',targets:['架构方案','技术取舍','故障恢复']},
  {id:'behavior',name:'行为面试',description:'通过真实情境验证协作、判断和推动能力。',targets:['情境','行动','复盘']}
];
const ALIGN_ROUND_DEFAULTS=[
  {title:'HR 初面',duration:15},
  {title:'技术深挖',duration:20},
  {title:'系统设计',duration:20},
  {title:'综合终面',duration:15}
];
Object.assign(state,{
  candidateSource:'saved',candidateExpanded:true,focusTags:['自我介绍','简历深挖','岗位能力','项目取舍','情景题','英语表达'],candidateManual:{basic:[''],education:[''],work:[''],projects:[''],skills:'',strengths:''},
  planCarouselIndex:0,reportCarouselIndex:0,specialtySheet:false,contextSheet:false,interviewerDetailIndex:0,practiceSelection:{type:'full',specialtyId:null},exitDialog:'',
  micPermissionChecked:false,selectedMic:'MacBook 麦克风',creationRequestId:null,generationWait:'idle',generationFailure:false,reportExpanded:0
});
const ALIGN_STORAGE_KEY='speakup-interview-prototype-v3';
try{
  const saved=JSON.parse(localStorage.getItem(ALIGN_STORAGE_KEY)||'null');
  if(saved){
    state.plans=Array.isArray(saved.plans)?saved.plans:state.plans;
    state.resumeItems=Array.isArray(saved.resumeItems)?saved.resumeItems:state.resumeItems;
    state.focusTags=Array.isArray(saved.focusTags)?saved.focusTags:state.focusTags;
    state.candidateManual=saved.candidateManual||state.candidateManual;
    state.scenePracticeHistory=Array.isArray(saved.scenePracticeHistory)?saved.scenePracticeHistory:state.scenePracticeHistory;
    state.sceneConfigId=saved.sceneConfigId||state.sceneConfigId||'restaurant';
    state.scenePracticeSession=saved.scenePracticeSession||state.scenePracticeSession;
    state.sceneActiveRecordId=saved.sceneActiveRecordId||state.sceneActiveRecordId;
  }
}catch(error){console.warn('Interview prototype state could not be restored.',error)}
const alignPersist=()=>{
  try{localStorage.setItem(ALIGN_STORAGE_KEY,JSON.stringify({plans:state.plans,resumeItems:state.resumeItems,focusTags:state.focusTags,candidateManual:state.candidateManual,sceneConfigId:state.sceneConfigId||'restaurant',scenePracticeHistory:state.scenePracticeHistory||[],scenePracticeSession:state.scenePracticeSession||null,sceneActiveRecordId:state.sceneActiveRecordId||''}))}
  catch(error){console.warn('Interview prototype state could not be saved.',error)}
};

const alignSteps=current=>`<div class="align-steps">${['岗位背景','候选人资料','练习重点'].map((x,i)=>`<span class="align-step ${i+1<current?'done':i+1===current?'active':''}">${x}</span>`).join('')}</div>`;
const alignTop=(title,back)=>topbar(title,back);
const alignSampleMode=()=>!state.interviewDraft.jobName.trim()&&!state.interviewDraft.jobDescription.trim()&&state.candidateSource==='sample';
const alignCandidateLabel=()=>({saved:'已保存简历',upload:'上传新简历',manual:'手动填写',sample:'示例资料'})[state.candidateSource]||'示例资料';
const alignCurrentPlan=()=>state.plans.find(p=>p.id===state.activePlanId)||state.plans[0]||currentPlan?.();
const alignHasStarted=()=>state.sessionsByInterviewer.some(list=>list.length>0);
const alignPractice=()=>{
  const interviewer=state.interviewers[state.activeInterviewer]||state.interviewers[0];
  const specialty=ALIGN_SPECIALTIES.find(x=>x.id===state.practiceSelection.specialtyId);
  const isFull=state.practiceSelection.type==='full';
  return {interviewer,isFull,specialty,label:isFull?'完整模拟':specialty?.name||'专项练习',minutes:isFull?interviewer.roundDuration:8,maxMain:isFull?6:3,targets:isFull?['求职动机','核心经历','岗位能力','技术取舍']:specialty?.targets||['核心能力']};
};
const alignQuestions=(session,answer='')=>{
  const plan=alignCurrentPlan(),snapshot=plan?.snapshot||state.planSnapshot||{},practice=alignPractice(),name=snapshot.jobName||'目标岗位';
  const pool=practice.isFull?[
    `Please introduce yourself and explain why you are interested in the ${name} role.`,
    `Which experience on your resume best demonstrates your fit for this role?`,
    `What did you personally own, and which part did you implement yourself?`,
    `What alternative did you consider, and why did you reject it?`,
    `How did you validate the result and handle production risk?`,
    `What would you improve if you did the same project again?`
  ]:[
    `Please give me a concise example related to ${practice.label}.`,
    `What did you personally decide and implement in that example?`,
    `What evidence shows the approach worked, and what would you improve?`
  ];
  const turn=session?.currentTurn||0;
  if(answer&&turn===1&&!session.followUpUsed){
    const clue=answer.trim().split(/\s+/).slice(0,7).join(' ');
    return `You mentioned "${clue}". What was the hardest trade-off behind that decision?`;
  }
  return pool[Math.min(turn,pool.length-1)];
};
const alignNormalizeInterviewer=(p,i)=>Object.assign(p,{
  responsibility:p.responsibility||[
    '验证岗位动机、英语沟通和团队匹配度。','深挖项目所有权、工程判断和交付结果。','检查架构细节、代码边界和可靠性设计。','评估系统扩展、取舍依据和长期演进。'
  ][i%4],
  roundTitle:p.roundTitle||ALIGN_ROUND_DEFAULTS[i%ALIGN_ROUND_DEFAULTS.length].title,
  roundDuration:Number(p.roundDuration)||ALIGN_ROUND_DEFAULTS[i%ALIGN_ROUND_DEFAULTS.length].duration,
  focusTags:p.focusTags||String(p.focus||'岗位能力、项目经历').split(/[、，]/).slice(0,3),voice:p.voice||ALIGN_VOICES[i%ALIGN_VOICES.length],
  specialties:p.specialties||ALIGN_SPECIALTIES.map(x=>({...x,targets:[...x.targets]})),fullStages:p.fullStages||['开场与动机','经历深挖','岗位能力','反问收尾'],hidden:false
});
const alignNormalizePlan=plan=>{
  if(!plan)return null;
  plan.createdAt??='2026.07.15 12:08';plan.sampleMode??=false;plan.candidateSource??='已保存简历';plan.focusTags??=['自我介绍','简历深挖','岗位能力','项目取舍','情景题','英语表达'];
  plan.interviewers.forEach(alignNormalizeInterviewer);plan.sessions??=plan.interviewers.map(()=>[]);plan.estimatedDuration??=plan.interviewers.reduce((sum,person)=>sum+person.roundDuration,0);return plan;
};
state.plans.forEach(alignNormalizePlan);state.interviewers.forEach(alignNormalizeInterviewer);

function alignedCreateJobV3(){const d=state.interviewDraft;return `<div class="align-page">${alignTop('创建模拟面试','create-hub')}${alignSteps(1)}<span class="align-kicker">岗位背景</span><h1 class="align-title">先告诉我目标岗位</h1><p class="align-lead">两项都可以留空。留空后会用明确标记的示例资料创建计划。</p><label class="align-field"><span>岗位名称（选填）</span><input class="align-input" data-align-draft="jobName" value="${esc(d.jobName)}" placeholder="例如：后端开发工程师"><small>只填写岗位时，系统会生成一份示例 JD。</small></label><label class="align-field"><span>职位描述 JD（选填）</span><textarea class="align-textarea" data-align-draft="jobDescription" placeholder="粘贴岗位职责和要求">${esc(d.jobDescription)}</textarea><small>只填写 JD 时，系统会自动提取岗位名称。</small></label><div class="align-actions"><button class="align-btn secondary" data-route="create-hub">返回</button><button class="align-btn primary" data-action="align-context-next">继续填写资料</button></div></div>`}
function alignedCandidateV3(){const atLimit=state.resumeItems.length>=3,failed=item=>["解析失败","内容为空"].includes(item.status),activeItem=state.resumeItems[state.selectedResumeIndex??state.defaultResume]||state.resumeItems[0],exps=activeItem?.experienceData||[],hasContent=activeItem&&(activeItem.manualData||(exps.length>0)),menuItem=state.resumeItems[state.resumeMenuIndex];return `<div class="align-page">${alignTop("创建模拟面试","create-job")}${alignSteps(2)}<span class="align-kicker">候选人资料</span><h1 class="align-title">我的简历</h1><p class="align-lead">上传 PDF 简历或手动编写经历，AI 会提取项目与工作经历，用于生成更贴合的面试问题。</p><div class="resume-methods"><button class="resume-method" data-action="upload-resume" ${atLimit?`disabled`:` `}><span class="method-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></span><strong>上传简历</strong><small>PDF 格式，最大 10 MB</small></button><button class="resume-method" data-action="write-resume" ${atLimit?`disabled`:` `}><span class="method-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></span><strong>编写简历</strong><small>手动填写项目经历</small></button></div><div class="resume-list">${state.resumeItems.map((item,i)=>`<section class="resume-card ${i===state.defaultResume?`active`:``} ${failed(item)?`failed`:``}"><div class="resume-main"><div class="resume-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg></div><div class="resume-info"><h3>${esc(item.name)}</h3><p>${item.size}${item.experiences?` · ${item.experiences} 条经历`:``}</p><div class="resume-badges"><span class="resume-state ${failed(item)||item.status===`上传失败`?`fail`:``}">${i===state.defaultResume?`默认 · `:``}${item.status}</span></div></div><button class="resume-menu-btn" data-action="resume-menu" data-index="${i}" aria-label="简历操作"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="12" cy="6" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="18" r="2"/></svg></button></div>${item===activeItem&&hasContent?(item.manualData?renderManualSections(item):``):``}</section>`).join(``)}</div>${state.resumeError?`<div class="form-error">${state.resumeError}</div>`:``}<div class="align-actions"><button class="align-btn secondary" data-route="create-job">返回</button><button class="align-btn primary" data-route="create-plan">继续选择重点</button></div>${menuItem?`<div class="sheet"><div class="sheet-card"><div class="topbar"><h2>简历操作</h2><button class="ghost-icon" data-action="close-resume-menu">×</button></div>${state.resumeRenaming?`<div class="exp-field"><label>简历名称</label><input data-resume-rename value="${esc(menuItem.name)}" placeholder="请输入简历名称"></div><div class="exp-card-actions"><button data-action="cancel-rename-resume">取消</button><button class="primary" data-action="save-rename-resume" data-index="${state.resumeMenuIndex}">保存</button></div>`:`<strong>${esc(menuItem.name)}</strong><button class="secondary btn-wide" data-action="rename-resume">重命名</button><button class="secondary btn-wide" data-action="set-default-resume" data-index="${state.resumeMenuIndex}" ${state.resumeMenuIndex===state.defaultResume?`disabled`:``}>设为默认简历</button><button class="danger btn-wide" data-action="delete-resume" data-index="${state.resumeMenuIndex}">删除这份简历</button><p class="snapshot-footnote">删除不会改变已有面试计划和历史报告中的文本快照。</p>`}</div></div>`:``}</div>`}function alignedCreatePlanV3(){const d=state.interviewDraft,isSample=alignSampleMode();return `<div class="align-page">${alignTop('创建模拟面试','create-candidate')}${alignSteps(3)}<span class="align-kicker">练习重点</span><h1 class="align-title">这次想重点练什么</h1><p class="align-lead">可以多选，也可以什么都不选。</p><div class="align-tags">${ALIGN_FOCUS_TAGS.map(x=>`<button class="align-tag ${state.focusTags.includes(x)?'active':''}" data-action="align-focus" data-value="${x}">${x}</button>`).join('')}</div><label class="align-field" style="margin-top:18px"><span>补充要求（选填）</span><textarea class="align-textarea" data-align-draft="requirements" placeholder="例如：重点追问我的技术取舍">${esc(d.requirements)}</textarea></label><section class="align-summary"><h3>计划摘要 ${isSample?'<span class="sample-flag">示例模式</span>':''}</h3><dl><dt>目标岗位</dt><dd>${esc(d.jobName||'示例：后端开发工程师')}</dd><dt>候选人</dt><dd>${alignCandidateLabel()}</dd><dt>练习重点</dt><dd>${esc(state.focusTags.join('、')||'自动安排')}</dd></dl></section>${state.generateError?`<div class="form-error">${esc(state.generateError)}</div>`:''}<div class="align-actions"><button class="align-btn secondary" data-route="create-candidate">返回</button><button class="align-btn primary" data-action="align-create-plan" ${state.generationWait==='creating'?'disabled':''}>${state.generationWait==='creating'?'正在保存…':'创建面试计划'}</button></div></div>`}
function alignedGenerationV3(){return `<div class="align-page">${alignTop('配置面试官','home')}<div class="align-loader"><div class="align-loader-art">S</div><h1 class="align-title">正在根据岗位配置面试官</h1><p>计划已经保存，可以安全离开。回来后会继续当前配置。</p>${state.generationFailure?`<div class="form-error">面试官配置暂时失败，计划和填写内容均已保留。</div><button class="align-btn primary block" data-action="align-retry-generation">重新配置</button><button class="align-btn secondary block" data-action="align-use-presets">使用预设面试官</button>`:''}</div></div>`}

function alignedRoundsV3(){
  const plan=alignNormalizePlan(alignCurrentPlan());
  if(!plan)return alignedHome();
  const total=plan.interviewers.length;
  state.planCarouselIndex=Math.max(0,Math.min(state.planCarouselIndex,total-1));
  const cards=plan.interviewers.map((person,i)=>{
    const sessions=plan.sessions[i]||[],active=sessions.find(session=>session.status==='in_progress'),completed=sessions.some(session=>session.status==='completed');
    const status=active?'进行中':completed?'已完成':'未开始';
    const progressTotal=4;
    const progressDone=completed?progressTotal:Math.min(progressTotal,active?.turns?.length||active?.currentTurn||0);
    const actionLabel=active?'继续本轮面试':completed?'再练一场':'开始本轮面试';
    return `<section class="interview-round-card" data-round-index="${i}" aria-label="第 ${i+1} 轮 ${esc(person.roundTitle)}"><header class="interview-round-head"><div><small class="interview-round-job">${esc(plan.snapshot.jobName||'后端开发工程师')}</small><span>第 ${i+1} 轮 · ${esc(person.roundTitle)}</span></div><div class="interview-round-progress"><span>${status}</span><b><i aria-hidden="true">★</i>${progressDone}/${progressTotal}</b></div></header><div class="interview-round-person">${characterAvatar(i,true)}<h2>${esc(person.role)}</h2><p>${esc(person.name)}</p></div><div class="interview-round-footer"><button class="interview-round-primary" data-action="align-prepare" data-index="${i}" data-type="full">${actionLabel}<span>· 约 ${person.roundDuration} 分钟</span></button><button class="interview-round-link" data-action="align-interviewer-detail" data-index="${i}">查看本轮说明</button></div></section>`;
  }).join('');
  const dots=plan.interviewers.map((person,i)=>`<button class="${i===state.planCarouselIndex?'active':''}" data-action="align-carousel-to" data-index="${i}" aria-label="查看第 ${i+1} 轮 ${esc(person.roundTitle)}"></button>`).join('');
  requestAnimationFrame(()=>{const track=document.querySelector('[data-plan-carousel]'),card=track?.querySelector(`[data-round-index="${state.planCarouselIndex}"]`);if(track&&card&&state.route==='rounds')track.scrollLeft=card.offsetLeft-track.offsetLeft});
  return `<div class="align-page interview-plan-page">${alignTop('面试计划','agent-chat')}<div class="interview-plan-track" data-plan-carousel>${cards}</div><nav class="interview-plan-dots" aria-label="面试轮次">${dots}</nav></div>`;
}
function alignedInterviewerConfigV3(){const locked=alignHasStarted();return `<div class="align-page">${alignTop(locked?'查看面试官':'编辑面试官','rounds')}<h1 class="align-title">${locked?'配置已锁定':'面试官配置'}</h1><p class="align-lead">${locked?'已有练习开始。人物和练习结构不再变化，声音修改只影响后续播放。':'开始第一场练习前，可以调整人物、声音和专项练习。'}</p>${locked?'<div class="lock-note">历史场次始终使用开始练习时保存的配置快照。</div>':''}${state.interviewers.map((p,i)=>`<section class="config-person"><div class="config-person-head">${characterAvatar(i)}<span><h3>${esc(p.name)}</h3><p>${esc(p.role)} · ${esc(p.voice)}</p></span><button class="align-btn ghost" data-action="align-interviewer-detail" data-index="${i}">详情</button></div><div class="config-person-actions"><button class="align-btn secondary" data-action="align-cycle-voice" data-index="${i}">切换声音</button><button class="align-btn danger" data-action="align-confirm-remove" data-index="${i}" ${locked||state.interviewers.length<=2?'disabled':''}>删除</button></div></section>`).join('')}${!locked&&state.interviewers.length<4?'<button class="align-btn secondary block" data-action="align-add-interviewer">添加预设面试官</button>':''}${state.dialogPanel==='remove-interviewer'?`<div class="specialty-sheet"><div class="specialty-panel"><h2>删除这位面试官？</h2><p class="confirm-copy">删除后，该面试官的完整模拟和专项练习配置也会移除。</p><div class="align-actions"><button class="align-btn secondary" data-action="align-cancel-remove">取消</button><button class="align-btn danger" data-action="align-remove-interviewer">确认删除</button></div></div></div>`:''}</div>`}
function alignedInterviewerDetailV3(){const i=state.interviewerDetailIndex,p=state.interviewers[i],locked=alignHasStarted();return `<div class="align-page">${alignTop('面试官详情','rounds')}${characterAvatar(i,true)}<h1 class="align-title" style="text-align:center">${esc(p.name)}</h1><p class="align-lead" style="text-align:center">${esc(p.role)}</p><section class="detail-card"><h3>负责什么</h3><p>${esc(p.responsibility)}</p></section><section class="detail-card"><h3>风格与关注点</h3><p>${esc(p.style)}</p><div class="align-tags">${p.focusTags.map(x=>`<span class="align-tag active">${esc(x)}</span>`).join('')}</div></section><section class="detail-card"><div class="detail-row"><span><b>声音</b><small>只影响后续问题播放</small></span><button class="align-btn secondary" data-action="align-cycle-voice" data-index="${i}">${esc(p.voice)}</button></div><div class="detail-row"><span><b>完整模拟</b><small>${p.fullStages.join('、')}</small></span><b>15 分钟</b></div>${p.specialties.map(x=>`<div class="detail-row"><span><b>${esc(x.name)}</b><small>${esc(x.description)}</small></span><b>8 分钟</b></div>`).join('')}</section>${locked?'<div class="lock-note">练习已开始，除声音外的配置已经锁定。</div>':''}<button class="align-btn secondary block" data-action="align-open-sessions" data-index="${i}">查看这位面试官的练习历史</button></div>`}
function alignedSessionsV3(){const p=state.interviewers[state.activeInterviewer],sessions=interviewerSessions(state.activeInterviewer);return `<div class="align-page">${alignTop('练习历史','rounds')}<h1 class="align-title">${esc(p.name)} 的场次</h1><p class="align-lead">完整模拟与专项练习独立保存，每次开始都会记录人物和计划快照。</p>${sessions.map(session=>`<section class="align-session"><div class="align-session-head"><span class="session-type">${esc(session.practiceLabel||'完整模拟')}</span><span class="session-status ${session.status==='in_progress'?'active':''}">${session.status==='in_progress'?'进行中':session.status==='completed'?'已完成':'未完成'}</span></div><h3>${esc(session.time||'刚刚')} · ${session.duration||'已保存'}</h3><p>${session.turns?.length||session.currentTurn||0} 个有效回答，${session.remainingMinutes??0} 分钟剩余</p><div class="align-session-actions">${session.status==='in_progress'?`<button class="align-btn primary" data-action="align-resume-session" data-session-id="${session.id}">继续</button><button class="align-btn secondary" data-action="align-open-report" data-session-id="${session.id}" disabled>报告</button>`:`<button class="align-btn secondary" data-action="align-open-report" data-session-id="${session.id}">查看报告</button><button class="align-btn ghost" data-action="align-new-from-session" data-session-id="${session.id}">再练一场</button>`}</div></section>`).join('')||'<div class="report-empty">还没有练习记录。</div>'}<button class="align-btn primary block" data-route="rounds">选择一种练习</button></div>`}
function alignedMicV3(){const practice=alignPractice();return `<div class="align-page">${alignTop('麦克风检查','preparation')}<span class="align-kicker">${practice.label}</span><h1 class="align-title">开始前检查声音</h1><div class="mic-explain"><h3>为什么需要麦克风</h3><p>面试会保存你的回答音频和转写，用于报告与同题复练。测试音频不会进入正式记录。</p></div>${!state.micPermissionChecked?`<button class="align-btn primary block" data-action="align-check-mic">检查麦克风</button>`:`<label class="align-field"><span>输入设备</span><select class="align-select" data-align-mic><option>MacBook 麦克风</option><option>外接 USB 麦克风</option></select></label><div class="detail-card"><b>${state.recording?'正在检测音量':'设备已连接'}</b>${state.recording?'<div class="mic-meter"><i></i></div>':'<p>点击试音并说一句英文。通过后才能进入面试。</p>'}</div><button class="align-btn ${state.micReady?'secondary':'primary'} block" data-action="align-mic-test">${state.micReady?'重新试音':state.recording?'正在试音…':'开始试音'}</button>`}${state.micError?`<div class="form-error">${esc(state.micError)}</div>`:''}<button class="align-btn primary block" style="margin-top:10px" data-action="align-enter-interview" ${state.micReady?'':'disabled'}>进入面试</button><div class="prototype-tools"><button data-action="align-mic-error" data-kind="permission">权限拒绝</button><button data-action="align-mic-error" data-kind="device">无设备</button><button data-action="align-mic-error" data-kind="silence">无声音</button></div></div>`}

const alignPhaseCopy={connecting:'正在连接',generating:'正在生成问题',ai:'面试官正在提问',user:'正在记录回答',processing:'正在处理回答',invalid:'回答无效',saved:'回答已保存',reconnect:'连接已中断'};
function alignedPracticeV3(){const session=activeSession(),practice=alignPractice(),turns=session?.turns||[],question=session?.currentQuestion||alignQuestions(session),phase=state.interviewPhase;return `<div class="practice-v3"><div class="practice-v3-head"><button data-action="align-request-exit" aria-label="退出面试">‹</button><b>${esc(practice.label)}</b><button data-action="align-request-exit" aria-label="退出选项">退出</button></div><div class="practice-stats"><div><small>面试官</small><b>${esc(practice.interviewer.name)}</b></div><div><small>已完成</small><b>${turns.length} / ${practice.maxMain}</b></div><div><small>剩余时间</small><b>${session?.remainingMinutes??practice.minutes} 分钟</b></div></div><div class="practice-status">${alignPhaseCopy[phase]||'面试进行中'}</div><div class="practice-question"><small>当前问题 · 英语回答</small>${esc(question)}</div>${phase==='user'||phase==='invalid'?`<textarea class="align-textarea" data-align-answer placeholder="用英语回答当前问题">${esc(state.currentTranscript||'')}</textarea>${state.answerError?`<div class="form-error">${esc(state.answerError)}</div>`:''}`:''}${phase==='reconnect'?'<div class="form-error">当前问题和已录制内容已保留，请重新连接后继续。</div>':''}<div class="practice-v3-actions">${phase==='ai'?'<button class="align-btn primary block" data-action="align-begin-answer">开始回答</button>':''}${phase==='user'||phase==='invalid'?'<button class="align-btn primary block" data-action="align-submit-answer">提交回答</button>':''}${phase==='reconnect'?'<button class="align-btn primary block" data-action="align-reconnect">重新连接</button>':''}${['generating','processing','connecting','saved'].includes(phase)?'<button class="align-btn ghost block" disabled>请稍候</button>':''}<button class="align-btn secondary block" data-action="align-replay" ${['generating','processing','connecting'].includes(phase)?'disabled':''}>重新播放当前问题</button></div><div class="reserved-live"><span><b>实时模式</b><br>当前版本仅保留入口</span><span>暂未开放</span></div>${state.exitDialog?`<div class="specialty-sheet"><div class="specialty-panel exit-panel"><h2>要如何结束这次练习？</h2><p class="confirm-copy">退出会保留当前场次。提前结束会关闭场次，并只基于有效回答生成报告。</p><button class="align-btn secondary block" data-action="align-save-exit">保存并退出</button><button class="align-btn danger block" data-action="align-end-report">提前结束并生成报告</button><button class="align-btn ghost block" data-action="align-cancel-exit">继续面试</button></div></div>`:''}</div>`}
function alignedReportV3(){const session=activeSession(),turns=session?.turns||[];if(state.reportStatus==='generating')return `${alignTop('生成面试报告','sessions')}<div class="align-loader"><div class="align-loader-art">S</div><h1 class="align-title">正在整理回答证据</h1><p>有效回答、原音和转写已经保存。</p><button class="prototype-check" data-action="align-report-fail">查看失败恢复</button></div>`;if(state.reportStatus==='failed')return `${alignTop('生成面试报告','sessions')}<div class="report-empty"><h2>报告生成失败</h2><p>面试场次已关闭，回答记录仍然安全保存。</p><button class="align-btn primary block" data-action="align-report-retry">单独重试报告</button></div>`;return `<div class="align-page">${alignTop(session?.status==='completed'?'面试报告':'未完成报告','sessions')}<h1 class="align-title">${esc(session?.practiceLabel||'面试')}复盘</h1><div class="prep-facts"><div class="prep-fact"><small>有效回答</small><b>${turns.length} 个</b></div><div class="prep-fact"><small>状态</small><b>${session?.status==='completed'?'已完成':'提前结束'}</b></div></div>${turns.length?turns.map((turn,i)=>`<article class="report-turn"><span class="report-label">第 ${i+1} 问</span><h3>${esc(turn.question)}</h3><button class="audio-protected" data-action="protected-audio">▶ <span><b>回听原回答</b><small>仅当前账户可访问 · ${turn.audioDuration||'00:48'}</small></span></button><span class="report-label">完整转写</span><p>${esc(turn.transcript)}</p><span class="report-label">回答证据</span><p class="evidence-quote">${esc(turn.evidence)}</p><span class="report-label">诊断</span><p>${esc(turn.diagnosis)}</p><span class="report-label">下一次改进目标</span><p>${esc(turn.target)}</p><button class="align-btn primary block" data-action="align-open-retry" data-index="${i}">同题复练</button></article>`).join(''):'<div class="report-empty">本场没有有效回答，因此没有生成问题反馈卡片。</div>'}<section class="report-language-review"><span class="review-icon">Aa</span><span><small>跨场景语言复习</small><strong>错题回顾与同题复练互不重复</strong><p>错题本只练习已收藏的表达、语法、词汇和发音。</p></span><button class="secondary" data-route="mistakes">进入错题本</button></section></div>`}
function alignedRetryV3(){const session=activeSession(),i=state.reportExpanded||0,turn=session?.turns?.[i],attempts=turn?.retryAttempts||[];if(!turn)return alignedReportV3();return `<div class="align-page">${alignTop('同题复练','report')}<span class="align-kicker">报告内专项复练</span><h1 class="align-title">重新回答同一道题</h1><div class="practice-question"><small>原问题</small>${esc(turn.question)}</div><section class="align-summary"><h3>本次改进目标</h3><p>${esc(turn.target)}</p></section>${state.retryRecording?`<textarea class="align-textarea" data-align-retry-answer>${esc(state.currentTranscript||'')}</textarea>`:''}<button class="align-btn primary block" data-action="align-retry-record">${state.retryRecording?'保存新版本':'开始复练'}</button>${attempts.length?`<h2 class="section-title">全部回答版本</h2><div class="detail-card"><b>原回答</b><p>${esc(turn.transcript)}</p></div>${attempts.map((a,n)=>`<div class="detail-card"><b>复练 ${n+1} · ${esc(a.time)}</b><p>${esc(a.transcript)}</p></div>`).join('')}`:''}<p class="align-lead" style="margin-top:14px">每次复练创建新版本，不覆盖原回答或更早版本。</p></div>`}
function alignedHomeV3(){const plans=state.plans.map(alignNormalizePlan);return `<div class="history-page"><header class="history-head"><div><small>INTERVIEW HISTORY</small><h1>面试历史</h1><p>按计划继续练习，或查看独立场次和报告。</p></div><span class="history-count">${plans.length} 个计划</span></header>${plans.length?`<section class="history-list">${plans.map(plan=>{const sessions=plan.sessions.flat(),recent=sessions.sort((a,b)=>(b.ts||0)-(a.ts||0))[0],count=sessions.length;return `<button class="history-card interview" data-action="align-open-plan" data-plan-id="${plan.id}"><span class="history-art"><i></i><i></i><i></i></span><span class="history-copy"><small>${esc(plan.candidateSource)} · ${esc(plan.createdAt)}</small><strong>${esc(plan.snapshot.jobName||'示例面试计划')}</strong><em>${count} 场练习${recent?`，最近：${esc(recent.practiceLabel||'完整模拟')}`:'，尚未开始'}</em></span><span class="history-open">进入计划</span></button>`}).join('')}</section>`:'<div class="empty-state"><b>还没有面试计划</b><p>所有信息都可以留空，也能快速体验示例流程。</p><button class="primary btn-wide" data-route="create-job">创建面试计划</button></div>'}</div>`}

views['create-job']=alignedCreateJobV3;views['create-candidate']=alignedCandidateV3;views['create-plan']=alignedCreatePlanV3;views['interviewer-loading']=alignedGenerationV3;views.interviewers=alignedInterviewerConfigV3;views.rounds=alignedRoundsV3;views['interviewer-detail']=alignedInterviewerDetailV3;views.sessions=alignedSessionsV3;
// Keep the improved interview setup, then hand control back to the original
// prototype from microphone check onward. These four surfaces intentionally use
// the earlier interaction model, including realtime mode and report retry.
views['mic-check']=ms1Mic;
views.practice=()=>addSampleAnswerFeedback(unifiedInterviewPractice());
views.report=()=>addMistakeReportEntry(alignedReport());
views.retry=()=>addRetryContext(alignedRetry());
views.home=()=>addMistakeEntry(alignedHomeV3());

function alignActivatePlan(id){const plan=alignNormalizePlan(state.plans.find(x=>x.id===id));if(!plan)return false;state.activePlanId=plan.id;state.planSnapshot=plan.snapshot;state.interviewers=plan.interviewers;state.sessionsByInterviewer=plan.sessions;state.planCarouselIndex=0;state.activeInterviewer=0;if(!plan.interviewers.length||plan.status==='configuring'){state.generationWait='configuring';state.route='interviewer-loading';setTimeout(()=>alignFinishGeneration(plan),650);return false}return true}
function alignCreatePlan(){if(state.generationWait==='creating')return;state.generationWait='creating';state.generateError='';render();const requestId=state.creationRequestId||`create-${Date.now()}`;state.creationRequestId=requestId;setTimeout(()=>{if(state.plans.some(x=>x.requestId===requestId)){state.generationWait='idle';return}let job=state.interviewDraft.jobName.trim(),jd=state.interviewDraft.jobDescription.trim();if(!job&&jd)job='从 JD 提取的后端开发工程师';if(job&&!jd)jd=`负责 ${job} 相关产品或工程工作，能够清晰说明关键经历、个人贡献和结果。`;const sampleMode=!job&&!jd&&state.candidateSource==='sample';if(!job)job='后端开发工程师';if(!jd)jd='负责可靠后端服务、异步工作流、数据一致性与生产可观测性建设。';const snapshot={jobName:job,jobDescription:jd,resumeName:state.candidateSource==='saved'?(state.resumeItems[state.selectedResumeIndex]?.name||'已保存简历'):alignCandidateLabel(),candidateProfile:state.candidateSource==='manual'?JSON.parse(JSON.stringify(state.candidateManual)):ALIGN_SAMPLE_PROFILE,focusScope:state.focusTags.join('、'),requirements:state.interviewDraft.requirements};const id=`plan-${Date.now()}`,plan={id,requestId,snapshot,candidateSource:alignCandidateLabel(),focusTags:[...state.focusTags],createdAt:'刚刚',sampleMode,interviewers:[],sessions:[],status:'configuring'};state.plans.unshift(plan);state.activePlanId=id;state.planSnapshot=snapshot;state.generationWait='configuring';state.route='interviewer-loading';render();setTimeout(()=>alignFinishGeneration(plan),750)},350)}
function alignFinishGeneration(plan){if(state.generationFailure)return;const job=plan.snapshot.jobName,templates=[
  {name:'Mia',role:'Talent Acquisition Partner',style:'温和清晰，关注动机与沟通',focus:'求职动机、英语沟通、团队匹配'},
  {name:'Ethan',role:`${job} Hiring Manager`,style:'连续追问，强调事实和所有权',focus:'个人贡献、技术判断、交付结果'},
  {name:'Lena',role:'Staff Engineer',style:'严谨直接，深入架构与代码',focus:'架构边界、可靠性、工程质量'}
].map(alignNormalizeInterviewer);plan.interviewers=templates;plan.sessions=templates.map(()=>[]);plan.status='ready';state.interviewers=templates;state.sessionsByInterviewer=plan.sessions;state.generationWait='idle';state.generationFailure=false;state.creationRequestId=null;state.planCarouselIndex=0;state.activeInterviewer=0;state.route='rounds';render();toast('面试官已经配置完成')}
function alignBindSession(session){
  const hrSession=(session.snapshot?.interviewer?.roundTitle||state.interviewers[state.activeInterviewer]?.roundTitle)==='HR 初面';
  if(hrSession){
    const technicalHrMock=/idempotency|Kafka|consumer retry|code path|transaction boundary|synchronous calls|event-driven|load-test/i;
    if((session.dynamicQuestions||[]).some(item=>technicalHrMock.test(item)))session.dynamicQuestions=[...hrQuestions];
    if((session.turnTranscripts||[]).some(item=>technicalHrMock.test(item)))session.turnTranscripts=(session.turnTranscripts||[]).map((item,i)=>technicalHrMock.test(item)?hrTranscripts[i]:item);
    if(session.retryAttempts)Object.keys(session.retryAttempts).forEach(key=>{session.retryAttempts[key]=(session.retryAttempts[key]||[]).filter(item=>!technicalHrMock.test(item.transcript||''))});
    if(session.status==='in_progress'){
      session.dynamicQuestions=[...hrQuestions];
      session.currentQuestion=hrQuestions[Math.min(session.currentTurn||0,3)];
    }
  }
  session.turnTranscripts??=(session.turns||[]).map(x=>x.transcript);
  session.dynamicQuestions??=[...(session.turns||[]).map(x=>x.question),...(session.currentQuestion&&session.status==='in_progress'?[session.currentQuestion]:[])];
  if(!session.dynamicQuestions.length)session.dynamicQuestions=[firstQuestionForPlan()];
  session.retryAttempts??={0:[],1:[],2:[],3:[]};
  session.heardQuestions??=[];
  session.interruptedTurns??=[];
  state.activeSessionId=session.id;
  state.interviewTurn=session.currentTurn||0;
  state.turnTranscripts=[...session.turnTranscripts];
  state.dynamicQuestions=[...session.dynamicQuestions];
  state.retryAttempts=session.retryAttempts;
  state.currentTranscript=transcriptsForRound()[Math.min(state.interviewTurn,3)]||'';
  state.sessionComplete=session.status==='completed';
  state.reportStatus=session.reportStatus||'ready';
}
function alignStartSession(){const practice=alignPractice(),key=practice.isFull?'full':practice.specialty.id,sessions=interviewerSessions(state.activeInterviewer),existing=sessions.find(x=>x.status==='in_progress'&&x.practiceKey===key);if(existing){alignBindSession(existing);existing.started=true;state.interviewPhase='ai';state.route='practice';render();return}const id=`session-${Date.now()}`,dynamicQuestions=[firstQuestionForPlan()],retryAttempts={0:[],1:[],2:[],3:[]},session={id,status:'in_progress',started:true,time:'刚刚',ts:Date.now(),duration:'已保存',currentTurn:0,turns:[],turnTranscripts:[],dynamicQuestions,retryAttempts,heardQuestions:[],interruptedTurns:[],practiceKey:key,practiceLabel:practice.label,practiceType:practice.isFull?'full':'specialty',specialtyId:practice.specialty?.id||null,remainingMinutes:practice.minutes,maxMain:practice.maxMain,followUpUsed:false,reportStatus:'pending',snapshot:{plan:JSON.parse(JSON.stringify(alignCurrentPlan().snapshot)),interviewer:JSON.parse(JSON.stringify(practice.interviewer)),practice:{label:practice.label,targets:[...practice.targets],minutes:practice.minutes}},currentQuestion:dynamicQuestions[0]};sessions.unshift(session);alignBindSession(session);session.started=true;state.interviewPhase='ai';state.route='practice';render()}
function alignCompleteReport(session){state.reportStatus='generating';session.reportStatus='generating';state.route='report';render();setTimeout(()=>{if(state.reportStatus==='generating'){state.reportStatus='ready';session.reportStatus='ready';render()}},850)}
function alignFinishAnswer(){const session=activeSession(),practice=alignPractice(),answer=state.currentTranscript.trim();if(answer.length<15){state.interviewPhase='invalid';state.answerError='回答过短，请再试一次';render();return}const question=session.currentQuestion,evidence=answer.split(/[.!?]/)[0].trim(),turn={id:`turn-${session.id}-${session.turns.length}`,question,transcript:answer,audioSaved:true,audioDuration:'00:48',evidence:evidence||answer,diagnosis:answer.length>90?'回答包含具体行动，但技术取舍还可以更集中。':'已经说明主要行动，仍需补充判断依据和可验证结果。',target:answer.length>90?'用一句话明确替代方案与选择依据。':'补充你亲自完成的动作和量化结果。',retryAttempts:[]};session.turns.push(turn);session.currentTurn=session.turns.length;session.remainingMinutes=Math.max(0,session.remainingMinutes-(practice.isFull?3:2));session.ts=Date.now();state.interviewTurn=session.currentTurn;state.turnTranscripts=session.turns.map(x=>x.transcript);state.interviewPhase='saved';state.currentTranscript='';alignPersist();render();setTimeout(()=>{const covered=practice.isFull?session.turns.length>=4:session.turns.length>=3;if(covered||session.currentTurn>=session.maxMain||session.remainingMinutes<=1){session.status='completed';session.duration=`${practice.minutes-session.remainingMinutes} 分钟`;state.sessionComplete=true;alignCompleteReport(session);return}const nextQuestion=alignQuestions(session,answer);if(session.currentTurn===1&&!session.followUpUsed)session.followUpUsed=true;state.interviewPhase='generating';render();setTimeout(()=>{session.currentQuestion=nextQuestion;state.interviewPhase='ai';alignPersist();render()},500)},450)}

document.addEventListener('input',event=>{const el=event.target;if(el.dataset.alignDraft)state.interviewDraft[el.dataset.alignDraft]=el.value;if(el.dataset.manual){const key=el.dataset.manual;if(Array.isArray(state.candidateManual[key]))state.candidateManual[key][Number(el.dataset.index)]=el.value;else state.candidateManual[key]=el.value}if(el.matches('[data-align-answer],[data-align-retry-answer]')){state.currentTranscript=el.value;state.answerError=''}if(el.matches('[data-align-mic]'))state.selectedMic=el.value});
document.addEventListener('click',event=>{const target=event.target.closest('[data-route="create-job"]');if(!target||['create-candidate','create-plan'].includes(state.route))return;state.interviewDraft.jobPrompt='';state.interviewDraft.jobName='';state.interviewDraft.jobDescription='';state.interviewDraft.requirements='';state.candidateSource=state.resumeItems.length?'saved':'sample';state.focusTags=['自我介绍','简历深挖','岗位能力','项目取舍','情景题','英语表达']},true);
document.addEventListener('click',event=>{const el=event.target.closest('[data-action^="align-"]');if(!el)return;event.preventDefault();event.stopImmediatePropagation();const action=el.dataset.action;
  if(action==='align-context-next'){state.interviewDraft.jobPrompt=state.interviewDraft.jobName;state.route='create-candidate';render()}
  else if(action==='align-source'){state.candidateSource=el.dataset.source;state.generateError='';render()}
  else if(action==='align-choose-upload'){state.candidateSource='upload';render()}
  else if(action==='align-upload-resume'){state.generationWait='parsing';state.generateError='';render();setTimeout(()=>{const item={name:'New_Candidate_Resume.pdf',size:'1.4 兆字节',status:'可用',experiences:4};state.resumeItems.push(item);state.selectedResumeIndex=state.resumeItems.length-1;state.generationWait='idle';render();toast('整份简历解析完成')},700)}
  else if(action==='align-add-manual'){state.candidateManual[el.dataset.key].push('');render()}
  else if(action==='align-focus'){const value=el.dataset.value,index=state.focusTags.indexOf(value);index>=0?state.focusTags.splice(index,1):state.focusTags.push(value);render()}
  else if(action==='align-create-plan')alignCreatePlan()
  else if(action==='align-retry-generation'){state.generationFailure=false;const plan=alignCurrentPlan();state.generationWait='configuring';render();setTimeout(()=>alignFinishGeneration(plan),700)}
  else if(action==='align-use-presets'){state.generationFailure=false;alignFinishGeneration(alignCurrentPlan())}
  else if(action==='align-carousel'){const total=state.interviewers.length;state.planCarouselIndex=(state.planCarouselIndex+Number(el.dataset.delta)+total)%total;state.activeInterviewer=state.planCarouselIndex;render()}
  else if(action==='align-carousel-to'){const index=Number(el.dataset.index)||0,track=document.querySelector('[data-plan-carousel]'),card=track?.querySelector(`[data-round-index="${index}"]`);state.planCarouselIndex=index;state.activeInterviewer=index;if(track&&card)track.scrollTo({left:card.offsetLeft-track.offsetLeft,behavior:'smooth'});document.querySelectorAll('.interview-plan-dots button').forEach((dot,i)=>dot.classList.toggle('active',i===index))}
  else if(action==='align-report-carousel-to'){const index=Number(el.dataset.index)||0,track=document.querySelector('[data-report-carousel]'),card=track?.querySelector(`[data-report-index="${index}"]`);state.reportCarouselIndex=index;if(track&&card)track.scrollTo({left:card.offsetLeft-track.offsetLeft,behavior:'smooth'});document.querySelectorAll('.report-question-dots button').forEach((dot,i)=>dot.classList.toggle('active',i===index))}
  else if(action==='align-context-sheet'){state.contextSheet=true;render()}
  else if(action==='align-close-context'){state.contextSheet=false;render()}
  else if(action==='align-specialties'){state.specialtySheet=true;render()}
  else if(action==='align-close-sheet'){state.specialtySheet=false;render()}
  else if(action==='align-prepare'){const index=el.dataset.index===undefined?state.planCarouselIndex:Number(el.dataset.index);state.planCarouselIndex=index;state.activeInterviewer=index;state.practiceSelection={type:el.dataset.type,specialtyId:el.dataset.specialty||null};state.specialtySheet=false;alignStartSession()}
  else if(action==='align-interviewer-detail'){state.interviewerDetailIndex=Number(el.dataset.index);state.activeInterviewer=state.interviewerDetailIndex;state.route='interviewer-detail';render()}
  else if(action==='align-open-sessions'){state.activeInterviewer=Number(el.dataset.index);state.route='sessions';render()}
  else if(action==='align-cycle-voice'){const p=state.interviewers[Number(el.dataset.index)],i=ALIGN_VOICES.indexOf(p.voice);p.voice=ALIGN_VOICES[(i+1)%ALIGN_VOICES.length];render();toast('声音已更新，仅影响后续播放')}
  else if(action==='align-confirm-remove'){state.removeInterviewerIndex=Number(el.dataset.index);state.dialogPanel='remove-interviewer';render()}
  else if(action==='align-cancel-remove'){state.dialogPanel='';render()}
  else if(action==='align-remove-interviewer'){const i=state.removeInterviewerIndex;state.interviewers.splice(i,1);state.sessionsByInterviewer.splice(i,1);state.dialogPanel='';state.planCarouselIndex=0;render();toast('面试官已删除')}
  else if(action==='align-add-interviewer'){state.interviewers.push(alignNormalizeInterviewer({name:'Noah',role:'System Design Interviewer',style:'结构化追问，关注长期演进',focus:'扩展能力、可靠性、监控体系'},state.interviewers.length));state.sessionsByInterviewer.push([]);render()}
  else if(action==='align-check-mic'){state.micPermissionChecked=true;state.micError='';render()}
  else if(action==='align-mic-test'){if(state.recording)return;state.recording=true;state.micReady=false;render();setTimeout(()=>{state.recording=false;state.micReady=true;render();toast('试音通过，测试音频不会保存')},700)}
  else if(action==='align-mic-error'){state.micPermissionChecked=true;state.micReady=false;state.recording=false;state.micError=({permission:'麦克风权限已被拒绝，请允许访问后重试。',device:'没有检测到输入设备，请连接或切换麦克风。',silence:'没有检测到有效声音，请提高输入音量后重试。'})[el.dataset.kind];render()}
  else if(action==='align-enter-interview'){const session=activeSession();session.started=true;state.interviewPhase='connecting';state.route='practice';render();setTimeout(()=>{state.interviewPhase='ai';render()},550)}
  else if(action==='align-begin-answer'){state.interviewPhase='user';state.currentTranscript='';state.answerError='';render()}
  else if(action==='align-submit-answer'){state.interviewPhase='processing';render();setTimeout(alignFinishAnswer,500)}
  else if(action==='align-replay'){state.interviewPhase='ai';render();toast('正在重新播放已保存的当前问题')}
  else if(action==='align-request-exit'){state.exitDialog='open';render()}
  else if(action==='align-cancel-exit'){state.exitDialog='';render()}
  else if(action==='align-save-exit'){state.exitDialog='';const session=activeSession();session.status='in_progress';session.ts=Date.now();state.route='sessions';render();toast('进度已保存，下次继续同一场练习')}
  else if(action==='align-end-report'){state.exitDialog='';const session=activeSession();session.status='incomplete';session.duration='提前结束';session.ts=Date.now();state.sessionComplete=false;alignCompleteReport(session)}
  else if(action==='align-reconnect'){state.interviewPhase='ai';render();toast('已重新连接，当前问题保持不变')}
  else if(action==='align-resume-session'){const session=interviewerSessions(state.activeInterviewer).find(x=>x.id===el.dataset.sessionId);alignBindSession(session);state.practiceSelection={type:session.practiceType,specialtyId:session.specialtyId};state.interviewPhase='ai';state.route='practice';render()}
  else if(action==='align-open-report'){const session=interviewerSessions(state.activeInterviewer).find(x=>x.id===el.dataset.sessionId);alignBindSession(session);state.route='report';render()}
  else if(action==='align-new-from-session'){const old=interviewerSessions(state.activeInterviewer).find(x=>x.id===el.dataset.sessionId);state.practiceSelection={type:old.practiceType,specialtyId:old.specialtyId};alignStartSession()}
  else if(action==='align-report-fail'){state.reportStatus='failed';activeSession().reportStatus='failed';render()}
  else if(action==='align-report-retry'){state.reportStatus='generating';activeSession().reportStatus='generating';render();setTimeout(()=>{state.reportStatus='ready';activeSession().reportStatus='ready';render()},700)}
  else if(action==='align-open-retry'){state.reportExpanded=Number(el.dataset.index);state.retryRecording=false;state.currentTranscript='';state.route='retry';render()}
  else if(action==='align-retry-record'){const turn=activeSession()?.turns?.[state.reportExpanded];if(!state.retryRecording){state.retryRecording=true;state.currentTranscript=turn.transcript;render()}else{turn.retryAttempts.push({time:'刚刚',transcript:state.currentTranscript,audioSaved:true});state.retryRecording=false;render();toast('新版本已保存，原回答没有被覆盖')}}
  else if(action==='align-open-plan'){const ready=alignActivatePlan(el.dataset.planId);if(ready)state.route='rounds';render()}
},true);
document.addEventListener('click',()=>setTimeout(alignPersist,0));
document.addEventListener('input',()=>setTimeout(alignPersist,0));
const alignCarouselConfig=track=>track.matches('[data-report-carousel]')?{
  cards:'[data-report-index]',dots:'.report-question-dots button',stateKey:'reportCarouselIndex',syncInterviewer:false
}:{cards:'[data-round-index]',dots:'.interview-plan-dots button',stateKey:'planCarouselIndex',syncInterviewer:true};
window.addEventListener('scroll',event=>{
  const scroller=event.target.closest?.('[data-report-scroll]');
  if(scroller&&event.target===scroller)syncReportScrollState(scroller);
  const track=event.target.closest?.('[data-plan-carousel],[data-report-carousel]');
  if(!track||event.target!==track)return;
  window.clearTimeout(track.roundScrollTimer);
  track.roundScrollTimer=window.setTimeout(()=>{
    const config=alignCarouselConfig(track),cards=[...track.querySelectorAll(config.cards)];
    if(!cards.length)return;
    const index=cards.reduce((best,card,i)=>Math.abs(card.offsetLeft-track.offsetLeft-track.scrollLeft)<Math.abs(cards[best].offsetLeft-track.offsetLeft-track.scrollLeft)?i:best,0);
    state[config.stateKey]=index;if(config.syncInterviewer)state.activeInterviewer=index;
    track.parentElement.querySelectorAll(config.dots).forEach((dot,i)=>dot.classList.toggle('active',i===index));
  },50);
},true);
window.addEventListener('wheel',event=>{
  const track=event.target.closest?.('[data-plan-carousel],[data-report-carousel]');
  if(!track||Math.abs(event.deltaY)<=Math.abs(event.deltaX)||Math.abs(event.deltaY)<4)return;
  const config=alignCarouselConfig(track),cards=[...track.querySelectorAll(config.cards)];
  if(!cards.length)return;
  const current=cards.reduce((best,card,i)=>Math.abs(card.offsetLeft-track.offsetLeft-track.scrollLeft)<Math.abs(cards[best].offsetLeft-track.offsetLeft-track.scrollLeft)?i:best,0);
  if(track.matches('[data-report-carousel]')){
    const scroller=cards[current]?.querySelector('[data-report-scroll]');
    if(scroller){
      const max=Math.max(0,scroller.scrollHeight-scroller.clientHeight);
      const canScrollDown=event.deltaY>0&&scroller.scrollTop<max-3;
      const canScrollUp=event.deltaY<0&&scroller.scrollTop>3;
      if(canScrollDown||canScrollUp){
        event.preventDefault();
        scroller.scrollTop=Math.max(0,Math.min(max,scroller.scrollTop+event.deltaY));
        syncReportScrollState(scroller);
        return;
      }
    }
  }
  event.preventDefault();
  if(track.roundWheelLocked)return;
  const index=Math.max(0,Math.min(cards.length-1,current+Math.sign(event.deltaY)));
  const card=cards[index];
  if(!card||index===current)return;
  track.roundWheelLocked=true;
  state[config.stateKey]=index;if(config.syncInterviewer)state.activeInterviewer=index;
  track.scrollTo({left:card.offsetLeft-track.offsetLeft,behavior:'smooth'});
  syncReportScrollState(card.querySelector?.('[data-report-scroll]'));
  track.parentElement.querySelectorAll(config.dots).forEach((dot,i)=>dot.classList.toggle('active',i===index));
  window.setTimeout(()=>{track.roundWheelLocked=false},320);
},{capture:true,passive:false});
window.addEventListener('beforeunload',alignPersist);

render();
