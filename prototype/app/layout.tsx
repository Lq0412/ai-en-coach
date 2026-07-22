import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpeakUp · 面向真实任务的英语沟通 Agent",
  description: "为雅思口语、英文面试、海外生活与工作沟通做准备、排练与复盘。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
