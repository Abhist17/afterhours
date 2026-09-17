"use client";

import { useMemo, useState } from "react";
import type { Analysis } from "@/lib/portfolio";
import { BY_SYMBOL } from "@/lib/universe";
import { pct, signedPct, sectorColor } from "@/lib/format";
import { useMeasuredWidth, Readout, GridLine, niceTicks, AXIS_FONT } from "./chart";

const H = 300;
const PAD = { top: 16, right: 16, bottom: 30, left: 44 };

/**
 * Every asset the desk knows, placed by what it has done over the window:
 * volatility across, return up. Held names are solid and sized by weight;
 * the rest of the universe is there in outline, so a book can see what it
 * is not holding. The book itself is the ringed point.
 */
export function RiskMap({ a }: { a: Analysis }) {
  const [hover, setHover] = useState<string | null>(null);
  const [ref, W] = useMeasuredWidth<HTMLDivElement>(700);

  const model = useMemo(() => {
    const pts = a.riskReturn.filter((p) => Number.isFinite(p.volPct) && Number.isFinite(p.ret));
    if (pts.length < 2) return null;
    const bookVol = a.risk.annualisedVolPct;
    const bookRet = a.drawdown?.windowReturn ?? 0;
    const thin = new Set(a.thin.map((t) => t.symbol));
    // Volatility spans two orders of magnitude between a stablecoin and a
    // thin token, so the axis is logarithmic, floored at 1%.
    const lg = (v: number) => Math.log10(Math.max(1, v));
    const vols = [...pts.map((p) => p.volPct), bookVol];
    const rets = [...pts.map((p) => p.ret), bookRet];
    const xMin = 0;
    const xMax = lg(Math.max(10, ...vols)) + 0.08;
    const yLo = Math.min(0, ...rets);
    const yHi = Math.max(0, ...rets);
    const yPad = (yHi - yLo || 0.1) * 0.12;
    const yMin = yLo - yPad;
    const yMax = yHi + yPad;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const x = (v: number) => PAD.left + ((lg(v) - xMin) / (xMax - xMin)) * innerW;
    const y = (r: number) => PAD.top + innerH - ((r - yMin) / (yMax - yMin)) * innerH;
    const maxW = Math.max(0.01, ...pts.map((p) => p.weight));
    const placed = pts.map((p) => ({
      ...p,
      x: x(p.volPct),
      y: y(p.ret),
      r: p.held ? 4 + Math.sqrt(p.weight / maxW) * 9 : 3,
      thin: thin.has(p.symbol),
      labelY: y(p.ret),
    }));
    // Labels for held names: nudge apart when two would overprint.
    const labelled = placed.filter((p) => p.held).sort((p, q) => p.y - q.y);
    for (let i = 1; i < labelled.length; i++) {
      const prev = labelled[i - 1];
      const cur = labelled[i];
      if (Math.abs(cur.x - prev.x) < 70 && cur.labelY - prev.labelY < 13) cur.labelY = prev.labelY + 13;
    }
    // The book's own label competes with the same space; push it clear of
    // whichever held label's baseline lands nearest once those have settled.
    const bookX = x(bookVol);
    const bookY = y(bookRet);
    let bookLabelBaseline = bookY - 8;
    for (const p of labelled) {
      const baseline = p.labelY + 3.5;
      if (Math.abs(bookX - p.x) < 70 && Math.abs(bookLabelBaseline - baseline) < 13) bookLabelBaseline = baseline - 13;
    }
    const xTicks = [1, 3, 10, 30, 100, 300, 1000].filter((v) => lg(v) <= xMax).map((v) => ({ v, x: x(v) }));
    return {
      placed,
      book: { x: bookX, y: bookY, labelBaseline: bookLabelBaseline, vol: bookVol, ret: bookRet },
      xTicks,
      yTicks: niceTicks(yMin, yMax, 4).map((v) => ({ v, y: y(v) })),
      zero: y(0),
      innerH,
    };
  }, [a, W]);

  if (!model) return <p className="px-4 py-4 text-xs text-tertiary">Needs at least two series with history.</p>;

  const active = hover === "book" ? null : model.placed.find((p) => p.symbol === hover) ?? null;
  const held = model.placed.filter((p) => p.held);

  return (
    <div className="px-4 py-3.5">
      <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label="Volatility against thirty-day return for every asset, with the book marked">
          {model.yTicks.map((t) => (
            <GridLine key={t.v} y={t.y} x1={PAD.left} x2={W - PAD.right} label={signedPct(t.v * 100, 0)} />
          ))}
          <line x1={PAD.left} x2={W - PAD.right} y1={model.zero} y2={model.zero} stroke="var(--border-strong)" strokeWidth={1} />
          {model.xTicks.map((t) => (
            <text key={t.v} x={t.x} y={H - 8} textAnchor="middle" fontSize={AXIS_FONT} fill="var(--text-tertiary)" className="numeric">
              {t.v.toFixed(0)}%
            </text>
          ))}
          <text x={PAD.left} y={PAD.top + 2} fontSize={AXIS_FONT} fill="var(--text-tertiary)">
            ↑ thirty-day return · annualised volatility → (log)
          </text>

          {/* Unheld universe first, in outline, so held names paint over. */}
          {model.placed
            .filter((p) => !p.held)
            .map((p) => {
              const asset = BY_SYMBOL[p.symbol];
              const color = asset ? sectorColor(asset.sector, asset.class) : "var(--asset-other)";
              return (
                <g key={p.symbol} onPointerEnter={() => setHover(p.symbol)} onPointerMove={() => setHover(p.symbol)}>
                  <circle cx={p.x} cy={p.y} r={p.r + 6} fill="transparent" />
                  <circle cx={p.x} cy={p.y} r={p.r} fill="var(--surface)" stroke={color} strokeWidth={1} strokeDasharray={p.thin ? "2 2" : undefined} opacity={hover && hover !== p.symbol ? 0.35 : 0.7} />
                </g>
              );
            })}
          {held.map((p) => {
            const asset = BY_SYMBOL[p.symbol];
            const color = asset ? sectorColor(asset.sector, asset.class) : "var(--asset-other)";
            const dim = hover !== null && hover !== p.symbol;
            return (
              <g key={p.symbol} onPointerEnter={() => setHover(p.symbol)} onPointerMove={() => setHover(p.symbol)}>
                <circle cx={p.x} cy={p.y} r={p.r + 6} fill="transparent" />
                <circle cx={p.x} cy={p.y} r={p.r} fill={color} opacity={dim ? 0.35 : 0.9} stroke={p.thin ? "var(--watch)" : "var(--surface)"} strokeWidth={1.5} strokeDasharray={p.thin ? "2 2" : undefined} />
                {p.labelY !== p.y && <line x1={p.x + p.r} y1={p.y} x2={p.x + p.r + 3} y2={p.labelY} stroke="var(--border-strong)" strokeWidth={1} />}
                <text x={p.x + p.r + 4} y={p.labelY + 3.5} fontSize={10} fill={dim ? "var(--text-tertiary)" : "var(--text)"} className="numeric" style={{ fontWeight: 500 }}>
                  {p.symbol}
                </text>
              </g>
            );
          })}
          {/* The book. */}
          <g onPointerEnter={() => setHover("book")} onPointerMove={() => setHover("book")}>
            <circle cx={model.book.x} cy={model.book.y} r={12} fill="transparent" />
            <circle cx={model.book.x} cy={model.book.y} r={7} fill="none" stroke="var(--brand)" strokeWidth={2} />
            <circle cx={model.book.x} cy={model.book.y} r={2.5} fill="var(--brand)" />
            {model.book.labelBaseline !== model.book.y - 8 && (
              <line x1={model.book.x + 9} y1={model.book.y} x2={model.book.x + 11} y2={model.book.labelBaseline - 3} stroke="var(--border-strong)" strokeWidth={1} />
            )}
            <text x={model.book.x + 11} y={model.book.labelBaseline} fontSize={10} fill="var(--brand)" style={{ fontWeight: 600 }}>
              this book
            </text>
          </g>
        </svg>
        {active && (
          <Readout x={active.x} y={active.y} width={W}>
            <div className="text-text">
              {active.symbol} <span className="text-tertiary">{BY_SYMBOL[active.symbol]?.name}</span>
            </div>
            <div className="numeric text-tertiary">
              vol {pct(active.volPct, 0)} · {signedPct(active.ret * 100, 1)} over the window{active.held ? ` · ${pct(active.weight * 100, 1)} of the book` : " · not held"}
            </div>
            {active.thin && <div style={{ color: "var(--watch)" }}>thin trading, hourly prints clipped at ±8%</div>}
          </Readout>
        )}
        {hover === "book" && (
          <Readout x={model.book.x} y={model.book.y} width={W}>
            <div className="text-text">This book</div>
            <div className="numeric text-tertiary">
              vol {pct(model.book.vol, 0)} · {signedPct(model.book.ret * 100, 1)} over the window at today&rsquo;s weights
            </div>
          </Readout>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-tertiary">
        Solid points are held, sized by weight; outlines are the rest of the universe; dashed rings are thin names whose prints are clipped. Up and to the left is the corner everyone wants. Thirty days is a short memory, a name here is where it has been, not where it is going.
      </p>
    </div>
  );
}
