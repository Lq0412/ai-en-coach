# GitHub 过程管理规范

> 来源：[1024XEngineer/techcamp Wiki](https://github.com/1024XEngineer/techcamp/wiki/03-GitHub-%E8%BF%87%E7%A8%8B%E7%AE%A1%E7%90%86%E8%A7%84%E8%8C%83)、2026-07-15 GitHub 协作规范提醒
> 编者：mcell，项目补充更新于 2026-07-15
> 所属体系：XEngineer 营软件工程规范（与产品设计规范、架构设计规范并列）

---

定义如何利用 GitHub 原生功能（Milestone、Issue、PR、Release 加标签）来管理整个开发流程，不额外引入其他工具。

---

## 一、Milestone

每个里程碑（MS）需在仓库中创建一个 Milestone：

- 写明本轮目标
- 关联本轮所有 Issue，通过 Milestone 进度条查看完成情况
- 结束时将已完成 Issue 整理到 Milestone 说明中，形成本轮功能清单

> **参考示例**：xgo 的 milestone "XGo v1.7"，目标、挂载 issue、完成度集中展示。

GitHub 操作参考：[使用标签和里程碑跟踪工作](https://docs.github.com/zh/issues/using-labels-and-milestones-to-track-work)。

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

Issue description 自带编辑历史，可承担工程文档的版本管理，无需另建 Wiki。工程文档定稿即只读，后续变更应新开 Issue 说明原因和增量，不覆盖已经冻结的决策。

---

## 三、文档管理

文档分为工程文档和用户文档，两者的管理方式不同。

### 工程文档

产品设计、架构决策、协议设计、数据设计等工程文档：

- 草稿和定稿均以对应 Issue 描述区为权威来源，使用 Issue 编辑历史保留版本。
- 不将定稿工程文档作为 Markdown 文件合入代码仓库，不另建第二套 Wiki 或仓库内副本。
- 如需逐行讨论，可临时使用 Draft PR 承载评审稿；该 PR 只用于 Review，讨论完成后不合并。
- 评审结论回填到 Issue，更新 Proposal 状态标签；定稿后保持只读。
- 系统架构的空骨架代码属于可执行工程交付，应通过正式 PR 合入，不属于“工程文档不入库”的限制。

### 用户文档

安装说明、使用指南、公开 API 使用说明等面向使用者的文档：

- 需要随产品代码入库，确保与版本对应。
- 功能完成但用户文档未完成时，使用 `Need-Document` 标签。
- 用户文档完成并通过 Review 后，更新为 `Documented` 标签。

---

## 四、PR

### Fork 工作流与分支保护

所有代码变更必须通过 **fork + PR** 提交，禁止在主仓库直接创建功能分支或直接提交代码。

标准流程：

```text
主仓库 main
  -> fork 到个人仓库
  -> 在个人 fork 创建单一任务分支
  -> 推送到个人 fork
  -> 向主仓库发起 PR
  -> Review 与检查通过
  -> 合并到主仓库
  -> 删除个人任务分支
```

要求：

- 一个分支只关联一个 Issue，保持短期、单一目的和可独立回滚。
- 分支名使用英文 kebab-case，例如 `feat/ms1-project-skeleton`、`fix/session-recovery`。
- 不向主仓库直接 push，不在主仓库创建 `feat/*`、`fix/*` 等个人开发分支。
- 提 PR 前同步主仓最新基线，解决冲突并完成本地构建与测试。
- PR 合并后删除个人 fork 中对应任务分支。
- 禁止对主仓默认分支 force push。

主仓管理员（导师和助教）应确认默认分支已开启保护，至少保证：

- 必须通过 PR 才能合入。
- 禁止直接 push 和 force push。
- 必须完成所需 Review。
- 已配置 CI 时，必要检查通过后才能合入。

每个 PR 必须关联对应的 Issue/功能，确保改动可追溯至需求。

### PR 合并标准

合并需满足以下条件：

1. 关联对应 Issue，改动范围与 Issue 一致，**不夹带无关修改**
2. 通过必要测试或验证；AI 生成代码尤其需要测试保障功能可用
3. 作者能清晰说明本次 PR 的主要改动及改动理由
4. 经过 AI 代码质量检查与人工 Review，无方向性问题和明显隐患
5. **不长期堆积**：PR 应小而频繁，及时合并，避免累积成数千行的大改动

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

## 五、Commit 规范

提交信息遵循 [Conventional Commits 1.0.0](https://www.conventionalcommits.org/zh-hans/v1.0.0/)。

### 格式

```text
<type>(<scope>): <subject>
```

- `type`：`feat`、`fix`、`docs`、`style`、`refactor`、`test`、`chore`、`perf`、`build`、`ci`。
- `scope`：可选，表示受影响区域，例如 `mobile`、`server`、`api`、`db`、`ci`。
- `subject`：一句话说明具体变化，避免“更新代码”“修复问题”等空泛描述。

示例：

```text
feat(server): add mock interview session flow
fix(mobile): preserve current turn after reconnect
docs: update local development guide
ci: add Go and Flutter checks
```

要求：

- 一个 Commit 表达一个完整、可回滚的意图。
- 功能完成或达到清晰检查点时提交，避免大量无意义 checkpoint。
- WIP Commit 只存在于个人任务分支，提 PR 前整理或压缩。
- 不提交密钥、`.env`、本地缓存和无关构建产物。
- Commit 和 PR 不夹带与关联 Issue 无关的修改。
- 提交前检查 diff，确保提交者能够说明 AI 辅助生成代码的逻辑和验证方式。

---

## 六、会议记录

- 日常会议优先使用腾讯会议自带的智能纪要功能自动生成记录，减少人工整理成本。
- 纪要至少保留会议日期、参与者、结论、待办、负责人和截止时间。
- 需要进入实施的决策必须回填到对应 Issue；会议纪要不能替代 Issue 中的正式结论。
- 不因保存会议记录而在仓库中维护另一套产品或架构决策文档。

---

## 七、Release

每个 Milestone 结束时创建一个 Release，对应可打 tag 的交付物。

Release 描述需正规：**列清本轮交付了哪些功能**。

> **参考示例**：xgo 的发布节奏 v1.7.0 → v1.7.3，每个版本描述均列明变更。

---

## 八、标签体系

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

## 九、子任务（sub-task）

当 Proposal 内容过长时，可将与具体实现相关的部分拆分为子任务（使用 `sub-task` 标签），仅将相关部分交给 AI 开发，避免上下文过长影响效果。

大部分功能说明不长时不必强制拆分。

---

## 十、看板（可选）

看板（Projects）不作强制要求。一个 Milestone 的功能通常不多，Milestone 下的 Issue 列表本身即为看板。各组按习惯自选。

---

## 十一、自查清单

### 学员

- [ ] 当前工作是否有对应 Issue，并关联正确 Milestone。
- [ ] 工程文档是否以 Issue 描述区为权威来源，而不是准备合入仓库。
- [ ] 是否从个人 fork 的任务分支发起 PR，而非在主仓建分支。
- [ ] Commit 是否符合 Conventional Commits，且一个提交只表达一个意图。
- [ ] PR 是否关联 Issue、范围单一、测试步骤可复现。
- [ ] 用户文档完成后是否更新 `Documented` 标签。

### 导师和助教

- [ ] 主仓默认分支已开启保护，禁止直接 push 和 force push。
- [ ] 合入必须经过 PR、Review 和必要的 CI 检查。
- [ ] 每个 MS 已创建 Milestone，并关联本阶段所有 Issue。
- [ ] Proposal、文档和任务状态标签使用正确。
- [ ] 发现偏差后及时在对应 Issue 或 PR 中给出可执行的纠正意见。
