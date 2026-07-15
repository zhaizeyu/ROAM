import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ROAM · AI 旅行规划",
  description: "输入地点、时间与偏好，生成可执行的逐日路线、Google Maps 导航与购票入口。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
