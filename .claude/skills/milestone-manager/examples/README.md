# Milestone Manager — 示例

## 示例 1：创建 MS1 Milestone

**用户：** 「创建 MS1 的 GitHub Milestone，这个项目 5 人 8 周」

**期望行为：** 输出 `MS1：战略决策与首个可串联版本` Milestone，含核心问题、交付物清单、不交付清单、截止日期。

## 示例 2：进度偏离检查

**用户：** 「MS2 过了一周，才关了 3 个 Issue（总共 17 个），怎么办」

**期望行为：** 输出偏离分析 + 建议动作（scope 是否膨胀？卡在哪里？需要砍项吗？）。

## 示例 3：Issue 关联检查

**用户：** 「检查当前所有 open Issue 都挂了 MS 吗」

**期望行为：** `gh issue list --json number,title,milestone` → 标出没有 Milestone 的 Issue → 输出补充建议。
