# Issue Standard

GitHub Issue 创建与管理团队规范：标题、范围、标签、拆分粒度。

本项目使用时优先参考 `reference/GitHub过程管理规范.md` 和 `reference/产品设计规范.md`。调研 Issue 不强制套四段模板或多标签；Proposal 才使用 `proposal`、`FullSpec` / `MiniSpec` 等状态标签。

## 安装

```bash
ln -s /path/to/my-skills-lab/project-method/issue-standard ~/.claude/skills/issue-standard
```

## 依赖

- 目标仓库已初始化 GitHub Issues
- 建议先对齐 [pr-commit](../../dev-tools/pr-commit/) 的 type 体系

## 触发示例

| 用户说 | 作用 |
|--------|------|
| 「从这份调研报告创建 Issue」 | 提取关键任务，拆分成符合模板的 Issue |
| 「帮我给这个 Issue 打标签」 | 按标签体系推荐标签 |
| 「这个任务太大了，怎么拆」 | 按拆分规则输出子 Issue 列表 |
| 「检查这些 Issue 都写到位了吗」 | 按 Issue 类型检查背景、目标、验收和标签是否适度 |
