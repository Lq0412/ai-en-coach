# PR & Commit 示例

## 通用示例

### 单包 Web 项目

```
feat(auth): 支持 OAuth2 第三方登录回调
fix(ui): 修复暗色模式下侧边栏对比度不足
docs: 更新 API 鉴权章节
chore(ci): Node 20 升级到 22
```

分支：`feat/auth-oauth2-callback`

PR 标题：`feat(auth): OAuth2 第三方登录`

---

### Monorepo（pnpm / turbo）

```
feat(packages/ui): Button 组件支持 loading 态
fix(apps/admin): 修复权限路由守卫死循环
chore(database): 新增 users_role 关联表迁移
```

拆分：迁移 PR 先于业务 PR，或同一 PR 内 migration commit 在首。

---

## 多端 Monorepo 示例（Mark 类项目）

目录与 scope 对照：

| 目录 | scope | 说明 |
|------|-------|------|
| `backend/` | `后端` | FastAPI、`module_*` |
| `frontend/` | `前端` | Vue 管理端 |
| `frontend-creator/` | `创作者端` | React 创作者工作台 |
| `backend/app/alembic/` | `数据库` | 迁移 |
| `docs/`、`*.md` | `文档` | 文档与说明 |

### Commit 示例

```
feat(创作者端): 登录态校验加内存缓存避免切页重复请求
fix(后端): 修复 video_project 创建接口 auth.user_id 字段错误
refactor(创作者端): PPT 弹窗复用管理端模板数据
perf(后端): cid3 分类树构建改为知识库索引避免重复读盘
docs: 补充创作者端本地启动说明
chore(数据库): 新增 video_project 表迁移
```

### 分支示例

```
feat/creator-登录鉴权
feat/backend-cid3-tree-perf
fix/creator-项目列表返回重复加载
fix/backend-video-project-500
```

### PR 标题示例

```
feat(创作者端): 登录态缓存与 Layout 级鉴权守卫
fix(后端): 优化 cid3-tree 接口构建性能
```

### 测试方式示例

```markdown
## 测试方式
1. 后端：`cd backend && python main.py run --env=dev`
2. 管理端：`cd frontend && pnpm dev` → http://localhost:5173/web
3. 创作者端：`cd frontend-creator && pnpm dev` → http://localhost:5180/creator
4. 验证：登录创作者端 → 切换项目列表页 → 观察 Network 无重复 `/me` 请求
5. 预期：首屏一次鉴权，切页不再重复拉用户信息
```

### 拆分示例

| 场景 | 建议 |
|------|------|
| 后端 API + 创作者端 UI 联调 | 先 `feat(后端)`，再 `feat(创作者端)` |
| 主题色 + 业务 bugfix | 拆成 style/refactor 与 fix 两个 PR |
| 迁移 + 业务代码 | 迁移单独 PR，或 migration 在前、业务在后 |
| 管理端与创作者端同功能 | 按端拆分，便于 review |

---

## 英文 subject 项目示例

若 `git log` 均为英文：

```
feat(api): add refresh token rotation on login
fix(web): prevent table crash on empty dataset
docs: document required env vars for local dev
```

PR 标题与 commit 保持一致风格。
