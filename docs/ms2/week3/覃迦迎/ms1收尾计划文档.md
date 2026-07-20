# 覃迦迎 MS1 收尾与 MS2 转段计划

> 更新日期：2026-07-20
> 目标仓库：[1024XEngineer/XE3-ESL](https://github.com/1024XEngineer/XE3-ESL)
> GitHub 账号：`jyqin0203`
> 文档用途：跟踪与我直接相关的 MS1 收尾工作，以及暂不合并 PR #51 时能够推进到的状态。

## 1. 当前进度

远端 `MS1：战略决策` 当前共关联 39 个 Issue，其中 27 个已关闭、12 个仍开放。由我创建的 MS1 Issue 中，10 个已关闭，只剩 #36 等待 PR #51 最终合入。

已完成且无需重新打开：#1、#4、#8、#10、#29、#34、#35、#47、#50、#55。
当前代码交付入口：[PR #51：建立 Practice 可串联空骨架接口](https://github.com/1024XEngineer/XE3-ESL/pull/51)。

收尾原则：

1. 暂不合并 PR #51，但可以继续修复、验证和 Review，使其达到可合并状态。
2. Proposal 必须完成相关模块评审后才能接受和关闭。
3. 实现 Issue 只有在代码合入后才算交付完成；不以“代码已经写好”代替合并。
4. 已接受 Proposal 保持冻结；后续变化通过增量决策处理。
5. 任何新的 Issue、PR、Milestone 或其他远端对象，必须先提交草稿供我审核，得到明确同意后才能创建。

## 2. 剩余 MS1 Issue

### [#36 实现 Practice 后端架构骨架](https://github.com/1024XEngineer/XE3-ESL/issues/36)

当前状态：Open，由 PR #51 实现。

处理步骤：

1. 不迁入 MS2，也不在 PR 未合并时手动关闭。
2. PR #51 已完成旧 Review 线程处理、#47 Practice 侧契约对齐和本地测试；下一步等待后续人工 Review 与合并授权。
3. 在没有合并授权时继续保持 Open。
4. 后续允许合并时，由 PR 正文中的 `Closes #36` 自动关闭 #36，Milestone 保持 MS1。

## 3. PR #51 暂不合并时的处理边界

[PR #51](https://github.com/1024XEngineer/XE3-ESL/pull/51) 当前 Open、`REVIEW_REQUIRED`，远端最新提交为 `5d75108`，暂无通过的人工 Review，也没有可见的 CI 检查结果。当前没有 Reviewer 请求。

已完成：

- 4 个旧 Review 线程均已回复处理依据并 Resolve，未解决线程为 0。
- 稳定错误契约已补齐；公开 Session/Snapshot 字段已覆盖原访问问题；查询范围按 #55 的空骨架决策收缩。
- #47 要求的 Practice 侧最小契约已实现：`PracticeParticipant.ParticipantRole`、`ResolveActorParticipantQuery` 和 `SessionService.ResolveActorParticipant`。
- 对齐提交 `5d75108 feat(practice): 对齐参与者关系解析契约` 已推送到 PR #51 分支。
- 本地已通过 gofmt、Practice 包测试、竞态测试、全量测试、`go vet` 和 `git diff --check`。

暂不合并时仍可完成：

1. 在需要进入合并准备时请求至少一名相关模块负责人进行人工 Review。
2. 根据后续 Review 处理新增意见并复跑验证。
3. 在未获得合并授权前保持 PR Open。

暂时不能完成：

- 不能把 #36 标记为已交付或关闭。
- 不能宣称个人 MS1 已全部收尾。

## 4. 已完成的 MS1 收口

| Issue | 当前结论 |
| --- | --- |
| [#10 反馈、复练与成长记录功能范围](https://github.com/1024XEngineer/XE3-ESL/issues/10) | 已接受并关闭，保留在 MS1。 |
| [#29 面试主链路第 7—10 节交互与场次策略增量](https://github.com/1024XEngineer/XE3-ESL/issues/29) | 已一次确认 Turn、结束控制、失败计数、语音验证和同题重答边界，并关闭在 MS1。 |
| [#34 ABCD 跨模块统一语言与契约](https://github.com/1024XEngineer/XE3-ESL/issues/34) | 已完成跨模块评审并关闭。 |
| [#35 Practice 后端模块架构与接口边界](https://github.com/1024XEngineer/XE3-ESL/issues/35) | 已接受并关闭；#55 只收缩交付深度，不改变其所有权和依赖方向。 |
| [#47 Practice 多参与者可扩展接口契约](https://github.com/1024XEngineer/XE3-ESL/issues/47) | 两位跨模块评审者均确认无阻塞，已标记 `Proposal-Accepted` 并关闭；Practice 侧最小契约已进入 PR #51。 |
| [#50 Practice 生命周期服务与事务语义](https://github.com/1024XEngineer/XE3-ESL/issues/50) | 已作为过大范围来源关闭，不再直接实现。 |
| [#55 收缩 Practice 为可串联空骨架](https://github.com/1024XEngineer/XE3-ESL/issues/55) | 六项验收完成，已记录未合并边界并关闭；代码交付仍由 #36 / PR #51 跟踪。 |

## 5. 已保留的 MS2 Practice 任务

以下三个 Issue 已保留在 `MS2：MVP 深化与架构落实`，均等待 #36 / PR #51 的空骨架稳定后再进入实现：

1. [#56 Practice Plan 与 Session 生命周期服务](https://github.com/1024XEngineer/XE3-ESL/issues/56)：负责计划和场次的基础状态变化。
2. [#57 TurnOutcome 幂等消费与场次策略推进](https://github.com/1024XEngineer/XE3-ESL/issues/57)：负责每轮回答后的下一步动作和重复提交保护。
3. [#58 Practice Repository 事务与并发约束](https://github.com/1024XEngineer/XE3-ESL/issues/58)：负责可靠存储、事务回滚和活动场次并发约束。

三者暂时保留，但开始开发前仍需结合 MS2 的核心 MVP 和 CI 要求重新确认优先级与最小验收范围。

## 6. 最新执行顺序

1. 保持 PR #51 Open，不主动合并。
2. 需要进入最终合并准备时请求人工 Review；当前按要求尚未请求。
3. 处理可能出现的新 Review 意见并复跑全套验证。
4. 获得明确合并授权后合并 PR #51，由 `Closes #36` 自动关闭 #36。

## 7. 个人 MS1 收尾完成标准

- [x] #10、#29、#34、#35 已留下收口记录并关闭。
- [x] #50 已停止按过大范围直接实现，后续任务已进入 MS2。
- [x] #47 已完成两方 Review、补齐契约、接受并关闭。
- [x] #55 已完成决策与空骨架深度验收并关闭。
- [x] PR #51 的旧 Review 意见已全部回复并 Resolve。
- [x] PR #51 已对齐 #47 的 Practice 侧最小契约并推送。
- [x] PR #51 已通过本地必要检查。
- [ ] PR #51 已取得人工 Review 批准。
- [ ] PR #51 已在获得授权后合并。
- [ ] #36 已由 PR 自动关闭并保留在 MS1。

如果继续保持 PR #51 不合并，当前已经达到可推进的最大状态：#47、#55 均已关闭，旧 Review 线程清零，#47 Practice 侧契约已推送且本地测试通过；只剩 #36 等待人工 Review 与最终合并授权。
