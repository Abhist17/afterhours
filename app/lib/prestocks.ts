/**
 * PreStocks: tokenized pre-IPO equity on Solana, backed 1:1 by SPV exposure
 * to the private company (https://prestocks.com). Deliberately kept out of
 * the main asset universe and its risk model: a private company has no
 * public listing, no thirty days of hourly prints anywhere, and no session
 * to be "after" — the desk's VaR, beta and correlation machinery assumes a
 * market that opens and closes, and a private company simply never opens
 * one. Held for real, priced live, honestly outside the score.
 *
 * Prices come from PreStocks' own API (https://prestocks.com/api/prestocks),
 * which has no CORS header for a browser on another origin to read, so a
 * page here cannot fetch it live; PRICES below is a snapshot taken at build
 * time, refreshed the same way the xStock history is. The mint list and
 * decimals were each checked on mainnet: every one is a Token-2022 mint
 * with 9 decimals.
 */

export interface PreStock {
  symbol: string;
  name: string;
  mint: string;
  industry: string;
  description: string;
  externalUrl: string;
}

export const PRESTOCKS: readonly PreStock[] = [
  { symbol: "OPENAI", name: "OpenAI", mint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF", industry: "AI", description: "Pioneers large-language models like GPT and DALL·E.", externalUrl: "https://www.prestocks.com/openai" },
  { symbol: "SPACEX", name: "SpaceX", mint: "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh", industry: "Aerospace", description: "Reusable launch vehicles and the Starlink satellite constellation.", externalUrl: "https://www.prestocks.com/spacex" },
  { symbol: "ANTHROPIC", name: "Anthropic", mint: "Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw", industry: "AI", description: "Builds Claude, a language model with a focus on safety and interpretability.", externalUrl: "https://www.prestocks.com/anthropic" },
  { symbol: "ANDURIL", name: "Anduril", mint: "PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB", industry: "Defense", description: "AI-driven defense systems: autonomous drones and perimeter sensors.", externalUrl: "https://www.prestocks.com/anduril" },
  { symbol: "NEURALINK", name: "Neuralink", mint: "PrekqLJvJ3qVdXmBGDiexvwUTF4rLFDa6HWS4HJbw9S", industry: "Biotech", description: "Implantable brain-computer interfaces.", externalUrl: "https://www.prestocks.com/neuralink" },
  { symbol: "FIGUREAI", name: "Figure AI", mint: "PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd", industry: "Robotics", description: "General-purpose humanoid robots for homes and industrial work.", externalUrl: "https://www.prestocks.com/figureai" },
  { symbol: "KALSHI", name: "Kalshi", mint: "PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua", industry: "Fintech", description: "A CFTC-regulated prediction market on real-world events.", externalUrl: "https://www.prestocks.com/kalshi" },
  { symbol: "POLYMARKET", name: "Polymarket", mint: "Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP", industry: "Fintech", description: "A decentralized prediction market for real-world events.", externalUrl: "https://www.prestocks.com/polymarket" },
] as const;

export const PRESTOCKS_DECIMALS = 9;

export const PRESTOCKS_BY_MINT: Record<string, PreStock> = Object.fromEntries(PRESTOCKS.map((p) => [p.mint, p]));
export const PRESTOCKS_BY_SYMBOL: Record<string, PreStock> = Object.fromEntries(PRESTOCKS.map((p) => [p.symbol, p]));

/** A snapshot of tokenPrice from the PreStocks API, taken 17 Sep 2026. */
export const PRESTOCKS_SNAPSHOT_AT = "2026-09-17T18:34:00Z";
export const PRESTOCKS_PRICES: Record<string, number> = {
  OPENAI: 1051.6542392847055,
  SPACEX: 123.7843023639554,
  ANTHROPIC: 1007.7537839521933,
  ANDURIL: 153.8350601072656,
  NEURALINK: 355.424229394178,
  FIGUREAI: 177.0252952000315,
  KALSHI: 860.609455653069,
  POLYMARKET: 144.81995664949753,
};
