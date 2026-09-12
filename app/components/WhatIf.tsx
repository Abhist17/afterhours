"use client";

import { useMemo, useState } from "react";
import type { History } from "@/lib/history";
import type { Quotes } from "@/lib/prices";
import { analyse } from "@/lib/portfolio";
import { ASSETS, BY_SYMBOL } from "@/lib/universe";
import { usd, riskBand } from "@/lib/format";
import { Button } from "./ui";

const FRACTIONS = [
  { value: 0.25, label: "¼" },
  { value: 0.5, label: "½" },
  { value: 1, label: "all" },
];

/**
 * "What if I moved some of this into that?" Re-scores the book with a share
 * of one position moved into another asset at the last quote — same
 * history, same estimator, in the browser, instantly. Value is preserved:
 * a rebalance changes a book's shape, not its size.
 */
export function WhatIf({
  amounts,
  history,
  quotes,
  now,
}: {
  amounts: Record<string, number>;
  history: History;
  quotes: Quotes;
  now: number;
}) {
  const held = Object.keys(amounts).filter((s) => amounts[s] > 0 && quotes.prices[s] > 0);
  const [from, setFrom] = useState(held[0] ?? "");
  const [to, setTo] = useState("SPYx");
  const [fraction, setFraction] = useState<number>(0.5);

  const fromSymbol = held.includes(from) ? from : held[0] ?? "";
  const toSymbol = to === fromSymbol ? (fromSymbol === "USDC" ? "SPYx" : "USDC") : to;

  const result = useMemo(() => {
    if (!fromSymbol || !toSymbol || !(quotes.prices[toSymbol] > 0)) return null;
    const before = analyse(amounts, quotes.prices, history, now);
    const movedUsd = amounts[fromSymbol] * quotes.prices[fromSymbol] * fraction;
    const next = { ...amounts };
    next[fromSymbol] = amounts[fromSymbol] * (1 - fraction);
    next[toSymbol] = (next[toSymbol] ?? 0) + movedUsd / quotes.prices[toSymbol];
    const after = analyse(next, quotes.prices, history, now);
    return { before, after, movedUsd };
  }, [amounts, fromSymbol, toSymbol, fraction, quotes, history, now]);

  if (!held.length) return <p className="px-4 py-4 text-xs text-tertiary">Nothing to move yet.</p>;

  const select = "numeric h-6 rounded-md border border-border bg-bg-subtle px-1.5 text-[11px] text-text focus:border-focus focus:outline-none";

  return (
    <div className="px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-tertiary">
        <span>Move</span>
        <span className="flex gap-1">
          {FRACTIONS.map((f) => (
            <Button key={f.value} size="sm" variant={fraction === f.value ? "primary" : "secondary"} onClick={() => setFraction(f.value)} className="!h-6 !px-2 !text-[11px]" aria-pressed={fraction === f.value}>
              {f.label}
            </Button>
          ))}
        </span>
        <span>of</span>
        <select value={fromSymbol} onChange={(e) => setFrom(e.target.value)} aria-label="Asset to move from" className={select}>
          {held.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span>into</span>
        <select value={toSymbol} onChange={(e) => setTo(e.target.value)} aria-label="Asset to move into" className={select}>
          {ASSETS.filter((a) => a.symbol !== fromSymbol && quotes.prices[a.symbol] > 0).map((a) => (
            <option key={a.symbol} value={a.symbol}>{a.symbol}</option>
          ))}
        </select>
      </div>

      {result && (
        <Outcome before={result.before} after={result.after} movedUsd={result.movedUsd} from={fromSymbol} to={toSymbol} />
      )}
    </div>
  );
}

function Outcome({
  before, after, movedUsd, from, to,
}: {
  before: ReturnType<typeof analyse>;
  after: ReturnType<typeof analyse>;
  movedUsd: number;
  from: string;
  to: string;
}) {
  const delta = after.score - before.score;
  const b0 = riskBand(before.score);
  const b1 = riskBand(after.score);
  const rows = [
    { label: "Value at Risk", from: usd(before.risk.headlineVarUsd), to: usd(after.risk.headlineVarUsd) },
    { label: "Beta to S&P", from: before.risk.beta === null ? "—" : `${before.risk.beta.toFixed(2)}×`, to: after.risk.beta === null ? "—" : `${after.risk.beta.toFixed(2)}×` },
    { label: "Stocks", from: `${(before.sleeves[0].valueShare * 100).toFixed(0)}%`, to: `${(after.sleeves[0].valueShare * 100).toFixed(0)}%` },
    { label: "Effective assets", from: before.concentration.effectiveAssets.toFixed(1), to: after.concentration.effectiveAssets.toFixed(1) },
  ];
  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="numeric text-[15px] font-medium" style={{ color: b0.color }}>{before.score.toFixed(1)}</span>
        <span className="text-tertiary" aria-hidden="true">→</span>
        <span className="numeric text-[15px] font-medium" style={{ color: b1.color }}>{after.score.toFixed(1)}</span>
        <span className="numeric text-[12px]" style={{ color: delta < 0 ? "var(--calm)" : delta > 0 ? "var(--severe)" : "var(--text-tertiary)" }}>
          {delta > 0 ? "+" : ""}{delta.toFixed(1)}
        </span>
        {b0.key !== b1.key && <span className="text-[11px] text-tertiary">{b0.label} → <span style={{ color: b1.color }}>{b1.label}</span></span>}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        {rows.map((r) => (
          <div key={r.label} className="min-w-0">
            <dt className="text-tertiary">{r.label}</dt>
            <dd className="numeric text-text"><span className="text-tertiary">{r.from}</span><span className="mx-1 text-tertiary" aria-hidden="true">→</span>{r.to}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[10px] leading-snug text-tertiary">
        Moves {usd(movedUsd)} of {from} into {BY_SYMBOL[to]?.name ?? to} at the last quote; the book keeps its value and changes shape.
      </p>
    </div>
  );
}
