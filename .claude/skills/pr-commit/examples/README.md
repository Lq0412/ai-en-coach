# pr-commit 示例用例

---

## 用例 1：写 commit message

**用户输入：**

> 帮我写 commit message，改动是加了用户登录 API 和对应测试。

**期望 agent 行为要点：**

- 先读 `git log -20 --oneline` 与项目约定（CONTRIBUTING / AGENTS 等）
- 推断 scope（如 `api` / `backend`），与历史风格一致
- 输出 Conventional Commits 格式 subject + 可选 body，type 准确（feat / test 等）

---

## 用例 2：拆分大变更开 PR

**用户输入：**

> 这次改太多了，帮我拆成几个 PR，每个 PR 只做一件事。

**期望 agent 行为要点：**

- 分析当前 diff / 变更范围，按独立可 review、可回滚原则拆分
- 每个 PR 给出建议分支名、scope、标题与四段式 PR 描述草稿
- 说明拆分顺序与依赖关系

---

## 用例 3：审查 staged diff

**用户输入：**

> 看一下 staged 的改动，commit 规范有没有问题。

**期望 agent 行为要点：**

- 运行 `git diff --staged` 查看暂存区
- 检查是否混入无关改动、是否应拆 commit
- 给出符合项目习惯的 commit message 建议或修正点
