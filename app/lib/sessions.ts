/**
 * Where a tokenized stock's moves happen: during the NYSE session, with a
 * market behind the token, or outside it, with nobody on the other side.
 *
 * Every hourly return is classified by whether the NYSE was open in the
 * middle of that hour; the squared returns in each class are summed. The
 * share of variance that fell in closed hours is the product's premise as a
 * number: how much of this book's risk is carried without a market. The
 * same walk yields the gap across each closed period, the move from the
 * last print before a close to the first after the next open, which is
 * what the holder actually carried across each night and weekend.
 */

import { isMarketOpen } from "./market-hours";
import type { PricePoint } from "./quant";

export interface SessionSplit {
  /** Realised variance (sum of squared returns) inside and outside the session. */
  openVar: number;
  closedVar: number;
  /** Share of total variance that happened while the NYSE was closed. */
  closedShare: number;
  openHours: number;
  closedHours: number;
  /** Per-hour volatility in each state, as a fraction; the honest comparison. */
  openVolPerHour: number;
  closedVolPerHour: number;
  /** Signed return summed over closed hours and over open hours. */
  closedReturn: number;
  openReturn: number;
}

export interface Gap {
  /** Last print at or before the close, and the first at or after the open. */
  from: number;
  to: number;
  /** Fractional return across the closed period. */
  ret: number;
  /** Hours between the two prints. */
  hours: number;
}

/** Midpoint of the interval that ends at this point; a return spans an hour. */
function midOf(prev: PricePoint, cur: PricePoint): number {
  return (prev.t + cur.t) / 2;
}

// Classifying an instant means formatting it in New York; the answer for a
// given hour never changes, so it is remembered across assets and renders.
const openAt = new Map<number, boolean>();
export function marketOpenAt(t: number): boolean {
  let v = openAt.get(t);
  if (v === undefined) {
    v = isMarketOpen(t);
    openAt.set(t, v);
    if (openAt.size > 20_000) openAt.clear();
  }
  return v;
}

export function sessionSplit(series: PricePoint[], cap?: number): SessionSplit | null {
  if (series.length < 3) return null;
  let openVar = 0;
  let closedVar = 0;
  let openHours = 0;
  let closedHours = 0;
  let openReturn = 0;
  let closedReturn = 0;
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const cur = series[i];
    if (!(prev.price > 0) || !(cur.price > 0)) continue;
    const raw = cur.price / prev.price - 1;
    const r = cap === undefined ? raw : raw > cap ? cap : raw < -cap ? -cap : raw;
    const hours = Math.max(0.25, (cur.t - prev.t) / 3_600_000);
    if (marketOpenAt(midOf(prev, cur))) {
      openVar += r * r;
      openHours += hours;
      openReturn += r;
    } else {
      closedVar += r * r;
      closedHours += hours;
      closedReturn += r;
    }
  }
  const total = openVar + closedVar;
  return {
    openVar,
    closedVar,
    closedShare: total > 0 ? closedVar / total : 0,
    openHours,
    closedHours,
    openVolPerHour: openHours > 0 ? Math.sqrt(openVar / openHours) : 0,
    closedVolPerHour: closedHours > 0 ? Math.sqrt(closedVar / closedHours) : 0,
    closedReturn,
    openReturn,
  };
}

/**
 * The closed periods inside a window, as [start, end] instants, walked
 * hour by hour so the answer comes from the same calendar as everything
 * else. `step` is the sampling interval of the data.
 */
export function closedPeriods(from: number, to: number, step = 3_600_000): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let start: number | null = null;
  for (let t = from; t <= to + step; t += step) {
    const open = marketOpenAt(t);
    if (!open && start === null) start = t;
    if (open && start !== null) {
      out.push({ start, end: t });
      start = null;
    }
  }
  if (start !== null) out.push({ start, end: to });
  return out;
}

/**
 * The move across each closed period in the series: from the last print at
 * or before the period began to the first at or after it ended. Periods
 * that the data does not straddle are skipped. Oldest first.
 */
export function gapHistory(series: PricePoint[]): Gap[] {
  if (series.length < 3) return [];
  const periods = closedPeriods(series[0].t, series[series.length - 1].t);
  const gaps: Gap[] = [];
  let i = 0;
  for (const p of periods) {
    // Last point at or before the start.
    while (i + 1 < series.length && series[i + 1].t <= p.start) i++;
    const before = series[i];
    if (!before || before.t > p.start) continue;
    // First point at or after the end.
    let j = i;
    while (j < series.length && series[j].t < p.end) j++;
    const after = series[j];
    if (!after || !(before.price > 0) || !(after.price > 0) || after.t <= before.t) continue;
    gaps.push({ from: before.t, to: after.t, ret: after.price / before.price - 1, hours: (after.t - before.t) / 3_600_000 });
  }
  return gaps;
}

/**
 * The book's gap across each closed period, value-weighted over the
 * equities that have a print on both sides. Cash and crypto do not gap:
 * their market never closed.
 */
export function bookGapHistory(
  history: Record<string, PricePoint[]>,
  weights: Record<string, number>,
  equities: string[]
): Gap[] {
  const per = new Map<string, Gap[]>();
  for (const s of equities) {
    if (history[s] && weights[s] > 0) per.set(s, gapHistory(history[s]));
  }
  if (!per.size) return [];
  // Align by period start; every equity series shares the calendar, so the
  // gaps line up by `from` once the series overlap.
  const byStart = new Map<number, { ret: number; w: number; to: number; hours: number }>();
  for (const [s, gaps] of per) {
    for (const g of gaps) {
      const key = g.from;
      const acc = byStart.get(key) ?? { ret: 0, w: 0, to: g.to, hours: g.hours };
      acc.ret += g.ret * weights[s];
      acc.w += weights[s];
      byStart.set(key, acc);
    }
  }
  const held = equities.reduce((a, s) => a + (weights[s] ?? 0), 0);
  return [...byStart.entries()]
    .filter(([, v]) => v.w >= held * 0.5)
    .sort((a, b) => a[0] - b[0])
    .map(([from, v]) => ({ from, to: v.to, hours: v.hours, ret: v.ret / v.w }));
}
