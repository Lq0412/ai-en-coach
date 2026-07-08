# AI 英语口语陪练

面向外语学习者的 AI 口语对话训练工具，重点解决低延迟、可打断、发音评测与表达纠错。

5 人团队 · 8 周 · 2026-07-08 起

## 技术栈

React Native · Python FastAPI · MySQL · Deepgram ASR · OpenAI TTS

## 安装 Skills

本项目 `.claude/skills/` 下包含团队工作流 skills。安装后 AI 助手自动遵循团队规范。

### Claude Code

项目级自动加载（推荐）：

```bash
git clone https://github.com/Lq0412/ai-en-coach.git
cd ai-en-coach
# .claude/skills/ 自动生效，无需额外配置
```

全局安装（所有项目通用）：

```bash
ln -s $(pwd)/.claude/skills/issue-standard ~/.claude/skills/issue-standard
ln -s $(pwd)/.claude/skills/pr-commit ~/.claude/skills/pr-commit
ln -s $(pwd)/.claude/skills/code-discipline ~/.claude/skills/code-discipline
# …选择你需要的 skill
```

### Codex (OpenAI)

```bash
# 全局安装
cp -r .claude/skills/issue-standard ~/.codex/skills/issue-standard
cp -r .claude/skills/pr-commit ~/.codex/skills/pr-commit
cp -r .claude/skills/code-discipline ~/.codex/skills/code-discipline
# …选择你需要的 skill

# 或项目级（放项目根目录）
cp -r .claude/skills/issue-standard .codex/skills/issue-standard
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
| Product Killshot Report | `docs/week1/2026-07-07-product-killshot-report.md` |
| 市场需求调研分工 | `docs/week1/2026-07-08-market-research-tasks.md` |
| 技术预研分工 | `docs/week1/2026-07-08-tech-pre-research-plan.md` |
| 前端技术选型调研 | `docs/week1/2026-07-08-frontend-tech-research.md` |
| 团队技术画像 | `docs/week1/2026-07-08-team-profile.md` |
| 会议纪要 | `docs/week1/meetings/` |
| 任务板 | `tasks/` |
