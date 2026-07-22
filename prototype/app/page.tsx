const prototypeHref = "/pages/prototype.html";

const interviewStages = [
  "HR 初面",
  "项目深挖",
  "系统设计",
  "综合终面",
];

const productFeatures = [
  {
    index: "01",
    title: "带着真实岗位来",
    copy: "把目标岗位、JD 和确认过的经历交给 SpeakUp，直接准备这一次真正要面对的英文面试。",
    image: "/assets/portal-shots/r3-scenes.png",
    alt: "SpeakUp 模拟面试场景列表原型",
    status: "准备",
  },
  {
    index: "02",
    title: "在压力里被继续追问",
    copy: "不是读完一道题就结束。角色化面试官会根据上一轮回答继续问，让你练到真正容易卡住的地方。",
    image: "/assets/portal-shots/m1-interview-chat.png",
    alt: "SpeakUp 角色化英文面试对话原型",
    status: "排练",
  },
  {
    index: "03",
    title: "带着证据回来复盘",
    copy: "保留原回答、追问、诊断和下一次改进目标。不是泛泛地打分，而是明确下一轮要补哪一块。",
    image: "/assets/portal-shots/r6-report.png",
    alt: "SpeakUp 英文面试报告原型",
    status: "复盘",
  },
];

export default function Home() {
  return (
    <main>
      <div className="announcement">
        <span>SpeakUp 门户第一版</span>
        <span className="announcement-separator" aria-hidden="true">·</span>
        <a href={prototypeHref} target="_blank" rel="noreferrer">
          直接查看交互原型 <span aria-hidden="true">↗</span>
        </a>
      </div>

      <nav className="site-nav" aria-label="主导航">
        <a className="brand" href="#top" aria-label="SpeakUp 首页">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>SpeakUp</span>
        </a>
        <div className="nav-links">
          <a href="#mock-interview">模拟面试</a>
          <a href="#prototype">准备 · 排练 · 复盘</a>
          <a href="#context">职业上下文</a>
          <a href="#outcome">真实结果</a>
        </div>
        <a className="button button-small" href={prototypeHref} target="_blank" rel="noreferrer">
          打开原型
        </a>
      </nav>

      <header className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">AI 英文模拟面试</p>
          <h1>
            <span className="headline-muted">下一场英文面试，</span>
            <br />
            先和 SpeakUp 练一遍。
          </h1>
          <p className="hero-subtitle">
            根据你的岗位和真实经历进行模拟追问；练完得到反馈，
            下次还能从上次卡住的地方继续。
          </p>
          <div className="button-group">
            <a className="button" href={prototypeHref} target="_blank" rel="noreferrer">
              开始模拟面试 <span aria-hidden="true">↗</span>
            </a>
            <a className="button button-secondary" href="#prototype">
              看产品怎么练
            </a>
          </div>
          <p className="hero-note">当前为产品验证原型 · 建议使用桌面端查看完整流程</p>
        </div>

        <div className="hero-product" aria-label="SpeakUp 模拟面试产品演示">
          <div className="hero-product-copy">
            <span className="demo-label">正在进行 · HR 初面</span>
            <p className="demo-question">Tell me about a project you owned end to end.</p>
            <div className="voice-answer">
              <span className="voice-icon" aria-hidden="true">●</span>
              <div className="voice-bars" aria-hidden="true">
                <i /><i /><i /><i /><i /><i /><i /><i />
              </div>
              <span>0:12</span>
            </div>
            <p className="demo-answer">
              I owned the product definition <em>since five years</em> and worked with design and engineering to ship it.
            </p>
            <div className="instant-feedback">
              <span>即时反馈</span>
              <p><s>since five years</s> → <strong>for five years</strong></p>
            </div>
          </div>
          <div className="hero-phone">
            <img
              src="/assets/portal-shots/m1-interview-chat.png"
              alt="SpeakUp 英文模拟面试对话页面"
            />
          </div>
          <span className="floating-chip chip-top">真实追问</span>
          <span className="floating-chip chip-bottom">说完即反馈</span>
        </div>
      </header>

      <section className="dark-section" id="mock-interview">
        <div className="section-intro">
          <p className="eyebrow eyebrow-light">完整模拟，也可以只练一轮</p>
          <h2>更像真的面试，<em>不是背题。</em></h2>
          <p>
            先用“模拟面试”验证最强需求。其他职业英语场景以后仍可接入，但这一版门户不把所有方向同时塞进首屏。
          </p>
        </div>

        <div className="stage-pills" aria-label="模拟面试阶段示意">
          {interviewStages.map((stage, index) => (
            <span className={index === 1 ? "stage-pill active" : "stage-pill"} key={stage}>
              {stage}
            </span>
          ))}
        </div>

        <div className="interview-showcase">
          <div className="interviewer-board">
            <div className="board-meta">
              <span>模拟面试计划</span>
              <strong>后端开发工程师</strong>
            </div>
            <div className="interviewer-row">
              <span className="avatar avatar-lilac">M</span>
              <div><strong>Mia</strong><small>HR · 求职动机与匹配度</small></div>
              <span>15 min</span>
            </div>
            <div className="interviewer-row selected">
              <span className="avatar avatar-orange">N</span>
              <div><strong>Noah</strong><small>工程经理 · 项目深挖</small></div>
              <span>20 min</span>
            </div>
            <div className="interviewer-row">
              <span className="avatar avatar-green">E</span>
              <div><strong>Ethan</strong><small>技术负责人 · 系统设计</small></div>
              <span>20 min</span>
            </div>
            <a className="button board-button" href={prototypeHref} target="_blank" rel="noreferrer">
              开始这一轮
            </a>
          </div>
          <div className="showcase-copy">
            <span className="section-number">01 / 模拟面试</span>
            <h3>让面试官根据你的回答，继续问下去。</h3>
            <p>
              现有原型已经包含岗位创建、简历经历、多个面试官、语音问答、报告和复练。门户先把这条链路讲清楚。
            </p>
            <a href={prototypeHref} target="_blank" rel="noreferrer">体验完整流程 ↗</a>
          </div>
        </div>
      </section>

      <section className="comparison-section" id="how-it-works">
        <div className="section-intro centered dark-copy">
          <p className="eyebrow">每说完一轮，就获得下一步</p>
          <h2>练习不是终点。<br /><em>下一次表现</em>才是。</h2>
          <p>每次回答都留下可回看的问题、表达和改进目标，让下一轮练习不必从零开始。</p>
        </div>

        <div className="comparison-grid">
          <div className="comparison-card muted-card">
            <div className="comparison-heading"><span>独自准备</span><strong>只有一段答案</strong></div>
            <p className="rough-answer">
              I have worked as a backend engineer since five years. I am responsible for many projects and communicate with teams.
            </p>
            <div className="placeholder-wave" aria-hidden="true" />
            <small>不知道面试官会追问什么，也不知道下一次该改哪里。</small>
          </div>
          <div className="comparison-card result-card">
            <div className="comparison-heading"><span>SpeakUp</span><strong>回答、追问、反馈</strong></div>
            <div className="result-line"><span>表达修正</span><p><s>since five years</s> → <strong>for five years</strong></p></div>
            <div className="result-line"><span>内容追问</span><p>What changed because of your decision?</p></div>
            <div className="result-line"><span>下次目标</span><p>补充一个能证明个人影响力的结果。</p></div>
          </div>
        </div>
      </section>

      <section className="features-section" id="prototype">
        <div className="section-intro dark-copy">
          <p className="eyebrow">围绕一场真实面试</p>
          <h2>准备、排练，再带着证据复盘。</h2>
          <p>三步都使用当前产品原型。门户不靠抽象概念解释差异，而是直接展示用户怎样完成一次面试准备。</p>
        </div>

        <div className="feature-grid">
          {productFeatures.map((feature) => (
            <article className="feature-card" key={feature.index}>
              <div className="feature-card-copy">
                <div className="feature-card-meta"><span>{feature.index}</span><em>{feature.status}</em></div>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
              </div>
              <div className="feature-shot">
                <img src={feature.image} alt={feature.alt} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="context-section" id="context">
        <div className="context-shot">
          <div className="context-shot-frame">
            <img src="/assets/portal-shots/m5-history.png" alt="SpeakUp 面试历史与练习进度原型" />
          </div>
          <span className="context-stamp">不用从头开始</span>
        </div>
        <div className="context-copy">
          <p className="eyebrow eyebrow-light">职业上下文连续</p>
          <h2>记得的不是闲聊，<br />是你正在面对的事。</h2>
          <p>
            SpeakUp 保存与这场面试直接相关、并经过用户确认的上下文。回来时，可以从上次进度继续。
          </p>
          <ul className="context-list">
            <li><span>01</span><div><strong>目标岗位与经历</strong><small>继续使用已经确认过的岗位、JD 和经历快照。</small></div></li>
            <li><span>02</span><div><strong>追问与练习进度</strong><small>知道练到哪位面试官、哪道问题和哪一个版本。</small></div></li>
            <li><span>03</span><div><strong>反复卡住的地方</strong><small>把需要复练的回答带到下一轮，而不是永久记录每一个错误。</small></div></li>
          </ul>
          <p className="context-note">记录应当有来源、可查看、可修改和可删除。</p>
        </div>
      </section>

      <section className="outcome-section" id="outcome">
        <div className="outcome-copy">
          <span className="placeholder-label">REAL-WORLD FOLLOW-UP · 待验证</span>
          <h2>别在练习结束时结束。</h2>
          <p>
            真实面试之后，邀请用户回来复盘发生了什么。把真实追问和卡点关联到岗位与项目，形成下一轮训练策略。
          </p>
          <span className="outcome-status">待验证：用户是否愿意在面试后回来复盘</span>
        </div>
        <div className="outcome-dialogue" aria-label="真实面试后复盘对话占位">
          <div className="dialogue-message agent-message"><small>SpeakUp · 第二天</small><p>昨天那场面试怎么样？</p></div>
          <div className="dialogue-message user-message"><p>项目经历答得还行，但面试官问为什么没选另一个方案时，我卡住了。</p></div>
          <div className="dialogue-message agent-message"><small>下一轮策略</small><p>明白。下一轮重点练“方案取舍”，并补充与这个项目直接相关的对比依据。</p></div>
          <span className="dialogue-placeholder">产品行为占位 · 后续验证后接入原型</span>
        </div>
      </section>

      <section className="final-cta">
        <p className="eyebrow eyebrow-light">从一场真实面试开始</p>
        <h2>用一场真实面试，<br />试试 SpeakUp。</h2>
        <p>当前验证入口是模拟面试；长期价值，是记住职业上下文，并让真实结果成为下一次练习的依据。</p>
        <div className="button-group">
          <a className="button" href={prototypeHref} target="_blank" rel="noreferrer">打开产品原型 ↗</a>
          <a className="button button-dark-secondary" href="#top">回到顶部</a>
        </div>
      </section>

      <footer>
        <a className="brand" href="#top"><span className="brand-mark" aria-hidden="true">S</span><span>SpeakUp</span></a>
        <p>AI 英文模拟面试 · 产品验证门户</p>
        <span>Prototype 2026</span>
      </footer>
    </main>
  );
}
