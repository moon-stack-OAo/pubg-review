import type {Metadata} from "next";
import {IBM_Plex_Mono, IBM_Plex_Sans, Noto_Sans_SC} from "next/font/google";
import {AppShell} from "@/components/app-shell";
import "./globals.css";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const notoSansSc = Noto_Sans_SC({
  variable: "--font-noto-sans-sc",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PUBG Review",
  description: "PUBG 对局复盘与个人战绩分析台",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} ${notoSansSc.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-bg font-sans text-fg">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
