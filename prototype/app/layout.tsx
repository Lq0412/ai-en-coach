import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpeakUp · AI 职业英文沟通 Agent",
  description: "为下一场重要的英文沟通做准备、排练与复盘。从 AI 英文模拟面试开始。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
