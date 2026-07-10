---
name: milestone-manager
description: >
  GitHub Milestone 创建、Issue 关联与进度跟踪。Use when 创建 Milestone、
  关联 Issue 到 Milestone、检查 MS 进度、或提到 里程碑管理、MS 规划、
  Milestone 创建、迭代管理、进度跟踪、MS 验收问题。
---

# Milestone 管理

把项目按固定间隔拆成可验收的迭代。每个 MS 必须有一个核心问题和一个可打 tag 的交付物。

## 规范来源与适用优先级

本项目优先参考 `reference/GitHub过程管理规范.md` 和 `reference/一些安排与共识.md`。`data/ms-config.json` 是本地辅助配置，不是覆盖 GitHub 仓库现有 Milestone 的强制来源。

使用本 skill 时按以下优先级判断：

1. **已有仓库优先**：如果目标仓库已经有 Milestone 标题、描述和 due date，不要因为本地配置不同而直接覆盖。
2. **创建新 Milestone 时才使用模板**：只有在用户要求新建或明确要求按配置同步时，才从 `data/ms-config.json` 生成标题、描述和截止日期。
3. **修改前先对比实际做法**：1024XEngineer 各仓库的 Milestone 口径并不完全一致，有的有 due date，有的没有。调整前应先说明差异和影响。
4. **不要批量改历史元数据**：除非用户明确要求，不要为了“规范化”批量改已有 Issue 的 Milestone、标签或关闭状态。

**操作逻辑（本文件）与项目参数分离。** 项目参数（起止时间、人数、Issue 配额等）见 [`data/ms-config.json`](data/ms-config.json)，仅作新建或规划时的参考。

## 读取项目参数

执行任何操作前，先读取 `data/ms-config.json` 获取当前项目的参数：

- `project.teamSize` — 团队人数
- `project.startDate` — 项目起始日期
- `project.totalWeeks` — 总周数
- `milestones[]` — 每个 MS 的 id、weeks、title、dueDate、coreQuestion、deliverables、nonDeliverables、issueQuota、perPersonQuota
- `progressTracking` — 预警阈值

## MS 结构

MS 数量和各段参数在 `data/ms-config.json` 的 `milestones` 数组中定义，每个 MS 包含：

| 字段 | 说明 |
|:-----|:-----|
| `id` | MS 标识（MS1-MS4） |
| `weeks` | 起止周（从 project.startDate 推算实际日期） |
| `title` | GitHub Milestone 标题 |
| `dueDate` | 截止日期 |
| `coreQuestion` | 本 MS 要回答的核心问题 |
| `deliverables` | 交付物清单 |
| `nonDeliverables` | 明确不交付的内容 |
| `issueQuota` | 建议 Issue 总数范围 |
| `perPersonQuota` | 每人 Issue 数范围 |

## 创建 Milestone

在 GitHub 上创建时，从 `ms-config.json` 读取对应 MS 的参数来填：

```markdown
## 标题
{ms.title}

## 描述
### 核心问题
{ms.coreQuestion}

### 交付物
- [ ] {逐条填入 ms.deliverables}

### 不交付
- [ ] {逐条填入 ms.nonDeliverables}

## 截止
{ms.dueDate}
```

### 标题命名规则

```
MS{N}：{一句话使命}
```

示例（来自 `ms-config.json` 的 `milestones[].title`）：
- `MS1：战略决策与首个可串联版本`
- `MS2：MVP 深化与架构落实`
- `MS3：功能闭合与质量达标`
- `MS4：打磨、交付与发布`

## Issue 关联

### 关联到 MS

每个 Issue 的右侧面板 → Milestone → 选对应 MS。

### 关联检查

创建 Issue 或评审 Issue 时，优先确认仓库是否正在使用 Milestone 管理。如果同一批 Issue 已经挂了 MS，则新增 Issue 应挂到同一 MS；如果仓库同类 Issue 普遍不挂 MS，不要擅自批量补挂。

在 1024XEngineer 过程规范中，Milestone 用于集中展示本轮目标、关联 Issue 和进度。它是推荐的过程管理主线，但具体标题、due date 和描述以目标仓库现状为准。

### 工作量配平

根据 `ms-config.json` 中各 MS 的 `perPersonQuota` 计算：

- 当前 MS 的 Issue 数 = `teamSize × perPersonQuota.{min,max}`（即 `{teamSize * perPersonQuota.min}-{teamSize * perPersonQuota.max}` 作为参考总量）
- 同时参考 `issueQuota.{min,max}` 作为绝对范围

超出这个范围 → 先提醒“本地配置建议范围”和“仓库实际做法”存在差异，再判断是否需要拆分、合并或补 Issue。不要直接把配置中的 issueQuota 当作硬性验收失败。

## 进度跟踪

### MS 看板

每个 MS 开始后，用 GitHub 的 Milestone 进度条关注百分比。低于预期时主动提醒：

| 现象 | 处理 |
|:-----|:-----|
| MS 过了一半，Issue 完成率 < `progressTracking.halfOverLowThreshold * 100`% | 检查 scope 是否膨胀，是否需要砍 |
| 某个成员 Issue 全部卡住 | 排查是否被阻塞、是否需要帮助 |
| MS 接近结束，还有 > `progressTracking.nearEndUnstartedThreshold` 个未开始 | 决定：移入下个 MS / 降优先级 / 放弃 |

### MS 进度速报

报告进度时使用简洁格式：

```
MS1 进度：7/12 已关闭，2 个进行中，3 个未开始
```
