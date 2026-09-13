/**
 * Real prices for the trades the desk proposes. Jupiter's quote endpoint
 * answers browser requests without a key, so a rebalance line can say what
 * it would actually fetch on-chain right now, routed, with price impact,
 * rather than a size at the last feed print. The swap endpoint turns a
 * quote into a transaction for a given wallet; signing and sending are the
 * wallet's, in `trade.ts`.
 */

import { BY_SYMBOL } from "./universe";

export const JUPITER_QUOTE_URL = "https://lite-api.jup.ag/swap/v1/quote";
export const JUPITER_SWAP_URL = "https://lite-api.jup.ag/swap/v1/swap";
/** The most a fill may slip from the quote before the chain rejects it. */
export const SLIPPAGE_BPS = 50;
const WSOL = "So11111111111111111111111111111111111111112";

export interface SwapQuote {
  from: string;
  to: string;
  /** Human units in and out. */
  amountIn: number;
  amountOut: number;
  /** Fractional price impact Jupiter reports, e.g. 0.0031 for 0.31%. */
  priceImpact: number;
  /** Venues along the route, in order, deduplicated. */
  route: string[];
  fetchedAt: number;
  /** Jupiter's own response, handed back to it verbatim to build the swap. */
  raw: unknown;
}

interface QuoteResponse {
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  routePlan?: { swapInfo?: { label?: string } }[];
}

export function mintFor(symbol: string): string | null {
  const a = BY_SYMBOL[symbol];
  if (!a) return null;
  return a.mint ?? WSOL;
}

/** Token amount to the integer the chain counts in, and back. */
export function toRaw(symbol: string, amount: number): bigint {
  const d = BY_SYMBOL[symbol]?.decimals ?? 0;
  return BigInt(Math.round(amount * 10 ** d));
}

export function fromRaw(symbol: string, raw: string | bigint): number {
  const d = BY_SYMBOL[symbol]?.decimals ?? 0;
  return Number(raw) / 10 ** d;
}

export function quoteUrl(from: string, to: string, amountIn: number, slippageBps = SLIPPAGE_BPS): string | null {
  const inMint = mintFor(from);
  const outMint = mintFor(to);
  if (!inMint || !outMint || !(amountIn > 0)) return null;
  const params = new URLSearchParams({
    inputMint: inMint,
    outputMint: outMint,
    amount: toRaw(from, amountIn).toString(),
    slippageBps: String(slippageBps),
  });
  return `${JUPITER_QUOTE_URL}?${params}`;
}

export async function quoteSwap(from: string, to: string, amountIn: number, signal?: AbortSignal): Promise<SwapQuote> {
  const url = quoteUrl(from, to, amountIn);
  if (!url) throw new Error(`No mint for ${from} or ${to}`);
  const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`Jupiter ${res.status}`);
  const body = (await res.json()) as QuoteResponse;
  const route: string[] = [];
  for (const leg of body.routePlan ?? []) {
    const label = leg.swapInfo?.label;
    if (label && !route.includes(label)) route.push(label);
  }
  return {
    from,
    to,
    amountIn: fromRaw(from, body.inAmount),
    amountOut: fromRaw(to, body.outAmount),
    priceImpact: Math.max(0, Number(body.priceImpactPct) || 0),
    route,
    fetchedAt: Date.now(),
    raw: body,
  };
}

/** The body the swap endpoint wants: the quote back, and who is paying. */
export function swapRequest(quote: SwapQuote, userPublicKey: string): Record<string, unknown> {
  return {
    quoteResponse: quote.raw,
    userPublicKey,
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 1_000_000, priorityLevel: "medium" } },
  };
}

/** A quote older than this is re-fetched before it is turned into a swap. */
export const QUOTE_MAX_AGE_MS = 20_000;

export async function buildSwap(quote: SwapQuote, userPublicKey: string, signal?: AbortSignal): Promise<Uint8Array> {
  const res = await fetch(JUPITER_SWAP_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(swapRequest(quote, userPublicKey)),
    signal: signal ?? AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Jupiter swap ${res.status}`);
  const body = (await res.json()) as { swapTransaction?: string; error?: string };
  if (!body.swapTransaction) throw new Error(body.error || "Jupiter returned no transaction");
  return Uint8Array.from(atob(body.swapTransaction), (c) => c.charCodeAt(0));
}

/**
 * What a quote implies against the desk's own mark: the dollars the trade
 * fetches at Jupiter's price, and the shortfall against the feed's price,
 * as a fraction of the trade.
 */
export function quoteVersusMark(q: SwapQuote, prices: Record<string, number>): { usdIn: number; usdOut: number; shortfall: number } {
  const usdIn = q.amountIn * (prices[q.from] ?? 0);
  const usdOut = q.amountOut * (prices[q.to] ?? 0);
  return { usdIn, usdOut, shortfall: usdIn > 0 ? 1 - usdOut / usdIn : 0 };
}
