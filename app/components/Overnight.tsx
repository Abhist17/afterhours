"use client";

import type { Analysis } from "@/lib/portfolio";
import { formatEastern } from "@/lib/market-hours";
import { usd, signedUsd, signedPct, untilTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { GapBars, VarianceSplit } from "./Sessions";

/**
 * The premise, as a panel. When the NYSE is closed the tokens keep trading,
 * and each one's move since the last official print is a bet the holder is
 * carrying with nobody on the other side. When it is open, the panel says
 * how long until that starts again. Below either: every close the window
 * had, and how much of the book's variance came in closed hours.
 */
export function Overnight({ a }: { a: Analysis }) {
  useNow(30_000);
  const m = a.market;
  const equities = a.holdings.filter((h) => h.asset.class === "equity");

  if (equities.length === 0) {
    return (
      <p className="px-4 py-4 text-xs leading-relaxed text-tertiary">
        No tokenized stocks in this book, so nothing here trades without its market.
      </p>
    );
  }

  const reason = m.reason === "weekend" ? "the weekend" : m.reason === "holiday" ? "a market holiday" : "the night";
  const rows = equities.filter((h) => h.sinceClose).sort((x, y) => Math.abs(y.sinceClose!.moveUsd) - Math.abs(x.sinceClose!.moveUsd));

  return (
    <div className="px-4 py-3.5">
      {m.open ? (
        <>
          <p className="text-[13px] text-text">
            NYSE is open. The shares behind {equities.length} position{equities.length === 1 ? "" : "s"} are trading alongside their tokens.
          </p>
          <p className="mt-1.5 text-[11px] leading-snug text-tertiary">
            Closes in {untilTime(m.nextClose)} at {formatEastern(m.nextClose)}. From then until {formatEastern(m.nextOpen)}, {usd(a.overnight.equityValue)} of this book — {(a.overnight.equityShare * 100).toFixed(0)}% — prices on Solana alone.
          </p>
        </>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <span className="numeric text-2xl font-medium" style={{ color: a.overnight.moveUsd < 0 ? "var(--severe)" : a.overnight.moveUsd > 0 ? "var(--calm)" : "var(--text)" }}>
              {signedUsd(a.overnight.moveUsd)}
            </span>
            <span className="numeric text-[11px] text-tertiary">{signedPct(a.overnight.movePct)} since {formatEastern(m.lastClose)}</span>
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-tertiary">
            The tokens have traded through {reason} for {m.hoursClosed.toFixed(0)}h without their shares. This is where they say the market will open, in {untilTime(m.nextOpen)}.
          </p>
          <ul className="mt-3 space-y-1.5" role="list">
            {rows.map((h) => (
              <li key={h.symbol} className="flex items-baseline justify-between gap-3 text-[12px]">
                <span className="text-text">
                  {h.symbol}
                  <span className="ml-1.5 text-[11px] text-tertiary">{h.asset.underlying}</span>
                </span>
                <span className="numeric text-secondary">
                  <span style={{ color: h.sinceClose!.changePct < 0 ? "var(--severe)" : h.sinceClose!.changePct > 0 ? "var(--calm)" : "var(--text-tertiary)" }}>
                    {signedPct(h.sinceClose!.changePct)}
                  </span>
                  <span className="ml-2 text-tertiary">{signedUsd(h.sinceClose!.moveUsd)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {a.sessions.gaps.length >= 2 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="label mb-2">The last closes</p>
          <GapBars gaps={a.sessions.gaps} equityValue={a.overnight.equityValue} />
        </div>
      )}

      <div className="mt-4 border-t border-border pt-3">
        <p className="label mb-2">Where the moves happen</p>
        <VarianceSplit a={a} />
      </div>
    </div>
  );
}
