import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Bricolage_Grotesque, Instrument_Serif, Manrope } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Steadyset — workout planner", template: "%s · Steadyset" },
  description: "Follow your workout plan, log every set, rest with a reliable timer, train alongside a buddy and keep everything in sync across devices.",
  applicationName: "Steadyset",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e9f3fc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1524" },
  ],
};

// Applies the saved theme and light/dark mode before first paint so there's no flash of the
// wrong theme. Old theme ids from earlier versions are mapped to the new ones.
const themeScript = `(function(){try{var d=document.documentElement,t=JSON.parse(localStorage.getItem('steadyset:theme')||'null')||{},o={blush:['lily','light'],paper:['lily','light'],ember:['summit','dark'],graphite:['summit','dark']}[t.theme],th=o?o[0]:(t.theme==='summit'?'summit':'lily'),m=t.colorMode||(o?o[1]:'system');if(m==='system')m=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';d.dataset.theme=th;d.dataset.mode=m;d.dataset.motion=t.motion||'system';}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="lily" data-mode="light" data-motion="system" suppressHydrationWarning className={`${instrument.variable} ${bricolage.variable} ${manrope.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
