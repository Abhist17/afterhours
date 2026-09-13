/**
 * Quant core, pure functions, no I/O, no clock.
 *
 * The estimators here (EWMA covariance with frequency-aware decay, parametric
 * and historical VaR, Expected Shortfall, Euler attribution, continuous
 * concentration) follow the same design as the author's earlier engine,
 * Sentra (github.com/Abhist17/sentra, MIT). What is new is what a book of
 * tokenized stocks needs and a crypto book does not: beta to the index, a
 * rolling backtest of the current allocation, and drift against a target.
 */

export interface PricePoint {
  /** Unix milliseconds. */
  t: number;
  price: number;
}

// ── Returns and moments ──────────────────────────────────────────

/**
 * Simple returns between consecutive prices. A non-positive price on either
 * side is a feed glitch, not a −100% day, so the pair is skipped rather than
 * poisoning every variance downstream.
 */
export function computeReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    const cur = prices[i];
    if (!(prev > 0) || !(cur > 0) || !Number.isFinite(prev) || !Number.isFinite(cur)) continue;
    out.push((cur - prev) / prev);
  }
  return out;
}

/**
 * Thin tokens print badly: a stale or off-market trade can sit for hours as
 * a 40% jump that later unwinds. A liquid stock token almost never moves
 * 8% in an hour, so the share of hours that do is a fair thinness reading,
 * and clipping returns at that size keeps one bad print from owning the
 * covariance. Prices are never altered, only what the estimators see.
 */
export const THIN_HOURLY_MOVE = 0.08;
export const THIN_SHARE = 0.01;

export function thinness(returns: number[], threshold = THIN_HOURLY_MOVE): number {
  if (!returns.length) return 0;
  let n = 0;
  for (const r of returns) if (Math.abs(r) > threshold) n++;
  return n / returns.length;
}

export function winsorise(returns: number[], cap = THIN_HOURLY_MOVE): number[] {
  return returns.map((r) => (r > cap ? cap : r < -cap ? -cap : r));
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** RiskMetrics daily default; ~17 days of memory. */
export const DEFAULT_LAMBDA = 0.94;

/**
 * A daily decay applied to hourly observations would remember 17 hours, not
 * 17 days. Hold the memory constant in calendar terms instead.
 */
export function scaleLambdaToFrequency(dailyLambda: number, periodsPerDay: number): number {
  if (!(periodsPerDay > 1) || !(dailyLambda > 0 && dailyLambda < 1)) return dailyLambda;
  return Math.min(0.99999, Math.max(0.5, 1 - (1 - dailyLambda) / periodsPerDay));
}

/** Zero-mean exponentially weighted covariance over the most recent overlap. */
export function ewmaCovariance(a: number[], b: number[], lambda = DEFAULT_LAMBDA): number {
  const len = Math.min(a.length, b.length);
  if (len < 2) return 0;
  const sa = a.slice(a.length - len);
  const sb = b.slice(b.length - len);
  let weighted = 0;
  let weightSum = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.pow(lambda, len - 1 - i);
    weighted += w * sa[i] * sb[i];
    weightSum += w;
  }
  return weightSum > 0 ? weighted / weightSum : 0;
}

// ── Normal helpers ───────────────────────────────────────────────

export function normalPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

/** Acklam's inverse normal CDF, ~1e-9 accurate. */
export function normalQuantile(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pLow) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Overlapping k-period compounded returns, keeps the fat tails √k assumes away. */
export function aggregateReturns(returns: number[], k: number): number[] {
  const periods = Math.max(1, Math.round(k));
  if (periods === 1) return returns.slice();
  if (returns.length < periods) return [];
  const out: number[] = [];
  for (let end = periods; end <= returns.length; end++) {
    let growth = 1;
    for (let i = end - periods; i < end; i++) growth *= 1 + returns[i];
    out.push(growth - 1);
  }
  return out;
}

/** Median spacing between observations, in ms; null below three points. */
export function inferIntervalMs(points: PricePoint[]): number | null {
  if (points.length < 3) return null;
  const gaps: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const g = points[i].t - points[i - 1].t;
    if (g > 0) gaps.push(g);
  }
  if (!gaps.length) return null;
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
}

// ── Concentration ────────────────────────────────────────────────

export const MAX_CONCENTRATION_PENALTY = 20;
const DOMINANCE_FLOOR = 0.3;
const DOMINANCE_CEILING = 0.7;
/** Four effective names is where a book stops being a bet on one thing. */
const TARGET_ASSETS = 4;

export interface Concentration {
  penalty: number;
  maxWeight: number;
  hhi: number;
  effectiveAssets: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** The worse of dominance (largest weight) and spread (effective names); both continuous. */
export function concentrationPenalty(weights: number[]): Concentration {
  const usable = weights.filter((w) => Number.isFinite(w) && w > 0);
  if (!usable.length) return { penalty: 0, maxWeight: 0, hhi: 0, effectiveAssets: 0 };
  const total = usable.reduce((a, b) => a + b, 0);
  const shares = usable.map((w) => w / total);
  const maxWeight = Math.max(...shares);
  const hhi = shares.reduce((s, w) => s + w * w, 0);
  const effectiveAssets = hhi > 0 ? 1 / hhi : 0;
  const dominance = clamp01((maxWeight - DOMINANCE_FLOOR) / (DOMINANCE_CEILING - DOMINANCE_FLOOR));
  const spread = clamp01((TARGET_ASSETS - effectiveAssets) / (TARGET_ASSETS - 1));
  return { penalty: MAX_CONCENTRATION_PENALTY * Math.max(dominance, spread), maxWeight, hhi, effectiveAssets };
}

// ── Portfolio risk ───────────────────────────────────────────────

export interface RiskInputs {
  portfolioValue: number;
  weightsBySymbol: Record<string, number>;
  returnsBySymbol: Record<string, number[]>;
  periodsPerDay: number;
  horizonDays?: number;
  confidence?: number;
  lambda?: number;
  /** Symbol of the market index for beta; omitted when not in the universe. */
  marketSymbol?: string;
}

export interface Contribution {
  symbol: string;
  weight: number;
  riskShare: number;
  componentVarUsd: number;
  volHorizon: number;
  /** Sensitivity to the index; 1.0 moves with it, 0 is unrelated. */
  beta: number | null;
}

export interface PortfolioRisk {
  /** One-day volatility of the book, as a fraction. */
  sigmaDaily: number;
  /** Annualised over the token's 365-day calendar, in percent. */
  annualisedVolPct: number;
  sigmaHorizon: number;
  varPct: number;
  varUsd: number;
  esPct: number;
  esUsd: number;
  histVarPct: number;
  histVarUsd: number;
  histEsPct: number;
  histEsUsd: number;
  headlineVarPct: number;
  headlineVarUsd: number;
  headlineEsUsd: number;
  headlineModel: "parametric" | "historical";
  contributions: Contribution[];
  diversificationRatio: number;
  /** Value-weighted beta of the book to the index, or null without one. */
  beta: number | null;
  coverage: number;
  uncovered: string[];
  observations: number;
  independentObservations: number;
  lambdaApplied: number;
  horizonDays: number;
  confidence: number;
}

export const MIN_HISTORICAL_OBSERVATIONS = 30;

const EMPTY: PortfolioRisk = {
  sigmaDaily: 0, annualisedVolPct: 0,
  sigmaHorizon: 0, varPct: 0, varUsd: 0, esPct: 0, esUsd: 0,
  histVarPct: 0, histVarUsd: 0, histEsPct: 0, histEsUsd: 0,
  headlineVarPct: 0, headlineVarUsd: 0, headlineEsUsd: 0, headlineModel: "parametric",
  contributions: [], diversificationRatio: 1, beta: null,
  coverage: 0, uncovered: [], observations: 0, independentObservations: 0,
  lambdaApplied: DEFAULT_LAMBDA, horizonDays: 1, confidence: 0.95,
};

export function calculatePortfolioRisk(inputs: RiskInputs): PortfolioRisk {
  const {
    portfolioValue, weightsBySymbol, returnsBySymbol, periodsPerDay,
    horizonDays = 1, confidence = 0.95, lambda = DEFAULT_LAMBDA, marketSymbol,
  } = inputs;
  if (portfolioValue <= 0 || !(periodsPerDay > 0)) return { ...EMPTY, horizonDays, confidence };

  const symbols: string[] = [];
  const weights: number[] = [];
  const matrix: number[][] = [];
  const uncovered: string[] = [];
  let coveredWeight = 0;

  for (const [symbol, weight] of Object.entries(weightsBySymbol)) {
    if (!Number.isFinite(weight) || weight <= 0) continue;
    const series = returnsBySymbol[symbol];
    if (series && series.length >= 2) {
      symbols.push(symbol);
      weights.push(weight);
      matrix.push(series);
      coveredWeight += weight;
    } else {
      uncovered.push(symbol);
    }
  }
  if (!symbols.length) return { ...EMPTY, uncovered, horizonDays, confidence };

  const lambdaApplied = scaleLambdaToFrequency(lambda, periodsPerDay);
  const cov = (i: number, j: number) => ewmaCovariance(matrix[i], matrix[j], lambdaApplied);

  let variance = 0;
  for (let i = 0; i < symbols.length; i++)
    for (let j = 0; j < symbols.length; j++) variance += weights[i] * weights[j] * cov(i, j);

  const sigmaPeriod = Math.sqrt(Math.max(0, variance));
  const periodsInHorizon = periodsPerDay * horizonDays;
  const horizonScale = Math.sqrt(periodsInHorizon);
  const sigmaHorizon = sigmaPeriod * horizonScale;
  const sigmaDaily = sigmaPeriod * Math.sqrt(periodsPerDay);

  const z = normalQuantile(confidence);
  const varPct = Math.min(100, sigmaHorizon * z * 100);
  const esPct = Math.min(100, sigmaHorizon * (normalPdf(z) / (1 - confidence)) * 100);

  // Historical simulation on compounded horizon returns.
  const aligned = Math.min(...matrix.map((s) => s.length));
  const portfolioReturns: number[] = [];
  for (let i = 0; i < aligned; i++) {
    let r = 0;
    for (let a = 0; a < matrix.length; a++) r += weights[a] * matrix[a][matrix[a].length - aligned + i];
    portfolioReturns.push(r);
  }
  const horizonReturns = aggregateReturns(portfolioReturns, Math.round(periodsInHorizon));
  let histVarPct = 0;
  let histEsPct = 0;
  if (horizonReturns.length >= MIN_HISTORICAL_OBSERVATIONS) {
    const sorted = [...horizonReturns].sort((a, b) => a - b);
    const cutoff = quantile(sorted, 1 - confidence);
    histVarPct = Math.min(100, Math.max(0, -cutoff) * 100);
    const tail = sorted.filter((r) => r <= cutoff);
    if (tail.length) histEsPct = Math.min(100, Math.max(0, -mean(tail)) * 100);
  }

  const useHistorical = histVarPct > varPct;
  const headlineVarPct = useHistorical ? histVarPct : varPct;
  const headlineEsPct = useHistorical ? histEsPct : esPct;
  const headlineVarUsd = (headlineVarPct / 100) * portfolioValue;

  // Beta to the index, on the same estimator, whether or not it is held.
  const market = marketSymbol ? returnsBySymbol[marketSymbol] : undefined;
  const marketVar = market && market.length >= 2 ? ewmaCovariance(market, market, lambdaApplied) : 0;
  const betaOf = (series: number[]) =>
    market && marketVar > 0 ? ewmaCovariance(series, market, lambdaApplied) / marketVar : null;

  // Euler attribution: component VaRs sum to the total.
  const contributions: Contribution[] = [];
  let weightedStandaloneVol = 0;
  let bookBeta: number | null = market && marketVar > 0 ? 0 : null;
  if (sigmaPeriod > 0) {
    for (let i = 0; i < symbols.length; i++) {
      let covRow = 0;
      for (let j = 0; j < symbols.length; j++) covRow += weights[j] * cov(i, j);
      const marginal = covRow / sigmaPeriod;
      const riskShare = (weights[i] * marginal) / sigmaPeriod;
      const standaloneVol = Math.sqrt(Math.max(0, cov(i, i))) * horizonScale;
      weightedStandaloneVol += weights[i] * standaloneVol;
      const beta = betaOf(matrix[i]);
      if (bookBeta !== null && beta !== null) bookBeta += weights[i] * beta;
      contributions.push({
        symbol: symbols[i], weight: weights[i], riskShare,
        componentVarUsd: riskShare * headlineVarUsd, volHorizon: standaloneVol, beta,
      });
    }
    contributions.sort((a, b) => b.riskShare - a.riskShare);
  }

  return {
    sigmaDaily,
    annualisedVolPct: annualisedVolPct(sigmaDaily),
    sigmaHorizon,
    varPct, varUsd: (varPct / 100) * portfolioValue,
    esPct, esUsd: (esPct / 100) * portfolioValue,
    histVarPct, histVarUsd: (histVarPct / 100) * portfolioValue,
    histEsPct, histEsUsd: (histEsPct / 100) * portfolioValue,
    headlineVarPct, headlineVarUsd, headlineEsUsd: (headlineEsPct / 100) * portfolioValue,
    headlineModel: useHistorical ? "historical" : "parametric",
    contributions,
    diversificationRatio: sigmaHorizon > 0 && weightedStandaloneVol > 0 ? weightedStandaloneVol / sigmaHorizon : 1,
    beta: bookBeta,
    coverage: coveredWeight,
    uncovered,
    observations: horizonReturns.length,
    independentObservations: Math.floor(horizonReturns.length / Math.max(1, Math.round(periodsInHorizon))),
    lambdaApplied, horizonDays, confidence,
  };
}

// ── Correlation ──────────────────────────────────────────────────

export function correlationMatrix(
  returnsBySymbol: Record<string, number[]>,
  symbols: string[],
  lambda = DEFAULT_LAMBDA
): { symbols: string[]; matrix: number[][] } {
  const usable = symbols.filter((s) => Array.isArray(returnsBySymbol[s]) && returnsBySymbol[s].length >= 2);
  const variance = usable.map((s) => ewmaCovariance(returnsBySymbol[s], returnsBySymbol[s], lambda));
  const n = usable.length;
  const matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  // Each pair once, mirrored: exactly symmetric, half the work.
  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const d = Math.sqrt(variance[i] * variance[j]);
      const rho = d > 0
        ? Math.max(-1, Math.min(1, ewmaCovariance(returnsBySymbol[usable[i]], returnsBySymbol[usable[j]], lambda) / d))
        : 0;
      matrix[i][j] = rho;
      matrix[j][i] = rho;
    }
  }
  return { symbols: usable, matrix };
}

// ── Score ────────────────────────────────────────────────────────

/** Calm / Watch / Elevated / Severe. */
export const RISK_BANDS = [0, 25, 45, 70] as const;

/**
 * The tokens trade every calendar day, and the daily sigma is measured over
 * every calendar day, weekends included, flat as they are, so it is
 * annualised over the calendar the token keeps, not the exchange's 252.
 */
export const DAYS_PER_YEAR = 365;

export function annualisedVolPct(sigmaDaily: number): number {
  return sigmaDaily * Math.sqrt(DAYS_PER_YEAR) * 100;
}

/**
 * The score is annualised volatility, in percent, plus the concentration
 * penalty, capped at 100. Volatility rather than VaR because it is the
 * number equity holders already carry in their heads: an index book runs
 * near 15 to 20, a single large-cap 30 to 45, a crypto-heavy book 60 to 90, a
 * memecoin or leverage past 100. VaR stays the dollar figure, the loss
 * on a bad day, and the score says what kind of book this is.
 */
export function blendedScore(sigmaDaily: number, concentration: number): number {
  return Math.max(0, Math.min(100, annualisedVolPct(sigmaDaily) + concentration));
}

// ── Rolling backtest ─────────────────────────────────────────────

export interface BacktestPoint {
  t: number;
  value: number;
  varPct: number;
  varUsd: number;
  score: number;
}

/**
 * The current allocation, scored at every hour of the window as if it had
 * been held throughout: book value from the prices of the hour, covariance
 * from a recursive EWMA that has seen only what was known by then. Says how
 * risky this shape of book has been, not how risky the wallet was, the
 * wallet's real record is on the chain.
 */
export function rollingRisk(
  history: Record<string, PricePoint[]>,
  amounts: Record<string, number>,
  opts: { periodsPerDay: number; confidence?: number; lambda?: number; horizonDays?: number; warmup?: number; cap?: number }
): BacktestPoint[] {
  // A week of warm-up by default: the recursion is seeded with the sample
  // covariance of those hours rather than zeros, otherwise the first
  // fortnight of the chart is the estimator filling its memory, drawn as
  // if the book had been getting riskier.
  const { periodsPerDay, confidence = 0.95, lambda = DEFAULT_LAMBDA, horizonDays = 1, cap } = opts;
  const warmup = opts.warmup ?? Math.round(7 * periodsPerDay);
  const clip = (r: number) => (cap === undefined ? r : r > cap ? cap : r < -cap ? -cap : r);
  const symbols = Object.keys(amounts).filter((s) => amounts[s] > 0 && history[s]?.length > 2);
  if (!symbols.length || !(periodsPerDay > 0)) return [];

  // Align on timestamps every series has.
  const common = symbols
    .map((s) => new Set(history[s].map((p) => p.t)))
    .reduce((acc, set) => new Set([...acc].filter((t) => set.has(t))));
  const times = [...common].sort((a, b) => a - b);
  if (times.length < warmup + 2) return [];

  const priceAt = symbols.map((s) => {
    const byT = new Map(history[s].map((p) => [p.t, p.price]));
    return times.map((t) => byT.get(t)!);
  });

  const lam = scaleLambdaToFrequency(lambda, periodsPerDay);
  const n = symbols.length;
  const z = normalQuantile(confidence);
  const horizonScale = Math.sqrt(periodsPerDay * horizonDays);
  const out: BacktestPoint[] = [];

  const returnAt = (k: number) => priceAt.map((series) => clip((series[k] - series[k - 1]) / series[k - 1]));

  // Seed: zero-mean sample covariance over the warm-up window.
  const cov: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const seedEnd = Math.min(warmup, times.length - 1);
  for (let k = 1; k <= seedEnd; k++) {
    const r = returnAt(k);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cov[i][j] += r[i] * r[j];
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cov[i][j] /= Math.max(1, seedEnd);

  for (let k = seedEnd; k < times.length; k++) {
    if (k > seedEnd) {
      // Update the recursive covariance with this hour's returns.
      const r = returnAt(k);
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) cov[i][j] = lam * cov[i][j] + (1 - lam) * r[i] * r[j];
    }

    const values = symbols.map((s, i) => amounts[s] * priceAt[i][k]);
    const value = values.reduce((a, b) => a + b, 0);
    if (value <= 0) continue;
    const w = values.map((v) => v / value);

    let variance = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) variance += w[i] * w[j] * cov[i][j];
    const sigmaDaily = Math.sqrt(Math.max(0, variance)) * Math.sqrt(periodsPerDay);
    const varPct = Math.min(100, Math.sqrt(Math.max(0, variance)) * horizonScale * z * 100);
    const score = blendedScore(sigmaDaily, concentrationPenalty(w).penalty);
    out.push({ t: times[k], value, varPct, varUsd: (varPct / 100) * value, score });
  }
  return out;
}

// ── Drift against a target ───────────────────────────────────────

export interface Target {
  symbol: string;
  /** Target share of value, 0-1. */
  weight: number;
}

export interface DriftLine {
  symbol: string;
  target: number;
  actual: number;
  /** actual - target, in weight. */
  drift: number;
  /** Signed USD to trade to return to target: negative sells, positive buys. */
  tradeUsd: number;
}

export interface Drift {
  lines: DriftLine[];
  /** Largest absolute drift across lines, in weight. */
  maxDrift: number;
  /** Sum of absolute trades / 2, the one-way turnover to rebalance. */
  turnoverUsd: number;
  turnoverPct: number;
}

/**
 * Where the book stands against its stated targets, and the trades that
 * would put it back. Assets held but not targeted count as a 0% target;
 * targets not held count as a 0% actual. Weights are normalised so a target
 * list that sums to 99% still means what its author meant.
 */
export function driftAgainst(
  valuesBySymbol: Record<string, number>,
  targets: Target[]
): Drift {
  const total = Object.values(valuesBySymbol).reduce((a, b) => a + Math.max(0, b), 0);
  const targetSum = targets.reduce((a, t) => a + Math.max(0, t.weight), 0);
  const symbols = new Set([...Object.keys(valuesBySymbol), ...targets.map((t) => t.symbol)]);
  const lines: DriftLine[] = [];
  let maxDrift = 0;
  let gross = 0;

  for (const symbol of symbols) {
    const actual = total > 0 ? Math.max(0, valuesBySymbol[symbol] ?? 0) / total : 0;
    const raw = targets.find((t) => t.symbol === symbol)?.weight ?? 0;
    const target = targetSum > 0 ? Math.max(0, raw) / targetSum : 0;
    if (actual === 0 && target === 0) continue;
    const drift = actual - target;
    const tradeUsd = -drift * total;
    maxDrift = Math.max(maxDrift, Math.abs(drift));
    gross += Math.abs(tradeUsd);
    lines.push({ symbol, target, actual, drift, tradeUsd });
  }

  // Largest drift first; within a tenth of a point, largest position first,
  // so a book at its target lists by size rather than by rounding noise.
  lines.sort((a, b) => {
    const gap = Math.abs(b.drift) - Math.abs(a.drift);
    return Math.abs(gap) > 0.0005 ? gap : b.actual - a.actual;
  });
  const turnoverUsd = gross / 2;
  return { lines, maxDrift, turnoverUsd, turnoverPct: total > 0 ? turnoverUsd / total : 0 };
}
