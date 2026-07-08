---
name: pr-commit
description: >
  Use when the user asks to commit, write a commit message, create a PR, split
  changes, review staged diffs, or mentions 提交规范, commit 规范, PR 规范,
  写 commit, 开 PR, 拆分变更, Conventional Commits, branch naming, or PR description.
  Also triggers on "pr-commit".
---

**SUB-SKILL:** For coding quality while implementing changes, see [code-discipline](../code-discipline/SKILL.md).

# PR & Commit 规范

通用 Git 工作流 skill。**先对齐当前仓库已有习惯，再套用下列默认规则。**

## 核心原则

**每个 PR 只做一件事。** 大功能拆成多个可独立 review、可独立回滚的小 PR。

---

## 第 0 步：对齐项目习惯（必做）

写 commit / 开 PR 前，按优先级读取项目约定：

1. `CONTRIBUTING.md`、`AGENTS.md`、`CLAUDE.md`、`.github/pull_request_template.md`
2. 近期历史：`git log -20 --oneline`（subject 语言、scope 写法、type 用法）
3. 目录结构推断 scope（见下表思路，按实际仓库调整）

**项目约定与本文冲突时，以项目为准。** 无明确约定时，用本文默认规则。

### Scope 推断（通用）

| 常见目录/区域 | 建议 scope | 说明 |
|---------------|------------|------|
| `backend/`、`api/`、`server/` | `backend` / `api` | 服务端 |
| `frontend/`、`web/`、`admin/` | `frontend` / `web` | 管理端 / Web |
| `mobile/`、`app/` | `mobile` / `app` | 客户端 |
| `packages/<name>/` | 包名 | monorepo 子包 |
| `migrations/`、`db/`、`alembic/` | `db` / `database` | 数据库迁移 |
| `docs/`、`*.md` | `docs` | 文档 |
| `ci/`、`.github/` | `ci` / `chore` | 流水线与配置 |

scope 可与团队历史一致（如中文 `后端`、`创作者端`），**与 `git log` 保持同一风格**。

---

## Commit 规范

### 格式

```
<type>(<scope>): <subject>
```

- **type**：`feat` | `fix` | `docs` | `style` | `refactor` | `test` | `chore` | `perf` | `build` | `ci`
- **scope**：上节推断或历史 commit 中的惯用 scope；纯文档可省略 scope
- **subject**：**默认中文**（若项目历史为英文则跟英文）；≤50 字；说清具体改了什么

### Type 含义

| type | 说明 |
|------|------|
| feat | 新功能 |
| fix | 修复 bug |
| docs | 仅文档 |
| style | 格式/样式，不改逻辑 |
| refactor | 重构，不改对外行为 |
| test | 测试 |
| chore | 构建、依赖、配置、脚本 |
| perf | 性能优化 |
| build / ci | 构建系统或 CI 变更 |

### 规则

- subject 禁止「更新代码」「修复问题」「misc changes」等空泛描述
- 一条 commit 一个意图；多 scope / 多意图 → **拆 commit**
- 不提交 `.env`、密钥、本地缓存、构建产物（除非用户明确要求）
- 用户未要求时 **不要主动 `git commit` / `git push`**
- **禁止** 在 commit message 中添加 `Co-authored-by: Cursor` 等 Agent 协作者行

### 示例

```
feat(api): 登录接口增加 refresh token 轮换
fix(web): 修复表格分页在空数据时崩溃
refactor(mobile): 抽离订单状态枚举到共享包
docs: 补充本地开发环境变量说明
chore(db): 新增 orders 表迁移
perf(api): 分类树接口改为内存索引避免重复读盘
```

更多 monorepo / 多端场景见 [examples.md](examples.md)。

---

## 分支规范

从默认主干（多为 `main` 或 `master`）拉功能分支：

```
feat/<scope>-<简短描述>
fix/<scope>-<简短描述>
```

描述用英文 kebab-case 或团队惯用拼音/中文均可，**与同仓库已有分支风格一致**。

```
feat/api-refresh-token
fix/web-table-empty-crash
feat/creator-login-cache
```

---

## PR 规范

### 工作流

```
main ← feature/fix 分支 → 开 PR → review → 合并
```

合并前确认：相对主干拉取后，项目仍可按文档正常启动/测试。

### PR 标题

与 commit 同风格，一句话说明变更：

```
feat(web): 表格空态与分页修复
fix(api): 修复创建订单时 user_id 字段错误
```

### PR 描述（必填四段）

```markdown
## 功能描述
<!-- 做什么、用户/开发者如何感知 -->

## 实现思路
<!-- 关键文件、技术选型、为何这样改 -->

## 测试方式
<!-- 可复制的验证步骤；含启动命令与预期结果 -->

## 相关 Issue / 备注
<!-- 可选：关联 issue、已知限制、需重启服务等 -->
```

### 测试方式（通用模板）

先读项目 README / `AGENTS.md` 获取真实启动命令，再填：

```markdown
## 测试方式
1. 安装依赖：<项目文档中的命令>
2. 启动服务：<各端启动命令与端口>
3. 验证：<具体路径与操作>
4. 预期：<具体现象>
```

不要只写「已自测」——步骤须能让 reviewer 复现。

---

## Agent 执行清单

### 写 commit 前

1. `git status` + `git diff`（必要时 `git diff --cached`）看清范围
2. 判断是否应拆分（多 scope / 多意图 → 建议拆分并说明）
3. 对齐 `git log` 选 type + scope + subject
4. 排除 secrets 与无关生成文件
5. **仅用户明确要求时** 执行 `git add` / `git commit`

### 开 PR 前

1. 确认分支相对主干的 commit 粒度合理（一 PR 一事）
2. `git log <base>...HEAD` + `git diff <base>...HEAD` 通读全部将纳入 PR 的变更
3. 标题 + 四段描述写全，**描述与 diff 一致**
4. 测试方式写可执行步骤
5. 用 `gh pr create`；返回 PR URL

### 无效 PR（必须避免）

- 描述为空或复制粘贴无关内容
- 单个 PR 混入多个不相关功能
- 合并后主干无法启动或缺迁移/配置
- 一次性提交大量无关 commit

---

## 拆分建议（常见场景）

| 场景 | 建议 |
|------|------|
| API + 前端联调 | 先后端/API PR，再前端 PR |
| 样式调整 + bugfix | 拆成 style/refactor 与 fix |
| 迁移 + 业务代码 | 迁移单独 PR，或 migration commit 在前 |
| monorepo 多端同功能 | 按端或按包拆分，便于 review |
| 文档 + 代码 | 文档可单独 `docs` PR，或同 PR 内独立 commit |

---

## 项目级覆盖（可选）

若仓库有 `.cursor/skills/pr-commit/` 或 `CONTRIBUTING.md` 中的 scope 表，**以项目内文件为准**，可覆盖本文 scope 与 subject 语言。

详细示例：[examples.md](examples.md)
