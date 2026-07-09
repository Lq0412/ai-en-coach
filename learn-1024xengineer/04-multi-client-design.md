# 多端接入设计

## 核心模式：Gateway 中继

NeoCode 和 AnyClaw 都采用了 **Gateway 中继** 模式：

```
                   ┌─────────────┐
                   │  Agent Core │  (业务逻辑)
                   └──────┬──────┘
                          │
                   ┌──────┴──────┐
                   │   Gateway   │  JSON-RPC / SSE / WebSocket
                   └──────┬──────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
    ┌─────┴─────┐  ┌──────┴──────┐  ┌────┴────┐
    │    TUI    │  │   Web UI    │  │  飞书    │
    │ (Terminal)│  │ (Browser)   │  │ (Feishu) │
    └───────────┘  └─────────────┘  └─────────┘
```

**关键设计原则**: Agent 核心逻辑不感知客户端类型。所有客户端通过统一协议与 Gateway 通信。

## NeoCode 的多端支持

| 端 | 启动方式 | 协议 |
|---|---|---|
| TUI | `neocode -w /path/to/project` | 直接调用 |
| Web UI | `neocode web` (默认 :8080) | HTTP/SSE |
| 飞书 SDK | `neocode feishu-adapter --ingress sdk` | WebSocket 长连接 |
| 飞书 Webhook | `neocode feishu-adapter --ingress webhook` | HTTP 回调 |
| Local Runner | `neocode runner` | WebSocket 主动连接云端 |

飞书接入的亮点：用单张**状态卡片**持续回传 run 状态，用户不需要一直盯着终端。

## AnyClaw 的扩展能力体系

AnyClaw 定义了四个扩展维度：

| 概念 | 说明 |
|---|---|
| **Skill** | 扩展任务能力与工具编排 |
| **Agent** | 面向不同角色或任务类型的代理 |
| **Channel** | 对接微信、飞书等外部渠道 |
| **CLI Hub** | 发现并调用本地 CLI-Anything 能力（Browser、Blender、GIMP...） |

## CialloClaw 的桌面接入

CialloClaw 专门处理桌面场景的"现场承接"：

- 悬浮球入口（全局快捷键触发）
- 语音输入（长按说出需求）
- 选中文本（划词后点击悬浮球）
- 文件拖拽（拖到悬浮球附近）

这些现场输入通过统一的 `task-centric` 主链路进入系统，不另立平行架构。

## 可复用的模式

1. **Gateway 作为统一入口**: 无论多少客户端，后端只提供一个 Gateway
2. **JSON-RPC 2.0 作为协议层**: 方法、参数、错误码都有明确的 schema 定义
3. **协议包独立**: CialloClaw 把协议定义放在 `packages/protocol/`，前后端共享
4. **事件流统一**: 所有端通过同一组事件类型（TurnEventStart, TextDelta, ToolUse, Done...）获得 Agent 执行状态

## 对 UniSpeaking 的启示

口语教练可能需要这些"端"：

- Web Chat（主入口）
- 语音输入（移动端核心体验）
- 微信/飞书（轻量练习提醒 + 每日一句）

可以考虑先做 Web Chat，但架构上预留 Gateway 层，后续加端时后端不用改。
