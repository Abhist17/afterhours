import { ASSETS } from "./universe";

/**
 * Live quotes straight from the feed, from the browser. One request for the
 * whole universe; on any failure the caller falls back to the last point of
 * the history, and says so.
 */

export interface Quotes {
  prices: Record<string, number>;
  fetchedAt: number;
  /** True when these came from the history file rather than the feed. */
  stale: boolean;
}

const SIMPLE = "https://api.coingecko.com/api/v3/simple/price";

export async function fetchLivePrices(fallback: Record<string, number>): Promise<Quotes> {
  const ids = ASSETS.map((a) => a.coingeckoId).join(",");
  try {
    const res = await fetch(`${SIMPLE}?ids=${encodeURIComponent(ids)}&vs_currencies=usd`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as Record<string, { usd?: number }>;
    const prices: Record<string, number> = {};
    let got = 0;
    for (const asset of ASSETS) {
      const p = body[asset.coingeckoId]?.usd;
      if (Number.isFinite(p) && (p as number) > 0) {
        prices[asset.symbol] = p as number;
        got++;
      } else if (fallback[asset.symbol]) {
        prices[asset.symbol] = fallback[asset.symbol];
      }
    }
    if (got === 0) throw new Error("empty quote");
    return { prices, fetchedAt: Date.now(), stale: false };
  } catch {
    return { prices: { ...fallback }, fetchedAt: 0, stale: true };
  }
}
