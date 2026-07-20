# Agent 系统架构模式

## 核心闭环

所有 1024XEngineer 的 AI Agent 项目共享同一个工程闭环：

```
Prompt → Plan → Tool Call → Observation → Code Change → Verification → Result
```

这不是"我问你答"的 ChatBot，而是 **ReAct 循环**：模型观察环境 → 思考下一步 → 调用工具行动 → 拿到结果再观察，循环直到任务完成。

## 分层架构

项目中反复出现的标准分层（以 ByteMind 为例）：

```
入口层 (TUI/Web/飞书/悬浮球)
  → 接入层 (Gateway / JSON-RPC / Local Service)
    → 编排层 (Agent Loop / Tool Execution / Policy)
      → 能力层 (LLM Provider / Tools / Skills / MCP / SubAgents)
        → 持久层 (SQLite / Session / Memory / Audit)
```

### 核心模块说明（基于 ByteMind `internal/`）

```
internal/
├── agent/          # 核心引擎: run_loop, compaction, policy, subagent
├── tools/          # 14个工具: read/write/bash/search/git/task/web...
├── provider/       # 多模型路由 + 健康检查 + 自动降级
├── skills/         # builtin/user/project 三层技能系统
├── extensions/     # MCP 扩展管理
├── session/        # 会话持久化与恢复
├── context/        # 上下文压缩与预算管理
├── config/         # 配置加载: 默认值 → 用户级 → 项目级 → 环境变量
├── plan/           # Plan 模式：高风险任务先评审方案
├── runtime/        # 任务管理器: goroutine 执行器 + 事件流
├── sandbox/        # 沙箱: 文件系统权限 + 进程隔离
├── rollback/       # 回滚: 记录变更 → 恢复点
└── storage/        # 持久化: 审计日志 + Prompt 存储
```

### 多模型路由

`provider/` 包的架构值得参考：

```
RoutedClient
  ├── Router (模型名 → Provider 选择)
  ├── HealthChecker (健康检查定时器)
  └── Fallback (主 Provider 不可用时自动降级)
```

支持 Anthropic / OpenAI / Gemini / 自定义 OpenAI-compatible。

## 可复用的设计原则

1. **分层清晰**: 入口不做业务决策，接入不做状态推进，能力层不承载产品语义
2. **统一协议**: JSON-RPC 2.0 作为前后端之间的稳定边界
3. **本地优先**: 运行状态、上下文、历史默认保存在本地（SQLite + WAL）
4. **治理内建**: 风险判断、授权审批、审计留痕是主链一部分，不是外围附属
5. **Human-in-the-loop**: 高风险操作（文件写入、命令执行）需要用户审批

## 对 UniSpeaking 的启示

口语教练也可以按这个分层来组织：

- **入口层**: Web Chat / 语音输入
- **编排层**: 口语对话 Loop（发音评估 → 纠错 → 继续对话）
- **能力层**: TTS / ASR / 发音评分 / 对话生成
- **持久层**: 学习记录 / 错词本 / 进度追踪
