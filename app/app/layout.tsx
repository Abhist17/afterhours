import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Pixelify_Sans } from "next/font/google";
import { THEME_BOOTSTRAP } from "@/lib/theme";
import "./globals.css";

// Self-hosted at build time, so the page never waits on a font CDN and
// the figures — which are all monospace — never reflow after first paint.
const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
// One display face, spent on the wordmark, the headline and the headline
// figures: a pixel face, because the desk is a terminal that stays lit
// after the bell. Body copy and every column of figures stay in Geist.
const pixel = Pixelify_Sans({ subsets: ["latin"], variable: "--font-pixel", display: "swap" });

const DESCRIPTION =
  "The risk desk for tokenized stocks on Solana. Value at Risk, beta, overnight exposure and " +
  "rebalance orders for a book of xStocks — read straight from your wallet, scored in your " +
  "browser, recorded on-chain by you.";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://abhist17.github.io/afterhours";
const ORIGIN = new URL(SITE_URL).origin;
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  metadataBase: new URL(ORIGIN),
  title: { default: "Afterhours — risk desk for tokenized stocks on Solana", template: "%s · Afterhours" },
  description: DESCRIPTION,
  applicationName: "Afterhours",
  keywords: ["Solana", "xStocks", "tokenized stocks", "Value at Risk", "portfolio risk", "beta", "rebalance", "SPCXx", "SPYx"],
  icons: { icon: `${BASE}/icon.svg`, apple: `${BASE}/icon-192.png` },
  manifest: `${BASE}/manifest.webmanifest`,
  openGraph: {
    type: "website",
    siteName: "Afterhours",
    title: "Afterhours — risk desk for tokenized stocks on Solana",
    description: DESCRIPTION,
    url: SITE_URL,
    images: [{ url: `${BASE}/og.png`, width: 1200, height: 630, alt: "The Afterhours desk reading a real xStocks wallet" }],
  },
  twitter: { card: "summary_large_image", title: "Afterhours", description: DESCRIPTION, images: [`${BASE}/og.png`] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0d12" },
    { media: "(prefers-color-scheme: light)", color: "#f7f8fb" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${sans.variable} ${mono.variable} ${pixel.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
