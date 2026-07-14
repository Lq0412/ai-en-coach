# AI 英语口语陪练

面向外语学习者的 AI 口语对话训练工具，重点解决低延迟、可打断、发音评测与表达纠错。

5 人团队 · 8 周 · 2026-07-08 起

## 技术栈

React Native · Go · MySQL · Deepgram ASR · OpenAI TTS

## 安装 Skills

本项目 `.agents/skills/` 下包含 Codex 团队工作流 skills，进入项目后自动加载。

### Codex

```bash
git clone https://github.com/Lq0412/ai-en-coach.git
cd ai-en-coach
git config core.hooksPath .githooks   # 启用项目 Git hooks
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
| 竞品杀手锏报告 | `docs/week1/林锵/2026-07-07-竞品杀手锏报告.md` |
| 项目简述 | `docs/week1/林锵/2026-07-08-项目简述.md` |
| 市场调研分工 | `docs/week1/林锵/2026-07-08-市场调研分工.md` |
| 技术预研分工 | `docs/week1/林锵/2026-07-08-技术预研分工.md` |
| 前端技术选型调研 | `docs/week1/林锵/2026-07-08-前端技术选型调研.md` |
| 团队技术画像 | `docs/week1/林锵/2026-07-08-团队技术画像.md` |
| 产品方向评估 | `docs/week1/张思成/2026-07-08-产品方向评估.md` |
| 数据库选型调研 | `docs/week1/张思成/2026-07-08-数据库选型调研.md` |
| AI英语口语调研 | `docs/week1/覃迦迎/2026-07-07-AI英语口语调研.md` |
| 用户需求调研综合报告 | `docs/week1/覃迦迎/2026-07-08-用户需求调研综合报告.md` |
| AI口语陪练产品调研 | `docs/week1/黄天宇/2026-07-07-AI口语陪练产品调研.md` |
| 竞品调研补充（海外） | `docs/week1/黄天宇/2026-07-08-AI口语陪练产品调研-补充海外APP.md` |
| 未满足需求 Top10 | `docs/week1/黄天宇/2026-07-08-未满足需求Top10.md` |
| 市场数据摘录 | `docs/week1/智铭威/2026-07-08-市场数据摘录.md` |
| 会议纪要 | `docs/week1/meetings/` |
| 任务板 | `tasks/` |
| 参考规范 | `reference/` |

## SpeakUp Web 产品原型

`prototype/` 目录包含可交互的 SpeakUp 产品原型，覆盖模拟面试创建、多轮及分阶段练习、实时/气泡对话、练习历史、报告、错题回顾、角色创建与个人中心等流程。

### 本地运行

```bash
cd prototype
npm install
npm run dev
```

启动后访问开发服务器首页，或直接查看 `prototype/public/spreak-prototype.html`。

### 构建

```bash
cd prototype
npm run build
```
