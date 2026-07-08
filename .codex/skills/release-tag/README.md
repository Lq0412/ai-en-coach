# Release Tag

Git Tag 与 GitHub Release 规范。每个 MS 交一个可追溯的版本。

## 安装

```bash
ln -s /path/to/my-skills-lab/project-method/release-tag ~/.claude/skills/release-tag
```

## 触发示例

| 用户说 | 作用 |
|--------|------|
| 「MS1 结束了，打 tag 发版」 | 输出 tag 命令 + Release Notes 模板 |
| 「Release Notes 怎么写」 | 输出四段格式（主要成果/已关闭 Issue/已知限制/下个 MS） |
| 「版本号怎么定」 | 输出 MS → tag 对照表 |
