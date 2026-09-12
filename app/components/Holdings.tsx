"use client";

import { Fragment, useState } from "react";
import type { Analysis } from "@/lib/portfolio";
import type { History } from "@/lib/history";
import { usd, price, amount, pct, signedPct, sectorColor } from "@/lib/format";
import { ASSETS, jupiterSwapUrl } from "@/lib/universe";
import { EmptyState } from "./ui";
import { Sparkline } from "./chart";
import { AssetChart } from "./AssetChart";
import { Term } from "./Term";

/**
 * Share of risk as a bar, with the position's weight as a tick on it, so
 * the eye sees the two disagree before reading either number.
 */
function RiskBar({ weight, risk, color }: { weight: number; risk: number; color: string }) {
  return (
    <span className="relative hidden h-1.5 w-10 overflow-hidden rounded-full bg-surface-hover sm:inline-block xl:hidden 2xl:inline-block" aria-hidden="true">
      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, Math.max(0, risk * 100))}%`, backgroundColor: color }} />
      <span className="absolute inset-y-0 w-px bg-text" style={{ left: `${Math.min(100, Math.max(0, weight * 100))}%` }} />
    </span>
  );
}

/** The window thinned to a few dozen points, for a sparkline. */
function thinned(series: { t: number; price: number }[] | undefined, points = 48): number[] {
  if (!series || series.length < 3) return [];
  const step = Math.max(1, Math.floor(series.length / points));
  const out: number[] = [];
  for (let i = 0; i < series.length; i += step) out.push(series[i].price);
  if (out[out.length - 1] !== series[series.length - 1].price) out.push(series[series.length - 1].price);
  return out;
}

export function Holdings({ a, history }: { a: Analysis; history: History }) {
  const [open, setOpen] = useState<string | null>(null);
  if (a.holdings.length === 0) {
    return (
      <EmptyState
        title="Nothing priced in this wallet"
        body={`It holds none of the ${ASSETS.filter((x) => x.class === "equity").length} xStocks, SOL, cbBTC or stablecoins the desk prices. Try a sample book to see the instrument working, or buy a first xStock on Jupiter.`}
        action={
          <a href={jupiterSwapUrl("USDC", "SPYx")} target="_blank" rel="noopener noreferrer" className="text-xs text-secondary underline decoration-border-strong underline-offset-2 hover:text-text">
            USDC → SPYx on Jupiter ↗
          </a>
        }
        compact
      />
    );
  }
  const closed = !a.market.open;
  const thin = new Set(a.thin.map((t) => t.symbol));
  const thinHeld = a.thin.filter((t) => a.holdings.some((h) => h.symbol === t.symbol));

  return (
    <div>
      <div className="flex h-1 gap-px px-4 pt-4">
        {a.holdings.map((h) => (
          <div
            key={h.symbol}
            className="h-full rounded-full"
            style={{ width: `${Math.max(h.weight * 100, 0.5)}%`, backgroundColor: sectorColor(h.asset.sector, h.asset.class) }}
          />
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border">
              <th className="label px-4 py-2.5 text-left font-semibold">Asset</th>
              <th className="label hidden px-3 py-2.5 text-left font-semibold md:table-cell xl:hidden 2xl:table-cell">30 days</th>
              <th className="label px-3 py-2.5 text-right font-semibold">Amount</th>
              <th className="label px-3 py-2.5 text-right font-semibold">Price</th>
              <th className="label whitespace-nowrap px-3 py-2.5 text-right font-semibold">{closed ? <Term term="Since the close">Since close</Term> : <Term term="Beta">Beta</Term>}</th>
              <th className="label px-3 py-2.5 text-right font-semibold">Value</th>
              <th className="label px-3 py-2.5 text-right font-semibold">Weight</th>
              <th className="label whitespace-nowrap px-3 py-2.5 text-right font-semibold"><Term term="Share of risk">Of risk</Term></th>
            </tr>
          </thead>
          <tbody>
            {a.holdings.map((h) => {
              const color = sectorColor(h.asset.sector, h.asset.class);
              const series = history.series[h.symbol];
              const expanded = open === h.symbol;
              const spark = thinned(series);
              const sparkColor = spark.length > 1 ? (spark[spark.length - 1] >= spark[0] ? "var(--calm)" : "var(--severe)") : "var(--text-tertiary)";
              return (
                <Fragment key={h.symbol}>
                  <tr
                    className={`cursor-pointer border-b border-border transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover ${expanded ? "bg-surface-hover" : ""}`}
                    onClick={() => setOpen(expanded ? null : h.symbol)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpen(expanded ? null : h.symbol);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-expanded={expanded}
                    aria-label={`${h.symbol}: show thirty days`}
                  >
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
                        <span className="font-medium text-text">{h.symbol}</span>
                        <span className="hidden whitespace-nowrap text-[11px] text-tertiary md:inline xl:hidden 2xl:inline">{h.asset.sector}</span>
                        {thin.has(h.symbol) && (
                          <span className="rounded border px-1 text-[9px] font-semibold uppercase tracking-wide" style={{ color: "var(--watch)", borderColor: "color-mix(in srgb, var(--watch) 40%, transparent)" }} title="Thin trading: hourly prints clipped at ±8% in the risk model">
                            thin
                          </span>
                        )}
                        <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true" className={`ml-0.5 shrink-0 text-tertiary transition-transform ${expanded ? "rotate-90" : ""}`}>
                          <path d="M3.5 2 6.5 5 3.5 8" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </td>
                    <td className="hidden px-3 py-1.5 md:table-cell xl:hidden 2xl:table-cell">
                      <Sparkline values={spark} color={h.asset.class === "cash" ? "var(--text-tertiary)" : sparkColor} minSpan={h.asset.class === "cash" ? h.price * 0.04 : 0} />
                    </td>
                    <td className="numeric px-3 py-2.5 text-right text-secondary">{amount(h.amount)}</td>
                    <td className="numeric px-3 py-2.5 text-right text-secondary">{price(h.price)}</td>
                    <td className="numeric px-3 py-2.5 text-right">
                      {closed ? (
                        h.sinceClose ? (
                          <span style={{ color: h.sinceClose.changePct < 0 ? "var(--severe)" : h.sinceClose.changePct > 0 ? "var(--calm)" : "var(--text-tertiary)" }}>
                            {signedPct(h.sinceClose.changePct)}
                          </span>
                        ) : (
                          <span className="text-tertiary">{h.asset.class === "equity" ? "—" : "24/7"}</span>
                        )
                      ) : h.beta === null ? (
                        <span className="text-tertiary">—</span>
                      ) : (
                        <span className="text-secondary">{h.beta.toFixed(2)}×</span>
                      )}
                    </td>
                    <td className="numeric px-3 py-2.5 text-right font-medium text-text">{usd(h.value)}</td>
                    <td className="numeric px-3 py-2.5 text-right text-secondary">{pct(h.weight * 100)}</td>
                    <td className="numeric px-3 py-2.5 text-right text-secondary">
                      <span className="inline-flex items-center justify-end gap-2">
                        {h.riskShare !== null && <RiskBar weight={h.weight} risk={h.riskShare} color={color} />}
                        <span
                          className="w-[4.5ch] text-right"
                          style={
                            h.riskShare === null
                              ? undefined
                              : h.riskShare > h.weight * 1.5 && h.riskShare - h.weight > 0.02
                                ? { color: "var(--elevated)" }
                                : h.riskShare < h.weight * 0.5 && h.weight - h.riskShare > 0.02
                                  ? { color: "var(--calm)" }
                                  : undefined
                          }
                        >
                          {h.riskShare === null ? "—" : pct(h.riskShare * 100)}
                        </span>
                      </span>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="border-b border-border bg-bg-subtle">
                      <td colSpan={8} className="px-3 pb-3 pt-2">
                        <AssetChart symbol={h.symbol} series={series ?? []} color={color} split={a.sessions.bySymbol[h.symbol]} underlying={h.asset.underlying} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border-strong">
              <td className="label px-4 py-2.5 font-semibold">Total</td>
              <td className="hidden md:table-cell xl:hidden 2xl:table-cell" />
              <td colSpan={3} />
              <td className="numeric px-3 py-2.5 text-right font-medium text-text">{usd(a.total)}</td>
              <td className="numeric px-3 py-2.5 text-right text-tertiary">100%</td>
              <td className="numeric px-3 py-2.5 text-right text-tertiary">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="space-y-0.5 px-4 pb-3 text-[11px] text-tertiary">
        <p>Click a position for its thirty days, with the hours its market was closed shaded.</p>
        {thinHeld.length > 0 && (
          <p>
            <span style={{ color: "var(--watch)" }}>Thin trading:</span> {thinHeld.map((t) => `${t.symbol} (${t.clipped} of ${Math.round(t.clipped / t.share)} hours moved more than 8%)`).join(", ")}. Their hourly prints are clipped at ±8% inside the risk model; the prices shown are the feed&rsquo;s own.
          </p>
        )}
        {a.risk.uncovered.length > 0 && (
          <p>
            Priced but outside the risk model, no thirty-day series yet: {a.risk.uncovered.join(", ")} — {pct((1 - a.risk.coverage) * 100, 0)} of the book.
          </p>
        )}
        {a.unpriced.length > 0 && <p>Held but without a quote this load: {a.unpriced.join(", ")}.</p>}
      </div>
    </div>
  );
}
