# 产品思维先行

## 核心观察

1024XEngineer 的好几个明星项目**不是上来就写代码**，而是先有一整套设计文档。这是实训营刻意训练的产品+架构思维。

## ByteMind 的设计文档清单

| 文档 | 内容 | 路径 |
|---|---|---|
| PRD | 产品愿景、用户痛点、成功标准、用户画像 | `docs/prd-mvp.md` |
| 架构设计 | 用户故事走查、模块协作图、数据流 | `docs/architecture.md` |
| 用户故事 | 典型使用场景的完整描述 | `docs/user-stories.md` |
| 子Agent架构 | SubAgent 的设计决策文档 | `docs/subagent-architecture.md` |
| Prompt 架构 | 系统提示词的层次结构设计 | `docs/prompt-architecture.md` |
| 沙箱验收 | 安全沙箱的验收标准 | `docs/sandbox-acceptance.md` |
| 测试计划 | MVP 阶段的测试策略 | `docs/mvp-test-plan.md` |

## CialloClaw 的设计文档清单

| 文档 | 内容 |
|---|---|
| `docs/architecture-overview.md` | 架构基线：分层、对象边界、主链路 |
| `docs/protocol-design.md` | JSON-RPC 方法定义、错误码、schema |
| `docs/data-design.md` | 表结构、索引、序列化格式 |
| `docs/module-design.md` | 模块内部类图、函数签名 |
| `docs/development-guidelines.md` | 开发规范与协作约定 |
| `docs/work-priority-plan.md` | 优先级与分工 |
| `docs/product-interaction-design.md` | 产品交互设计 |

## 设计文档的层次

```
PRD（产品需求文档）
  └─ 回答"为什么做、为谁做、做成什么样"
      │
      架构设计文档
        └─ 回答"系统怎么分层、对象怎么协作"
            │
            协议/数据/模块设计
              └─ 回答"具体怎么实现"
```

## PRD 的标准结构（参考 ByteMind）

```
1. 产品愿景与定位
   - 一句话定义
   - 产品形态选择（为什么是 TUI 而不是 IDE 插件？）
2. 用户痛点与需求分析
   - 立项背景
   - 用户痛点
   - 需求归纳
3. 产品目标
   - 产品目标（可衡量的）
   - 产品原则（做决策的指南针）
   - 成功标准（怎样算"做成了"）
4. 用户画像
   - 目标用户是谁，什么场景下使用
```

## 产品原则示例（ByteMind）

1. **本地优先**: 默认围绕当前工作区运行，不依赖云端
2. **TUI 优先**: TUI 是主交互入口
3. **执行优先**: 重点不是"聊得像助手"，而是"做得像工具"
4. **可控优先**: 高风险操作必须有确认机制
5. **恢复优先**: 会话中断后应保留可继续的状态

## 对 UniSpeaking 的启示

在写代码之前，先回答：

- **产品愿景**: 你的口语教练是 ChatBot 还是一个"教练"？差别在哪里？
- **用户痛点**: 用户学口语的真正障碍是什么（不是"没人聊"，可能是"不敢开口"、"不知道错在哪"）
- **成功标准**: 怎样算"用户的口语变好了"？
- **产品原则**: 做功能决策时，你的指南针是什么？
