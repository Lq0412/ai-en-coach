import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spreak 产品原型",
  description: "Spreak AI 英语表达教练可交互产品原型",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
