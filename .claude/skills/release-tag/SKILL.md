---
name: release-tag
description: >
  Git Tag 与 GitHub Release 规范。Use when 打 tag、写 Release Notes、发布版本、
  或提到 打 tag、Release、发版、版本号、release notes、tag 规范、发布说明。
---

# Release & Tag 规范

每个 Milestone 结束时打一个 tag，交一个 Release。**可追溯、可回滚。**

## Tag 命名

```
v{major}.{minor}
```

| MS | Tag | 含义 |
|:---|:----|:-----|
| MS1 | `v0.1.0` | 方向确立，骨架可运行 |
| MS2 | `v0.2.0` | 核心路径可演示 |
| MS3 | `v0.3.0` | MVP 完整可试用 |
| MS4 | `v1.0.0` | 正式发布 |

### 规则

- 每个 MS 结束 **必须** 打 tag
- tag 打在 `main` 分支上（MS 结束时 dev 合入 main，随即打 tag）
- tag 不可删除、不可移动——错了就补打新 tag（如 `v0.2.1`）
- **不打轻量 tag**，全部用 annotated tag

## 打 Tag 命令

```bash
# MS 结束时（dev 已合入 main）
git checkout main
git pull

# annotated tag：必须写 message
git tag -a v0.1.0 -m "MS1：方向确立，骨架可运行"

git push origin v0.1.0
```

## Release Notes

每个 tag 发布时必须写 Release Notes，格式如下：

```markdown
# MS1：战略决策与首个可串联版本

## 主要成果
- 竞品矩阵 12+ 产品完成，确定方向（高压冲突口语）
- 空骨架系统可运行（模块边界 + 接口契约 + 数据模型）
- 技术选型裁定：React Native + Python FastAPI + Deepgram ASR

## 已关闭 Issue
- #1 市场调研：用户访谈 6 人
- #3 竞品全景矩阵
- #5 ASR 技术选型调研
- #8 模块骨架代码入库

## 已知限制
- ASR 仅桩实现，下周 MS2 开始集成真实 Deepgram
- 前端仅骨架页面，无真实交互

## 下个 MS 计划
MS2（7/21-8/1）：核心对话路径跑通，Real ASR + TTS + LLM 串联
```

### Release Notes 规则

- **「主要成果」写决策和产出，不写过程**（「确定了 ASR 用 Deepgram」不是「讨论了三天的 ASR 方案」）
- **「已关闭 Issue」从 GitHub Milestone 自动生成**（`gh release create` 可以自动拉）
- **「已知限制」必须写**——知道什么还没做好，比假装做好了更重要
- **「下个 MS 计划」一句话**——让读者知道下一步是什么

## 自动创建 Release

```bash
gh release create v0.1.0 \
  --title "MS1：战略决策与首个可串联版本" \
  --notes-file release-notes.md
```

