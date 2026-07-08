# Issue Standard

GitHub Issue 创建与管理团队规范：模板、标签、拆分粒度。

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
| 「检查这些 Issue 都写到位了吗」 | 逐条检查四段是否齐全 |
