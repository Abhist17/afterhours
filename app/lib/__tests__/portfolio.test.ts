import { describe, expect, it } from "vitest";
import { analyse } from "../portfolio";
import type { History } from "../history";
import type { PricePoint } from "../quant";
import { ASSETS } from "../universe";

function synthetic(n: number, sigma: number, seed: number): number[] {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const u1 = Math.max(1e-12, rand());
    const u2 = rand();
    out.push(Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma);
  }
  return out;
}

// Hourly series ending at a Saturday noon UTC, so the market is closed and
// the last NYSE print (Friday 20:00 UTC) sits inside the window.
const END = Date.UTC(2026, 8, 19, 12, 0);
const HOURS = 720;

function series(start: number, returns: number[]): PricePoint[] {
  const pts: PricePoint[] = [];
  let price = start;
  for (let i = 0; i < returns.length; i++) {
    pts.push({ t: END - (returns.length - 1 - i) * 3_600_000, price });
    price *= 1 + returns[i];
  }
  return pts;
}

function buildHistory(): History {
  const market = synthetic(HOURS, 0.004, 1);
  const sol = synthetic(HOURS, 0.012, 2);
  const out: Record<string, PricePoint[]> = {};
  let seed = 10;
  for (const a of ASSETS) {
    let r: number[];
    if (a.symbol === "SPYx") r = market;
    else if (a.symbol === "SOL") r = sol;
    else if (a.class === "cash") r = synthetic(HOURS, 0.00002, seed++);
    else if (a.sector === "crypto-linked equity") r = sol.map((x, i) => 0.7 * x + 0.3 * market[i] + synthetic(HOURS, 0.006, seed)[i]);
    else r = market.map((x, i) => 1.1 * x + synthetic(HOURS, 0.006, seed)[i]);
    seed++;
    out[a.symbol] = series(a.class === "cash" ? 1 : 100 + seed, r);
  }
  return { generatedAt: END, days: 30, series: out, periodsPerDay: 24, source: "bundled" };
}

const history = buildHistory();
const prices = Object.fromEntries(Object.entries(history.series).map(([s, p]) => [s, p[p.length - 1].price]));

describe("analyse", () => {
  const amounts = { TSLAx: 10, COINx: 10, MSTRx: 5, SOL: 50, USDC: 2_000, SPYx: 5 };
  const a = analyse(amounts, prices, history, END);

  it("prices the book and sums the sleeves to the total", () => {
    expect(a.total).toBeGreaterThan(0);
    const sleeveValue = a.sleeves.reduce((s, x) => s + x.value, 0);
    expect(sleeveValue).toBeCloseTo(a.total, 6);
    const weights = a.holdings.reduce((s, h) => s + h.weight, 0);
    expect(weights).toBeCloseTo(1, 9);
    expect(a.unpriced).toEqual([]);
  });

  it("gives every held asset a risk share that sums to one, and a beta", () => {
    const shares = a.holdings.reduce((s, h) => s + (h.riskShare ?? 0), 0);
    expect(shares).toBeCloseTo(1, 6);
    const spy = a.holdings.find((h) => h.symbol === "SPYx")!;
    expect(spy.beta).toBeCloseTo(1, 6);
    expect(a.risk.beta).not.toBeNull();
  });

  it("knows the market is closed and prices the overnight exposure", () => {
    expect(a.market.open).toBe(false);
    expect(a.market.reason).toBe("weekend");
    // Every equity has a move since Friday's close; cash and SOL do not.
    for (const h of a.holdings) {
      if (h.asset.class === "equity") expect(h.sinceClose).not.toBeNull();
      else expect(h.sinceClose).toBeNull();
    }
    expect(a.overnight.counted).toBe(4);
    expect(a.overnight.equityValue).toBeCloseTo(a.sleeves[0].value, 6);
  });

  it("names the crypto-linked equities and their tie to SOL", () => {
    expect(a.cryptoLinked.symbols.sort()).toEqual(["COINx", "MSTRx"]);
    expect(a.cryptoLinked.valueShareOfEquities).toBeGreaterThan(0);
    expect(a.cryptoLinked.corrToSol).not.toBeNull();
    // Built to move with SOL, so the correlation should be clearly positive.
    expect(a.cryptoLinked.corrToSol!).toBeGreaterThan(0.4);
  });

  it("puts the index in the correlation grid even when not held", () => {
    const b = analyse({ TSLAx: 10, SOL: 10 }, prices, history, END);
    expect(b.correlation.symbols).toContain("SPYx");
    expect(b.correlation.symbols).not.toContain("USDC");
  });

  it("backtests the allocation over the window", () => {
    // 720 hourly points less a week of warm-up.
    expect(a.backtest.length).toBe(HOURS - 168);
    expect(a.backtest[a.backtest.length - 1].t).toBe(END);
  });

  it("reports an unpriced holding rather than dropping it silently", () => {
    const b = analyse({ SPYx: 1, GLDx: 2 }, { ...prices, GLDx: 0 }, history, END);
    expect(b.unpriced).toEqual(["GLDx"]);
    expect(b.holdings.map((h) => h.symbol)).toEqual(["SPYx"]);
  });

  it("keeps a position with a quote but no history in the book, and says the model does not cover it", () => {
    // A freshly listed xStock: the feed quotes it today, but the thirty-day
    // file has no series for it yet.
    const { SPCXx: _dropped, ...without } = history.series;
    void _dropped;
    const b = analyse({ SPYx: 5, SPCXx: 20 }, prices, { ...history, series: without }, END);
    const spcx = b.holdings.find((h) => h.symbol === "SPCXx")!;
    expect(spcx.value).toBeGreaterThan(0);
    expect(spcx.riskShare).toBeNull();
    expect(spcx.beta).toBeNull();
    expect(b.risk.uncovered).toEqual(["SPCXx"]);
    expect(b.risk.coverage).toBeCloseTo(b.holdings.find((h) => h.symbol === "SPYx")!.weight, 9);
    // The rest of the book is still scored.
    expect(b.risk.headlineVarUsd).toBeGreaterThan(0);
  });

  it("handles an empty wallet without NaN", () => {
    const b = analyse({}, prices, history, END);
    expect(b.total).toBe(0);
    expect(b.score).toBe(0);
    expect(b.holdings).toEqual([]);
    expect(Number.isFinite(b.overnight.movePct)).toBe(true);
  });
});
