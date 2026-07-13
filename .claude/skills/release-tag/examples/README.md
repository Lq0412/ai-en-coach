# Release Tag — 示例

## 示例 1：MS1 结束打 tag

**用户：** 「MS1 完成了，帮我打 tag 写 Release Notes」

**期望行为：** 输出 `git tag -a v0.1.0` 命令 + 读取 MS1 已关闭 Issue 列表 → 生成 Release Notes。

## 示例 2：Release Notes 补全

**用户：** 「这个 Release Notes 只列了 Issue，帮我补完整」

**期望行为：** 补充「主要成果」「已知限制」「下个 MS 计划」三段，把 Issue 列表归到「已关闭 Issue」下。

## 示例 3：补修复 tag

**用户：** 「v0.2.0 的合入有问题，需要补一个修复 tag」

**期望行为：** 建议 `v0.2.1`，输出打 tag 命令，并在 Release Notes 中标注修复了什么。
