# 任务 2：评分、反馈、错题与复练

## 负责什么

负责用户完成一轮面试或专项练习后的学习闭环：评分、反馈、错题沉淀和下一次复练建议。

首期覆盖：

- 对回答进行结构、内容完整度、英文表达和场景匹配度评分；
- 生成带证据的结构化反馈，而不是泛泛评价；
- 从回答中提取错题、薄弱点和代表句；
- 根据错题和薄弱点生成专项复练目标及下一题；
- 保存每次练习的结果，并根据多次记录判断改善或重复问题；
- 练习结束后让已有主链路能读取最新反馈。

## 不负责什么

- 不负责自由对话、翻译或场景 Prompt；
- 不管理简历、JD、附件、Scenario 或 Mem0 长期记忆；
- 不修改前端页面；
- 不创建新的用户资料接口；
- 不修改 `backend/cmd/server/main.go`。

## 文件边界

可修改或新增：

```text
backend/internal/practice/
backend/internal/review/
backend/internal/demomodules/registry.go
backend/internal/demomodules/*test.go
backend/internal/assistant/service.go
backend/internal/assistant/service_test.go
```

禁止修改：

```text
backend/internal/preparation/
backend/internal/platform/memory/
backend/internal/assistant/context/
backend/internal/assistant/dashscope.go
backend/internal/assistant/http.go
backend/cmd/server/main.go
frontend/
```

## 与其他任务的约定

- 输入只使用已保存的 Session、Turn、转写和用户上下文快照；
- 评分 Prompt 只在本任务维护，不能改动实时对话 Prompt；
- 单次错误先保存为 Review 结论，不能直接写入 Mem0；
- 只有用户确认或多次证据支持的稳定问题，才由“用户资料、记忆与学习记录”任务决定是否升级为长期学习记忆；
- 对外返回 `ReviewResult`、`MistakeItem` 和 `RepracticeTarget`，不向调用方暴露内部模型 Prompt。

## 分支创建

前置条件：先合并 Scenario 基础 PR #64，再从最新 `main` 创建分支。

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feat/review-mistakes-repractice
```

## 交付与验收

- [ ] 一次完成的练习能产生结构化评分和至少一条带原回答证据的反馈；
- [ ] 错题有类型、原句、问题说明、改进建议和复练状态；
- [ ] 同一练习重复结束不会产生重复报告或重复错题；
- [ ] 无足够证据时明确标注“依据不足”，不编造专业结论；
- [ ] 可以从历史结果生成下一次可执行的复练目标；
- [ ] `go test ./...` 通过；
- [ ] PR 不包含 Prompt、Scenario、Memory 或前端的无关修改。
