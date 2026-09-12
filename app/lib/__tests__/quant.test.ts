import { describe, expect, it } from "vitest";
import {
  computeReturns,
  ewmaCovariance,
  scaleLambdaToFrequency,
  normalQuantile,
  concentrationPenalty,
  calculatePortfolioRisk,
  correlationMatrix,
  rollingRisk,
  driftAgainst,
  blendedScore,
  inferIntervalMs,
  type PricePoint,
} from "../quant";

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

function pricesFrom(returns: number[], start = 100, t0 = 1_800_000_000_000): PricePoint[] {
  const out: PricePoint[] = [{ t: t0, price: start }];
  for (let i = 0; i < returns.length; i++) {
    out.push({ t: t0 + (i + 1) * 3_600_000, price: out[i].price * (1 + returns[i]) });
  }
  return out;
}

describe("basics", () => {
  it("skips unusable prices when computing returns", () => {
    expect(computeReturns([100, 110, 0, 50, 55])).toEqual([0.1, 0.1]);
  });

  it("rescales a daily decay to hourly data", () => {
    expect(scaleLambdaToFrequency(0.94, 24)).toBeCloseTo(0.9975, 4);
    expect(scaleLambdaToFrequency(0.94, 1)).toBe(0.94);
  });

  it("inverts the normal CDF", () => {
    expect(normalQuantile(0.95)).toBeCloseTo(1.6449, 3);
    expect(normalQuantile(0.5)).toBeCloseTo(0, 6);
  });

  it("measures the sampling interval as a median", () => {
    const pts = pricesFrom(synthetic(20, 0.01, 1));
    expect(inferIntervalMs(pts)).toBe(3_600_000);
  });
});

describe("concentration", () => {
  it("is zero for an even four-way split and full for one asset", () => {
    expect(concentrationPenalty([0.25, 0.25, 0.25, 0.25]).penalty).toBe(0);
    expect(concentrationPenalty([1]).penalty).toBe(20);
  });
  it("never jumps", () => {
    let last = concentrationPenalty([0.3, 0.7]).penalty;
    for (let w = 0.31; w <= 0.99; w += 0.01) {
      const p = concentrationPenalty([w, 1 - w]).penalty;
      expect(p - last).toBeLessThan(1.5);
      last = p;
    }
  });
});

describe("calculatePortfolioRisk", () => {
  const returns = {
    SPYX: synthetic(720, 0.004, 3),
    TSLAX: synthetic(720, 0.012, 4),
    USDC: synthetic(720, 0.00003, 5),
  };
  // TSLA moves with the index plus its own noise, so beta should exceed 1.
  const tsla = returns.SPYX.map((r, i) => 1.4 * r + returns.TSLAX[i] * 0.5);
  const series = { ...returns, TSLAX: tsla };

  it("produces a one-day VaR with beta and attribution that sums to one", () => {
    const r = calculatePortfolioRisk({
      portfolioValue: 100_000,
      weightsBySymbol: { SPYX: 0.5, TSLAX: 0.4, USDC: 0.1 },
      returnsBySymbol: series,
      periodsPerDay: 24,
      marketSymbol: "SPYX",
    });
    expect(r.headlineVarUsd).toBeGreaterThan(0);
    expect(r.headlineVarUsd).toBeLessThan(20_000);
    expect(r.coverage).toBe(1);
    const shares = r.contributions.reduce((s, c) => s + c.riskShare, 0);
    expect(shares).toBeCloseTo(1, 9);

    const spy = r.contributions.find((c) => c.symbol === "SPYX")!;
    const tslaC = r.contributions.find((c) => c.symbol === "TSLAX")!;
    expect(spy.beta).toBeCloseTo(1, 6);
    expect(tslaC.beta!).toBeGreaterThan(1.2);
    expect(r.beta!).toBeGreaterThan(0.9);
    expect(r.beta!).toBeLessThan(1.4);
  });

  it("reports what it cannot see", () => {
    const r = calculatePortfolioRisk({
      portfolioValue: 100_000,
      weightsBySymbol: { SPYX: 0.6, NVDAX: 0.4 },
      returnsBySymbol: series,
      periodsPerDay: 24,
    });
    expect(r.uncovered).toEqual(["NVDAX"]);
    expect(r.coverage).toBeCloseTo(0.6, 9);
    expect(r.beta).toBeNull();
  });
});

describe("correlationMatrix", () => {
  it("is symmetric with a unit diagonal", () => {
    const a = synthetic(300, 0.01, 7);
    const { matrix } = correlationMatrix({ A: a, B: a.map((x) => -x), C: synthetic(300, 0.01, 8) }, ["A", "B", "C"]);
    expect(matrix[0][0]).toBe(1);
    expect(matrix[0][1]).toBeCloseTo(-1, 9);
    expect(matrix[0][2]).toBe(matrix[2][0]);
  });
});

describe("rollingRisk", () => {
  it("scores the current allocation at every aligned hour after warm-up", () => {
    const history = {
      SPYX: pricesFrom(synthetic(200, 0.004, 11), 500),
      TSLAX: pricesFrom(synthetic(200, 0.012, 12), 300),
    };
    const points = rollingRisk(history, { SPYX: 10, TSLAX: 5 }, { periodsPerDay: 24, warmup: 24 });
    expect(points.length).toBe(200 - 24 + 1);
    for (const p of points) {
      expect(p.value).toBeGreaterThan(0);
      expect(p.varPct).toBeGreaterThanOrEqual(0);
      expect(p.score).toBeGreaterThanOrEqual(0);
      expect(p.score).toBeLessThanOrEqual(100);
    }
    // Later points carry a covariance that has seen more history; the
    // series is well-defined and ordered by time.
    for (let i = 1; i < points.length; i++) expect(points[i].t).toBeGreaterThan(points[i - 1].t);
  });

  it("aligns on shared timestamps and drops unheld assets", () => {
    const base = pricesFrom(synthetic(100, 0.01, 21));
    const shifted = base.slice(10); // starts ten hours later
    const points = rollingRisk({ A: base, B: shifted, C: base }, { A: 1, B: 1, C: 0 }, { periodsPerDay: 24, warmup: 10 });
    expect(points.length).toBe(shifted.length - 10);
  });

  it("starts from a seeded covariance, not from zero", () => {
    // Constant volatility throughout: the first scored hour should already
    // carry roughly the same risk as the last, not ramp up from nothing.
    const history = { A: pricesFrom(synthetic(720, 0.01, 31), 100) };
    const points = rollingRisk(history, { A: 1 }, { periodsPerDay: 24 });
    const first = points[0].varPct;
    const last = points[points.length - 1].varPct;
    expect(first).toBeGreaterThan(last * 0.5);
    expect(first).toBeLessThan(last * 2);
    // A week of warm-up leaves about 23 days of hourly points.
    expect(points.length).toBe(720 - 168 + 1);
  });
});

describe("driftAgainst", () => {
  it("computes trades that restore the target and the one-way turnover", () => {
    const d = driftAgainst({ SPYX: 70_000, TSLAX: 30_000 }, [
      { symbol: "SPYX", weight: 0.5 },
      { symbol: "TSLAX", weight: 0.5 },
    ]);
    const spy = d.lines.find((l) => l.symbol === "SPYX")!;
    expect(spy.drift).toBeCloseTo(0.2, 9);
    expect(spy.tradeUsd).toBeCloseTo(-20_000, 6);
    expect(d.maxDrift).toBeCloseTo(0.2, 9);
    expect(d.turnoverUsd).toBeCloseTo(20_000, 6);
    expect(d.turnoverPct).toBeCloseTo(0.2, 9);
  });

  it("treats untargeted holdings and unheld targets as zero on the other side", () => {
    const d = driftAgainst({ SOL: 50_000, SPYX: 50_000 }, [{ symbol: "SPYX", weight: 1 }]);
    const sol = d.lines.find((l) => l.symbol === "SOL")!;
    expect(sol.target).toBe(0);
    expect(sol.tradeUsd).toBeCloseTo(-50_000, 6);

    const e = driftAgainst({ SPYX: 100 }, [
      { symbol: "SPYX", weight: 0.5 },
      { symbol: "GLDX", weight: 0.5 },
    ]);
    expect(e.lines.find((l) => l.symbol === "GLDX")!.tradeUsd).toBeCloseTo(50, 6);
  });

  it("normalises targets that do not sum to one", () => {
    const d = driftAgainst({ A: 50, B: 50 }, [{ symbol: "A", weight: 0.3 }, { symbol: "B", weight: 0.3 }]);
    expect(d.maxDrift).toBeCloseTo(0, 9);
  });

  it("lists the largest drift first, and a book at target by size", () => {
    const values = { A: 60, B: 30, C: 10 };
    const atTarget = driftAgainst(values, [
      { symbol: "C", weight: 0.1 },
      { symbol: "A", weight: 0.6 },
      { symbol: "B", weight: 0.3 },
    ]);
    expect(atTarget.lines.map((l) => l.symbol)).toEqual(["A", "B", "C"]);

    const drifted = driftAgainst(values, [
      { symbol: "A", weight: 0.6 },
      { symbol: "B", weight: 0.1 },
      { symbol: "C", weight: 0.3 },
    ]);
    expect(drifted.lines.map((l) => l.symbol)).toEqual(["B", "C", "A"]);
  });
});

describe("thinness and winsorise", () => {
  it("measures the share of hours that moved more than the clip, and clips them", async () => {
    const { thinness, winsorise } = await import("../quant");
    const r = [0.01, -0.02, 0.45, 0.0, -0.46, 0.003];
    expect(thinness(r)).toBeCloseTo(2 / 6, 9);
    expect(thinness(r, 0.5)).toBe(0);
    expect(winsorise(r)).toEqual([0.01, -0.02, 0.08, 0, -0.08, 0.003]);
    expect(thinness([])).toBe(0);
  });
});

describe("blendedScore", () => {
  it("is annualised volatility plus concentration, capped", () => {
    // 1% a day is ~19% a year on the token's calendar.
    expect(blendedScore(0.01, 0)).toBeCloseTo(19.1, 1);
    expect(blendedScore(0.01, 10)).toBeCloseTo(29.1, 1);
    expect(blendedScore(0.1, 20)).toBe(100);
    expect(blendedScore(0, 0)).toBe(0);
  });

  it("puts the kinds of book in the bands their names promise", () => {
    // Daily sigma: an index ~0.9%, a single large-cap ~2%, crypto ~4%.
    expect(blendedScore(0.009, 0)).toBeLessThan(25);
    expect(blendedScore(0.02, 0)).toBeGreaterThan(25);
    expect(blendedScore(0.02, 0)).toBeLessThan(45);
    expect(blendedScore(0.04, 0)).toBeGreaterThan(70);
  });
});
