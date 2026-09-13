/**
 * Stress: what the book does if a factor moves by an amount the last
 * thirty days may never have shown. Two factors matter for a book of
 * tokenized stocks, the index and crypto, and each position moves by
 * its beta to the factor being shocked, on the same estimator as
 * everything else. Two more scenarios are not hypothetical at all: the
 * worst day the window actually had, and the worst closed period.
 */

import { ewmaCovariance, scaleLambdaToFrequency, DEFAULT_LAMBDA, aggregateReturns, type PricePoint } from "./quant";
import type { Gap } from "./sessions";

export interface ScenarioLine {
  symbol: string;
  /** Position's fractional move under the scenario. */
  move: number;
  pnlUsd: number;
}

export interface Scenario {
  key: string;
  label: string;
  /** One sentence on what is assumed. */
  basis: string;
  /** Book P&L in dollars and as a fraction of the book. */
  pnlUsd: number;
  pnlPct: number;
  lines: ScenarioLine[];
  /** When the scenario is a dated event. */
  at?: number;
  /** Which factor and shock, for factor scenarios. */
  factor?: { symbol: string; shock: number };
}

/** Beta of each series to the factor, on the EWMA estimator. */
export function betasTo(
  returnsBySymbol: Record<string, number[]>,
  factor: string,
  lambda: number
): Record<string, number> {
  const f = returnsBySymbol[factor];
  const out: Record<string, number> = {};
  if (!f || f.length < 2) return out;
  const fv = ewmaCovariance(f, f, lambda);
  if (!(fv > 0)) return out;
  for (const [s, r] of Object.entries(returnsBySymbol)) {
    if (r.length >= 2) out[s] = ewmaCovariance(r, f, lambda) / fv;
  }
  return out;
}

export function factorScenario(
  key: string,
  label: string,
  factor: string,
  shock: number,
  values: Record<string, number>,
  betas: Record<string, number>,
  isCash: (s: string) => boolean
): Scenario {
  const total = Object.values(values).reduce((a, b) => a + b, 0);
  const lines: ScenarioLine[] = [];
  let pnl = 0;
  for (const [symbol, value] of Object.entries(values)) {
    if (!(value > 0)) continue;
    const beta = isCash(symbol) ? 0 : betas[symbol] ?? 0;
    // `+ 0` turns a −0 from a zero beta into a plain zero.
    const move = beta * shock + 0;
    const pnlUsd = move * value;
    pnl += pnlUsd;
    lines.push({ symbol, move, pnlUsd });
  }
  lines.sort((a, b) => a.pnlUsd - b.pnlUsd);
  return {
    key,
    label,
    basis: `${factor} ${shock > 0 ? "+" : ""}${(shock * 100).toFixed(0)}%, every position by its beta to it`,
    pnlUsd: pnl,
    pnlPct: total > 0 ? pnl / total : 0,
    lines,
    factor: { symbol: factor, shock },
  };
}

/**
 * The worst day the window had for this shape of book: the current weights
 * applied to each asset's compounded one-day return, aligned on the most
 * recent overlap, with the day it happened.
 */
export function worstDayScenario(
  values: Record<string, number>,
  returnsBySymbol: Record<string, number[]>,
  timesBySymbol: Record<string, number[]>,
  periodsPerDay: number
): Scenario | null {
  const symbols = Object.keys(values).filter((s) => values[s] > 0 && returnsBySymbol[s]?.length >= 2);
  const total = Object.values(values).reduce((a, b) => a + b, 0);
  if (!symbols.length || !(total > 0)) return null;
  const k = Math.max(1, Math.round(periodsPerDay));
  const daily = symbols.map((s) => aggregateReturns(returnsBySymbol[s], k));
  const aligned = Math.min(...daily.map((d) => d.length));
  if (aligned < 2) return null;
  let worst = 0;
  let worstIdx = -1;
  for (let i = 0; i < aligned; i++) {
    let pnl = 0;
    for (let a = 0; a < symbols.length; a++) {
      const d = daily[a];
      pnl += values[symbols[a]] * d[d.length - aligned + i];
    }
    if (pnl < worst) {
      worst = pnl;
      worstIdx = i;
    }
  }
  if (worstIdx < 0) return null;
  const lines: ScenarioLine[] = symbols
    .map((s, a) => {
      const d = daily[a];
      const move = d[d.length - aligned + worstIdx];
      return { symbol: s, move, pnlUsd: move * values[s] };
    })
    .sort((a, b) => a.pnlUsd - b.pnlUsd);
  // The day it ended: the timestamp of the last hour in that window.
  const first = symbols[0];
  const times = timesBySymbol[first] ?? [];
  const dailyLen = daily[0].length;
  const endIdx = times.length - 1 - (dailyLen - 1 - (dailyLen - aligned + worstIdx));
  const at = times[Math.max(0, Math.min(times.length - 1, endIdx))];
  return {
    key: "worst-day",
    label: "The worst day this window had",
    basis: "Every position's actual one-day move on that day, at today's weights",
    pnlUsd: worst,
    pnlPct: worst / total,
    lines,
    at,
  };
}

/** The deepest closed-period gap the equities carried, at today's weights. */
export function worstGapScenario(gaps: Gap[], equityValue: number): Scenario | null {
  if (!gaps.length || !(equityValue > 0)) return null;
  const worst = gaps.reduce((a, b) => (b.ret < a.ret ? b : a));
  if (worst.ret >= 0) return null;
  return {
    key: "worst-gap",
    label: "The worst close-to-open this window had",
    basis: `The tokenized stocks' move across the ${worst.hours >= 40 ? "weekend" : "night"} ending ${new Date(worst.to).toLocaleDateString([], { month: "short", day: "numeric" })}`,
    pnlUsd: worst.ret * equityValue,
    pnlPct: 0,
    lines: [],
    at: worst.to,
  };
}

export const MARKET_SHOCKS = [-0.02, -0.05, -0.1] as const;
export const CRYPTO_SHOCKS = [-0.15, -0.3] as const;

export function stressBook(inputs: {
  values: Record<string, number>;
  returnsBySymbol: Record<string, number[]>;
  timesBySymbol: Record<string, number[]>;
  periodsPerDay: number;
  marketSymbol: string;
  cryptoSymbol: string;
  isCash: (s: string) => boolean;
  gaps: Gap[];
  equityValue: number;
}): { scenarios: Scenario[]; betaToMarket: Record<string, number>; betaToCrypto: Record<string, number> } {
  const lambda = scaleLambdaToFrequency(DEFAULT_LAMBDA, inputs.periodsPerDay);
  const betaToMarket = betasTo(inputs.returnsBySymbol, inputs.marketSymbol, lambda);
  const betaToCrypto = betasTo(inputs.returnsBySymbol, inputs.cryptoSymbol, lambda);
  const scenarios: Scenario[] = [];
  for (const shock of MARKET_SHOCKS) {
    scenarios.push(
      factorScenario(`market${shock}`, `S&P 500 ${(shock * 100).toFixed(0)}%`, inputs.marketSymbol, shock, inputs.values, betaToMarket, inputs.isCash)
    );
  }
  for (const shock of CRYPTO_SHOCKS) {
    scenarios.push(
      factorScenario(`crypto${shock}`, `Crypto ${(shock * 100).toFixed(0)}%`, inputs.cryptoSymbol, shock, inputs.values, betaToCrypto, inputs.isCash)
    );
  }
  const worstDay = worstDayScenario(inputs.values, inputs.returnsBySymbol, inputs.timesBySymbol, inputs.periodsPerDay);
  if (worstDay) scenarios.push(worstDay);
  const worstGap = worstGapScenario(inputs.gaps, inputs.equityValue);
  if (worstGap) {
    const total = Object.values(inputs.values).reduce((a, b) => a + b, 0);
    worstGap.pnlPct = total > 0 ? worstGap.pnlUsd / total : 0;
    scenarios.push(worstGap);
  }
  return { scenarios, betaToMarket, betaToCrypto };
}

// ── Value, drawdown, and the model's own record ─────────────────

export interface ValuePoint {
  t: number;
  value: number;
  /** Fraction below the running peak, ≤ 0. */
  drawdown: number;
}

/** The book at today's amounts, priced at every shared hour of the window. */
export function valueSeries(history: Record<string, PricePoint[]>, amounts: Record<string, number>): ValuePoint[] {
  const symbols = Object.keys(amounts).filter((s) => amounts[s] > 0 && history[s]?.length > 2);
  if (!symbols.length) return [];
  const common = symbols
    .map((s) => new Set(history[s].map((p) => p.t)))
    .reduce((acc, set) => new Set([...acc].filter((t) => set.has(t))));
  const times = [...common].sort((a, b) => a - b);
  const priceAt = symbols.map((s) => new Map(history[s].map((p) => [p.t, p.price])));
  const out: ValuePoint[] = [];
  let peak = 0;
  for (const t of times) {
    let value = 0;
    for (let i = 0; i < symbols.length; i++) value += amounts[symbols[i]] * (priceAt[i].get(t) ?? 0);
    if (!(value > 0)) continue;
    peak = Math.max(peak, value);
    out.push({ t, value, drawdown: peak > 0 ? value / peak - 1 : 0 });
  }
  return out;
}

export interface Drawdown {
  maxDrawdown: number;
  /** Peak and trough instants of the deepest drawdown. */
  peakAt: number;
  troughAt: number;
  /** Return over the window. */
  windowReturn: number;
}

export function drawdownStats(points: ValuePoint[]): Drawdown | null {
  if (points.length < 2) return null;
  let maxDrawdown = 0;
  let troughAt = points[0].t;
  let peakAt = points[0].t;
  let runningPeakAt = points[0].t;
  let peak = points[0].value;
  for (const p of points) {
    if (p.value >= peak) {
      peak = p.value;
      runningPeakAt = p.t;
    }
    if (p.drawdown < maxDrawdown) {
      maxDrawdown = p.drawdown;
      troughAt = p.t;
      peakAt = runningPeakAt;
    }
  }
  return { maxDrawdown, peakAt, troughAt, windowReturn: points[points.length - 1].value / points[0].value - 1 };
}

export interface VarCheck {
  /** Days on which the realised loss exceeded the VaR forecast made a day earlier. */
  exceptions: number;
  days: number;
  expected: number;
  /** The worst realised loss against its forecast, as fractions of value. */
  worstLoss: number;
  worstForecast: number;
  worstAt: number;
  verdict: "in line" | "watch" | "optimistic";
}

/**
 * The model marked against what happened: each hour's VaR forecast for the
 * next day, against the book's actual move over that day. At 95% about one
 * day in twenty should breach. Many more means the model is too calm for
 * this book; none at all, over a short window, means nothing yet.
 */
export function varCheck(
  forecast: { t: number; value: number; varPct: number }[],
  periodsPerDay: number,
  confidence = 0.95
): VarCheck | null {
  const k = Math.max(1, Math.round(periodsPerDay));
  if (forecast.length <= k) return null;
  const byT = new Map(forecast.map((p) => [p.t, p]));
  let exceptions = 0;
  let days = 0;
  let worstLoss = 0;
  let worstForecast = 0;
  let worstAt = forecast[0].t;
  // Non-overlapping days, stepping a day at a time from the first forecast.
  for (let i = 0; i + k < forecast.length; i += k) {
    const now = forecast[i];
    const later = byT.get(forecast[i + k].t)!;
    const realised = later.value / now.value - 1;
    days++;
    const loss = -realised;
    if (loss > now.varPct / 100) exceptions++;
    if (loss - now.varPct / 100 > worstLoss - worstForecast) {
      worstLoss = loss;
      worstForecast = now.varPct / 100;
      worstAt = later.t;
    }
  }
  if (!days) return null;
  const expected = days * (1 - confidence);
  const verdict: VarCheck["verdict"] = exceptions <= Math.ceil(expected) + 1 ? "in line" : exceptions <= Math.ceil(expected) + 3 ? "watch" : "optimistic";
  return { exceptions, days, expected, worstLoss, worstForecast, worstAt, verdict };
}

// ── Risk and return, asset by asset ──────────────────────────────

export interface RiskReturnPoint {
  symbol: string;
  /** Annualised volatility, percent, on the EWMA estimator. */
  volPct: number;
  /** Return over the window, as a fraction. */
  ret: number;
  weight: number;
  held: boolean;
}

export function riskReturnMap(
  history: Record<string, PricePoint[]>,
  returnsBySymbol: Record<string, number[]>,
  weights: Record<string, number>,
  periodsPerDay: number,
  annualise: (sigmaDaily: number) => number
): RiskReturnPoint[] {
  const lambda = scaleLambdaToFrequency(DEFAULT_LAMBDA, periodsPerDay);
  const out: RiskReturnPoint[] = [];
  for (const [symbol, r] of Object.entries(returnsBySymbol)) {
    const series = history[symbol];
    if (!series || series.length < 3 || r.length < 2) continue;
    const variance = ewmaCovariance(r, r, lambda);
    const sigmaDaily = Math.sqrt(Math.max(0, variance)) * Math.sqrt(periodsPerDay);
    const first = series[0].price;
    const last = series[series.length - 1].price;
    if (!(first > 0) || !(last > 0)) continue;
    out.push({ symbol, volPct: annualise(sigmaDaily), ret: last / first - 1, weight: weights[symbol] ?? 0, held: (weights[symbol] ?? 0) > 0 });
  }
  return out.sort((a, b) => b.weight - a.weight);
}
