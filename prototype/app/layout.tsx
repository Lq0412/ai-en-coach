import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpeakUp · AI 英文模拟面试",
  description: "根据目标岗位和真实经历，生成角色化英文模拟面试、连续追问与练后反馈。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
