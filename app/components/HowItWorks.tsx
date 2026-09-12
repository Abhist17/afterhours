"use client";

import { useEffect, useRef } from "react";
import { BAND_THRESHOLDS } from "@/lib/format";
import { Button } from "./ui";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "The premise",
    body:
      "An xStock is a Solana token that tracks a share. The token trades every hour of every day; the share trades 9:30 to 4:00, New York, on trading days. Between the close and the next open, the token's price is a forecast of the reopen — and the gap is risk you carry with nobody on the other side. A brokerage app never shows you that. This does.",
  },
  {
    title: "The score",
    body:
      "One number, 0 to 100: the 95% one-day Value at Risk as a share of the book, plus a penalty for concentration. VaR is the loss exceeded on about one day in twenty; the covariance behind it is exponentially weighted over thirty days of hourly returns, with the decay rescaled so its memory is seventeen days, not seventeen hours. Two models run — normal-curve and historical — and the more conservative one headlines.",
  },
  {
    title: "Beta, sleeves, and the crypto that is not called crypto",
    body:
      "Every position gets a beta to SPYx on the same estimator. The book is split into tokenized stocks, crypto and cash, each with its share of value beside its share of risk — the bars disagree, and where they disagree is what to act on. Coinbase, Strategy, Robinhood and Circle are stocks on paper and crypto beta in practice; the desk counts them with SOL.",
  },
  {
    title: "The backtest",
    body:
      "The current allocation, scored at every hour of the last thirty days as if it had been held throughout, with a covariance that has only seen what was known by then. It says how risky this shape of book has been. Your wallet's own record is what you anchor on-chain.",
  },
  {
    title: "Targets, drift, and what if",
    body:
      "State the allocation you meant to hold; the desk shows the drift from it and the trades that put it back, sized at the last quote with Jupiter prefilled. What-if moves a share of one position into another and re-scores the whole book in your browser.",
  },
  {
    title: "Nothing leaves your browser",
    body:
      "Balances are read from mainnet by the page. Prices and history come from a public feed. The arithmetic runs in the tab. The only thing that ever goes anywhere is what you choose to sign: your policy and your risk snapshots, written to a Solana program by your own wallet.",
  },
];

export function HowItWorks({ open, onClose }: { open: boolean; onClose: () => void }) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 py-[6vh]" onClick={onClose} role="presentation">
      <div ref={card} className="card max-h-full w-full max-w-lg overflow-y-auto p-6 shadow-lg" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="how-title">
        <h2 id="how-title" className="text-[15px] font-semibold text-text">How Afterhours reads a book</h2>
        {SECTIONS.map((s) => (
          <section key={s.title} className="mt-5 border-t border-border pt-4">
            <h3 className="label mb-2">{s.title}</h3>
            <p className="text-[12px] leading-relaxed text-tertiary">{s.body}</p>
          </section>
        ))}
        <section className="mt-5 border-t border-border pt-4">
          <h3 className="label mb-2.5">The scale</h3>
          <ul className="space-y-2" role="list">
            {BAND_THRESHOLDS.map((entry, i) => {
              const next = BAND_THRESHOLDS[i + 1];
              return (
                <li key={entry.band.key} className="flex items-baseline gap-2.5">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.band.color }} />
                  <span className="numeric w-14 shrink-0 text-[11px] text-tertiary">{next ? `${entry.at}–${next.at - 1}` : `${entry.at}–100`}</span>
                  <span className="min-w-0">
                    <span className="text-[13px] font-medium" style={{ color: entry.band.color }}>{entry.band.label}</span>
                    <span className="ml-1.5 text-[12px] text-tertiary">{entry.band.description}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
        <p className="mt-5 border-t border-border pt-3 text-[11px] leading-relaxed text-tertiary">
          Every figure is a model estimate built from thirty days of prices. It is not investment advice, and a model that has never seen a crash cannot price one.
        </p>
        <div className="mt-4">
          <Button variant="primary" onClick={onClose} className="w-full">Got it</Button>
        </div>
      </div>
    </div>
  );
}
