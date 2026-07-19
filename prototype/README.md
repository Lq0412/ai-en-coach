# SpeakUp 产品原型

本目录是当前产品原型的唯一开发版本。`speakup-premium/` 保存可直接打开的静态原型，根目录的应用与 Worker 文件负责本地预览、自动检查和 Sites 托管。

线上站点：[SpeakUp Preview](https://speakup-preview.oopwqsnyzxm.chatgpt.site/)

## 使用

```bash
npm install
npm run dev
```

也可以直接打开 `speakup-premium/pages/prototype.html`。

## 验证

```bash
npm test
```

统一检查会完成构建，并验证 Agent 创建、面试计划、四问练习、报告、复练、错题、场景练习和导航等核心流程。

## 版本归档

本目录不保存历史副本。每个 Milestone 结束后，通过 Git Tag 和 GitHub Release 保存对应版本，并将静态原型 ZIP 作为 Release 附件。
