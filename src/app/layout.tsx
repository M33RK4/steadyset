import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Barlow, Barlow_Condensed, Figtree, Fraunces, Geist } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });
const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-barlow", display: "swap" });
const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-barlow-condensed", display: "swap" });
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Steadyset — workout planner", template: "%s · Steadyset" },
  description: "Follow your workout plan, log every set, rest with a reliable timer and keep your training in sync across devices.",
  applicationName: "Steadyset",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf2f3" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
};

// Applies the saved theme before first paint so there's no flash of the wrong theme.
const themeScript = `(function(){try{var t=JSON.parse(localStorage.getItem('steadyset:theme')||'null');if(t&&t.theme){document.documentElement.dataset.theme=t.theme;document.documentElement.dataset.motion=t.motion||'system';}}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="blush"
      data-motion="system"
      suppressHydrationWarning
      className={`${fraunces.variable} ${figtree.variable} ${barlow.variable} ${barlowCondensed.variable} ${geist.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
