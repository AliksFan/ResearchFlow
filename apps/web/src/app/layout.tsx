import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ServerActionRedirectNavigation } from "@/components/server-action-redirect-navigation";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ResearchFlow 项目管理系统",
    template: "%s | ResearchFlow 项目管理系统",
  },
  description: "ResearchFlow 虚拟项目展示工程。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full bg-slate-50 antialiased">
      <body className="min-h-full bg-slate-50 text-slate-950">
        <ServerActionRedirectNavigation />
        {children}
      </body>
    </html>
  );
}
