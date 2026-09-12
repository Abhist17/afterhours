import { describe, expect, it } from "vitest";
import { sessionSplit, closedPeriods, gapHistory, bookGapHistory, marketOpenAt } from "../sessions";
import type { PricePoint } from "../quant";

// Mon 2026-09-14 09:00 EDT = 13:00 UTC; the session opens at 13:30 UTC.
const MON_9AM = Date.UTC(2026, 8, 14, 13, 0);
const H = 3_600_000;

/** Hourly points from a start, with a price for each hour. */
function series(start: number, prices: number[]): PricePoint[] {
  return prices.map((price, i) => ({ t: start + i * H, price }));
}

describe("marketOpenAt", () => {
  it("agrees with the calendar and caches the answer", () => {
    // 10:30 EDT Monday: open. 08:30 EDT: closed.
    expect(marketOpenAt(Date.UTC(2026, 8, 14, 14, 30))).toBe(true);
    expect(marketOpenAt(Date.UTC(2026, 8, 14, 12, 30))).toBe(false);
    expect(marketOpenAt(Date.UTC(2026, 8, 14, 14, 30))).toBe(true);
  });
});

describe("closedPeriods", () => {
  it("finds the night between two sessions and the weekend", () => {
    // Monday 09:00 to Tuesday 17:00 EDT — one overnight in between, plus the
    // partial closed spans at each end.
    const from = MON_9AM;
    const to = MON_9AM + 32 * H;
    const periods = closedPeriods(from, to);
    // Closed until the 14:00 UTC hour (the walk is hourly, so 13:00 is
    // closed and 14:00 is the first open hour), open until 20:00, closed
    // overnight until 14:00 next day, open until 20:00, then closed.
    expect(periods.length).toBe(3);
    expect(periods[1].start).toBe(Date.UTC(2026, 8, 14, 20, 0));
    expect(periods[1].end).toBe(Date.UTC(2026, 8, 15, 14, 0));
  });
});

describe("sessionSplit", () => {
  it("attributes each hour's variance to open or closed hours", () => {
    // Twelve hourly prints from Monday 09:00 EDT. A 1% move every hour: the
    // intervals whose midpoint falls inside the session (13:30–20:00 UTC)
    // are 13→14 (midpoint 13:30, the opening bell) through 19→20, seven of
    // eleven; the other four are closed.
    const prices = Array.from({ length: 12 }, (_, i) => 100 * Math.pow(1.01, i));
    const split = sessionSplit(series(MON_9AM, prices))!;
    expect(split.openHours).toBe(7);
    expect(split.closedHours).toBe(4);
    expect(split.closedShare).toBeCloseTo(4 / 11, 6);
    expect(split.openVolPerHour).toBeCloseTo(0.01, 6);
    expect(split.closedVolPerHour).toBeCloseTo(0.01, 6);
    expect(split.openReturn).toBeCloseTo(0.07, 6);
  });

  it("puts a weekend's moves entirely in closed hours", () => {
    // Saturday noon UTC for 24 hours.
    const sat = Date.UTC(2026, 8, 19, 12, 0);
    const split = sessionSplit(series(sat, [100, 101, 99, 102, 98]))!;
    expect(split.openHours).toBe(0);
    expect(split.closedShare).toBe(1);
  });

  it("is null without enough points", () => {
    expect(sessionSplit(series(MON_9AM, [1, 2]))).toBeNull();
  });
});

describe("gapHistory", () => {
  it("measures the move from the last print before a close to the first after the open", () => {
    // Monday 09:00 EDT through Tuesday 17:00 EDT: prices flat at 100 during
    // Monday's session, then jump to 110 overnight, then flat.
    const prices: number[] = [];
    for (let i = 0; i < 33; i++) {
      const t = MON_9AM + i * H;
      // Monday close is 20:00 UTC; from the 21:00 UTC point onward the
      // token has repriced.
      prices.push(t > Date.UTC(2026, 8, 14, 20, 0) ? 110 : 100);
    }
    const gaps = gapHistory(series(MON_9AM, prices));
    const overnight = gaps.find((g) => g.from === Date.UTC(2026, 8, 14, 20, 0));
    expect(overnight).toBeDefined();
    expect(overnight!.to).toBe(Date.UTC(2026, 8, 15, 14, 0));
    expect(overnight!.ret).toBeCloseTo(0.1, 9);
    expect(overnight!.hours).toBe(18);
  });

  it("value-weights the book's gap over the equities that have both prints", () => {
    const prices = (jump: number) =>
      Array.from({ length: 33 }, (_, i) => (MON_9AM + i * H > Date.UTC(2026, 8, 14, 20, 0) ? 100 * (1 + jump) : 100));
    const history = { A: series(MON_9AM, prices(0.1)), B: series(MON_9AM, prices(-0.1)), SOL: series(MON_9AM, prices(0.5)) };
    const gaps = bookGapHistory(history, { A: 0.3, B: 0.1, SOL: 0.6 }, ["A", "B"]);
    const overnight = gaps.find((g) => g.from === Date.UTC(2026, 8, 14, 20, 0))!;
    // (0.3 × 0.1 + 0.1 × −0.1) / 0.4 = 0.05
    expect(overnight.ret).toBeCloseTo(0.05, 9);
  });
});
