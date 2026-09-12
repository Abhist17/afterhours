import type { Metadata, Viewport } from "next";
import { THEME_BOOTSTRAP } from "@/lib/theme";
import "./globals.css";

const DESCRIPTION =
  "The risk desk for tokenized stocks on Solana. Value at Risk, beta, overnight exposure and " +
  "rebalance orders for a book of xStocks — read straight from your wallet, scored in your " +
  "browser, recorded on-chain by you.";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://abhist17.github.io/afterhours";
const ORIGIN = new URL(SITE_URL).origin;

export const metadata: Metadata = {
  metadataBase: new URL(ORIGIN),
  title: { default: "Afterhours — risk desk for tokenized stocks on Solana", template: "%s · Afterhours" },
  description: DESCRIPTION,
  applicationName: "Afterhours",
  keywords: ["Solana", "xStocks", "tokenized stocks", "Value at Risk", "portfolio risk", "beta", "rebalance"],
  openGraph: { type: "website", siteName: "Afterhours", title: "Afterhours — risk desk for tokenized stocks on Solana", description: DESCRIPTION, url: SITE_URL },
  twitter: { card: "summary_large_image", title: "Afterhours", description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
    { media: "(prefers-color-scheme: light)", color: "#fcfcfd" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
