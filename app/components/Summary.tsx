"use client";

import type { Analysis } from "@/lib/portfolio";
import { usd, pct, signedUsd, signedPct, riskBand } from "@/lib/format";
import { RiskDial } from "./RiskDial";
import { Term } from "./Term";

/**
 * The dial and four figures, as one instrument. The fourth figure is the
 * one a brokerage never shows: how much of the book is stock that is
 * trading right now without the stock market, and where it has gone
 * since the last print.
 */
export function Summary({ a }: { a: Analysis }) {
  const band = riskBand(a.score);
  const beta = a.risk.beta;
  const closed = !a.market.open && a.overnight.counted > 0;

  const metrics: { label: string; term?: string; value: string; detail: string; color?: string }[] = [
    {
      label: "Book",
      value: usd(a.total),
      detail: `${a.holdings.length} position${a.holdings.length === 1 ? "" : "s"} · ${pct(a.sleeves[0].valueShare * 100, 0)} tokenized stock`,
    },
    {
      label: "Value at Risk · 1d",
      term: "Value at Risk",
      value: usd(a.risk.headlineVarUsd),
      detail:
        a.risk.coverage < 0.995 && a.risk.uncovered.length > 0
          ? `Expected shortfall ${usd(a.risk.headlineEsUsd)} · 95% · covers ${pct(a.risk.coverage * 100, 0)} of the book`
          : `Expected shortfall ${usd(a.risk.headlineEsUsd)} · 95% · ${a.risk.headlineModel}`,
    },
    {
      label: "Beta to S&P 500",
      term: "Beta",
      value: beta === null ? "n/a" : `${beta.toFixed(2)}×`,
      detail:
        beta === null
          ? "No index series loaded"
          : beta > 1.15
            ? "Moves more than the market"
            : beta < 0.85
              ? "Moves less than the market"
              : "Moves with the market",
    },
    {
      label: closed ? "Since the close" : "Overnight exposure",
      term: closed ? "Since the close" : undefined,
      value: closed ? signedUsd(a.overnight.moveUsd) : usd(a.overnight.equityValue),
      color: closed ? (a.overnight.moveUsd < 0 ? "var(--severe)" : a.overnight.moveUsd > 0 ? "var(--calm)" : undefined) : undefined,
      detail: closed
        ? `${signedPct(a.overnight.movePct)} across ${a.overnight.counted} stock${a.overnight.counted === 1 ? "" : "s"} · the market opens to this`
        : `${pct(a.overnight.equityShare * 100, 0)} of the book keeps trading after 4pm ET`,
    },
  ];

  return (
    <section className="card enter overflow-hidden">
      <div className="flex flex-col lg:flex-row">
        <div className="flex shrink-0 items-center gap-5 border-b border-border px-6 py-5 lg:border-b-0 lg:border-r">
          <RiskDial score={a.score} size={124} showLabel={false} />
          <div className="min-w-0">
            <p className="label"><Term term="Risk score">Risk score</Term></p>
            <p className="mt-1 text-[13px] font-semibold" style={{ color: band.color }}>{band.label}</p>
            <p className="mt-1 max-w-[22ch] text-[11px] leading-snug text-tertiary">
              {band.description} · {a.risk.annualisedVolPct.toFixed(0)}% annualised
              {a.concentration.penalty > 0.5 ? ` + ${a.concentration.penalty.toFixed(0)} concentration` : ""}
            </p>
          </div>
        </div>
        <dl className="grid flex-1 grid-cols-2 gap-px bg-border xl:grid-cols-4">
          {metrics.map((m) => (
            <div key={m.label} className="min-w-0 bg-surface px-5 py-4">
              <dt className="label">{m.term ? <Term term={m.term}>{m.label}</Term> : m.label}</dt>
              <dd className="display mt-1.5 truncate text-[22px] leading-none text-text xl:text-[24px]" style={m.color ? { color: m.color } : undefined}>{m.value}</dd>
              <p className="mt-1.5 text-[11px] leading-snug text-tertiary">{m.detail}</p>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
