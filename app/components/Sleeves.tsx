"use client";

import type { Analysis } from "@/lib/portfolio";
import { usd, pct, sleeveColor } from "@/lib/format";

function Bar({ label, fraction, color }: { label: string; fraction: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-[9px] uppercase tracking-wide text-tertiary">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-hover">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(fraction * 100, 0.5)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

/**
 * Stocks, crypto, cash — share of value against share of risk. Where the
 * two bars disagree is the whole panel. Then the sentence that a sector
 * label hides: the crypto that is called a stock.
 */
export function Sleeves({ a }: { a: Analysis }) {
  const linked = a.cryptoLinked;
  const equity = a.sleeves[0];
  const crypto = a.sleeves[1];

  return (
    <div className="px-4 py-3.5">
      <div className="space-y-3">
        {a.sleeves.filter((s) => s.value > 0).map((s) => {
          const gap = s.riskShare - s.valueShare;
          return (
            <div key={s.key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex items-center gap-2 text-[13px] text-text">
                  <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: sleeveColor(s.key) }} />
                  {s.label}
                  <span className="text-[11px] text-tertiary">{s.symbols.join(", ")}</span>
                </span>
                <span className="numeric text-[13px] font-medium text-text">
                  {pct(s.riskShare * 100)}<span className="ml-1.5 text-[11px] font-normal text-tertiary">of risk</span>
                </span>
              </div>
              <div className="mt-1.5 space-y-1">
                <Bar label="value" fraction={s.valueShare} color="var(--border-strong)" />
                <Bar label="risk" fraction={s.riskShare} color={sleeveColor(s.key)} />
              </div>
              <p className="mt-1 text-[10px] leading-snug text-tertiary">
                {pct(s.valueShare * 100)} of value · {usd(s.value)}
                {Math.abs(gap) > 0.03 && (
                  <>
                    {" · "}
                    <span style={{ color: gap > 0 ? "var(--elevated)" : "var(--calm)" }}>
                      carries {Math.abs(gap * 100).toFixed(0)}pp {gap > 0 ? "more" : "less"} risk than weight
                    </span>
                  </>
                )}
              </p>
            </div>
          );
        })}
      </div>

      {linked.symbols.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="flex items-baseline justify-between">
            <span className="label">Crypto in stock clothing</span>
            <span className="numeric text-[13px] font-medium" style={{ color: "var(--asset-3)" }}>
              {pct(linked.valueShareOfEquities * 100, 0)} of stocks
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-tertiary">
            {linked.symbols.join(", ")} {linked.symbols.length === 1 ? "is" : "are"} equity on paper
            {linked.corrToSol !== null && (
              <> and {linked.corrToSol.toFixed(2)} correlated with SOL over 30 days</>
            )}
            . With the crypto sleeve, that is{" "}
            <span className="text-secondary">
              {pct((crypto.valueShare + linked.valueShareOfEquities * equity.valueShare) * 100, 0)}
            </span>{" "}
            of the book riding crypto beta, whatever the sector labels say.
          </p>
        </div>
      )}

      {a.sectors.length > 1 && (
        <dl className="mt-4 space-y-1 border-t border-border pt-3">
          {a.sectors.map((s) => (
            <div key={s.sector} className="flex items-baseline justify-between gap-3 text-[11px]">
              <dt className="text-tertiary">{s.sector}</dt>
              <dd className="numeric text-secondary">
                {pct(s.valueShare * 100, 0)} <span className="text-tertiary">value</span> · {pct(s.riskShare * 100, 0)} <span className="text-tertiary">risk</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
