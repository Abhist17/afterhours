import {
  calculatePortfolioRisk,
  computeReturns,
  concentrationPenalty,
  correlationMatrix,
  rollingRisk,
  blendedScore,
  scaleLambdaToFrequency,
  DEFAULT_LAMBDA,
  type PortfolioRisk,
  type Concentration,
  type BacktestPoint,
  type Contribution,
} from "./quant";
import { marketStatus, moveSinceClose, type MarketStatus } from "./market-hours";
import { BY_SYMBOL, MARKET_SYMBOL, type Asset, type AssetClass, type Sector } from "./universe";
import type { History } from "./history";

/**
 * One pass from what a wallet holds to everything the page says about it.
 * Pure: prices, history and the clock come in as arguments, so a sample book
 * and a real one go through exactly the same arithmetic.
 */

export interface Holding {
  asset: Asset;
  symbol: string;
  amount: number;
  price: number;
  value: number;
  weight: number;
  /** Token move since the underlying's last print; equities only. */
  sinceClose: { atClose: number; changePct: number; moveUsd: number } | null;
  /** From the risk attribution; null when the asset has no series. */
  riskShare: number | null;
  beta: number | null;
}

export interface Sleeve {
  key: AssetClass;
  label: string;
  value: number;
  valueShare: number;
  riskShare: number;
  symbols: string[];
}

export interface SectorLine {
  sector: Sector;
  value: number;
  valueShare: number;
  riskShare: number;
  symbols: string[];
}

export interface Analysis {
  holdings: Holding[];
  total: number;
  risk: PortfolioRisk;
  concentration: Concentration;
  score: number;
  sleeves: Sleeve[];
  sectors: SectorLine[];
  /**
   * The crypto that is not called crypto: COIN, MSTR, HOOD, CRCL. How much
   * of the equity sleeve they are, how much risk they carry, and how they
   * move with SOL.
   */
  cryptoLinked: { valueShareOfEquities: number; riskShare: number; corrToSol: number | null; symbols: string[] };
  market: MarketStatus;
  /** Equities trading while the underlying market is closed. */
  overnight: { equityValue: number; equityShare: number; moveUsd: number; movePct: number; counted: number };
  correlation: { symbols: string[]; matrix: number[][] };
  backtest: BacktestPoint[];
  unpriced: string[];
  periodsPerDay: number;
}

const SLEEVE_LABEL: Record<AssetClass, string> = {
  equity: "Tokenized stocks",
  crypto: "Crypto",
  cash: "Cash",
};

export function analyse(
  amounts: Record<string, number>,
  prices: Record<string, number>,
  history: History,
  now: number = Date.now()
): Analysis {
  const market = marketStatus(now);

  // Price the book. Anything without a quote is reported, not zeroed away.
  const unpriced: string[] = [];
  const priced: { asset: Asset; amount: number; price: number; value: number }[] = [];
  for (const [symbol, amount] of Object.entries(amounts)) {
    const asset = BY_SYMBOL[symbol];
    if (!asset || !(amount > 0)) continue;
    const price = prices[symbol];
    if (!(price > 0)) {
      unpriced.push(symbol);
      continue;
    }
    priced.push({ asset, amount, price, value: amount * price });
  }
  const total = priced.reduce((s, h) => s + h.value, 0);

  // Returns for everything with a series, not just what is held: beta needs
  // the index, and the correlation grid is more useful with the neighbours.
  const returnsBySymbol: Record<string, number[]> = {};
  for (const [symbol, points] of Object.entries(history.series)) {
    const r = computeReturns(points.map((p) => p.price));
    if (r.length >= 2) returnsBySymbol[symbol] = r;
  }

  const weightsBySymbol = Object.fromEntries(priced.map((h) => [h.asset.symbol, h.value / (total || 1)]));

  const risk = calculatePortfolioRisk({
    portfolioValue: total,
    weightsBySymbol,
    returnsBySymbol,
    periodsPerDay: history.periodsPerDay,
    marketSymbol: MARKET_SYMBOL,
  });
  const concentration = concentrationPenalty(priced.map((h) => h.value / (total || 1)));
  const score = blendedScore(risk.sigmaDaily, concentration.penalty);

  const byContribution = new Map<string, Contribution>(risk.contributions.map((c) => [c.symbol, c]));

  const holdings: Holding[] = priced
    .map(({ asset, amount, price, value }) => {
      const c = byContribution.get(asset.symbol);
      let sinceClose: Holding["sinceClose"] = null;
      if (asset.class === "equity" && !market.open) {
        const m = moveSinceClose(history.series[asset.symbol] ?? [], market.lastClose, price);
        if (m) sinceClose = { atClose: m.atClose, changePct: m.changePct, moveUsd: (m.changePct / 100) * value };
      }
      return {
        asset,
        symbol: asset.symbol,
        amount,
        price,
        value,
        weight: total > 0 ? value / total : 0,
        sinceClose,
        riskShare: c ? c.riskShare : null,
        beta: c ? c.beta : null,
      };
    })
    .sort((a, b) => b.value - a.value);

  // Sleeves and sectors: value share from prices, risk share from the
  // attribution, so the two can disagree — which is the point.
  const sleeveOf = (key: AssetClass): Sleeve => {
    const members = holdings.filter((h) => h.asset.class === key);
    const value = members.reduce((s, h) => s + h.value, 0);
    return {
      key,
      label: SLEEVE_LABEL[key],
      value,
      valueShare: total > 0 ? value / total : 0,
      riskShare: members.reduce((s, h) => s + (h.riskShare ?? 0), 0),
      symbols: members.map((h) => h.symbol),
    };
  };
  const sleeves = (["equity", "crypto", "cash"] as AssetClass[]).map(sleeveOf);

  const sectorMap = new Map<Sector, SectorLine>();
  for (const h of holdings) {
    const line = sectorMap.get(h.asset.sector) ?? {
      sector: h.asset.sector, value: 0, valueShare: 0, riskShare: 0, symbols: [],
    };
    line.value += h.value;
    line.riskShare += h.riskShare ?? 0;
    line.symbols.push(h.symbol);
    sectorMap.set(h.asset.sector, line);
  }
  const sectors = [...sectorMap.values()]
    .map((l) => ({ ...l, valueShare: total > 0 ? l.value / total : 0 }))
    .sort((a, b) => b.value - a.value);

  const equityValue = sleeves[0].value;
  const linked = holdings.filter((h) => h.asset.sector === "crypto-linked equity");
  const linkedValue = linked.reduce((s, h) => s + h.value, 0);
  const sol = returnsBySymbol.SOL;
  let corrToSol: number | null = null;
  if (sol && linked.length) {
    const lam = scaleLambdaToFrequency(DEFAULT_LAMBDA, history.periodsPerDay);
    // Value-weighted average correlation of the linked names with SOL.
    const { symbols, matrix } = correlationMatrix(returnsBySymbol, ["SOL", ...linked.map((h) => h.symbol)], lam);
    if (symbols[0] === "SOL" && symbols.length > 1) {
      let acc = 0;
      let w = 0;
      for (let i = 1; i < symbols.length; i++) {
        const h = linked.find((x) => x.symbol === symbols[i])!;
        acc += matrix[0][i] * h.value;
        w += h.value;
      }
      corrToSol = w > 0 ? acc / w : null;
    }
  }
  const cryptoLinked = {
    valueShareOfEquities: equityValue > 0 ? linkedValue / equityValue : 0,
    riskShare: linked.reduce((s, h) => s + (h.riskShare ?? 0), 0),
    corrToSol,
    symbols: linked.map((h) => h.symbol),
  };

  const equities = holdings.filter((h) => h.asset.class === "equity");
  const withMove = equities.filter((h) => h.sinceClose);
  const moveUsd = withMove.reduce((s, h) => s + (h.sinceClose?.moveUsd ?? 0), 0);
  const movedValue = withMove.reduce((s, h) => s + h.value, 0);
  const overnight = {
    equityValue,
    equityShare: total > 0 ? equityValue / total : 0,
    moveUsd,
    movePct: movedValue > 0 ? (moveUsd / (movedValue - moveUsd)) * 100 : 0,
    counted: withMove.length,
  };

  // Correlation grid over what is held plus the index, non-cash only.
  const gridSymbols = [
    ...new Set([MARKET_SYMBOL, ...holdings.filter((h) => h.asset.class !== "cash").map((h) => h.symbol)]),
  ];
  const correlation = correlationMatrix(
    returnsBySymbol,
    gridSymbols,
    scaleLambdaToFrequency(DEFAULT_LAMBDA, history.periodsPerDay)
  );

  const backtest = rollingRisk(history.series, amounts, { periodsPerDay: history.periodsPerDay });

  return {
    holdings, total, risk, concentration, score, sleeves, sectors, cryptoLinked,
    market, overnight, correlation, backtest, unpriced, periodsPerDay: history.periodsPerDay,
  };
}
