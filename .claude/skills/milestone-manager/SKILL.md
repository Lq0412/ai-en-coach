---
name: milestone-manager
description: >
  GitHub Milestone 创建、Issue 关联与进度跟踪。Use when 创建 Milestone、
  关联 Issue 到 Milestone、检查 MS 进度、或提到 里程碑管理、MS 规划、
  Milestone 创建、迭代管理、进度跟踪、MS 验收问题。
---

# Milestone 管理

把项目按固定间隔拆成可验收的迭代。每个 MS 必须有一个核心问题和一个可打 tag 的交付物。

**操作逻辑（本文件）与项目参数分离。** 项目参数（起止时间、人数、Issue 配额等）见 [`data/ms-config.json`](data/ms-config.json)。

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

创建 Issue 或评审 Issue 时，必须确认 **Milestone 字段不为空**。

没有挂 MS 的 Issue 等于没有排期。

### 工作量配平

根据 `ms-config.json` 中各 MS 的 `perPersonQuota` 计算：

- 当前 MS 的 Issue 数 = `teamSize × perPersonQuota.{min,max}`（即 `{teamSize * perPersonQuota.min}-{teamSize * perPersonQuota.max}` 作为参考总量）
- 同时参考 `issueQuota.{min,max}` 作为绝对范围

超出这个范围 → 检查是否把 Issue 拆得太碎或太大。

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
