# 前端技术选型调研 — 主流产品架构参照

> **关联文档**：[技术预研分工方案](./tech-presearch-plan.md) · [市场调研分工文档](./market-research-tasks.md) · [Product Killshot Report](./product-killshot-2026-07-07.md)  
> **调研性质**：桌面调研（公开资料 + 竞品参照）· 不含代码实测  
> **日期**：2026-07-08  

---

## 一、为什么先看主流产品怎么做

在决定自己的技术方案之前，先回答一个关键问题：**做口语陪练的成熟产品，前端用什么？**

如果所有成功产品都选了同一种架构，那这个选择大概率有它的道理。如果它们选了不同的路线，那说明我们要做的取舍不是「对错」，而是「适合」。

---

## 二、主流产品技术栈全景

| 产品 | 成立 | 前端框架 | 音频层 | 后端语言 | ASR 方案 | 是否支持打断 | 商业状态 |
|:-----|:----|:---------|:-------|:---------|:---------|:-----------:|:---------|
| **Speak** | 2016 | React Native | 原生 AudioRecord / AVAudioEngine | Python + Go | 自研 Conformer-CTC（NVIDIA Riva） | ✅ | 独角兽，10M+ 下载 |
| **Duolingo Max** | 2012 | **原生** Swift / Kotlin + KMP | 原生音频 API | Python + Java | 第三方 + 自研 | ✅ | 上市公司，500M+ 下载 |
| **ELSA Speak** | 2015 | 未公开（推断原生 / RN） | 原生（发音级分析） | Python | 自研发音评测引擎 | ✅ | 92M+ 下载 |
| **流利说** | 2012 | **原生**（自有 SDK） | 自有语音引擎 SDK | Python | 自研语音评测 | ✅ | 纽交所上市 |
| **扇贝口语** | 2011 | **原生**（独立 iOS / Android） | 原生音频采集 | Python / Go | 第三方 + 自研 | — | 成熟产品 |

### 核心发现

> **没有一个大厂口语产品用小程序、纯 Web H5 或 PWA 作主力架构。**

所有产品的音频层都是**原生实现**（AudioRecord / AVAudioEngine），没有用 JS 层管理音频流的。前端框架的选择只影响 UI 层，不影响音频处理层。

---

## 三、Speak 架构深度分析（最值得参照）

Speak 是跟你们最像的产品——专注口语陪练、AI 对话为主轴、5 年内从不知名做到独角兽。2024 年 6 月他们公开了架构升级全过程。

### 3.1 架构演进

| 阶段 | 前端 | 音频管道 | ASR 方案 | 问题 |
|:-----|:-----|:---------|:---------|:-----|
| **V1（初期）** | React Native | iOS: Apple Speech / Android: 自研小模型 + 第三方 API | 前端双线 | 口音识别差，双线维护成本高 |
| **V2（现在）** | React Native | iOS + Android **统一**：原生采集 → WebSocket 流式传输 → 服务端推理 | 自研 Conformer-CTC（NVIDIA Riva / Triton） | WER 降 60%，延迟 ≈1.6s |

### 3.2 音频数据流

```
[用户说话]
    ↓
原生 AudioRecord (Android) / AVAudioEngine (iOS)
    ↓  PCM 16bit (不是文件！)
WebSocket 流式传输
    ↓
服务端 VAD（语音活动检测）
    ↓  detected
Conformer-CTC ASR
    ↓  文本
LLM（GPT / Claude）
    ↓  回复文本 + 流式 Token
TTS 合成
    ↓  PCM 音频块
WebSocket 流式返回
    ↓
原生 AudioTrack (Android) / AVAudioEngine (iOS)
    ↓
[用户听到 AI 回复]

← 用户随时可以打断 →
打破 TTS 播放 → 清空缓冲区 → 取消传输 → 切换回录音状态
```

**关键设计原则**：
1. **音频是流（stream）不是文件（file）**——始终在内存管道中，不落盘
2. **播放速率受限**——以实时速度播放（1秒音频用1秒播完），不提前缓冲太多，这样打断时不需要清大量缓冲
3. **所有 AI 逻辑在服务端**——前端只做采集和播放，模型升级不影响客户端

### 3.3 React Native 在前端扮演的角色

Speak 用 React Native 但**不是 JS 处理音频**：

| 层 | 技术 | 说明 |
|:---|:-----|:------|
| **UI 渲染** | React Native | 跨平台 UI，场景选择/对话界面/总结页 |
| **音频采集** | 原生 Module | Swift / Kotlin 写的 Native Module |
| **音频播放** | 原生 Module | 同理，原生控制音频焦点 |
| **网络传输** | WebSocket + gRPC | RN 的 WebSocket 层足够 |

这意味着即使选择了跨平台框架，**音频相关的核心路径必须在原生层**，不能依赖框架的 JS 音频 API。

---

## 四、Duolingo 架构参照

### 4.1 技术策略

Duolingo 2024-2025 年公开的技术路线：

| 平台 | 技术 | 说明 |
|:-----|:-----|:------|
| iOS | **Swift**（原生） | SwiftUI + UIKit |
| Android | **Kotlin**（原生） | Jetpack Compose（已从 Java 100% 迁移） |
| 共享逻辑 | **Kotlin Multiplatform** | 业务逻辑共享，UI 不共享 |
| Web | Backbone.js + jQuery（旧）→ 逐步 KMP | — |

### 4.2 KMP 的生产力数据

| 项目 | 纯原生时间 | KMP 后时间 | 加速倍率 |
|:-----|:----------|:-----------|:--------|
| Adventures 功能 | 9 月（仅 Android） | 5 月（KMP）+ 1.5 月（Web） | ~3x |
| Video Call 库（WebSocket） | 9 月（仅 iOS） | 1 月（KMP）+ 6 月（Android） | ~5x |
| Math 评分库 | 1.5 月 | 1 周/平台 | ~6x |

### 4.3 对你们的参考意义

Duolingo 的策略是：**原生 + KMP 共享逻辑**。

但你们的团队只有 5 人、2 个月，原生双线（Swift + Kotlin）的开发和维护成本扛不住。Duolingo 的选择适合大厂（几百人工程团队），不适合创业团队。

---

## 五、ELSA Speak / 流利说 / 扇贝

| 产品 | 前端策略 | 可参考之处 |
|:-----|:---------|:-----------|
| **ELSA Speak** | 推断原生或 RN，发音级分析需要底层音频访问 | 显示「发音诊断」作为独立模块是可行的 |
| **流利说** | 自研语音 SDK，前端原生 | 自研引擎成本高，不推荐 5 人团队仿效 |
| **扇贝口语** | 原生，功能聚焦「跟读 + 打分」 | 功能克制，不追求实时对话，模式简单 |

这三家都**没有用小程序**。流利说虽然有微信生态产品，但主力 App 是原生。

---

## 六、小程序 vs 原生 vs 跨平台 — 音频能力对比

### 6.1 核心指标对比

| 能力 | 小程序 | Web H5 | React Native | Flutter | 原生 Swift/Kotlin |
|:-----|:------:|:------:|:------------:|:-------:|:-----------------:|
| **录音+播放同时**（全双工） | ❌ 互斥 | ❌ 大部分浏览器不支持 | ✅ 原生 Module 实现 | ⚠️ engine 层限制 | ✅ 原生支持 |
| **音频焦点抢占**（打断） | ❌ 依赖微信 | ❌ 浏览器限制 | ✅ 原生 Module | ⚠️ 间接 | ✅ 原生 API |
| **流式 PCM 采集** | ❌ RecorderManager 输出文件 | ⚠️ MediaRecorder 限制 | ✅ 原生 Module | ⚠️ 可做但复杂 | ✅ AudioRecord |
| **硬件 AEC（回声消除）** | ❌ 不可控 | ❌ 不可控 | ✅ 原生接入 | ⚠️ 可做 | ✅ AudioSource.VOICE_COMMUNICATION |
| **后台运行** | ❌ 切后台断 | ❌ 页面不可见暂停 | ✅ 需配置 | ✅ 需配置 | ✅ 原生 |
| **音频格式控制** | ❌ 微信封装 | ❌ 有限 | ✅ 原生控制 | ⚠️ 有限 | ✅ PCM/Opus 自由选 |
| **包大小** | 2MB→20MB 分包 | 无限制 | 无限制 | 无限制 | 无限制 |
| **开发成本** | 低 | 低 | 中 | 中 | 高（双线） |
| **发布审核** | ⚠️ 语音类高风险 | 无 | App Store + 安卓市场 | App Store + 安卓市场 | App Store + 安卓市场 |

### 6.2 为什么小程序不能同时录音和播放

小程序的 **RecorderManager** 和 **InnerAudioContext / AudioContext** 共享同一个音频焦点：

```
场景：用户想打断 AI 说话
    
小程序音频状态：
┌─────────────────────────────────────┐
│ InnerAudioContext 正在播放 AI 回复    │
│ (占据音频焦点)                       │
├─────────────────────────────────────┤
│ ↓ 用户触发录音                       │
│ ↓ 微信提示「录音将中断当前播放」       │
│ ↓ 必须停止 InnerAudioContext         │
│ ↓ 释放音频焦点                       │
│ ↓ 启动 RecorderManager               │
│ (500-1000ms 状态切换)                │
├─────────────────────────────────────┤
│ RecorderManager 开始录音             │
│ (占据音频焦点)                       │
└─────────────────────────────────────┘
```

在原生 Android/iOS 上则不同：

```
原生音频状态：
┌─────────────────────────────────────┐
│ AudioTrack 正在播放 AI 回复          │
│ AudioRecord 处于待命状态（低功耗）    │
├─────────────────────────────────────┤
│ ↓ 用户开口说话                       │
│ ↓ VAD 检测到语音                     │
│ ↓ AudioTrack.stop()（立即）          │
│ ↓ AudioRecord.start()（同时，毫秒级）│
│ (切换时间 50-200ms)                  │
├─────────────────────────────────────┤
│ AudioRecord 开始录音                 │
│ AudioTrack 已释放                   │
└─────────────────────────────────────┘
```

这个 **50ms vs 500-1000ms 的切换差距**，就是「自然对话」和「对讲机模式」的区别。

---

## 七、结论与建议

### 7.1 选型推荐

| 方案 | 对打断体验的影响 | 开发成本 | 推荐度 |
|:-----|:---------------:|:--------:|:------:|
| **React Native + 原生音频 Module** | ✅ 接近原生 | 中 | ⭐⭐⭐⭐⭐ |
| **原生（Swift + Kotlin）** | ✅ 最佳 | 高 | ⭐⭐⭐（人力不够） |
| **Flutter + 原生音频插件** | ⚠️ 80% 原生水平 | 中 | ⭐⭐⭐ |
| **小程序 MVP → 后续迁移** | ❌ 体验打折 | 低 | ⭐⭐ |
| **纯 Web H5** | ❌ 浏览器限制多 | 低 | ⭐ |

### 7.2 推荐方案：React Native + 原生音频 Module

```
┌────────────────────────────────┐
│         React Native UI         │
│  场景选择 · 对话界面 · 总结页   │
├────────────────────────────────┤
│     Native Bridge (音频层)      │
│  ┌──────────┐ ┌──────────────┐ │
│  │ Audio    │ │ Audio        │ │
│  │ Capture  │ │ Playback     │ │
│  │ (原生)   │ │ (原生)        │ │
│  └────┬─────┘ └──────┬───────┘ │
│       │ PCM 16kHz     │ PCM     │
│       ▼               ▲        │
│   ┌──────────────────────┐     │
│   │   WebSocket Client   │     │
│   │   (react-native      │     │
│   │    + 重连/中断逻辑)  │     │
│   └──────────┬───────────┘     │
└──────────────┼─────────────────┘
               │ WebSocket
               ▼
        后端服务集群
```

| 层 | 推荐技术 | 说明 |
|:---|:---------|:-----|
| **UI 框架** | React Native | 跨平台，一套代码覆盖 iOS + Android，社区成熟 |
| **音频采集** | 原生 Module（Swift AudioKit / Kotlin AudioRecord） | 不依赖 RN JS 层音频 API |
| **音频播放** | 原生 Module（AVAudioEngine / AudioTrack） | 原生控制焦点和打断 |
| **音频传输** | WebSocket（流式 PCM 16bit 16kHz） | 通用协议，兼容性好 |
| **VAD / 端点检测** | 服务端（Silero VAD 或云服务内置） | 前端不需要自建 VAD |

### 7.3 如果仍然想用小程序快速验证

如果团队坚持用小程序先跑 MVP，建议做以下**体验降级预期管理**：

| 功能 | 小程序表现 | 预期差距 |
|:-----|:----------|:---------|
| 对话方式 | **回合制**（你说完→AI 说→你说完） | 不是实时对话，更像对讲机 |
| 打断 | 不支持或体验差 | 需要用户等 AI 说完再说 |
| 对话延迟 | 每轮多 300-800ms | 相比原生慢 50-100% |
| 后台 | 切后台断连 | 不能边练边切微信 |

> **一句话判断**：如果你的 MVP 需要验证的是「用户有没有这个需求」，小程序够用；如果你要验证的是「用户愿不愿意为这个体验付费」，用 RN + 原生音频。

---

## 八、参考来源

| 来源 | 链接 |
|:-----|:-----|
| Speak 工程博客 — ASR 升级 | [speak.com/blog/asr-levelup](https://www.speak.com/blog/asr-levelup) |
| Duolingo KMP 案例研究 | [mobile-vitals.com](https://mobile-vitals.com/article/1502-duolingo-duolingo-kmp-a-case-study-in-developer-productivity) |
| Duolingo KotlinConf 2025 | [blog.jetbrains.com/kotlin/2025/12/industry-leaders-on-the-kotlinconf25-stage/](https://blog.jetbrains.com/kotlin/2025/12/industry-leaders-on-the-kotlinconf25-stage/) |
| Duolingo 面试工程信息 | [blog.duolingo.com/interviewing-with-duolingos-engineering-team/](https://blog.duolingo.com/interviewing-with-duolingos-engineering-team/) |
| React Native 语音 AI 架构 | [casainnov.com/blog/voice-ai-react-native-whisper-realtime](https://casainnov.com/blog/voice-ai-react-native-whisper-realtime) |
| 语音 AI 低延迟架构 | [dev.to](https://dev.to/lifeisverygood/architecting-low-latency-real-time-ai-voice-agents-challenges-solutions-hdn) |
| Android 语音 AI 原生音频 | [agora.io/kr/blog/voice-ai-on-android-beyond-speech-to-text/](https://www.agora.io/kr/blog/voice-ai-on-android-beyond-speech-to-text/) |

---

## 附录：Speak 工程博客原文摘要

> *"We transitioned from fragmented, on-device speech recognition — where iOS used Apple Speech and Android used a combination of small custom models and third-party services — to a unified, server-side ASR system. This was a massive effort: we fine-tuned a Conformer-CTC model using NVIDIA NeMo, deployed it with NVIDIA Riva and Triton Inference Server on Kubernetes, and built a new gRPC-based streaming pipeline.*
>
> *The results: >60% Word Error Rate reduction, ~1.6s average feedback latency (20% faster than before), and a single code path for all business logic regardless of platform."*
>
> — Speak Engineering Blog, June 2024
