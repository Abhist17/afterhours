/**
 * What Afterhours can price, and therefore what it can score.
 *
 * The table lives in data/universe.json so the hourly history refresh (a
 * plain Node script) and the app read the same rows. Every xStock in it was
 * checked two ways before it went in: the mint from CoinGecko's Solana
 * platform entry, then the account itself on mainnet — owner program and
 * decimals. That caught CoinGecko listing AMDx with 18 decimals; the chain
 * says 8, like every other xStock. All xStocks are Token-2022 mints, which a
 * Token-program-only scan would never see.
 *
 * Sectors are coarse on purpose. The one that matters for this product is
 * "crypto-linked equity": COIN, MSTR, HOOD and CRCL are stocks on paper and
 * crypto beta in practice — and STRC, BMNR and DFDV are treasury companies
 * whose share price is a leveraged claim on the coin they hold. A book of
 * SOL plus those is one bet wearing several tickers.
 *
 * Backed lists several hundred xStocks; this table carries the ones with
 * real float and turnover on Solana, so every series has thirty days of
 * hourly prices behind it. Adding one is one verified row.
 */

import rows from "../data/universe.json";

export type AssetClass = "equity" | "crypto" | "cash";

export type Sector =
  | "index"
  | "mega-cap tech"
  | "software"
  | "semis"
  | "ev & auto"
  | "aerospace"
  | "crypto-linked equity"
  | "consumer"
  | "healthcare"
  | "financials"
  | "energy"
  | "commodity"
  | "crypto"
  | "cash";

export interface Asset {
  symbol: string;
  name: string;
  /** Underlying ticker for equities, e.g. TSLA for TSLAx. */
  underlying: string | null;
  coingeckoId: string;
  /** Mainnet mint; null for native SOL. */
  mint: string | null;
  /** Which token program owns the mint. */
  program: "native" | "token" | "token-2022";
  decimals: number;
  class: AssetClass;
  sector: Sector;
}

export const ASSETS: readonly Asset[] = rows as Asset[];

/** The index every beta is measured against. */
export const MARKET_SYMBOL = "SPYx";

export const BY_SYMBOL: Record<string, Asset> = Object.fromEntries(ASSETS.map((a) => [a.symbol, a]));
export const BY_MINT: Record<string, Asset> = Object.fromEntries(
  ASSETS.filter((a) => a.mint).map((a) => [a.mint as string, a])
);

export function assetOf(symbol: string): Asset | undefined {
  return BY_SYMBOL[symbol];
}

export function isEquity(symbol: string): boolean {
  return BY_SYMBOL[symbol]?.class === "equity";
}

export function isCash(symbol: string): boolean {
  return BY_SYMBOL[symbol]?.class === "cash";
}

/** Jupiter's swap page, addressed by mint so a symbol collision cannot misroute. */
export function jupiterSwapUrl(from: string, to: string): string {
  const id = (symbol: string) => {
    const a = BY_SYMBOL[symbol];
    return a ? a.mint ?? "SOL" : "";
  };
  return `https://jup.ag/swap/${id(from)}-${id(to)}`;
}
