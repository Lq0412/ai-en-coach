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

## AI 使用底线

> 最终交付责任在人，不在 AI。

AI 可参与每个环节，但**不替代工程流程本身**：

- **方案理由要讲清**：为什么这样设计、为什么选这个方案，提交者必须能解释。
- **代码逻辑要理解**：AI 生成的每一段代码，提交者必须能讲清逻辑——不只是"大概是这个意思"。
- **核心 PR 附 Prompt + Review 说明**：关键 PR 的描述中附上使用的关键 Prompt，以及人工 Review 后确认的要点。
- **架构必须由人主导**：系统架构由人设计，不得以 AI 粗浅实现入库冒充架构。

### AI 代码合入前自检

- [ ] 我能讲清这段代码的每一处逻辑
- [ ] 关键 PR 附了使用的 Prompt
- [ ] 没有 AI 常见的糊弄行为（兜底数据、猜测字段、冗余异常处理）
- [ ] 架构级代码（模块划分、接口定义）由人书写，非 AI 生成
