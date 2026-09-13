"use client";

import { useMemo, useState } from "react";
import type { Analysis } from "@/lib/portfolio";
import { factorScenario, type Scenario } from "@/lib/scenarios";
import { CRYPTO_SYMBOL } from "@/lib/portfolio";
import { BY_SYMBOL, MARKET_SYMBOL } from "@/lib/universe";
import { usd, signedUsd, signedPct, dayLabel, sectorColor } from "@/lib/format";
import { Button } from "./ui";

/**
 * What the book does under moves the last thirty days may never have
 * shown. Factor shocks move every position by its beta to the factor; the
 * two dated scenarios are the window's own worst day and worst close-to-
 * open, at today's weights. The custom shock is a slider for each factor,
 * summed, a first-order answer, labelled as one.
 */
export function Stress({ a }: { a: Analysis }) {
  const [selected, setSelected] = useState<string>(a.stress.scenarios[0]?.key ?? "");
  const [marketShock, setMarketShock] = useState(-0.05);
  const [cryptoShock, setCryptoShock] = useState(-0.2);

  const values = useMemo(() => Object.fromEntries(a.holdings.map((h) => [h.symbol, h.value])), [a]);
  const custom = useMemo<Scenario>(() => {
    const isCash = (s: string) => BY_SYMBOL[s]?.class === "cash";
    const m = factorScenario("custom-m", "", MARKET_SYMBOL, marketShock, values, a.stress.betaToMarket, isCash);
    const c = factorScenario("custom-c", "", CRYPTO_SYMBOL, cryptoShock, values, a.stress.betaToCrypto, isCash);
    const lines = m.lines.map((l) => {
      const cl = c.lines.find((x) => x.symbol === l.symbol);
      return { symbol: l.symbol, move: l.move + (cl?.move ?? 0), pnlUsd: l.pnlUsd + (cl?.pnlUsd ?? 0) };
    });
    lines.sort((x, y) => x.pnlUsd - y.pnlUsd);
    const pnl = lines.reduce((s, l) => s + l.pnlUsd, 0);
    return {
      key: "custom",
      label: "Your own shock",
      basis: `S&P 500 ${(marketShock * 100).toFixed(0)}% and crypto ${(cryptoShock * 100).toFixed(0)}% together, betas summed, the two overlap, so read it as a ceiling`,
      pnlUsd: pnl,
      pnlPct: a.total > 0 ? pnl / a.total : 0,
      lines,
    };
  }, [values, marketShock, cryptoShock, a.stress.betaToMarket, a.stress.betaToCrypto, a.total]);

  const scenarios = [...a.stress.scenarios, custom];
  const active = scenarios.find((s) => s.key === selected) ?? scenarios[0];

  if (a.holdings.length === 0 || !active) {
    return <p className="px-4 py-4 text-xs text-tertiary">Nothing to stress yet.</p>;
  }

  const worstPct = Math.max(0.0001, ...scenarios.map((s) => Math.abs(s.pnlPct)));
  const var1d = a.risk.headlineVarUsd;

  return (
    <div className="px-4 py-3.5">
      <ul className="space-y-1" role="list">
        {scenarios.map((s) => {
          const on = s.key === active.key;
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => setSelected(s.key)}
                className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors ${on ? "bg-surface-active" : "hover:bg-surface-hover"}`}
                aria-pressed={on}
              >
                <span className="w-[13.5rem] shrink-0 text-[12px] text-text">
                  {s.label}
                  {s.at && <span className="numeric ml-1.5 text-[10px] text-tertiary">{dayLabel(s.at)}</span>}
                </span>
                <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-hover">
                  <span
                    className="absolute inset-y-0 right-0 rounded-full"
                    style={{ width: `${(Math.abs(s.pnlPct) / worstPct) * 100}%`, backgroundColor: s.pnlUsd < 0 ? "var(--severe)" : "var(--calm)", opacity: on ? 1 : 0.6 }}
                  />
                </span>
                <span className="numeric w-[5.5rem] shrink-0 text-right text-[12px]" style={{ color: s.pnlUsd < 0 ? "var(--severe)" : s.pnlUsd > 0 ? "var(--calm)" : "var(--text-tertiary)" }}>
                  {signedPct(s.pnlPct * 100, 1)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {active.key === "custom" && (
        <div className="mt-3 grid grid-cols-2 gap-3 rounded-md border border-border bg-bg-subtle p-2.5 text-[11px] text-tertiary">
          <label className="block">
            <span className="flex justify-between">
              <span>S&amp;P 500</span>
              <span className="numeric text-text">{(marketShock * 100).toFixed(0)}%</span>
            </span>
            <input type="range" min={-30} max={10} step={1} value={marketShock * 100} onChange={(e) => setMarketShock(Number(e.target.value) / 100)} className="mt-1 w-full accent-[var(--brand)]" aria-label="Market shock" />
          </label>
          <label className="block">
            <span className="flex justify-between">
              <span>Crypto</span>
              <span className="numeric text-text">{(cryptoShock * 100).toFixed(0)}%</span>
            </span>
            <input type="range" min={-60} max={20} step={1} value={cryptoShock * 100} onChange={(e) => setCryptoShock(Number(e.target.value) / 100)} className="mt-1 w-full accent-[var(--brand)]" aria-label="Crypto shock" />
          </label>
        </div>
      )}

      <div className="mt-4 border-t border-border pt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="numeric text-2xl font-medium" style={{ color: active.pnlUsd < 0 ? "var(--severe)" : active.pnlUsd > 0 ? "var(--calm)" : "var(--text)" }}>
            {signedUsd(active.pnlUsd)}
          </span>
          <span className="numeric text-[11px] text-tertiary">
            {signedPct(active.pnlPct * 100, 1)} of {usd(a.total)}
            {var1d > 0 && active.pnlUsd < 0 && <> · {(Math.abs(active.pnlUsd) / var1d).toFixed(1)}× the one-day VaR</>}
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-tertiary">{active.basis}.</p>

        {active.lines.length > 0 && (
          <ul className="mt-3 space-y-1" role="list">
            {active.lines.slice(0, 8).map((l) => {
              const asset = BY_SYMBOL[l.symbol];
              return (
                <li key={l.symbol} className="flex items-baseline justify-between gap-3 text-[12px]">
                  <span className="flex items-center gap-2 text-text">
                    <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: asset ? sectorColor(asset.sector, asset.class) : "var(--asset-other)" }} />
                    {l.symbol}
                    {active.factor && (
                      <span className="numeric text-[10px] text-tertiary">
                        β {((active.factor.symbol === MARKET_SYMBOL ? a.stress.betaToMarket : a.stress.betaToCrypto)[l.symbol] ?? 0).toFixed(2)}
                      </span>
                    )}
                  </span>
                  <span className="numeric text-secondary">
                    <span style={{ color: l.move < 0 ? "var(--severe)" : l.move > 0 ? "var(--calm)" : "var(--text-tertiary)" }}>{signedPct(l.move * 100, 1)}</span>
                    <span className="ml-2 text-tertiary">{signedUsd(l.pnlUsd)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" className="!h-6 !px-2 !text-[11px]" onClick={() => setSelected("custom")}>
          Set your own shock
        </Button>
        <span className="text-[10px] leading-snug text-tertiary">
          Betas to {MARKET_SYMBOL} and {CRYPTO_SYMBOL} on the same thirty-day estimator as the VaR. A shock the window never saw is a guess dressed as a number; the two dated rows are not.
        </span>
      </div>
    </div>
  );
}
