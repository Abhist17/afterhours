"use client";

import { useState } from "react";
import type { Analysis } from "@/lib/portfolio";
import type { Gap } from "@/lib/sessions";
import { usd, signedUsd, signedPct, pct, dayLabel, sectorColor } from "@/lib/format";
import { useMeasuredWidth, Readout } from "./chart";

const BAR_H = 96;

/**
 * The last closes, one bar each: what the tokenized stocks did between a
 * close and the next open, value-weighted at today's weights. Weekends are
 * the wide bars. This is the risk the holder actually carried, night after
 * night, without a market.
 */
export function GapBars({ gaps, equityValue }: { gaps: Gap[]; equityValue: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useMeasuredWidth<HTMLDivElement>(600);
  const shown = gaps.slice(-24);
  if (shown.length < 2) return <p className="text-[11px] text-tertiary">Not enough closes in the window yet.</p>;

  const maxAbs = Math.max(0.005, ...shown.map((g) => Math.abs(g.ret)));
  const totalHours = shown.reduce((s, g) => s + g.hours, 0);
  const gapPx = 3;
  const usable = W - gapPx * (shown.length - 1);
  // Bar width follows how long the market was closed, so a weekend reads as
  // a weekend.
  let cursor = 0;
  const bars = shown.map((g) => {
    const w = Math.max(6, (g.hours / totalHours) * usable);
    const x = cursor;
    cursor += w + gapPx;
    return { g, x, w, h: (Math.abs(g.ret) / maxAbs) * (BAR_H / 2 - 4) };
  });
  const scale = cursor - gapPx > 0 ? W / (cursor - gapPx) : 1;
  const mid = BAR_H / 2;
  const active = hover !== null ? bars[hover] : null;
  const worst = shown.reduce((a, b) => (b.ret < a.ret ? b : a));
  const best = shown.reduce((a, b) => (b.ret > a.ret ? b : a));
  const up = shown.filter((g) => g.ret > 0).length;

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[11px] text-tertiary">
        <span>
          {shown.length} closes · up {up}, down {shown.length - up}
        </span>
        <span className="numeric">
          worst <span style={{ color: "var(--severe)" }}>{signedPct(worst.ret * 100)}</span> · best <span style={{ color: "var(--calm)" }}>{signedPct(best.ret * 100)}</span>
        </span>
      </div>
      <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
        <svg width="100%" height={BAR_H} viewBox={`0 0 ${W} ${BAR_H}`} preserveAspectRatio="none" className="block touch-pan-y" role="img" aria-label="Move across each of the last closed periods">
          <line x1={0} x2={W} y1={mid} y2={mid} stroke="var(--border-strong)" strokeWidth={1} />
          {bars.map((b, i) => {
            const neg = b.g.ret < 0;
            const weekend = b.g.hours >= 40;
            return (
              <g key={b.g.from} onPointerEnter={() => setHover(i)} onPointerMove={() => setHover(i)}>
                <rect x={b.x * scale} y={0} width={b.w * scale} height={BAR_H} fill="transparent" />
                <rect
                  x={b.x * scale}
                  y={neg ? mid : mid - b.h}
                  width={b.w * scale}
                  height={Math.max(1, b.h)}
                  rx={1.5}
                  fill={neg ? "var(--severe)" : "var(--calm)"}
                  opacity={hover === null || hover === i ? (weekend ? 0.95 : 0.7) : 0.3}
                />
                {weekend && <rect x={b.x * scale} y={BAR_H - 3} width={b.w * scale} height={2} fill="var(--watch)" opacity={0.7} />}
              </g>
            );
          })}
        </svg>
        {active && (
          <Readout x={(active.x + active.w / 2) * scale} y={active.g.ret < 0 ? mid + 8 : mid - active.h - 8} width={W}>
            <div className="numeric text-text">
              {signedPct(active.g.ret * 100)} · {signedUsd(active.g.ret * equityValue)}
            </div>
            <div className="text-tertiary">
              {active.g.hours >= 40 ? "Weekend" : "Overnight"} to {dayLabel(active.g.to)} · {Math.round(active.g.hours)}h closed
            </div>
          </Readout>
        )}
      </div>
      <p className="mt-1 text-[10px] leading-snug text-tertiary">
        Each bar is one close-to-open, wider for weekends (marked amber), at today&rsquo;s weights and today&rsquo;s equity value of {usd(equityValue)}.
      </p>
    </div>
  );
}

/**
 * Where the variance came from. One bar for the book, then one per stock:
 * the share of thirty-day variance that happened while the NYSE was
 * closed. The per-hour ratio beside it is the fairer comparison, since
 * closed hours outnumber open ones nearly three to one.
 */
export function VarianceSplit({ a }: { a: Analysis }) {
  const [all, setAll] = useState(false);
  const book = a.sessions.book;
  const rows = a.holdings
    .filter((h) => h.asset.class === "equity" && a.sessions.bySymbol[h.symbol])
    .map((h) => ({ h, s: a.sessions.bySymbol[h.symbol] }))
    .sort((x, y) => y.s.closedShare - x.s.closedShare);

  if (!book || !rows.length) return null;
  const perHour = book.openVolPerHour > 0 ? book.closedVolPerHour / book.openVolPerHour : null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-text">
          <span className="numeric font-medium" style={{ color: "var(--watch)" }}>{pct(book.closedShare * 100, 0)}</span> of this book&rsquo;s variance happened while the NYSE was closed
        </span>
        <span className="numeric shrink-0 text-[11px] text-tertiary">{Math.round(book.closedHours)}h closed · {Math.round(book.openHours)}h open</span>
      </div>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-hover">
        <div className="h-full" style={{ width: `${(1 - book.closedShare) * 100}%`, backgroundColor: "var(--calm)", opacity: 0.8 }} title="During the session" />
        <div className="h-full" style={{ width: `${book.closedShare * 100}%`, backgroundColor: "var(--watch)" }} title="While closed" />
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-tertiary">
        {perHour !== null && (
          <>
            Per hour, it moved <span className="numeric text-secondary">{perHour.toFixed(2)}×</span> as much closed as open —{" "}
            {perHour > 1.1 ? "the token was more volatile without its market than with it." : perHour < 0.7 ? "quieter without its market, but there are far more closed hours than open ones." : "about the same rate, spread over far more closed hours."}
          </>
        )}
      </p>
      <ul className="mt-3 space-y-1.5" role="list">
        {(all ? rows : rows.slice(0, 6)).map(({ h, s }) => (
          <li key={h.symbol} className="flex items-center gap-3 text-[12px]">
            <span className="flex w-16 shrink-0 items-center gap-2 text-text">
              <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: sectorColor(h.asset.sector, h.asset.class) }} />
              {h.symbol}
            </span>
            <span className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-surface-hover">
              <span className="h-full" style={{ width: `${s.closedShare * 100}%`, backgroundColor: "var(--watch)" }} />
            </span>
            <span className="numeric w-10 shrink-0 text-right text-secondary">{pct(s.closedShare * 100, 0)}</span>
            <span className="numeric hidden w-14 shrink-0 text-right text-[11px] text-tertiary sm:inline">
              {s.openVolPerHour > 0 ? `${(s.closedVolPerHour / s.openVolPerHour).toFixed(2)}×/h` : "—"}
            </span>
          </li>
        ))}
      </ul>
      {rows.length > 6 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-[11px] text-tertiary underline decoration-border-strong underline-offset-2 hover:text-text">
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}
