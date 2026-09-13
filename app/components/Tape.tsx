"use client";

import type { History } from "@/lib/history";
import { moveSinceClose, type MarketStatus } from "@/lib/market-hours";
import { price as fmtPrice, signedPct } from "@/lib/format";
import { ASSETS } from "@/lib/universe";

/**
 * The tape: every xStock in the universe with its token price and its
 * move since the last official close, passing under the hero. While the
 * NYSE is closed it is the whole point of the desk in one line, these
 * are prices no exchange has confirmed. While it is open it is the day
 * so far. The row is rendered twice so the loop never shows a seam.
 */
export function Tape({
  history,
  prices,
  market,
}: {
  history: History | null;
  prices: Record<string, number> | null;
  market: MarketStatus;
}) {
  if (!history || !prices) return null;

  const rows = ASSETS.filter((a) => a.class === "equity")
    .map((a) => {
      const now = prices[a.symbol];
      const m = now > 0 ? moveSinceClose(history.series[a.symbol] ?? [], market.lastClose, now) : null;
      return m ? { symbol: a.symbol, price: now, changePct: m.changePct } : null;
    })
    .filter((r): r is { symbol: string; price: number; changePct: number } => r !== null);
  if (rows.length < 4) return null;

  // Reading pace: about three seconds per name, whatever the count.
  const duration = `${Math.round(rows.length * 3)}s`;
  const lead = market.open ? "Today vs the last close" : "Since the close";

  const Row = ({ ariaHidden }: { ariaHidden?: boolean }) => (
    <div className="flex shrink-0 items-center" aria-hidden={ariaHidden}>
      <span className="label mr-5 shrink-0" style={{ color: "var(--brand)" }}>{lead}</span>
      {rows.map((r) => (
        <span key={r.symbol} className="numeric mr-6 flex shrink-0 items-baseline gap-1.5 text-[11px]">
          <span className="font-medium text-text">{r.symbol}</span>
          <span className="text-tertiary">{fmtPrice(r.price)}</span>
          <span style={{ color: r.changePct < 0 ? "var(--severe)" : r.changePct > 0 ? "var(--calm)" : "var(--text-tertiary)" }}>
            {signedPct(r.changePct)}
          </span>
        </span>
      ))}
    </div>
  );

  return (
    <div
      className="tape-wrap print-hide overflow-hidden border-b border-border bg-bg-subtle py-1.5"
      role="region"
      aria-label={`${lead}: every xStock's token move`}
      tabIndex={0}
    >
      <div className="tape" style={{ "--tape-duration": duration } as React.CSSProperties}>
        <Row />
        <Row ariaHidden />
      </div>
    </div>
  );
}
