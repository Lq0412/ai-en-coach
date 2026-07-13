# 工程验证闭环

## 核心理念

1024XEngineer 的项目不只是"我写了个东西"，而是"我能证明它真的有用"。每个明星项目都有完整的**工程验证闭环**。

## ByteMind 的验证体系

### 1. 可复现 Demo

`examples/bugfix-demo/broken-project` 是一个独立的 Go 项目：

- 初始状态：`go test ./...` 失败（divide-by-zero bug）
- Agent 执行修复：`CalculateAverage` 加 guard clause
- 最终状态：测试全部通过
- 可离线验证：不需要 API key

```bash
go run ./cmd/bytemind run \
  -prompt "Fix the failing test and verify it passes" \
  -workspace examples/bugfix-demo/broken-project \
  -approval-mode full_access
```

### 2. Evals 测试

```bash
go run ./evals/runner.go -smoke -run bugfix_go_001
```

- 可复现的评估用例
- smoke 测试确保核心链路没坏
- 每个 eval 有明确的输入/期望输出/判断标准

### 3. CI 体系

```
CI (ci.yml)
  ├── 多平台构建 (macOS/Linux/Windows)
  ├── 单元测试 + Codecov 覆盖率
  ├── Evals smoke test
  └── Lint + 安全检查
```

## ENGINEERING.md

ByteMind 专门有 `ENGINEERING.md` 文件，面向评审者展示工程证据：

- **Real Agent Loop**: 多步工具调用 + 观测反馈 + 上下文压缩 + 速率限制重试
- **Coding-native Tools**: 14 个内置工具，每个都有单元测试和安全分级
- **Reproducible Demo**: 独立项目，初始失败 → Agent 修复 → 验证通过

## 工具的安全分级

ByteMind 对每个工具有安全分类：

| 级别 | 说明 | 示例 |
|---|---|---|
| Safe | 无需审批 | read_file, search_text, list_files |
| Sensitive | 需审批 | write_file, replace_in_file, run_shell |
| Controlled | 沙箱内执行 | run_tests, git_diff |

## 对 UniSpeaking 的启示

口语教练的工程验证闭环可以包括：

### 可复现 Demo
```
一个预设的"学员录音" → AI 评分 → 返回纠错建议 → 验证：
  - 发音错误被正确识别
  - 评分与人工评分偏差 < 10%
  - 纠错建议具体可操作
```

### Eval 用例集
```
eval_set/
├── pronunciation/
│   ├── th_sound.wav      # /θ/ 发音 → 期望评分 > 80
│   ├── r_l_confuse.wav   # r/l 混淆 → 应被标记
│   └── perfect.wav       # 标准发音 → 应 > 95
├── grammar/
│   └── tense_error.txt   # "I go yesterday" → 应被纠正
└── conversation/
    └── order_food.txt    # 餐厅对话 → 应识别场景并回应
```

### CI 检查
```
每次 PR:
  ├── Evals smoke test (抽 5 个 eval 跑)
  ├── 评分延迟 < 2s
  └── TTS 质量检查
```

**关键**: 不是等项目做完了再补测试，而是在开发过程中就用 eval 驱动——先定义"什么叫好"，再写代码达到它。
