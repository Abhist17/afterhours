import { describe, expect, it } from "vitest";
import {
  betasTo,
  jointBetasTo,
  factorScenario,
  worstDayScenario,
  worstGapScenario,
  stressBook,
  valueSeries,
  drawdownStats,
  varCheck,
  riskReturnMap,
} from "../scenarios";
import type { PricePoint } from "../quant";

const H = 3_600_000;
const T0 = Date.UTC(2026, 8, 1, 0, 0);

function walk(returns: number[], start = 100): PricePoint[] {
  const out: PricePoint[] = [{ t: T0, price: start }];
  let p = start;
  returns.forEach((r, i) => {
    p *= 1 + r;
    out.push({ t: T0 + (i + 1) * H, price: p });
  });
  return out;
}

describe("betasTo and factorScenario", () => {
  const market = Array.from({ length: 200 }, (_, i) => 0.01 * Math.sin(i / 3));
  const returns = {
    SPYx: market,
    TSLAx: market.map((r) => 2 * r),
    USDC: market.map(() => 0),
    SOL: market.map((r) => -0.5 * r),
  };

  it("measures beta against the named factor", () => {
    const b = betasTo(returns, "SPYx", 0.98);
    expect(b.SPYx).toBeCloseTo(1, 6);
    expect(b.TSLAx).toBeCloseTo(2, 6);
    expect(b.SOL).toBeCloseTo(-0.5, 6);
    expect(betasTo(returns, "MISSING", 0.98)).toEqual({});
  });

  it("moves every position by beta times the shock, cash by nothing", () => {
    const b = betasTo(returns, "SPYx", 0.98);
    const s = factorScenario("m", "S&P −5%", "SPYx", -0.05, { SPYx: 1000, TSLAx: 1000, USDC: 1000 }, b, (x) => x === "USDC");
    expect(s.pnlUsd).toBeCloseTo(-50 - 100, 6);
    expect(s.pnlPct).toBeCloseTo(-150 / 3000, 9);
    // Worst line first.
    expect(s.lines[0].symbol).toBe("TSLAx");
    expect(s.lines.find((l) => l.symbol === "USDC")!.move).toBe(0);
  });
});

describe("jointBetasTo", () => {
  // A and B are correlated with each other; an asset that is an exact
  // linear combination of both should have its true coefficients
  // recovered by the joint fit, unlike a naive sum of single-factor betas.
  const a = Array.from({ length: 200 }, (_, i) => 0.01 * Math.sin(i / 3));
  const b = a.map((r, i) => 0.6 * r + 0.005 * Math.cos(i / 5));
  const returns = {
    A: a,
    B: b,
    Y: a.map((r, i) => 1.5 * r + 0.5 * b[i]),
  };

  it("recovers the true coefficients of a position built from both factors", () => {
    const j = jointBetasTo(returns, "A", "B", 0.98);
    expect(j.Y.a).toBeCloseTo(1.5, 6);
    expect(j.Y.b).toBeCloseTo(0.5, 6);
  });

  it("disagrees with summing independent single-factor betas, because the factors overlap", () => {
    const single = { a: betasTo(returns, "A", 0.98).Y, b: betasTo(returns, "B", 0.98).Y };
    expect(Math.abs(single.a + single.b - 1.5 - 0.5)).toBeGreaterThan(0.01);
  });

  it("returns {} when either factor is missing", () => {
    expect(jointBetasTo(returns, "MISSING", "B", 0.98)).toEqual({});
  });
});

describe("worstDayScenario", () => {
  it("finds the day the book would have lost most, and dates it", () => {
    // Flat except one bad day for A in the middle of a ten-day window.
    const r = Array.from({ length: 240 }, () => 0);
    for (let i = 120; i < 144; i++) r[i] = -0.005; // ≈ −11.3% over that day
    const returns = { A: r, B: r.map(() => 0) };
    const times = { A: walk(r).map((p) => p.t), B: walk(r).map((p) => p.t) };
    const s = worstDayScenario({ A: 1000, B: 1000 }, returns, times, 24)!;
    expect(s.pnlUsd).toBeLessThan(-100);
    expect(s.pnlUsd).toBeGreaterThan(-120);
    expect(s.lines[0].symbol).toBe("A");
    // Ends inside the bad day's last hour.
    expect(s.at).toBe(T0 + 144 * H);
  });

  it("is null when nothing lost money", () => {
    const r = Array.from({ length: 60 }, () => 0.001);
    expect(worstDayScenario({ A: 100 }, { A: r }, { A: walk(r).map((p) => p.t) }, 24)).toBeNull();
  });
});

describe("worstGapScenario", () => {
  it("takes the deepest negative gap at today's equity value", () => {
    const gaps = [
      { from: 1, to: 2, ret: 0.02, hours: 18 },
      { from: 3, to: 4, ret: -0.04, hours: 66 },
      { from: 5, to: 6, ret: -0.01, hours: 18 },
    ];
    const s = worstGapScenario(gaps, 10_000)!;
    expect(s.pnlUsd).toBeCloseTo(-400, 6);
    expect(s.basis).toMatch(/weekend/);
    expect(worstGapScenario([{ from: 1, to: 2, ret: 0.02, hours: 18 }], 10_000)).toBeNull();
  });
});

describe("stressBook", () => {
  it("assembles factor scenarios and the dated ones", () => {
    const market = Array.from({ length: 240 }, (_, i) => 0.01 * Math.sin(i / 5));
    const returns = { SPYx: market, SOL: market.map((r) => 3 * r), TSLAx: market.map((r) => 1.5 * r), USDC: market.map(() => 0) };
    const times = Object.fromEntries(Object.entries(returns).map(([s, r]) => [s, walk(r).map((p) => p.t)]));
    const { scenarios, betaToMarket, betaToCrypto } = stressBook({
      values: { SPYx: 500, TSLAx: 500, SOL: 500, USDC: 500 },
      returnsBySymbol: returns,
      timesBySymbol: times,
      periodsPerDay: 24,
      marketSymbol: "SPYx",
      cryptoSymbol: "SOL",
      isCash: (s) => s === "USDC",
      gaps: [{ from: 1, to: 2, ret: -0.03, hours: 18 }],
      equityValue: 1000,
    });
    expect(betaToMarket.TSLAx).toBeCloseTo(1.5, 6);
    expect(betaToCrypto.SPYx).toBeCloseTo(1 / 3, 6);
    const keys = scenarios.map((s) => s.key);
    expect(keys).toContain("market-0.05");
    expect(keys).toContain("crypto-0.3");
    expect(keys).toContain("worst-day");
    expect(keys).toContain("worst-gap");
    // Every factor scenario is a loss for this long-only book.
    for (const s of scenarios) expect(s.pnlUsd).toBeLessThan(0);
    const gap = scenarios.find((s) => s.key === "worst-gap")!;
    expect(gap.pnlUsd).toBeCloseTo(-30, 6);
    expect(gap.pnlPct).toBeCloseTo(-30 / 2000, 9);
  });
});

describe("valueSeries and drawdownStats", () => {
  it("prices the book through the window and finds the deepest drawdown", () => {
    const a = walk([0.1, 0.1, -0.5, 0.2, 0.1]);
    const b = walk([0, 0, 0, 0, 0]);
    const v = valueSeries({ A: a, B: b }, { A: 1, B: 1 });
    expect(v.length).toBe(6);
    expect(v[0].value).toBe(200);
    expect(v[0].drawdown).toBe(0);
    const d = drawdownStats(v)!;
    // Peak after two rises: 121 + 100 = 221; trough 60.5 + 100 = 160.5.
    expect(d.maxDrawdown).toBeCloseTo(160.5 / 221 - 1, 9);
    expect(d.peakAt).toBe(T0 + 2 * H);
    expect(d.troughAt).toBe(T0 + 3 * H);
    expect(d.windowReturn).toBeCloseTo(v[5].value / 200 - 1, 9);
  });

  it("aligns on shared timestamps only", () => {
    const a = walk([0, 0, 0]);
    const b = walk([0, 0, 0, 0, 0]).slice(1);
    const v = valueSeries({ A: a, B: b }, { A: 1, B: 1 });
    expect(v.map((p) => p.t)).toEqual([T0 + H, T0 + 2 * H, T0 + 3 * H]);
    expect(valueSeries({ A: a }, {})).toEqual([]);
    expect(drawdownStats([])).toBeNull();
  });
});

describe("varCheck", () => {
  it("counts the days the realised loss beat the forecast", () => {
    // A forecast of 2% every hour; the book loses 3% on one day and 1% on
    // the others, in daily steps of 24 hours.
    const forecast: { t: number; value: number; varPct: number }[] = [];
    let value = 1000;
    for (let day = 0; day < 10; day++) {
      for (let h = 0; h < 24; h++) forecast.push({ t: T0 + (day * 24 + h) * H, value, varPct: 2 });
      value *= day === 4 ? 0.97 : 0.99;
    }
    forecast.push({ t: T0 + 240 * H, value, varPct: 2 });
    const c = varCheck(forecast, 24)!;
    expect(c.days).toBe(10);
    expect(c.exceptions).toBe(1);
    expect(c.expected).toBeCloseTo(0.5, 9);
    expect(c.verdict).toBe("in line");
    expect(c.worstLoss).toBeCloseTo(0.03, 9);
    expect(c.worstAt).toBe(T0 + 5 * 24 * H);
  });

  it("calls a model optimistic when breaches pile up", () => {
    const forecast: { t: number; value: number; varPct: number }[] = [];
    let value = 1000;
    for (let day = 0; day < 20; day++) {
      for (let h = 0; h < 24; h++) forecast.push({ t: T0 + (day * 24 + h) * H, value, varPct: 1 });
      value *= 0.95;
    }
    forecast.push({ t: T0 + 480 * H, value, varPct: 1 });
    expect(varCheck(forecast, 24)!.verdict).toBe("optimistic");
    expect(varCheck(forecast.slice(0, 10), 24)).toBeNull();
  });
});

describe("riskReturnMap", () => {
  it("gives every series a volatility and a window return, held first", () => {
    const calm = Array.from({ length: 100 }, (_, i) => 0.001 * Math.sin(i));
    const wild = Array.from({ length: 100 }, (_, i) => 0.02 * Math.sin(i));
    const history = { CALM: walk(calm), WILD: walk(wild) };
    const returns = { CALM: calm, WILD: wild };
    const map = riskReturnMap(history, returns, { WILD: 1 }, 24, (s) => s * 100);
    expect(map[0].symbol).toBe("WILD");
    expect(map[0].held).toBe(true);
    expect(map[1].held).toBe(false);
    expect(map[0].volPct).toBeGreaterThan(map[1].volPct * 10);
    expect(map[1].ret).toBeCloseTo(history.CALM[100].price / 100 - 1, 9);
  });
});
