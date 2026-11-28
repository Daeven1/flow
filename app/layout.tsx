import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { GroveWorkspace } from "@/components/focus/FocusSessionProvider";
import { Analytics } from "@vercel/analytics/next";

const groveSans = localFont({ src: "./fonts/GeistVF.woff", weight: "100 900", display: "swap" });

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#E0EFFE" },
    { media: "(prefers-color-scheme: dark)", color: "#0D1B2E" },
  ],
};

export const metadata: Metadata = {
  title: "Grove — MYP Design Teacher Productivity",
  description: "ADHD-friendly productivity app for MYP Design teachers",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Grove",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icon-180.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevents flash of wrong theme on load */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('grove-theme');if(m==='dark'||(!m&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
        {/* Prevents flash of wrong mode on load */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var today=new Date().toISOString().slice(0,10);var d=localStorage.getItem('grove-mode-date');var m=d===today?localStorage.getItem('grove-mode'):null;if(m==='PERSONAL'||(m===null&&(new Date().getDay()===0||new Date().getDay()===6))){document.documentElement.classList.add('personal-mode')}}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className={`${groveSans.className} bg-[#E0EFFE] dark:bg-[#0D1B2E] text-slate-900 dark:text-zinc-100 min-h-screen`}
      >
        <GroveWorkspace>{children}</GroveWorkspace>
        <Analytics />
      </body>
    </html>
  );
}
