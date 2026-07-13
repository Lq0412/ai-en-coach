# Milestone Manager

GitHub Milestone 创建、Issue 关联与进度跟踪。基于 8 周 / 4 个 MS 模型。

本项目使用时优先参考 `reference/GitHub过程管理规范.md` 和 `reference/一些安排与共识.md`。已有仓库的 Milestone 标题、描述和 due date 以仓库现状为准；`data/ms-config.json` 只在新建或用户明确要求同步时作为参考。

## 安装

```bash
ln -s /path/to/my-skills-lab/project-method/milestone-manager ~/.claude/skills/milestone-manager
```

## 触发示例

| 用户说 | 作用 |
|--------|------|
| 「创建 MS1 的 Milestone」 | 按模板输出标题 + 描述 + 交付物清单 |
| 「MS2 过半了，帮我看看进度」 | 对比预期和实际进度，输出偏离项 |
| 「检查这周的 Issue 都挂 MS 了吗」 | 逐条 Issue 检查 Milestone 关联 |
| 「8 周怎么拆成 4 个 MS」 | 输出 4 个 MS 的拆解表 |
