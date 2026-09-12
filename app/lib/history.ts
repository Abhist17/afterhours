import { ASSETS } from "./universe";
import { inferIntervalMs, type PricePoint } from "./quant";

/**
 * Thirty days of hourly prices for the universe, refreshed on the hour by a
 * GitHub Action and published to the `data` branch. The app fetches that
 * and the copy bundled with the build together: the bundle — older, but
 * same-origin and never absent — paints first, and the hourly file takes
 * over when it lands, so a first paint never depends on a third party.
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

/** Universe symbols the file has no usable series for. */
export function missingFrom(file: HistoryFile): string[] {
  return ASSETS.filter((a) => !(file.assets?.[a.symbol]?.points?.length >= 3)).map((a) => a.symbol);
}

/**
 * The live file with any series it lacks taken from the bundled one. The
 * universe can grow in a commit before the hourly refresh has run, and a
 * newly listed asset should not spend that hour outside the risk model.
 */
export function mergeHistoryFiles(live: HistoryFile, bundled: HistoryFile): HistoryFile {
  const assets = { ...live.assets };
  for (const symbol of missingFrom(live)) {
    const fallback = bundled.assets?.[symbol];
    if (fallback && fallback.points?.length >= 3) assets[symbol] = fallback;
  }
  return { ...live, assets };
}

/**
 * Both files at once. The bundled one is same-origin and paints first;
 * the live one, when it lands, replaces it — filled from the bundle for
 * anything it lacks. A slow third party costs freshness for a moment,
 * never the first paint. Returns a cancel function for unmount.
 */
export function loadHistoryProgressive(handlers: {
  onHistory: (h: History) => void;
  onError: (message: string) => void;
  urls?: { live: string; bundled: string };
}): () => void {
  const { live: liveUrl, bundled: bundledUrl } = handlers.urls ?? { live: LIVE_URL, bundled: BUNDLED_URL };
  let cancelled = false;
  // What has landed so far: undefined while in flight, null when it failed.
  let live: HistoryFile | null | undefined;
  let bundled: HistoryFile | null | undefined;
  let liveShown = false;
  let bundledShown = false;

  const settle = (p: Promise<HistoryFile>) => p.then((f) => f, () => null);

  const step = () => {
    if (cancelled) return;
    // A complete live file wins the moment it lands.
    if (live && !liveShown && missingFrom(live).length === 0) {
      liveShown = true;
      handlers.onHistory(parseHistory(live, "live"));
      return;
    }
    // A short live file waits for the bundle to fill it.
    if (live && !liveShown && bundled !== undefined) {
      liveShown = true;
      handlers.onHistory(parseHistory(bundled ? mergeHistoryFiles(live, bundled) : live, "live"));
      return;
    }
    // Meanwhile the bundle paints, unless the live file has already landed.
    if (bundled && !bundledShown && !liveShown && live === undefined) {
      bundledShown = true;
      handlers.onHistory(parseHistory(bundled, "bundled"));
      return;
    }
    if (live === null && bundled === null) handlers.onError("neither the hourly file nor the bundled copy could be fetched");
    if (live === null && bundled && !bundledShown) {
      bundledShown = true;
      handlers.onHistory(parseHistory(bundled, "bundled"));
    }
  };

  void settle(fetchJson(liveUrl)).then((f) => {
    live = f;
    step();
  });
  void settle(fetchJson(bundledUrl)).then((f) => {
    bundled = f;
    step();
  });
  return () => {
    cancelled = true;
  };
}

/** Latest price per symbol from the history alone — the fallback quote. */
export function lastPrices(history: History): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [symbol, points] of Object.entries(history.series)) {
    if (points.length) out[symbol] = points[points.length - 1].price;
  }
  return out;
}
