import InterviewDemo from "./InterviewDemo";

const prototypeHref = "/pages/prototype.html";

const journeyStages = [
  {
    index: "01",
    stage: "考出去",
    type: "雅思口语",
    copy: "按 Part 1、2、3 的真实结构限时作答，从逐句证据回到同题复练。",
    action: "开始 Part 2 模拟",
    href: `${prototypeHref}#ielts-part2-practice`,
  },
  {
    index: "02",
    stage: "面进去",
    type: "英文面试",
    copy: "结合 JD、简历和项目经历，生成多轮面试计划并持续压力追问。",
    action: "生成面试方案",
    href: `${prototypeHref}#portal-interview-start`,
  },
  {
    index: "03",
    stage: "活下来",
    type: "海外日常",
    copy: "把下一件要办的事直接告诉 Agent。它会识别对方、目标和不能遗漏的信息，再接管角色追问。",
    action: "告诉 Agent 一件事",
    href: `${prototypeHref}#daily-doctor-brief`,
  },
  {
    index: "04",
    stage: "发展好",
    type: "国际职场",
    copy: "先拿到能直接使用的表达，再排练客户、会议和绩效沟通中的追问。",
    action: "准备客户会议",
    href: `${prototypeHref}#workplace-client-brief`,
  },
];

const scenarioProofs = [
  {
    type: "雅思口语",
    title: "不只给一个分数，而是保留每一句回答的证据。",
    copy: "题卡、计时、转写和逐句建议在同一页完成，用户可以直接回到同一道题继续说。",
    image: "/assets/portal-shots/portal-ielts-part2.jpg",
    alt: "SpeakUp IELTS Part 2 限时作答与逐句反馈界面",
    href: `${prototypeHref}#ielts-part2-practice`,
    action: "查看雅思口语 Mock",
  },
  {
    type: "海外日常",
    title: "不需要创建“场景”，把眼前的事直接告诉 Agent。",
    copy: "SpeakUp 会从自然语言里识别人物、目标和限制条件，先给出能直接使用的表达，再接管角色进行追问。",
    image: "/assets/portal-shots/portal-daily-doctor.jpg",
    alt: "SpeakUp 从自然语言中理解海外就医任务并给出可直接使用的表达",
    href: `${prototypeHref}#daily-doctor-brief`,
    action: "看看 Agent 如何接住就医任务",
  },
  {
    type: "国际职场",
    title: "先拿到可直接使用的表达，再进入客户压力追问。",
    copy: "结合项目背景、客户关注点和承诺边界，先准备表达，再模拟对方最可能提出的质疑。",
    image: "/assets/portal-shots/portal-workplace-client.jpg",
    alt: "SpeakUp 海外客户延期沟通准备与压力排练方案",
    href: `${prototypeHref}#workplace-client-brief`,
    action: "查看工作沟通 Mock",
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
    href: `${prototypeHref}#portal-interview-start`,
    action: "查看任务理解",
  },
  {
    index: "02",
    title: "单面之外，也能应对多人连续追问",
    copy: "三位面试官共享同一份 JD、简历与回答上下文，下一位会沿着刚才的回答继续深挖。",
    image: "/assets/portal-shots/portal-panel-practice.jpg",
    alt: "SpeakUp 多面试官模拟中三位面试官根据同一段回答连续追问",
    status: "单面 / 群面",
    href: `${prototypeHref}#portal-panel-practice`,
    action: "体验多面试官模拟",
  },
  {
    index: "03",
    title: "练完以后，Agent 直接告诉你下一步",
    copy: "不是把用户丢进一份长报告。SpeakUp 会判断最值得先改的一点、说明依据，并直接发起下一轮追问。",
    image: "/assets/portal-shots/portal-evidence-report.jpg",
    alt: "SpeakUp 在面试结束后给出一条优先级明确的精简建议",
    status: "即时建议",
    href: `${prototypeHref}#portal-agent-debrief`,
    action: "查看 Agent 建议",
  },
  {
    index: "04",
    title: "它记得的，是你的目标和能力变化",
    copy: "Memory 会持续记住岗位、真实项目、反复卡点和已经改善的能力，并据此重新排序下一轮重点。",
    image: "/assets/portal-shots/portal-memory-chat.jpg",
    alt: "SpeakUp Memory 在对话中使用长期目标、真实项目、重复卡点与能力变化",
    status: "Memory 驱动",
    href: `${prototypeHref}#career-context`,
    action: "查看 Memory 如何工作",
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
    title: "Memory 记住成长轨迹",
    copy: "不只是聊天历史。SpeakUp 记得你要面对谁、用过哪些真实经历、哪些能力反复卡住、哪些已经改善。",
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
          <a href="#use-cases">适用任务</a>
          <a href="#demo">完整演示</a>
          <a href="#how-it-works">产品方式</a>
        </div>
        <a className="button button-small" href={`${prototypeHref}#agent-chat`} target="_blank" rel="noreferrer">
          体验 SpeakUp
        </a>
      </nav>

      <header className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">面向真实任务的英语沟通 Agent</p>
          <h1>
            <span className="headline-muted">下一场重要的英文沟通，</span>
            <br />
            先和 SpeakUp 练一遍。
          </h1>
          <p className="hero-subtitle">
            说出你接下来要面对什么，SpeakUp 会结合目标、经历和过往练习，帮你准备、排练和复盘。
          </p>
          <div className="hero-scenario-links" aria-label="选择想准备的英语任务">
            {journeyStages.map((item) => (
              <a key={item.type} href={item.href} target="_blank" rel="noreferrer" data-scenario={item.type}>
                {item.type}
              </a>
            ))}
          </div>
          <div className="button-group">
            <a className="button" href={`${prototypeHref}#agent-chat`} target="_blank" rel="noreferrer">
              告诉 SpeakUp 我要面对什么 <span aria-hidden="true">↗</span>
            </a>
            <a className="button button-secondary" href="#use-cases">
              查看四类任务
            </a>
          </div>
          <p className="hero-note">当前完整演示：后端开发工程师英文面试</p>
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
            <p className="demo-answer">收到。我会结合岗位要求和项目经历，先确认单面或群面，再安排对应的连续追问。</p>
            <div className="instant-feedback">
              <span>完整流程</span>
              <p><strong>确认任务</strong> → 单面 / 群面 → Agent 建议 → Memory 调整</p>
            </div>
          </div>
          <div className="hero-phone">
            <img
              src="/assets/portal-shots/portal-interview-start.jpg"
              alt="SpeakUp 为后端开发工程师生成四轮一对一模拟面试计划"
            />
          </div>
          <span className="floating-chip chip-top">岗位与经历</span>
          <span className="floating-chip chip-bottom">单面 / 群面可选</span>
        </div>
      </header>

      <section className="journey-section" id="use-cases">
        <div className="section-intro dark-copy">
          <p className="eyebrow">从任何阶段开始</p>
          <h2>考出去、面进去、活下来，<br />再到真正发展好。</h2>
          <p>四类任务共用同一个 SpeakUp：先理解下一件要发生的事，再准备、排练、复盘，并把结果带到下一次。</p>
        </div>
        <div className="journey-grid" aria-label="SpeakUp 覆盖的四类真实英语任务">
          {journeyStages.map((item) => (
            <article className="journey-card" key={item.type}>
              <div className="journey-meta"><span>{item.index}</span><em>{item.stage}</em></div>
              <h3>{item.type}</h3>
              <p>{item.copy}</p>
              <a href={item.href} target="_blank" rel="noreferrer" data-scenario={item.type}>
                {item.action} <span aria-hidden="true">↗</span>
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="features-section" id="demo">
        <div className="section-intro dark-copy">
          <p className="eyebrow">完整演示 · 后端开发工程师英文面试</p>
          <h2>一次面试任务，<br />看见 Agent 的四种能力。</h2>
          <p>从理解任务到单面 / 多面试官模拟，再到即时建议和长期 Memory；四步共用同一位候选人与同一个目标岗位。</p>
        </div>
        <InterviewDemo features={productFeatures} />
      </section>

      <section className="scenario-proof-section">
        <div className="section-intro dark-copy">
          <p className="eyebrow">不只是一场英文面试</p>
          <h2>同一个 Agent，<br />接住不同的真实任务。</h2>
          <p>结构化考试可以进入专门训练；生活与工作不要求用户先创建场景，只需把事情说出来，SpeakUp 负责理解背景、整理表达并模拟对方。</p>
        </div>
        <div className="scenario-proof-list">
          {scenarioProofs.map((proof, index) => (
            <article className="scenario-proof-card" key={proof.type}>
              <div className="scenario-proof-copy">
                <div><span>{String(index + 1).padStart(2, "0")}</span><em>{proof.type}</em></div>
                <h3>{proof.title}</h3>
                <p>{proof.copy}</p>
                <a href={proof.href} target="_blank" rel="noreferrer" data-scenario={proof.type}>
                  {proof.action} <span aria-hidden="true">↗</span>
                </a>
              </div>
              <div className="scenario-proof-shot">
                <img src={proof.image} alt={proof.alt} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="principles-section" id="how-it-works">
        <div className="section-intro centered dark-copy">
          <p className="eyebrow">四类任务，共用同一个 SpeakUp</p>
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

      <section className="final-cta">
        <p className="eyebrow eyebrow-light">从下一件必须说清楚的事开始</p>
        <h2>告诉 SpeakUp，<br />接下来要面对什么。</h2>
        <p>可以是一场雅思口语考试、英文面试，也可以是海外生活和工作里马上要发生的关键沟通。</p>
        <div className="button-group">
          <a className="button" href={`${prototypeHref}#agent-chat`} target="_blank" rel="noreferrer">开始一次任务准备 ↗</a>
          <a className="button button-dark-secondary" href="#top">回到顶部</a>
        </div>
      </section>

      <footer>
        <a className="brand" href="#top"><span className="brand-mark" aria-hidden="true">S</span><span>SpeakUp</span></a>
        <p>面向真实任务的英语沟通 Agent</p>
        <span>© 2026 SpeakUp</span>
      </footer>
    </main>
  );
}
