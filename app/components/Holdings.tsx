"use client";

import type { Analysis } from "@/lib/portfolio";
import { usd, price, amount, pct, signedPct, sectorColor } from "@/lib/format";
import { jupiterSwapUrl } from "@/lib/universe";
import { EmptyState } from "./ui";

export function Holdings({ a }: { a: Analysis }) {
  if (a.holdings.length === 0) {
    return (
      <EmptyState
        title="Nothing priced in this wallet"
        body="It holds none of the xStocks, SOL, USDC or USDT the desk prices. Try a sample book to see the instrument working, or buy a first xStock on Jupiter."
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
              <th className="label px-4 py-2.5 text-right font-semibold">Amount</th>
              <th className="label px-4 py-2.5 text-right font-semibold">Price</th>
              <th className="label px-4 py-2.5 text-right font-semibold">{closed ? "Since close" : "Beta"}</th>
              <th className="label px-4 py-2.5 text-right font-semibold">Value</th>
              <th className="label px-4 py-2.5 text-right font-semibold">Weight</th>
              <th className="label px-4 py-2.5 text-right font-semibold">Of risk</th>
            </tr>
          </thead>
          <tbody>
            {a.holdings.map((h) => (
              <tr key={h.symbol} className="border-b border-border last:border-0 transition-colors hover:bg-surface-hover">
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: sectorColor(h.asset.sector, h.asset.class) }} />
                    <span className="font-medium text-text">{h.symbol}</span>
                    <span className="hidden text-[11px] text-tertiary md:inline">{h.asset.sector}</span>
                  </span>
                </td>
                <td className="numeric px-4 py-2.5 text-right text-secondary">{amount(h.amount)}</td>
                <td className="numeric px-4 py-2.5 text-right text-secondary">{price(h.price)}</td>
                <td className="numeric px-4 py-2.5 text-right">
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
                <td className="numeric px-4 py-2.5 text-right font-medium text-text">{usd(h.value)}</td>
                <td className="numeric px-4 py-2.5 text-right text-secondary">{pct(h.weight * 100)}</td>
                <td className="numeric px-4 py-2.5 text-right text-secondary">{h.riskShare === null ? "—" : pct(h.riskShare * 100)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border-strong">
              <td className="label px-4 py-2.5 font-semibold">Total</td>
              <td colSpan={3} />
              <td className="numeric px-4 py-2.5 text-right font-medium text-text">{usd(a.total)}</td>
              <td className="numeric px-4 py-2.5 text-right text-tertiary">100%</td>
              <td className="numeric px-4 py-2.5 text-right text-tertiary">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {a.unpriced.length > 0 && (
        <p className="px-4 pb-3 text-[11px] text-tertiary">Held but not priced this load: {a.unpriced.join(", ")}.</p>
      )}
    </div>
  );
}
