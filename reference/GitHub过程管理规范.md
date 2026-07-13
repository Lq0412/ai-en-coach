# GitHub 过程管理规范

> 来源：[1024XEngineer/techcamp Wiki](https://github.com/1024XEngineer/techcamp/wiki/03-GitHub-%E8%BF%87%E7%A8%8B%E7%AE%A1%E7%90%86%E8%A7%84%E8%8C%83)
> 编者：mcell，更新于 2026-07-07
> 所属体系：XEngineer 营软件工程规范（与产品设计规范、架构设计规范并列）

---

定义如何利用 GitHub 原生功能（Milestone、Issue、PR、Release 加标签）来管理整个开发流程，不额外引入其他工具。

---

## 一、Milestone

每个里程碑（MS）需在仓库中创建一个 Milestone：

- 写明本轮目标
- 关联本轮所有 Issue，进度可视
- 结束时将已完成 Issue 整理到 Milestone 说明中，形成本轮功能清单

> **参考示例**：xgo 的 milestone "XGo v1.7"，目标、挂载 issue、完成度集中展示。

---

## 二、Issue

Issue 是过程的基本单元，承载三类内容：

- 产品/架构的工程文档草稿
- 任务拆解
- 设计澄清

### 要求

- 背景清晰、目标明确、验收标准具体
- 对应一个或少量 PR，范围可控
- **禁止空泛标题**（如"优化一下 XX"不合格）

Issue description 自带编辑历史，可承担工程文档的版本管理，无需另建 Wiki。工程文档定稿即只读的规则参照《软件工程规范》。

---

## 三、PR

每个 PR 必须关联对应的 Issue/功能，确保改动可追溯至需求。

### PR 合并标准

合并需满足以下条件：

1. 关联对应 Issue，改动范围与 Issue 一致，**不夹带无关修改**
2. 通过必要测试或验证；AI 生成代码尤其需要测试保障功能可用
3. 作者能清晰说明本次 PR 的主要改动及改动理由
4. 经过 AI 代码质量检查与人工 Review，无方向性问题和明显隐患
5. **不长期堆积**：PR 应小而频繁，及时合并，避免累积成数千行的大改动

建议各组结合项目情况开启分支保护规则，并用 PR 校验 action 作为合并门禁。

### Review 分工

| 角色 | 职责 |
|:-----|:-----|
| **助教** | 日常 PR 的方向与改动可理解性（是否对应 Issue、改动能否讲清） |
| **导师** | 关键 PR 或关键技术风险上提供反馈 |
| **学员之间** | 鼓励互相 Review |

### 设计草案的 Review

产品设计文档、原型（含 Live Demo）等设计产出可通过 PR 进行逐行评审：将设计内容提交为 PR，利用行内评论逐条讨论。

**关键区别**：此类 PR 只用于 Review、**不合并**；讨论定稿后把内容落回对应 Issue，并在 Issue 中附上该 PR 链接，此后 Issue 作为开发起点与后续跟踪。

（系统架构的空骨架 PR 会合并入库，与设计草案 PR 不同。）

---

## 四、Release

每个 Milestone 结束时创建一个 Release，对应可打 tag 的交付物。

Release 描述需正规：**列清本轮交付了哪些功能**。

> **参考示例**：xgo 的发布节奏 v1.7.0 → v1.7.3，每个版本描述均列明变更。

---

## 五、标签体系

标签是过程管理的主线，用于标记产品设计决策结果、规格粒度、文档状态，使整个项目可追溯。

| 维度 | 标签 | 含义 |
|:-----|:-----|:-----|
| 产品设计 | `proposal` | 该 Issue 是一个产品提案 |
| 决策结果 | `Proposal-Accepted` | 提案定稿，进入开发 |
| 决策结果 | `Proposal-Denied` | 方案不成立，记录原因并归档 |
| 决策结果 | `Proposal-NoPlan` | 方案成立但本期不排期 |
| 规格粒度 | `FullSpec` | 影响面大的完整规格 |
| 规格粒度 | `MiniSpec` | 小改动的精简规格 |
| 文档状态 | `Need-Document` | 功能已完成待补用户文档 |
| 文档状态 | `Documented` | 用户文档已提供 |

### 提案的典型生命周期

```
proposal → 讨论 → Proposal-Accepted + FullSpec（或 MiniSpec）→ 开发 → Need-Document → 补文档 → Documented
```

> **真实样例**：xgo #2802 Flat Mode（Accepted + FullSpec）、xgo #2751 Simplified Enum Type（Accepted + MiniSpec）、xgo #2667 Command Syntax for defer（Denied——被拒绝是正常结果，并非失败，它同样是一次有记录的决策）。

---

## 六、子任务（sub-task）

当 Proposal 内容过长时，可将与具体实现相关的部分拆分为子任务（使用 `sub-task` 标签），仅将相关部分交给 AI 开发，避免上下文过长影响效果。

大部分功能说明不长时不必强制拆分。

---

## 七、看板（可选）

看板（Projects）不作强制要求。一个 Milestone 的功能通常不多，Milestone 下的 Issue 列表本身即为看板。各组按习惯自选。
