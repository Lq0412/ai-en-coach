---
name: code-discipline
description: >
  Use when writing code, fixing bugs, refactoring, or reviewing diffs,
  or when the user mentions coding discipline, YAGNI, stdlib first, minimal diff,
  编码纪律, 决策阶梯, 过度设计, or asks to avoid unnecessary dependencies.
---

**SUB-SKILL:** For commit/PR workflow after code changes, see [pr-commit](../pr-commit/SKILL.md).

# 编码纪律

写代码前记住：

1. **模块化 / 组件化**
2. **高内聚、低耦合**
3. **单一职责**
4. **简洁、高效、可读性高**
5. **不能过度设计** — 「设计」「架构」类 prompt 易产出看不懂的垃圾代码。走最简单能工作的实现。

## 决策阶梯

阶梯是决策 reflex，不是调研项目。前一级够用就停；两个方案都能用 → 选更高一级。优先 stdlib / 原生 / 已有依赖，**不**为此做 web search 或装新包。

1. 真需要吗？（YAGNI）2. 标准库能做吗？3. 平台原生能力够吗？4. 现有依赖已解决吗？5. 能一行搞定吗？6. 最后才写最小实现。

## 规则

- **未请求的抽象不做** — 单实现 interface、单产品 factory、永不变 config 等
- **删优于加** — 最少文件，最短 diff； boring 优于 clever
- **复杂需求** — 先给懒/最小方案，同条回复问「Y 是否够用？」；能默认就不卡住
- **两个 stdlib 方案同体量** → 选 edge-case 正确那个（懒 = 少写代码，不是选更脆算法）
- **有意简化** — `// discipline:` 注释标注已知上限与升级路径

## 输出与不简化

代码优先；最多 3 行说明跳过了什么、何时再加。用户明确要的报告/讲解不受此限。以下不砍：信任边界校验、防数据丢失、安全、用户明确要求的能力；a11y 基础同理。硬件/传感器保留校准入口（一行即可）。

## 禁止

- **兜底代码** — 依赖失败时悄悄换假数据、模板、默认值，仍假装成功
- **冗余代码** — 复制已有逻辑、多余 try/catch、dead code、用户没要的功能
- **猜测性代码** — 不清楚就不写；**不明白的地方要问用户或查源码**，不得为了「代码绝对能跑」堆不必要的防御代码

典型禁止写法：

```typescript
// ❌ 不清楚 id 字段叫什么，却猜一堆字段名
const id = res.data?.id ?? res.data?.userId ?? res.data?.user_id ?? 0;
```

```python
# ❌ 调用失败却悄悄用硬编码兜底
topics = await llm_generate(...)
if not topics:
    topics = hardcoded_templates(...)
```

## 应当

- 字段名、枚举、表结构、业务规则 — 有源码依据再写；代码库里找不到 → **问用户**
- 失败就明确失败，不要静默糊弄过去
- 改动范围 = 用户要求的最小集合

## AI 代码交付规范

生成或修改代码时：

- **不猜测业务规则**：字段名、枚举、表结构——代码库里找不到就**问用户**，不自造
- **不添加用户没要求的东西**：不写兜底数据、猜测字段、冗余异常处理、静默 fallback
- **架构由人定，AI 给方案**：模块划分、接口定义等架构级决策，提出方案让用户选择，不自行决定
- **失败就明确失败**：不要静默糊弄过去，报错就报清楚

交付代码时提醒用户：
- 合入前确认自己能讲清每一处代码逻辑
- 关键 PR 需附使用的 Prompt 和 Review 确认要点
