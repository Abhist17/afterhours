"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * A word with a definition behind it. Dotted, never underlined like a
 * link; the definition appears on hover or focus and reads to a screen
 * reader through aria-describedby.
 */
export const TERMS: Record<string, string> = {
  "Value at Risk": "The loss that is exceeded on about one day in twenty (95%), over one day, from thirty days of hourly prices. A floor for a bad day, not a ceiling.",
  "Expected shortfall": "The average loss on the days that do exceed the VaR: how bad the bad days are, on average.",
  Beta: "How much a position moves when the index moves 1%, measured against SPYx on the same estimator. 1.0 moves with the market; 2.0 moves twice as much.",
  "Risk score": "Annualised volatility of the book, plus a penalty for concentration. Index-fund books run near 18; a single stock 30 to 45; crypto past 60.",
  Drift: "How far a position's actual weight sits from the weight the owner declared as its target.",
  "Effective assets": "How many equally-sized positions the book behaves like: 1 ÷ the sum of squared weights. Ten names weighted 90/1/1… act like one.",
  "Share of risk": "Each position's contribution to the book's Value at Risk, so the contributions sum to the total. A small position can carry a large share.",
  "Since the close": "The token's move since the last official print of the share it tracks. The stock market opens to this.",
  "Price impact": "How much the swap itself moves the price on the venues it routes through, as Jupiter quotes it for this exact size.",
  "Overnight Risk Ratio": "The share of this book's thirty-day variance, 0 to 100, that happened while the NYSE was closed: how much of what moved this book was risk no exchange was open to price. A pure index book with no tokenized stock scores 0; a book that is entirely tokenized equity scores near 100.",
};

export function Term({ children, term, def }: { children?: ReactNode; term: keyof typeof TERMS | string; def?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const text = def ?? TERMS[term] ?? "";
  if (!text) return <>{children ?? term}</>;
  return (
    <span className="relative inline-block">
      <span
        className="term"
        tabIndex={0}
        aria-describedby={id}
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children ?? term}
      </span>
      <span
        id={id}
        role="tooltip"
        className={`readout left-0 top-full mt-1.5 max-w-[30ch] whitespace-normal normal-case tracking-normal text-secondary ${open ? "" : "hidden"}`}
        style={{ fontWeight: 400 }}
      >
        <span className="mb-0.5 block text-[10px] font-semibold text-text">{term}</span>
        {text}
      </span>
    </span>
  );
}
