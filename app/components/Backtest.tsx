"use client";

import { useMemo, useState } from "react";
import type { Analysis } from "@/lib/portfolio";
import { riskBand, usd, dayLabel, clockTime, signedPct, pct } from "@/lib/format";
import { useMeasuredWidth, Readout, GridLine, niceTicks, nearestIndex, AXIS_FONT } from "./chart";
import { Button } from "./ui";

const H = 220;
const PAD = { top: 12, right: 12, bottom: 24, left: 46 };

type View = "score" | "value" | "drawdown";

/**
 * The score this allocation would have carried on every hour of the last
 * thirty days — the same recursive estimator, seeing only what was known
 * then — with the book's value and drawdown on the same axis of time. It
 * is a statement about the shape of the book, not the wallet's past: the
 * wallet's own record is what the owner anchors on-chain. Under it, the
 * model marked against what happened.
 */
export function Backtest({ a }: { a: Analysis }) {
  const [view, setView] = useState<View>("score");
  const [hover, setHover] = useState<number | null>(null);
  const [svgRef, W, svgNode] = useMeasuredWidth<SVGSVGElement>(800);

  const points = a.backtest;
  const values = a.valueSeries;

  const model = useMemo(() => {
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const src =
      view === "score"
        ? points.map((p) => ({ t: p.t, v: p.score }))
        : view === "value"
          ? values.map((p) => ({ t: p.t, v: p.value }))
          : values.map((p) => ({ t: p.t, v: p.drawdown * 100 }));
    if (src.length < 2) return null;
    const vs = src.map((p) => p.v);
    let min: number;
    let max: number;
    if (view === "score") {
      const lo = Math.min(...vs);
      const hi = Math.max(...vs);
      const mid = (lo + hi) / 2;
      const span = Math.max(hi - lo, 12);
      min = Math.max(0, mid - span * 0.62);
      max = Math.min(100, mid + span * 0.62);
    } else if (view === "value") {
      const lo = Math.min(...vs);
      const hi = Math.max(...vs);
      const pad = (hi - lo || hi * 0.05) * 0.1;
      min = lo - pad;
      max = hi + pad;
    } else {
      min = Math.min(-1, Math.min(...vs) * 1.1);
      max = 0.5;
    }
    const range = max - min || 1;
    const t0 = src[0].t;
    const elapsed = Math.max(1, src[src.length - 1].t - t0);
    const x = (t: number) => PAD.left + ((t - t0) / elapsed) * innerW;
    const y = (v: number) => PAD.top + innerH - ((v - min) / range) * innerH;
    const xs = src.map((p) => x(p.t));
    const line = src.map((p, i) => `${i ? "L" : "M"} ${xs[i].toFixed(2)} ${y(p.v).toFixed(2)}`).join(" ");
    const base = view === "drawdown" ? y(0) : PAD.top + innerH;
    const area = `${line} L ${xs[xs.length - 1].toFixed(2)} ${base} L ${xs[0].toFixed(2)} ${base} Z`;
    const ticks = niceTicks(min, max, 3).map((v) => ({ v, y: y(v) }));
    const bands = view === "score" ? [25, 45, 70].filter((b) => b > min && b < max).map((b) => ({ at: b, y: y(b) })) : [];
    return { src, xs, x, y, line, area, ticks, bands, innerH, min, max };
  }, [points, values, view, W]);

  if (!model) {
    return <p className="px-4 py-4 text-xs text-tertiary">The backtest needs a day of shared hourly prices across the holdings.</p>;
  }

  const idx = hover ?? model.src.length - 1;
  const active = model.src[idx];
  const first = model.src[0];
  const color =
    view === "score" ? riskBand(active.v).color : view === "value" ? (active.v >= first.v ? "var(--calm)" : "var(--severe)") : "var(--severe)";
  const fmt = (v: number) => (view === "score" ? v.toFixed(1) : view === "value" ? usd(v) : `${v.toFixed(1)}%`);
  const peak = view === "score" ? model.src.reduce((p, q) => (q.v > p.v ? q : p)) : null;
  const check = a.varCheck;

  function locate(clientX: number) {
    const rect = svgNode.current?.getBoundingClientRect();
    if (!rect) return;
    setHover(nearestIndex(model!.xs, clientX - rect.left));
  }

  const headline =
    view === "score"
      ? `${(active.v - first.v) >= 0 ? "+" : ""}${(active.v - first.v).toFixed(1)} over ${Math.round((active.t - first.t) / 86_400_000)} days · peak ${peak!.v.toFixed(1)} on ${dayLabel(peak!.t)}`
      : view === "value"
        ? `${signedPct((active.v / first.v - 1) * 100, 1)} over ${Math.round((active.t - first.t) / 86_400_000)} days at today's amounts`
        : a.drawdown
          ? `deepest ${pct(a.drawdown.maxDrawdown * 100, 1)} · ${dayLabel(a.drawdown.peakAt)} to ${dayLabel(a.drawdown.troughAt)}`
          : "";

  return (
    <div className="px-1 pb-3 pt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-3">
        <div className="flex items-baseline gap-2.5">
          <span className="numeric text-xl font-medium" style={{ color }}>{fmt(active.v)}</span>
          <span className="numeric text-xs text-tertiary">
            {hover !== null ? `${dayLabel(active.t)} ${clockTime(active.t)}` : headline}
          </span>
        </div>
        <span className="flex gap-1">
          {(["score", "value", "drawdown"] as View[]).map((v) => (
            <Button key={v} size="sm" variant={view === v ? "primary" : "ghost"} className="!h-6 !px-2 !text-[11px] capitalize" onClick={() => setView(v)} aria-pressed={view === v}>
              {v === "score" ? "Risk score" : v}
            </Button>
          ))}
        </span>
      </div>
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full touch-pan-y"
          style={{ height: H }}
          onPointerMove={(e) => locate(e.clientX)}
          onPointerDown={(e) => locate(e.clientX)}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`${view} of the current allocation over the last thirty days`}
        >
          <defs>
            <linearGradient id={`bt-fill-${view}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={view === "drawdown" ? 0 : 0.16} />
              <stop offset="100%" stopColor={color} stopOpacity={view === "drawdown" ? 0.18 : 0} />
            </linearGradient>
          </defs>
          {model.ticks.map((t) => (
            <GridLine key={t.v} y={t.y} x1={PAD.left} x2={W - PAD.right} label={view === "value" ? usd(t.v, { compact: true }) : view === "score" ? t.v.toFixed(0) : `${t.v.toFixed(0)}%`} />
          ))}
          {model.bands.map((b) => (
            <g key={b.at}>
              <line x1={PAD.left} y1={b.y} x2={W - PAD.right} y2={b.y} stroke={riskBand(b.at).color} strokeWidth={1} strokeDasharray="3 5" opacity={0.45} />
              <text x={W - PAD.right} y={b.y - 4} textAnchor="end" fontSize={9} fill={riskBand(b.at).color} opacity={0.8} className="numeric">
                {riskBand(b.at).label.toLowerCase()} {b.at}
              </text>
            </g>
          ))}
          <path d={model.area} fill={`url(#bt-fill-${view})`} />
          <path d={model.line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {hover !== null && <line x1={model.xs[hover]} y1={PAD.top} x2={model.xs[hover]} y2={PAD.top + model.innerH} stroke="var(--text-tertiary)" strokeWidth={1} />}
          <circle cx={model.xs[idx]} cy={model.y(active.v)} r={3} fill={color} stroke="var(--surface)" strokeWidth={2} />
        </svg>
        {hover !== null && (
          <Readout x={model.xs[hover]} y={model.y(active.v)} width={W}>
            <div className="numeric text-text">{fmt(active.v)}</div>
            <div className="numeric text-tertiary">
              {dayLabel(active.t)} {clockTime(active.t)}
            </div>
            {view === "score" && (
              <div className="numeric text-tertiary">
                VaR {usd(points[idx]?.varUsd ?? 0)} · book {usd(points[idx]?.value ?? 0)}
              </div>
            )}
          </Readout>
        )}
      </div>
      <div className="mt-1 flex justify-between px-3">
        <span className="numeric text-[10px] text-tertiary">{dayLabel(first.t)}</span>
        <span className="numeric text-[10px] text-tertiary">{dayLabel((first.t + model.src[model.src.length - 1].t) / 2)}</span>
        <span className="numeric text-[10px] text-tertiary">{dayLabel(model.src[model.src.length - 1].t)}</span>
      </div>

      {check && (
        <div className="mx-3 mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-border pt-3 text-[11px]">
          <span className="text-text">
            <span className="label mr-2">Model check</span>
            The one-day VaR was exceeded on{" "}
            <span className="numeric" style={{ color: check.verdict === "in line" ? "var(--calm)" : check.verdict === "watch" ? "var(--watch)" : "var(--severe)" }}>
              {check.exceptions} of {check.days}
            </span>{" "}
            days · about {check.expected.toFixed(1)} expected at 95%
          </span>
          <span className="text-tertiary">
            {check.verdict === "in line"
              ? "in line with its confidence"
              : check.verdict === "watch"
                ? "more breaches than the model promised — read the VaR as a floor"
                : "the model is too calm for this book — the historical VaR headlines"}
            {check.worstLoss > check.worstForecast && (
              <> · worst miss {pct(check.worstLoss * 100, 1)} against {pct(check.worstForecast * 100, 1)} on {dayLabel(check.worstAt)}</>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
