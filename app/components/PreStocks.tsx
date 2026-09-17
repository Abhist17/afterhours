"use client";

import { PRESTOCKS_BY_SYMBOL, PRESTOCKS_PRICES, PRESTOCKS_SNAPSHOT_AT } from "@/lib/prestocks";
import { usd, amount as fmtAmount, timeAgo } from "@/lib/format";

/**
 * What a wallet holds in tokenized pre-IPO equity, beside the book but not
 * inside it. Priced from PreStocks; never scored, since the score is built
 * on a public listing's hourly prints and a private company has none.
 */
export function PreStocksHoldings({ held }: { held: Record<string, number> }) {
  const rows = Object.entries(held)
    .filter(([, amt]) => amt > 0)
    .map(([symbol, amt]) => {
      const meta = PRESTOCKS_BY_SYMBOL[symbol];
      const px = PRESTOCKS_PRICES[symbol] ?? 0;
      return { symbol, amt, meta, value: amt * px, px };
    })
    .sort((a, b) => b.value - a.value);

  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.value, 0);

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="label flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        Private markets, via PreStocks
        <span className="normal-case tracking-normal text-tertiary">not part of the book above, no risk model behind it</span>
      </p>
      <div className="mt-2 space-y-1.5">
        {rows.map((r) => (
          <div key={r.symbol} className="flex items-center justify-between gap-3 text-[12.5px]">
            <span className="flex items-center gap-2 text-text">
              <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: "var(--brand)" }} />
              <span className="font-medium">{r.meta?.name ?? r.symbol}</span>
              <span className="hidden text-[11px] text-tertiary sm:inline">{r.meta?.industry}</span>
            </span>
            <span className="numeric flex items-center gap-3 text-secondary">
              <span className="text-tertiary">{fmtAmount(r.amt)} @ {usd(r.px)}</span>
              <span className="font-medium text-text">{usd(r.value)}</span>
              {r.meta && (
                <a href={r.meta.externalUrl} target="_blank" rel="noopener noreferrer" className="text-tertiary hover:text-text" title={`${r.meta.name} on PreStocks`}>
                  ↗
                </a>
              )}
            </span>
          </div>
        ))}
      </div>
      <p className="numeric mt-2 flex items-center justify-between text-[12.5px]">
        <span className="text-tertiary">Total, outside the book</span>
        <span className="font-medium text-text">{usd(total)}</span>
      </p>
      <p className="mt-2 text-[10px] leading-snug text-tertiary">
        PreStocks tokens are backed 1:1 by SPV exposure to a private company; prices are a snapshot from{" "}
        <a href="https://prestocks.com" target="_blank" rel="noopener noreferrer" className="underline decoration-border-strong underline-offset-2 hover:text-text">
          prestocks.com
        </a>{" "}
        as of {timeAgo(Date.parse(PRESTOCKS_SNAPSHOT_AT))}. No public listing means no thirty-day series to score against, so these sit beside the book, not in it.
      </p>
    </div>
  );
}
