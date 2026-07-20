# 技术栈选型

## 1024XEngineer 的通用技术栈

通过分析 6 个主要仓库，发现它们共享一套高度一致的技术栈。

### 后端

| 选择 | 原因 | 使用者 |
|---|---|---|
| **Go 1.24+** | 高性能、单二进制分发、跨平台、goroutine 天然适合 Agent 并发 | bytemind, neo-code, anyclaw, CialloClaw, ClawPet |
| **Bubble Tea** | Go 生态最成熟的 TUI 框架，Elm 架构 | bytemind, neo-code |
| **SQLite + WAL** | 本地优先、零配置、WAL 模式支持并发读写 | CialloClaw |

### 桌面端

| 选择 | 原因 | 使用者 |
|---|---|---|
| **Tauri 2** | 轻量桌面壳（比 Electron 小很多）、Rust 后端 | CialloClaw |
| **Electron** | 成熟的桌面方案、生态丰富 | ClawPet |

### 前端

| 选择 | 原因 | 使用者 |
|---|---|---|
| **React 18+** | 生态成熟 | CialloClaw, anyclaw |
| **TypeScript** | 类型安全 | 所有前端项目 |
| **Vite** | 快速构建 | CialloClaw, anyclaw |
| **Tailwind CSS** | 快速出 UI | CialloClaw |
| **Zustand** | 轻量状态管理 | CialloClaw |
| **TanStack Query** | 服务端状态管理 | CialloClaw |

### 协议与通信

| 选择 | 原因 | 使用者 |
|---|---|---|
| **JSON-RPC 2.0** | 结构化请求/响应、标准错误码 | CialloClaw, neo-code |
| **SSE** | 服务端推送事件流 | neo-code, anyclaw |
| **WebSocket** | 双向实时通信 | neo-code |

### AI 集成

| 选择 | 说明 |
|---|---|
| **多 Provider 路由** | Anthropic / OpenAI / Gemini / Ollama / 自定义 OpenAI-compatible |
| **统一 OpenAI-compatible 协议** | 所有 LLM 调用走同一套接口 |
| **Vercel AI SDK** | Mini Claude Code 课程（TypeScript 项目）用的 |

## 为什么选 Go？

1. **单二进制分发**: `go build` → 一个文件，用户不需要装依赖
2. **并发模型**: goroutine 天然适合 Agent 的并行工具调用
3. **跨平台**: macOS / Linux / Windows 一次编写
4. **CLI/TUI 生态**: Bubble Tea、Cobra 等成熟库
5. **性能**: 启动快、内存占用低

## CialloClaw 的前后端组合（最完整的参考）

```
┌────────────────────────────────────────────┐
│ apps/desktop (Tauri 2 + React + TypeScript)│
│ - 悬浮球 UI                                  │
│ - 任务工作台                                  │
│ - 轻量输入/反馈                               │
├────────────────────────────────────────────┤
│ services/local-service (Go)                 │
│ - JSON-RPC 接入                              │
│ - 任务编排/执行/治理                           │
├────────────────────────────────────────────┤
│ workers/ (Node.js sidecar)                  │
│ - playwright-worker: 浏览器自动化             │
│ - ocr-worker: OCR 识别                       │
│ - media-worker: 媒体处理                      │
├────────────────────────────────────────────┤
│ packages/protocol (共享)                     │
│ - JSON-RPC 方法、schema、类型定义             │
└────────────────────────────────────────────┘
```

## 对 UniSpeaking 的启示

UniSpeaking 目前看起来是 TypeScript 项目，技术栈可以考虑：

| 层 | 推荐选择 | 原因 |
|---|---|---|
| 后端 | Node.js/TS 或 Go | TS 可以前后端统一语言；Go 性能更好 |
| 前端 | React + Vite + Tailwind | 与 CialloClaw 一致 |
| 语音 | Web Speech API / Whisper | 浏览器原生 + 服务端兜底 |
| 发音评估 | 第三方 API + 自建模型 | 先用 API 验证，再考虑自建 |
| 存储 | SQLite (better-sqlite3) | 本地优先、零配置 |
| 协议 | JSON-RPC 或 REST | 如果做多端，建议 JSON-RPC |
