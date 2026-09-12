"use client";

import { useEffect, useMemo, useState } from "react";
import type { Analysis } from "@/lib/portfolio";
import { driftAgainst, type Target } from "@/lib/quant";
import { ASSETS, BY_SYMBOL, jupiterSwapUrl } from "@/lib/universe";
import { usd, pct, amount as fmtAmount, sectorColor, timeAgo } from "@/lib/format";
import { quoteSwap, quoteVersusMark, type SwapQuote } from "@/lib/jupiter";
import { Button } from "./ui";

/** The leg every rebalance routes through. */
const CASH_LEG = "USDC";

/** Drift inside this band is noise; outside it is a trade. */
const DEFAULT_BAND = 0.05;

/** Percentage points with a sign, and never "-0.0". */
function signedPp(fraction: number): string {
  const pp = Math.round(fraction * 1000) / 10;
  if (pp === 0) return "0.0pp";
  return `${pp > 0 ? "+" : "−"}${Math.abs(pp).toFixed(1)}pp`;
}

const PRESETS: { key: string; label: string; build: (a: Analysis) => Target[] }[] = [
  {
    key: "current",
    label: "Current weights",
    build: (a) => a.holdings.map((h) => ({ symbol: h.symbol, weight: h.weight })),
  },
  {
    key: "equal",
    label: "Equal weight",
    build: (a) => {
      const held = a.holdings.filter((h) => h.asset.class !== "cash");
      return held.map((h) => ({ symbol: h.symbol, weight: 1 / held.length }));
    },
  },
  {
    key: "core",
    label: "60 / 40",
    build: (a) => {
      // Sixty in the index, forty in cash — the allocation every other
      // allocation is measured against.
      void a;
      return [
        { symbol: "SPYx", weight: 0.6 },
        { symbol: "USDC", weight: 0.4 },
      ];
    },
  },
];

/**
 * Where the book stands against what its owner meant it to be, and the
 * trades that put it back. Targets are typed here and remembered per book;
 * the same list is what the owner can anchor on-chain as their policy, so
 * the drift a reader sees is drift from a stated intent, not from a guess.
 */
export function Drift({
  a,
  prices: feed,
  storageKey,
  onTargetsChange,
}: {
  a: Analysis;
  /** The feed's price for every asset, held or not, to mark quotes against. */
  prices: Record<string, number>;
  storageKey: string;
  onTargetsChange?: (targets: Target[]) => void;
}) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [editing, setEditing] = useState(false);
  const [band, setBand] = useState(DEFAULT_BAND);

  // Restore the owner's targets for this book, or start from its current
  // shape so the first drift shown is zero rather than a lecture.
  useEffect(() => {
    let restored: Target[] | null = null;
    try {
      const raw = localStorage.getItem(`afterhours-targets:${storageKey}`);
      if (raw) restored = JSON.parse(raw) as Target[];
    } catch {}
    setTargets(restored ?? PRESETS[0].build(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!targets.length) return;
    try {
      localStorage.setItem(`afterhours-targets:${storageKey}`, JSON.stringify(targets));
    } catch {}
    onTargetsChange?.(targets);
  }, [targets, storageKey, onTargetsChange]);

  const values = useMemo(() => Object.fromEntries(a.holdings.map((h) => [h.symbol, h.value])), [a]);
  const drift = useMemo(() => driftAgainst(values, targets), [values, targets]);
  const targetSum = targets.reduce((s, t) => s + t.weight, 0);

  // Cash is not traded, it is what the trades pass through: sells land in
  // USDC and buys are paid from it, so the cash line is the residual.
  const isCash = (symbol: string) => BY_SYMBOL[symbol]?.class === "cash";
  const sells = drift.lines.filter((l) => l.tradeUsd < 0 && Math.abs(l.drift) > band && !isCash(l.symbol));
  const buys = drift.lines.filter((l) => l.tradeUsd > 0 && Math.abs(l.drift) > band && !isCash(l.symbol));
  const cashChange = drift.lines.filter((l) => isCash(l.symbol) && Math.abs(l.drift) > band).reduce((s, l) => s + l.tradeUsd, 0);
  const priceOf = (symbol: string) => feed[symbol] ?? a.holdings.find((h) => h.symbol === symbol)?.price ?? 0;
  const prices = feed;

  // Real quotes for the orders, from Jupiter, a moment after they settle.
  const orderKey = [...sells, ...buys].map((l) => `${l.symbol}:${Math.round(l.tradeUsd)}`).join("|");
  const [quotes, setQuotes] = useState<Record<string, SwapQuote | "pending" | "failed">>({});
  useEffect(() => {
    if (!orderKey) {
      setQuotes({});
      return;
    }
    const controller = new AbortController();
    const orders = [...sells, ...buys].slice(0, 10);
    const timer = setTimeout(async () => {
      setQuotes(Object.fromEntries(orders.map((l) => [l.symbol, "pending"])));
      // One at a time: the public endpoint is shared and a book has few lines.
      for (const l of orders) {
        if (controller.signal.aborted) return;
        const sell = l.tradeUsd < 0;
        const from = sell ? l.symbol : CASH_LEG;
        const to = sell ? CASH_LEG : l.symbol;
        const amountIn = sell ? Math.abs(l.tradeUsd) / (priceOf(l.symbol) || 1) : Math.abs(l.tradeUsd);
        let q: SwapQuote | null = null;
        // A shared public endpoint; one patient retry covers its rate limit.
        for (let attempt = 0; attempt < 2 && !q; attempt++) {
          try {
            q = await quoteSwap(from, to, amountIn, controller.signal);
          } catch {
            if (controller.signal.aborted) return;
            await new Promise((r) => setTimeout(r, 900));
          }
        }
        if (controller.signal.aborted) return;
        setQuotes((prev) => ({ ...prev, [l.symbol]: q ?? "failed" }));
        await new Promise((r) => setTimeout(r, 150));
      }
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  function setWeight(symbol: string, weight: number) {
    setTargets((ts) => ts.map((t) => (t.symbol === symbol ? { ...t, weight } : t)));
  }
  function remove(symbol: string) {
    setTargets((ts) => ts.filter((t) => t.symbol !== symbol));
  }
  function add(symbol: string) {
    if (!symbol || targets.some((t) => t.symbol === symbol)) return;
    setTargets((ts) => [...ts, { symbol, weight: 0 }]);
  }

  if (a.holdings.length === 0) {
    return <p className="px-4 py-4 text-xs text-tertiary">Nothing to compare against a target yet.</p>;
  }

  return (
    <div className="px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <Button key={p.key} size="sm" variant="secondary" onClick={() => setTargets(p.build(a))} className="!h-6 !px-2 !text-[11px]">
            {p.label}
          </Button>
        ))}
        <Button size="sm" variant={editing ? "primary" : "ghost"} onClick={() => setEditing((e) => !e)} className="!h-6 !px-2 !text-[11px]">
          {editing ? "Done" : "Edit targets"}
        </Button>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-tertiary">
          band
          <select
            value={band}
            onChange={(e) => setBand(Number(e.target.value))}
            aria-label="Rebalance band"
            className="numeric h-6 rounded-md border border-border bg-bg-subtle px-1 text-[11px] text-text focus:border-focus focus:outline-none"
          >
            {[0.02, 0.05, 0.1].map((b) => (
              <option key={b} value={b}>±{(b * 100).toFixed(0)}pp</option>
            ))}
          </select>
        </span>
      </div>

      {editing && (
        <div className="mt-3 space-y-1.5 rounded-md border border-border bg-bg-subtle p-2.5">
          {targets.map((t) => (
            <div key={t.symbol} className="flex items-center gap-2 text-[12px]">
              <span className="numeric w-16 text-text">{t.symbol}</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={Math.round(t.weight * 1000) / 10}
                onChange={(e) => setWeight(t.symbol, Math.max(0, Number(e.target.value)) / 100)}
                aria-label={`Target weight for ${t.symbol}`}
                className="numeric h-6 w-20 rounded-md border border-border bg-surface px-1.5 text-[11px] text-text focus:border-focus focus:outline-none"
              />
              <span className="text-tertiary">%</span>
              <button type="button" onClick={() => remove(t.symbol)} className="ml-auto text-[11px] text-tertiary hover:text-severe" aria-label={`Remove ${t.symbol} from targets`}>remove</button>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1 text-[12px]">
            <select
              defaultValue=""
              onChange={(e) => {
                add(e.target.value);
                e.target.value = "";
              }}
              aria-label="Add an asset to the targets"
              className="numeric h-6 rounded-md border border-border bg-surface px-1.5 text-[11px] text-text focus:border-focus focus:outline-none"
            >
              <option value="" disabled>+ add asset</option>
              {ASSETS.filter((x) => !targets.some((t) => t.symbol === x.symbol)).map((x) => (
                <option key={x.symbol} value={x.symbol}>{x.symbol} · {x.name}</option>
              ))}
            </select>
            <span className={`ml-auto numeric text-[11px] ${Math.abs(targetSum - 1) > 0.005 ? "text-watch" : "text-tertiary"}`}>
              targets sum to {(targetSum * 100).toFixed(0)}%{Math.abs(targetSum - 1) > 0.005 ? " — normalised when scored" : ""}
            </span>
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {drift.lines.map((l) => {
          const asset = BY_SYMBOL[l.symbol];
          const outside = Math.abs(l.drift) > band;
          return (
            <div key={l.symbol}>
              <div className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="flex items-center gap-2 text-text">
                  <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: asset ? sectorColor(asset.sector, asset.class) : "var(--asset-other)" }} />
                  {l.symbol}
                </span>
                <span className="numeric text-secondary">
                  {pct(l.actual * 100, 0)} <span className="text-tertiary">vs</span> {pct(l.target * 100, 0)}
                  <span className="ml-2" style={{ color: outside ? (l.drift > 0 ? "var(--elevated)" : "var(--watch)") : "var(--text-tertiary)" }}>
                    {signedPp(l.drift)}
                  </span>
                </span>
              </div>
              <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-surface-hover">
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, l.actual * 100)}%`, backgroundColor: asset ? sectorColor(asset.sector, asset.class) : "var(--asset-other)", opacity: outside ? 1 : 0.55 }} />
                <div className="absolute inset-y-0 w-px bg-text" style={{ left: `${Math.min(100, l.target * 100)}%` }} aria-hidden="true" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <div className="flex items-baseline justify-between">
          <span className="label">Rebalance</span>
          <span className="numeric text-[12px] text-secondary">
            {drift.maxDrift > band ? (
              <>{usd(drift.turnoverUsd)} <span className="text-tertiary">one-way · {pct(drift.turnoverPct * 100, 0)} of the book</span></>
            ) : (
              <span style={{ color: "var(--calm)" }}>within band</span>
            )}
          </span>
        </div>
        {drift.maxDrift > band && (sells.length > 0 || buys.length > 0) ? (
          <>
            <ul className="mt-2 space-y-2" role="list">
              {[...sells, ...buys].map((l) => {
                const sell = l.tradeUsd < 0;
                const units = priceOf(l.symbol) > 0 ? Math.abs(l.tradeUsd) / priceOf(l.symbol) : null;
                const href = sell ? jupiterSwapUrl(l.symbol, CASH_LEG) : jupiterSwapUrl(CASH_LEG, l.symbol);
                const q = quotes[l.symbol];
                const quoted = q && q !== "pending" && q !== "failed" ? q : null;
                const mark = quoted ? quoteVersusMark(quoted, { ...prices, [CASH_LEG]: prices[CASH_LEG] ?? 1 }) : null;
                return (
                  <li key={l.symbol} className="text-[12px]">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-text">
                        <span className="text-tertiary">{sell ? "Sell" : "Buy"}</span> {usd(Math.abs(l.tradeUsd))} of {l.symbol}
                        {units !== null && <span className="numeric ml-1.5 text-[11px] text-tertiary">≈ {fmtAmount(units)}</span>}
                      </span>
                      <a href={href} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[11px] text-secondary underline decoration-border-strong underline-offset-2 hover:text-text">
                        on Jupiter<span aria-hidden="true" className="ml-0.5 text-[9px]">↗</span>
                      </a>
                    </div>
                    <div className="numeric mt-0.5 text-[10px] text-tertiary">
                      {q === "pending" && <span className="breathe">quoting…</span>}
                      {q === "failed" && <span>no route quoted right now</span>}
                      {quoted && mark && (
                        <>
                          Jupiter: {fmtAmount(quoted.amountIn)} {quoted.from} → {fmtAmount(quoted.amountOut)} {quoted.to}
                          {quoted.priceImpact > 0 && (
                            <>
                              {" · "}
                              <span style={{ color: quoted.priceImpact > 0.01 ? "var(--severe)" : quoted.priceImpact > 0.003 ? "var(--watch)" : undefined }}>
                                {(quoted.priceImpact * 100).toFixed(2)}% impact
                              </span>
                            </>
                          )}
                          {Math.abs(mark.shortfall) > 0.0005 && (
                            <>
                              {" · "}
                              <span style={{ color: mark.shortfall > 0.01 ? "var(--severe)" : mark.shortfall > 0.003 ? "var(--watch)" : "var(--calm)" }}>
                                {mark.shortfall > 0 ? `${(mark.shortfall * 100).toFixed(2)}% below` : `${(-mark.shortfall * 100).toFixed(2)}% above`} the feed
                              </span>
                            </>
                          )}
                          {quoted.route.length > 0 && <> · via {quoted.route.join(", ")}</>}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {Math.abs(cashChange) > 1 && (
              <p className="numeric mt-2 text-[11px] text-tertiary">
                Cash {cashChange > 0 ? "rises" : "falls"} by {usd(Math.abs(cashChange))} as the trades settle.
              </p>
            )}
          </>
        ) : (
          <p className="mt-1.5 text-[11px] leading-snug text-tertiary">
            {drift.maxDrift > band ? "Only the cash line is off target; the trades above it are inside the band." : `Every position is within ±${(band * 100).toFixed(0)}pp of its target. Nothing to trade.`}
          </p>
        )}
        <p className="mt-2 text-[10px] leading-snug text-tertiary">
          Orders are sized at the last feed print and routed through USDC. The line under each is a live quote from Jupiter for that exact size — what the swap would fetch on-chain now, with its price impact and route
          {Object.values(quotes).some((q) => q && q !== "pending" && q !== "failed") && (
            <>, fetched {timeAgo(Math.max(...Object.values(quotes).map((q) => (q && q !== "pending" && q !== "failed" ? q.fetchedAt : 0))))}</>
          )}
          . Jupiter opens with the pair prefilled and you set the amount. Nothing here trades for you.
        </p>
      </div>
    </div>
  );
}
