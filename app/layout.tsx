import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FLOW — MYP Design Teacher Productivity",
  description: "ADHD-friendly productivity app for MYP Design teachers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevents flash of wrong theme on load */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('flow-theme');if(m==='dark'||(!m&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className={`${inter.className} bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 min-h-screen`}
      >
        <Nav />
        <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
        <Analytics />
      </body>
    </html>
  );
}
