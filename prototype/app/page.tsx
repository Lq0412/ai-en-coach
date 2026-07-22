const prototypeHref = "/pages/prototype.html";

const taskExamples = [
  {
    type: "英文面试",
    copy: "我下周要面试这家公司。",
    detail: "结合 JD、简历和项目经历，完成多轮追问与复练。",
  },
  {
    type: "客户沟通",
    copy: "明天我要向客户解释延期。",
    detail: "先讲清现状，再回应质疑并准备补救方案。",
  },
  {
    type: "会议表达",
    copy: "这场会议上我要反对老板的方案。",
    detail: "提出不同意见，解释依据，并推动下一步决策。",
  },
  {
    type: "绩效沟通",
    copy: "我要和海外主管谈绩效。",
    detail: "围绕贡献、反馈和职业发展进行关键对话。",
  },
];

const productFeatures = [
  {
    index: "01",
    title: "说出任务，确认岗位和经历",
    copy: "告诉 SpeakUp 下周要面试什么岗位。它会结合 JD 和简历，先生成常见的一对一多轮计划。",
    image: "/assets/portal-shots/portal-interview-start.jpg",
    alt: "SpeakUp 根据后端开发工程师 JD 和简历生成四轮一对一面试计划",
    status: "提出任务",
  },
  {
    index: "02",
    title: "进入一对一压力排练",
    copy: "围绕同一份岗位与项目经历持续追问，在语音回答中暴露真正容易卡住的技术表达。",
    image: "/assets/portal-shots/portal-interview-practice.jpg",
    alt: "SpeakUp 角色化英文面试连续追问界面",
    status: "语音排练",
  },
  {
    index: "03",
    title: "用回答证据决定下一次练什么",
    copy: "逐题保留原回答、转写、诊断和改进目标，并从同一道问题开始下一次复练。",
    image: "/assets/portal-shots/portal-evidence-report.jpg",
    alt: "SpeakUp 英文沟通练后报告界面",
    status: "报告复练",
  },
  {
    index: "04",
    title: "回来时，直接从上次继续",
    copy: "SpeakUp 会在普通对话中引用上次卡点和已经改善的地方，并据此改变下一轮练习重点。",
    image: "/assets/portal-shots/portal-memory-chat.jpg",
    alt: "SpeakUp 在普通对话中引用过往练习证据并安排下一轮重点",
    status: "继续推进",
  },
];

const productPrinciples = [
  {
    index: "01",
    title: "从真实任务开始",
    copy: "不需要先选课程或设计 Prompt，直接说清楚下一场沟通要面对谁、解决什么。",
  },
  {
    index: "02",
    title: "不用每次从头解释",
    copy: "SpeakUp 会在后续对话里引用已经确认的岗位、经历、卡点和改善，不让每次练习重新开始。",
  },
  {
    index: "03",
    title: "跟到现实产生结果",
    copy: "真实沟通结束后，把新的追问和卡点带回来，成为下一轮准备与排练的依据。",
  },
];

export default function Home() {
  return (
    <main>
      <div className="announcement">
        <span>SpeakUp 模拟面试现已开放</span>
        <span className="announcement-separator" aria-hidden="true">·</span>
        <a href={prototypeHref} target="_blank" rel="noreferrer">
          立即体验 <span aria-hidden="true">↗</span>
        </a>
      </div>

      <nav className="site-nav" aria-label="主导航">
        <a className="brand" href="#top" aria-label="SpeakUp 首页">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>SpeakUp</span>
        </a>
        <div className="nav-links">
          <a href="#demo">完整演示</a>
          <a href="#how-it-works">产品方式</a>
          <a href="#use-cases">适用场景</a>
        </div>
        <a className="button button-small" href={prototypeHref} target="_blank" rel="noreferrer">
          体验模拟面试
        </a>
      </nav>

      <header className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">你的职业英语联系人</p>
          <h1>
            <span className="headline-muted">下一场重要的英文沟通，</span>
            <br />
            先和 SpeakUp 说一遍。
          </h1>
          <p className="hero-subtitle">
            带着明天的面试、客户会议或绩效沟通来。SpeakUp 结合你的职业背景，
            先帮你准备能直接使用的表达，需要时模拟追问，事情结束后继续复盘。
          </p>
          <div className="button-group">
            <a className="button" href={prototypeHref} target="_blank" rel="noreferrer">
              体验模拟面试 <span aria-hidden="true">↗</span>
            </a>
            <a className="button button-secondary" href="#demo">
              查看完整演示
            </a>
          </div>
          <p className="hero-note">完整案例：后端开发工程师英文面试</p>
        </div>

        <div className="hero-product" aria-label="SpeakUp 后端开发工程师模拟面试示例">
          <div className="hero-product-copy">
            <span className="demo-label">完整演示 · 后端开发工程师</span>
            <p className="demo-question">我下周要面试后端开发工程师，重点练系统设计和技术取舍。</p>
            <div className="voice-answer">
              <span className="voice-icon" aria-hidden="true">●</span>
              <div className="voice-bars" aria-hidden="true">
                <i /><i /><i /><i /><i /><i /><i /><i />
              </div>
              <span>0:16</span>
            </div>
            <p className="demo-answer">收到。我会先按常见的一对一流程，结合岗位要求和你的项目经历安排练习。</p>
            <div className="instant-feedback">
              <span>完整流程</span>
              <p><strong>确认任务</strong> → 一对一排练 → 证据复盘 → 从上次继续</p>
            </div>
          </div>
          <div className="hero-phone">
            <img
              src="/assets/portal-shots/portal-interview-start.jpg"
              alt="SpeakUp 为后端开发工程师生成四轮一对一模拟面试计划"
            />
          </div>
          <span className="floating-chip chip-top">岗位与经历</span>
          <span className="floating-chip chip-bottom">先从一对一开始</span>
        </div>
      </header>

      <section className="features-section" id="demo">
        <div className="section-intro dark-copy">
          <p className="eyebrow">完整演示 · 后端开发工程师英文面试</p>
          <h2>说出任务、练一遍、看证据，<br />再从上次继续。</h2>
          <p>四个界面属于同一位候选人和同一个目标岗位，完整展示 SpeakUp 如何让一次练习继续服务下一次表现。</p>
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

      <section className="principles-section" id="how-it-works">
        <div className="section-intro centered dark-copy">
          <p className="eyebrow">它不只是一次模拟</p>
          <h2>围绕真实任务，<br />形成<em>长期进步</em>。</h2>
          <p>一次练习的内容会继续服务下一次准备，而不是在对话关闭后消失。</p>
        </div>
        <div className="principle-grid">
          {productPrinciples.map((principle) => (
            <article className="principle-item" key={principle.index}>
              <span>{principle.index}</span>
              <h3>{principle.title}</h3>
              <p>{principle.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="use-cases-section" id="use-cases">
        <div className="section-intro dark-copy">
          <p className="eyebrow">不只用于面试</p>
          <h2>下一场重要沟通，<br />都可以从这里开始。</h2>
          <p>模拟面试提供从准备到复练的完整流程；同样的任务准备方式，也适用于客户、会议和绩效沟通。</p>
        </div>
        <div className="task-examples" aria-label="SpeakUp 可以帮助准备的真实任务">
          {taskExamples.map((task) => (
            <article className="task-example" key={task.type}>
              <div className="task-example-meta"><span>{task.type}</span></div>
              <p>“{task.copy}”</p>
              <small>{task.detail}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="final-cta">
        <p className="eyebrow eyebrow-light">从下一场英文面试开始</p>
        <h2>上传岗位和经历，<br />开始第一轮模拟。</h2>
        <p>先完成一场后端开发工程师模拟面试，再让 SpeakUp 在下一次沟通中接着帮助你。</p>
        <div className="button-group">
          <a className="button" href={prototypeHref} target="_blank" rel="noreferrer">开始模拟面试 ↗</a>
          <a className="button button-dark-secondary" href="#top">回到顶部</a>
        </div>
      </section>

      <footer>
        <a className="brand" href="#top"><span className="brand-mark" aria-hidden="true">S</span><span>SpeakUp</span></a>
        <p>AI 职业英文沟通 Agent</p>
        <span>© 2026 SpeakUp</span>
      </footer>
    </main>
  );
}
