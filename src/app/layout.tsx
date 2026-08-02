import type { Metadata } from "next";
import "@/app/globals.css";
import { buildMetadata } from "@/lib/site";

export const metadata: Metadata = buildMetadata({
  title: "TIANTI",
  description: "面向 cosplay 与国风内容场景的公开达人、活动与档案浏览站。",
  path: "/"
});

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
