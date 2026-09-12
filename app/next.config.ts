import path from "path";
import type { NextConfig } from "next";

// GitHub Pages serves the site from /<repo>; set by the deploy workflow.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Everything runs in the browser: balances from Solana, prices from the
  // feed, history from a JSON a workflow refreshes, quant in the tab, and
  // on-chain writes signed by the viewer's own wallet. So the app is a
  // static export that any host can serve and nothing ever sleeps.
  output: "export",
  basePath: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  agentRules: false,
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
