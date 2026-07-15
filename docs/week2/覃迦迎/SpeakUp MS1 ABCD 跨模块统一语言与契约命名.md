# SpeakUp MS1 ABCD 跨模块统一语言与契约命名

> 日期：2026-07-15<br>
> 状态：团队评审稿<br>
> 适用模块：`preparation`、`practice`、`conversation`、`review`<br>
> 文档目的：统一跨模块对象、字段语义、状态、命令和事件命名；不规定 REST 路径、Go 类型、数据库表名或通信方式

## 1. 使用规则

1. 跨模块接口、事件、设计文档和代码中的公共概念以本文为准。
2. 对象由一个模块拥有，其他模块只能通过只读引用、快照或明确契约使用。
3. 核心训练模型使用 `Practice*`，不绑定面试；面试专有模型使用 `Interview*`。
4. MS1 只实现 `INTERVIEW`，未来场景名称只是扩展边界，不代表当前开发范围。
5. 本文规定的是最小语义字段。各模块可以增加内部字段，但不能要求其他模块理解内部实现。
6. 跨模块对象改名、改变所有权或删除字段，必须由受影响模块共同确认并同步更新本文。

## 2. 四个模块的统一边界

| 代号 | 模块           | 一句话职责                                     | 拥有的核心对象                                                                                               |
| ---- | -------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| A    | `preparation`  | 定义练习前可选择的场景、背景、角色和练习选项   | `ScenarioDefinition`、`ScenarioConfig`、`PreparationProfile`、`RoleDefinition`、`PracticeOptionDefinition`   |
| B    | `practice`     | 把准备内容编排为计划，并管理每场练习的生命周期 | `PracticePlan`、`PracticeSession`、`PracticeParticipant`、`PracticeSessionSnapshot`、`PracticeSessionPolicy` |
| C    | `conversation` | 执行一问一答及录音、转录和问题生成             | `Question`、`Turn`、`AudioAsset`、`TurnOutcome`                                                              |
| D    | `review`       | 分析回答、生成证据反馈、重答记录和历史报告     | `TurnAnalysis`、`FeedbackItem`、`RetryAttempt`、`SessionReport`、`NextPracticeFocus`                         |

统一判断方法：

```text
A preparation：有什么可练、背景和角色是什么
B practice：本次选什么、如何开始和结束
C conversation：实际问什么、用户回答了什么
D review：回答得怎么样、下一次重点练什么
```

## 3. 命名层级

### 3.1 通用核心名称

以下名称适用于面试及未来其他训练场景：

```text
PracticePlan
PracticeSession
PracticeParticipant
PracticeSessionSnapshot
PracticeSessionPolicy
PracticeOptionDefinition
Question
Turn
TurnOutcome
TurnAnalysis
FeedbackItem
RetryAttempt
SessionReport
```

### 3.2 场景专有名称

场景由 `scenario_type` 和对应配置区分：

```text
INTERVIEW        -> InterviewScenarioConfig / InterviewerRole
SALES_ROLEPLAY   -> SalesRoleplayConfig / SalesParticipantRole
PRESENTATION     -> PresentationScenarioConfig
ONE_ON_ONE       -> OneOnOneScenarioConfig
CUSTOM           -> CustomScenarioConfig
```

MS1 只实现第一行。界面可以显示“面试计划”“面试场次”，领域对象仍使用 `PracticePlan` 和 `PracticeSession`。

### 3.3 标识符规则

- 对象标识统一使用 `<object>_id`，例如 `practice_session_id`、`turn_id`。
- 跨模块只传稳定 ID，不使用名称、数组位置或页面序号充当关联键。
- 版本使用 `<object>_version`；配置修订使用 `plan_revision`。
- 时间字段使用明确动作名称，例如 `created_at`、`started_at`、`completed_at`。
- 状态字段使用 `<object>_status`，不用含义模糊的 `state` 或 `flag`。

## 4. A：`preparation` 对外对象

### 4.1 `ScenarioDefinition`

表示一种训练场景的稳定定义。

| 最小字段                 | 含义                         |
| ------------------------ | ---------------------------- |
| `scenario_definition_id` | 场景定义标识                 |
| `scenario_type`          | 场景类型；MS1 为 `INTERVIEW` |
| `name`                   | 产品展示名称                 |
| `version`                | 场景定义版本                 |
| `status`                 | `active` 或 `inactive`       |

### 4.2 `ScenarioConfig`

表示场景专有配置的抽象名称。MS1 的具体类型为 `InterviewScenarioConfig`，可包含岗位、面试阶段、练习选项等面试语义。B 负责选择和冻结，不负责编辑其内容。

| 最小字段                 | 含义         |
| ------------------------ | ------------ |
| `scenario_config_id`     | 配置标识     |
| `scenario_definition_id` | 所属场景定义 |
| `config_type`            | 具体配置类型 |
| `version`                | 配置版本     |

### 4.3 `PreparationProfile`

表示用户可持续编辑的准备资料集合，不直接作为历史 Session 的读取来源。

| 最小字段                 | 含义                 |
| ------------------------ | -------------------- |
| `preparation_profile_id` | 准备资料标识         |
| `user_id`                | 所属用户             |
| `resume_ref`             | 简历引用，可为空     |
| `job_description_ref`    | 岗位描述引用，可为空 |
| `background_summary`     | 经用户确认的背景摘要 |
| `version`                | 资料版本             |
| `updated_at`             | 最近更新时间         |

### 4.4 `RoleDefinition`

角色定义的通用名称。MS1 的面试角色可具体表达为 `InterviewerRole`。

| 最小字段                 | 含义                 |
| ------------------------ | -------------------- |
| `role_definition_id`     | 角色定义标识         |
| `scenario_definition_id` | 所属场景             |
| `role_type`              | 角色类型             |
| `display_name`           | 展示名称             |
| `responsibilities`       | 职责摘要             |
| `style`                  | 对话风格摘要         |
| `focus_areas`            | 关注目标列表         |
| `voice_config_ref`       | 音色配置引用，可为空 |
| `version`                | 角色版本             |

### 4.5 `PracticeOptionDefinition`

表示某个场景或角色允许用户选择的练习方式，由 A 定义、B 选择并冻结。MS1 至少包含完整模拟和角色专项两类选项。

| 最小字段                     | 含义                         |
| ---------------------------- | ---------------------------- |
| `practice_option_id`         | 练习选项标识                 |
| `scenario_definition_id`     | 所属场景                     |
| `role_definition_id`         | 限定角色时填写，可为空       |
| `practice_option_type`       | `FULL_SIMULATION` 或 `FOCUS` |
| `display_name`               | 产品展示名称                 |
| `version`                    | 练习选项版本                 |

### 4.6 `PreparationSnapshot`

表示某一时刻准备内容的不可变副本。A 定义快照内容，B 将其纳入 `PracticeSessionSnapshot`。

| 最小字段                   | 含义                         |
| -------------------------- | ---------------------------- |
| `preparation_snapshot_id`  | 快照标识                     |
| `source_profile_id`        | 来源资料标识                 |
| `source_version`           | 来源资料版本                 |
| `resume_snapshot`          | 当时使用的简历内容或只读副本 |
| `job_description_snapshot` | 当时使用的岗位内容或只读副本 |
| `background_snapshot`      | 当时确认的背景内容           |
| `created_at`               | 快照创建时间                 |

## 5. B：`practice` 对外对象

### 5.1 `PracticePlan`

长期训练容器，可跨多个 Session 使用和修改。

| 最小字段                 | 含义                 |
| ------------------------ | -------------------- |
| `practice_plan_id`       | 计划标识             |
| `user_id`                | 所属用户             |
| `scenario_definition_id` | 场景定义引用         |
| `scenario_type`          | MS1 为 `INTERVIEW`   |
| `scenario_config_id`     | 场景专有配置引用     |
| `preparation_profile_id` | 当前准备资料引用     |
| `selected_role_ids`      | 当前可练角色引用集合 |
| `plan_revision`          | 每次有效修改递增     |
| `practice_plan_status`   | 计划状态             |

统一状态：

```text
configuring
configuration_failed
ready
archived
```

### 5.2 `PracticeSession`

一次实际练习。每个 Session 只属于一个计划，并读取自己的不可变快照。

| 最小字段                  | 含义                           |
| ------------------------- | ------------------------------ |
| `practice_session_id`     | Session 标识                   |
| `practice_plan_id`        | 所属计划                       |
| `scenario_type`           | 从计划继承的场景类型           |
| `snapshot_id`             | `PracticeSessionSnapshot` 标识 |
| `practice_session_status` | Session 状态                   |
| `started_at`              | 正式开始时间，可为空           |
| `ended_at`                | 结束时间，可为空               |
| `end_reason`              | 正常完成或提前结束原因，可为空 |

统一状态：

```text
starting
in_progress
paused
completed
ended_early
```

### 5.3 `PracticeParticipant`

Session 与参与角色的关系。MS1 集合长度固定为 1，但接口使用集合为多面试官扩展预留。

| 最小字段                  | 含义               |
| ------------------------- | ------------------ |
| `practice_participant_id` | 参与者关系标识     |
| `practice_session_id`     | 所属 Session       |
| `role_definition_id`      | 来源角色定义       |
| `role_snapshot`           | 本场冻结的角色内容 |
| `participant_order`       | 稳定顺序           |

### 5.4 `PracticeSessionSnapshot`

Session 创建时由 B 生成的完整只读输入，是 C 和 D 理解本场上下文的唯一入口。

| 最小字段                       | 含义                           |
| ------------------------------ | ------------------------------ |
| `snapshot_id`                  | 快照标识                       |
| `practice_session_id`          | 所属 Session                   |
| `plan_revision`                | 创建时计划修订号               |
| `scenario_type`                | 场景类型                       |
| `scenario_definition_snapshot` | 场景定义快照                   |
| `scenario_config_snapshot`     | 场景专有配置快照               |
| `preparation_snapshot`         | A 提供的准备快照               |
| `participants`                 | `PracticeParticipant` 快照集合 |
| `practice_option`              | `PracticeOptionDefinition` 快照 |
| `session_policy`               | `PracticeSessionPolicy`        |
| `practice_focuses`             | 本次带入的结构化训练目标       |
| `created_at`                   | 快照创建时间                   |

### 5.5 `PracticeSessionPolicy`

| 最小字段                      | 含义                                   |
| ----------------------------- | -------------------------------------- |
| `suggested_duration_seconds`  | 建议时长                               |
| `min_effective_turns`         | 策略正常完成所需的最少有效 Turn        |
| `max_effective_turns`         | 有效 Turn 硬上限，主问题和追问统一计数 |
| `coverage_checkpoint_turn`    | 开始判断目标覆盖是否足够的检查轮次     |
| `max_follow_ups_per_question` | 单题追问上限                           |
| `target_objectives`           | 本场需覆盖的目标                       |
| `early_completion_rule`       | 允许正常提前完成的规则标识             |

## 6. C：`conversation` 对外对象

### 6.1 `Question`

| 最小字段                 | 含义                     |
| ------------------------ | ------------------------ |
| `question_id`            | 问题标识                 |
| `practice_session_id`    | 所属 Session             |
| `speaker_participant_id` | 实际提问者               |
| `objective_id`           | 考察目标，可为空         |
| `question_type`          | `PRIMARY` 或 `FOLLOW_UP` |
| `parent_question_id`     | 追问对应的主问题，可为空 |
| `content`                | 问题文本                 |
| `sequence`               | 本场稳定顺序             |
| `audio_asset_id`         | 问题 TTS 音频，可为空    |
| `created_at`             | 问题创建时间             |

Conversation 内部可以额外保存以下生成追踪字段，不要求其他模块理解：

| 内部字段                  | 含义                     |
| ------------------------- | ------------------------ |
| `generator_provider`      | 问题生成能力来源         |
| `generator_model_version` | 问题生成所用的模型版本   |

字段约束：

- `question_type = PRIMARY` 时，`parent_question_id` 为空。
- `question_type = FOLLOW_UP` 时，`parent_question_id` 指向同一 Session 的主问题。
- `speaker_participant_id` 必须属于当前 `PracticeSessionSnapshot.participants`。
- 多个面试官场景下，每个 Question 仍然只有一个实际提问者。

### 6.2 `Turn`

`Turn` 表示一次有效的问答记录，不等同于单条 WebSocket 消息或录音分片。

| 最小字段              | 含义               |
| --------------------- | ------------------ |
| `turn_id`             | Turn 标识          |
| `practice_session_id` | 所属 Session       |
| `question_id`         | 对应问题           |
| `speaker_participant_id` | 实际提问者，必须与 Question 一致 |
| `sequence`            | 本场稳定顺序，必须与 Question 一致 |
| `interaction_mode`    | `PUSH_TO_TALK` 或 `REALTIME` |
| `answer_text`         | 用户最终回答文本   |
| `audio_asset_id`      | 原回答音频，可为空 |
| `turn_status`         | Turn 状态          |
| `submitted_at`        | 有效回答提交时间   |
| `created_at`          | Turn 创建时间      |
| `completed_at`        | Turn 完成时间，可为空 |

建议统一状态：

```text
answering
submitted
processing
completed
```

失败、重连、空回答和无效输入不创建有效 `Turn`，也不推进 B 的 Session 策略。

Conversation 内部可以额外保存以下处理字段，不作为跨模块最小契约：

| 内部字段                   | 含义                              |
| -------------------------- | --------------------------------- |
| `processing_stage`         | 当前内部处理阶段                  |
| `current_transcript_version` | 当前有效转录版本，可为空        |
| `processing_failure`       | 最近一次处理失败信息，可为空      |

字段约束：

- `practice_session_id` 必须与 Question 的所属 Session 一致。
- `speaker_participant_id` 和 `sequence` 必须与 Question 一致。
- `answer_text` 和 `audio_asset_id` 在 Turn 完成后不可覆盖。
- `user_id` 不进入 Turn 公共字段；通过 `practice_session_id` 验证用户归属。

### 6.3 `AudioAsset`

| 最小字段         | 含义                                         |
| ---------------- | -------------------------------------------- |
| `audio_asset_id` | 音频资产标识                                 |
| `owner_type`     | 所属对象类型，例如 `TURN` 或 `RETRY_ATTEMPT` |
| `owner_id`       | 所属对象标识                                 |
| `duration_ms`    | 音频时长                                     |
| `storage_ref`    | 存储引用；MS1 Mock 可为空                    |
| `audio_status`   | 音频状态                                     |
| `content_type`   | 音频 MIME，例如 `audio/mp4`                  |
| `language`       | 音频语言，可为空                             |
| `created_at`     | 音频资产创建时间                             |
| `updated_at`     | 最近状态更新时间                             |

建议统一 `audio_status`：

```text
pending
ready
failed
deleted
```

字段约束：

- `owner_id` 必须与 `owner_type` 对应的对象一致。
- `duration_ms` 大于 0。
- `storage_ref` 是稳定存储引用，不是公开下载 URL。

### 6.4 `TurnOutcome`

C 在有效 Turn 保存后发给 B 的控制信号，不是用户可见反馈。

| 最小字段                           | 含义                         |
| ---------------------------------- | ---------------------------- |
| `turn_id`                          | 对应 Turn，兼作幂等依据      |
| `practice_session_id`              | 所属 Session                 |
| `answer_validity`                  | 回答是否有效                 |
| `objective_coverage`               | 已覆盖、部分覆盖和未覆盖目标 |
| `follow_up_gap`                    | 是否存在值得追问的缺口       |
| `follow_up_count`                  | 当前主问题已追问次数         |
| `completed_primary_question_count` | 已完成主问题数               |

B 根据 `TurnOutcome` 返回统一 `NextAction`：

```text
FOLLOW_UP_CURRENT
MOVE_TO_NEXT_OBJECTIVE
COMPLETE_SESSION
```

未来多参与者场景可以附加 `next_participant_id`，MS1 不实现轮流提问逻辑。

字段约束：

- `turn_id` 同时作为 B 幂等处理 TurnOutcome 的依据。
- `follow_up_count` 和 `completed_primary_question_count` 不小于 0。
- TurnOutcome 只包含推进 Session 策略需要的信息，不包含语言评分和用户反馈。

### 6.5 Conversation 内部转录结构

转录属于 Conversation 的内部处理数据。跨模块仍以 `Turn.answer_text` 作为用户最终回答文本，不要求 B 或 D 理解转录实现。

#### `Transcript`

| 内部字段             | 含义                         |
| -------------------- | ---------------------------- |
| `transcript_id`      | 转录标识                     |
| `turn_id`            | 所属 Turn                    |
| `transcript_version` | Turn 内转录版本，从 1 开始   |
| `text`               | 原始 ASR 文本                |
| `language`           | 识别语言                     |
| `provider`           | ASR 能力来源                 |
| `model_version`      | ASR 模型版本                 |
| `segments`           | 带时间范围的片段集合，可为空 |
| `created_at`         | 转录创建时间                 |

约束：

- Transcript 按版本追加，不覆盖旧版本。
- 同一 Turn 内 `transcript_version` 单调递增。
- 改写文本、评分和反馈不属于 Transcript，由 Review 保存。

#### `TranscriptSegment`

| 内部字段   | 含义                  |
| ---------- | --------------------- |
| `start_ms` | 片段开始时间，毫秒    |
| `end_ms`   | 片段结束时间，毫秒    |
| `text`     | 片段文本              |
| `confidence` | ASR 置信度，可为空  |

### 6.6 Conversation 内部失败与尝试结构

这些结构只用于 Conversation 内部恢复，不作为跨模块公共对象。

#### `ProcessingFailure`

| 内部字段   | 含义                     |
| ---------- | ------------------------ |
| `stage`    | 失败阶段                 |
| `code`     | 稳定错误码               |
| `message`  | 清洗后的错误描述         |
| `retryable` | 是否允许原地重试        |
| `failed_at` | 失败时间                |

#### `ProcessingAttempt`

| 内部字段                  | 含义                         |
| ------------------------- | ---------------------------- |
| `processing_attempt_id`   | 尝试记录标识                 |
| `turn_id`                 | 所属 Turn                    |
| `attempt_number`          | Turn 内尝试序号              |
| `stage`                   | 当前处理阶段                 |
| `processing_attempt_status` | `running`、`completed` 或 `failed` |
| `failure`                 | 失败信息，可为空             |
| `started_at`              | 开始时间                     |
| `completed_at`            | 成功完成时间，可为空         |

ProcessingAttempt 只追加、不覆盖；Provider 只返回标准化错误，Conversation 决定如何形成 ProcessingFailure 和 Turn 内部状态。

## 7. D：`review` 对外对象

### 7.1 `TurnAnalysis`

表示一次 Turn 的可重试分析结果，与原始 Turn 分开保存。

| 最小字段           | 含义                   |
| ------------------ | ---------------------- |
| `turn_analysis_id` | 分析标识               |
| `turn_id`          | 被分析的原始 Turn      |
| `analysis_status`  | 分析状态               |
| `analysis_version` | 分析算法或 Mock 版本   |
| `transcript`       | 用于分析的转录文本     |
| `evidence_refs`    | 对原回答证据的引用集合 |
| `created_at`       | 分析创建时间           |

建议统一状态：

```text
pending
processing
completed
failed
```

### 7.2 `FeedbackItem`

| 最小字段           | 含义                   |
| ------------------ | ---------------------- |
| `feedback_item_id` | 反馈项标识             |
| `turn_analysis_id` | 所属分析               |
| `feedback_type`    | 反馈维度               |
| `evidence`         | 用户原回答中的具体证据 |
| `problem`          | 证据反映的问题         |
| `improvement`      | 可执行的改进方向       |

不使用无法解释的裸总分或录用概率作为公共契约。

### 7.3 `RetryAttempt`

同题重答必须追加记录，不能覆盖原 `Turn`、原分析或原反馈。

| 最小字段           | 含义                   |
| ------------------ | ---------------------- |
| `retry_attempt_id` | 重答标识               |
| `source_turn_id`   | 原始 Turn              |
| `answer_text`      | 重答文本               |
| `audio_asset_id`   | 重答音频，可为空       |
| `comparison`       | 已补充内容与仍缺少内容 |
| `created_at`       | 重答时间               |

### 7.4 `SessionReport`

| 最小字段              | 含义               |
| --------------------- | ------------------ |
| `session_report_id`   | 报告标识           |
| `practice_session_id` | 对应 Session       |
| `report_status`       | 报告状态           |
| `turn_analysis_ids`   | 纳入报告的分析集合 |
| `summary`             | 本场总结           |
| `generated_at`        | 生成时间，可为空   |

### 7.5 `NextPracticeFocus`

D 从历史结果提炼、B 写入下一场快照的有限结构化目标。不得用完整报告代替。

| 最小字段             | 含义                                 |
| -------------------- | ------------------------------------ |
| `practice_focus_id`  | 目标标识                             |
| `scope_type`         | `PLAN` 或 `ROLE`                     |
| `practice_plan_id`   | 所属计划                             |
| `role_definition_id` | 角色级目标时必填                     |
| `focus_text`         | 简短、可执行的训练目标               |
| `source_session_id`  | 来源 Session                         |
| `status`             | `active`、`dismissed` 或 `completed` |
| `updated_at`         | 更新时间                             |

类型别名：

```text
scope_type = PLAN -> PlanPracticeFocus
scope_type = ROLE -> RolePracticeFocus
```

## 8. 跨模块传递清单

| 方向       | 传递对象                                                        | 用途                   | 接收方限制                  |
| ---------- | --------------------------------------------------------------- | ---------------------- | --------------------------- |
| A → B      | `ScenarioDefinition`、`ScenarioConfig`                          | 创建计划和确定场景     | B 不修改定义内容            |
| A → B      | `PreparationSnapshot`                                           | 冻结本场背景           | B 只纳入 Session 快照       |
| A → B      | `RoleDefinition[]`                                              | 展示和选择角色         | B 只保存引用与快照          |
| A → B      | `PracticeOptionDefinition[]`                                    | 展示和选择练习类型     | B 只保存选择结果与快照      |
| B → C      | `PracticeSessionSnapshot`                                       | 启动或恢复对话         | C 不读取可变计划内容        |
| B → C      | `NextAction`                                                    | 决定追问、换目标或结束 | C 不自行改变 Session 终态   |
| C → B      | `TurnOutcome`                                                   | 推进 Session 策略      | B 按 `turn_id` 幂等处理     |
| C → D      | `Turn`、`AudioAsset`                                            | 生成分析和反馈         | D 不修改原回答              |
| B → D      | Session 结束通知                                                | 触发阶段或完整报告     | 报告失败不回滚 Session 终态 |
| D → B      | `NextPracticeFocus[]`                                           | 下一场训练目标         | B 每类最多选 1–3 个写入快照 |
| D → 产品层 | `TurnAnalysis`、`FeedbackItem`、`RetryAttempt`、`SessionReport` | 历史、反馈和重答       | B 不复制完整反馈逻辑        |

## 9. 跨模块命令、查询与事件

### 9.1 命令命名

命令使用“动词 + 完整对象名”：

```text
CreatePracticePlan
UpdatePracticePlan
ArchivePracticePlan
RestorePracticePlan
CreatePracticeSession
PausePracticeSession
ResumePracticeSession
EndPracticeSessionEarly
SubmitTurn
RequestTurnAnalysis
CreateRetryAttempt
RequestSessionReport
```

### 9.2 查询命名

```text
GetScenarioDefinition
GetPreparationSnapshot
ListRoleDefinitions
GetPracticePlan
ListPracticePlans
GetActivePracticeSession
GetPracticeSessionBootstrap
GetTurnAnalysis
ListSessionReports
```

### 9.3 领域事件命名

事件使用“完整对象名 + 已发生动作”，表达已经发生的事实：

```text
PracticePlanCreated
PracticePlanUpdated
PracticePlanArchived
PracticeSessionStarted
PracticeSessionPaused
PracticeSessionResumed
PracticeSessionCompleted
PracticeSessionEndedEarly
TurnSubmitted
TurnAnalysisCompleted
TurnAnalysisFailed
SessionReportCompleted
NextPracticeFocusUpdated
```

本文不要求 MS1 必须采用消息队列；直接调用、进程内事件或消息传递由架构设计决定，但语义名称保持一致。

## 10. 主链路信息流

```text
A 创建/更新场景、背景和角色
  -> B 创建 PracticePlan
  -> 用户完成准备和设备检查
  -> B 创建 PracticeSession + PracticeSessionSnapshot
  -> C 根据快照生成 Question
  -> C 保存有效 Turn
  -> C 向 B 提交 TurnOutcome
  -> B 返回 NextAction
  -> 循环直到 B 完成或用户提前结束 Session
  -> B 通知 D 生成 TurnAnalysis 与 SessionReport
  -> D 更新 NextPracticeFocus
  -> B 创建下一场时把有限目标写入新快照
```

## 11. MS1 必须实现与扩展预留

### 11.1 MS1 必须实现

- `scenario_type` 固定支持 `INTERVIEW`。
- A 提供四位面试官角色。
- 每个 `PracticeSession` 只有一个 `PracticeParticipant`。
- 单角色完整模拟为 4–6 个有效 Turn，第 4 个后按覆盖情况决定结束或继续。
- 单角色专项练习为 2–3 个有效 Turn，达到专项最低轮次且目标已覆盖时可以结束。
- 主问题和追问统一计入有效 Turn 上限；无效输入不消耗轮次。
- 至少一次问题明确引用上一轮回答。
- 每个有效 Turn 至少产生一条 Mock 分析或反馈。
- 支持反馈后同题重答且不覆盖历史。
- ASR、TTS、LLM 和对象存储允许使用确定性 Mock，并明确标注。

### 11.2 只预留、不实现

- 多个 `PracticeParticipant` 同场参与。
- 多角色轮流提问、抢话或动态加入退出。
- `SALES_ROLEPLAY`、`PRESENTATION`、`ONE_ON_ONE` 和 `CUSTOM` 的业务逻辑。
- 完整历史报告直接参与下一场推理。
- 消息队列、生产 Provider 和生产密钥。

## 12. 禁止混用与废弃名称

| 不再作为公共核心名使用             | 统一名称                                          | 原因                              |
| ---------------------------------- | ------------------------------------------------- | --------------------------------- |
| `InterviewPlan`                    | `PracticePlan`                                    | 核心计划需要支持非面试场景        |
| `InterviewSession`                 | `PracticeSession`                                 | 核心 Session 需要跨场景复用       |
| `SessionParticipant`               | `PracticeParticipant`                             | 避免与登录 Session 等概念冲突     |
| `SessionSnapshot`                  | `PracticeSessionSnapshot`                         | 明确所属领域                      |
| `SessionPolicy`                    | `PracticeSessionPolicy`                           | 明确所属领域                      |
| `Interviewer` 作为所有场景通用角色 | `RoleDefinition`                                  | `InterviewerRole` 只属于面试场景  |
| `Answer` 和 `Turn` 混用            | `Turn`                                            | 公共记录统一表示一次有效问答      |
| `Feedback` 泛指所有分析结果        | `TurnAnalysis` / `FeedbackItem` / `SessionReport` | 区分分析、单条反馈与整场报告      |
| `RetryTurn`                        | `RetryAttempt`                                    | 重答是附属尝试，不是新主链路 Turn |
| `History` 作为实体名               | 具体对象或查询                                    | 历史是读取视图，不是单一领域实体  |

## 13. 契约治理

### 13.1 可以由模块内部自行修改

- 私有类、私有函数和内部 DTO 名称。
- 不暴露给其他模块的状态和缓存结构。
- 数据库索引、Provider 实现和页面组件名称。

### 13.2 必须共同评审

- 公共对象改名或所有权变化。
- 跨模块字段新增为必填、字段删除或语义变化。
- 状态枚举和终态规则变化。
- 命令、查询、事件名称或幂等语义变化。
- 快照内容和历史不可变规则变化。

### 13.3 推荐协作方式

1. Issue 和设计稿优先引用本文名称。
2. PR 涉及跨模块契约时，在描述中列出“新增、修改、废弃”的公共名称。
3. 兼容期内旧名称只能作为适配层别名，不能继续扩散。
4. 团队确认后先更新本文，再同步代码、数据库设计和各模块详细设计。

## 14. 团队确认清单

- [ ] A 确认场景、准备资料和角色对象的名称及所有权。
- [ ] B 确认计划、Session、快照、参与者和策略名称。
- [ ] C 确认 Question、Turn、音频和轮次结果名称。
- [ ] D 确认分析、反馈、重答、报告和训练目标名称。
- [ ] 四方确认跨模块传递清单和状态枚举。
- [ ] 架构与数据库文档逐步迁移废弃名称，不新增旧名称。
