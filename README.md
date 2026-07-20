# AI 英语口语陪练

面向国际化技术岗位候选人的 AI 英文面试陪练产品，通过岗位背景、角色化面试、证据反馈和同题复练帮助用户提升真实表达能力。

5 人团队 · 8 周 · 2026-07-06 起

## 技术栈

Flutter · Go + Gin · PostgreSQL · REST + WebSocket · 可替换 ASR / LLM / TTS Provider

## 安装 Skills

本项目 `.agents/skills/` 下包含 Codex 团队工作流 skills，进入项目后自动加载。

### Codex

```bash
git clone https://github.com/Lq0412/ai-en-coach.git
cd ai-en-coach
# .agents/skills/ 自动生效，无需复制
```

如需在其他项目复用，可选择性复制到 Codex 全局 skills：

```bash
cp -r .agents/skills/issue-standard ~/.codex/skills/issue-standard
cp -r .agents/skills/pr-commit ~/.codex/skills/pr-commit
cp -r .agents/skills/code-discipline ~/.codex/skills/code-discipline
# …选择你需要的 skill
```

### 可用 Skills

| Skill | 用途 |
|-------|------|
| `issue-standard` | Issue 模板、标签、拆分 |
| `pr-commit` | Commit 格式、PR 四段描述 |
| `code-discipline` | 编码纪律、禁止项 |
| `branch-commit` | 分支管理、提交频率 |
| `pr-review` | Review 流程、合入条件 |
| `milestone-manager` | Milestone 创建、进度跟踪 |
| `release-tag` | Tag 命名、Release Notes |
| `product-killshot` | 竞品分析 + 产品优化报告 |
| `ai-design-smell` | AI 生成设计味识别与修复 |
| `web-to-design-md` | 竞品网站提取设计系统 |

## 内部文档

以下文档随项目同步，用于团队协作。

参与开发前请先阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md)。Issue、分支、Commit、PR、Review 与 Release 的完整规则见 [`reference/GitHub过程管理规范.md`](reference/GitHub过程管理规范.md)。

```
docs/
└── week1/
    ├── meetings/
    ├── 林锵/
    ├── 覃迦迎/
    ├── 黄天宇/
    ├── 张思成/
    ├── 智铭威/
    └── ...
```

| 文档 | 路径 |
|------|------|
| 竞品杀手锏报告 | `docs/ms1/week1/林锵/2026-07-07-竞品杀手锏报告.md` |
| 项目简述 | `docs/ms1/week1/林锵/2026-07-08-项目简述.md` |
| 市场调研分工 | `docs/ms1/week1/林锵/2026-07-08-市场调研分工.md` |
| 技术预研分工 | `docs/ms1/week1/林锵/2026-07-08-技术预研分工.md` |
| 前端技术选型调研 | `docs/ms1/week1/林锵/2026-07-08-前端技术选型调研.md` |
| 团队技术画像 | `docs/ms1/week1/林锵/2026-07-08-团队技术画像.md` |
| 产品方向评估 | `docs/ms1/week1/张思成/2026-07-08-产品方向评估.md` |
| 数据库选型调研 | `docs/ms1/week1/张思成/2026-07-08-数据库选型调研.md` |
| AI英语口语调研 | `docs/ms1/week1/覃迦迎/2026-07-07-AI英语口语调研.md` |
| 用户需求调研综合报告 | `docs/ms1/week1/覃迦迎/2026-07-08-用户需求调研综合报告.md` |
| AI口语陪练产品调研 | `docs/ms1/week1/黄天宇/2026-07-07-AI口语陪练产品调研.md` |
| 竞品调研补充（海外） | `docs/ms1/week1/黄天宇/2026-07-08-AI口语陪练产品调研-补充海外APP.md` |
| 未满足需求 Top10 | `docs/ms1/week1/黄天宇/2026-07-08-未满足需求Top10.md` |
| 市场数据摘录 | `docs/ms1/week1/智铭威/2026-07-08-市场数据摘录.md` |
| 会议纪要 | `docs/ms1/week1/meetings/` |
| 参考规范 | `reference/` |

## SpeakUp Web 产品原型

`prototype/` 目录包含可交互的 SpeakUp 产品原型，覆盖模拟面试创建、多轮及分阶段练习、实时/气泡对话、练习历史、报告、错题回顾、角色创建与个人中心等流程。

### 本地运行

```bash
cd prototype
npm install
npm run dev
```

启动后访问开发服务器首页，或直接查看 `prototype/speakup-premium/pages/prototype.html`。

### 构建

```bash
cd prototype
npm run build
```

### Milestone 原型归档

`prototype/` 始终只保留当前开发版本。每个 Milestone 结束后，在通过验证的 commit 上创建对应 Tag，并将静态原型 ZIP 作为 GitHub Release 附件；仓库内不复制多份历史原型，也不维护 `deliverables/` 副本。
