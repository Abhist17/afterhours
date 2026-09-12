import { ASSETS } from "./universe";
import { inferIntervalMs, type PricePoint } from "./quant";

/**
 * Thirty days of hourly prices for the universe, refreshed on the hour by a
 * GitHub Action and published to the `data` branch. The app tries that
 * first, then the copy bundled with the build — older, but never absent —
 * so a first paint does not depend on a third party being up.
 */

export interface HistoryFile {
  generatedAt: number;
  days: number;
  assets: Record<string, { coingeckoId: string; fetchedAt: number; points: [number, number][] }>;
}

export interface History {
  generatedAt: number;
  days: number;
  /** Ascending by time. */
  series: Record<string, PricePoint[]>;
  /** Observations per day, measured from the data's own timestamps. */
  periodsPerDay: number;
  /** Where it came from, for the status line. */
  source: "live" | "bundled";
}

const LIVE_URL =
  process.env.NEXT_PUBLIC_HISTORY_URL ||
  "https://raw.githubusercontent.com/Abhist17/afterhours/data/history.json";

const BUNDLED_URL = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/data/history.json`;

export function parseHistory(file: HistoryFile, source: History["source"]): History {
  const series: Record<string, PricePoint[]> = {};
  const intervals: number[] = [];
  for (const asset of ASSETS) {
    const entry = file.assets?.[asset.symbol];
    if (!entry || !Array.isArray(entry.points) || entry.points.length < 3) continue;
    const points = entry.points
      .filter(([t, p]) => Number.isFinite(t) && Number.isFinite(p) && p > 0)
      .map(([t, price]) => ({ t, price }))
      .sort((a, b) => a.t - b.t);
    series[asset.symbol] = points;
    const gap = inferIntervalMs(points);
    if (gap) intervals.push(gap);
  }
  // The joint series is only as fine as its coarsest member.
  const intervalMs = intervals.length ? Math.max(...intervals) : 0;
  return {
    generatedAt: file.generatedAt,
    days: file.days,
    series,
    periodsPerDay: intervalMs > 0 ? 86_400_000 / intervalMs : 0,
    source,
  };
}

async function fetchJson(url: string, timeoutMs = 10_000): Promise<HistoryFile> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as HistoryFile;
}

export async function loadHistory(): Promise<History> {
  try {
    return parseHistory(await fetchJson(LIVE_URL), "live");
  } catch {
    return parseHistory(await fetchJson(BUNDLED_URL), "bundled");
  }
}

/** Latest price per symbol from the history alone — the fallback quote. */
export function lastPrices(history: History): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [symbol, points] of Object.entries(history.series)) {
    if (points.length) out[symbol] = points[points.length - 1].price;
  }
  return out;
}
