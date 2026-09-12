"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { BacktestPoint } from "@/lib/quant";
import { riskBand, usd, dayLabel, clockTime } from "@/lib/format";
import { EmptyState } from "./ui";

const H = 220;
const PAD = { top: 12, right: 12, bottom: 24, left: 40 };
const FALLBACK_W = 800;

/** Measures the element's own width so the chart draws in real pixels. */
function useMeasuredWidth(fallback: number) {
  const [width, setWidth] = useState(fallback);
  const nodeRef = useRef<SVGSVGElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const ref = useCallback((node: SVGSVGElement | null) => {
    observerRef.current?.disconnect();
    nodeRef.current = node;
    if (!node) return;
    const measure = () => {
      const next = Math.round(node.getBoundingClientRect().width);
      if (next > 0) setWidth((c) => (c === next ? c : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    observerRef.current = new ResizeObserver(measure);
    observerRef.current.observe(node);
  }, []);
  return [ref, width, nodeRef] as const;
}

/**
 * The score this allocation would have carried on every hour of the last
 * thirty days — the same recursive estimator, seeing only what was known
 * then. It is a statement about the shape of the book, not the wallet's
 * past: the wallet's own record is what the owner anchors on-chain.
 */
export function Backtest({ points }: { points: BacktestPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [svgRef, W, svgNode] = useMeasuredWidth(FALLBACK_W);

  const model = useMemo(() => {
    if (points.length < 2) return null;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const scores = points.map((p) => p.score);
    const lo = Math.min(...scores);
    const hi = Math.max(...scores);
    const mid = (lo + hi) / 2;
    const span = Math.max(hi - lo, 12);
    const min = Math.max(0, mid - span * 0.62);
    const max = Math.min(100, mid + span * 0.62);
    const range = max - min || 1;
    const t0 = points[0].t;
    const elapsed = Math.max(1, points[points.length - 1].t - t0);
    const x = (i: number) => PAD.left + ((points[i].t - t0) / elapsed) * innerW;
    const y = (v: number) => PAD.top + innerH - ((v - min) / range) * innerH;
    const line = points.map((p, i) => `${i ? "L" : "M"} ${x(i).toFixed(2)} ${y(p.score).toFixed(2)}`).join(" ");
    const baseline = PAD.top + innerH;
    const area = `${line} L ${x(points.length - 1).toFixed(2)} ${baseline} L ${x(0).toFixed(2)} ${baseline} Z`;
    const ticks = [0, 0.5, 1].map((f) => ({ y: PAD.top + f * innerH, value: max - f * range }));
    // Band lines that fall inside the frame.
    const bands = [25, 45, 70].filter((b) => b > min && b < max).map((b) => ({ at: b, y: y(b) }));
    return { x, y, line, area, ticks, bands, innerH };
  }, [points, W]);

  if (!model) {
    return <EmptyState title="Not enough aligned history" body="The backtest needs a day of shared hourly prices across the holdings." compact />;
  }

  const index = hover ?? points.length - 1;
  const active = points[index];
  const band = riskBand(active.score);
  const first = points[0];
  const worst = points.reduce((a, b) => (b.score > a.score ? b : a));

  function locate(clientX: number) {
    const rect = svgNode.current?.getBoundingClientRect();
    if (!rect) return;
    const target = clientX - rect.left;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(model!.x(i) - target);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    setHover(nearest);
  }

  return (
    <div className="px-1 pb-3 pt-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3">
        <div className="flex items-baseline gap-2.5">
          <span className="numeric text-xl font-medium" style={{ color: band.color }}>{active.score.toFixed(1)}</span>
          <span className="numeric text-xs text-tertiary">VaR {usd(active.varUsd)} · book {usd(active.value)}</span>
        </div>
        <span className="numeric text-xs text-tertiary">
          {hover !== null
            ? `${dayLabel(active.t)} ${clockTime(active.t)}`
            : `${(active.score - first.score) >= 0 ? "+" : ""}${(active.score - first.score).toFixed(1)} over ${Math.round((active.t - first.t) / 86_400_000)} days · peak ${worst.score.toFixed(1)} on ${dayLabel(worst.t)}`}
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full touch-pan-y"
        style={{ height: H }}
        onPointerMove={(e) => locate(e.clientX)}
        onPointerDown={(e) => locate(e.clientX)}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Risk score of the current allocation over the last thirty days. Latest ${active.score.toFixed(1)}, peak ${worst.score.toFixed(1)}.`}
      >
        <defs>
          <linearGradient id="bt-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={band.color} stopOpacity="0.16" />
            <stop offset="100%" stopColor={band.color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {model.ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.left - 8} y={t.y + 3} textAnchor="end" fontSize="10" fill="var(--text-tertiary)" className="numeric">{t.value.toFixed(0)}</text>
          </g>
        ))}
        {model.bands.map((b) => (
          <g key={b.at}>
            <line x1={PAD.left} y1={b.y} x2={W - PAD.right} y2={b.y} stroke={riskBand(b.at).color} strokeWidth={1} strokeDasharray="3 5" opacity={0.45} />
            <text x={W - PAD.right} y={b.y - 4} textAnchor="end" fontSize="9" fill={riskBand(b.at).color} opacity={0.8} className="numeric">{riskBand(b.at).label.toLowerCase()} {b.at}</text>
          </g>
        ))}
        <path d={model.area} fill="url(#bt-fill)" />
        <path d={model.line} fill="none" stroke={band.color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hover !== null && <line x1={model.x(hover)} y1={PAD.top} x2={model.x(hover)} y2={PAD.top + model.innerH} stroke="var(--text-tertiary)" strokeWidth={1} />}
        <circle cx={model.x(index)} cy={model.y(active.score)} r={3} fill={band.color} stroke="var(--surface)" strokeWidth={2} />
      </svg>
      <div className="mt-1 flex justify-between px-3">
        <span className="numeric text-[10px] text-tertiary">{dayLabel(points[0].t)}</span>
        <span className="numeric text-[10px] text-tertiary">{dayLabel((points[0].t + points[points.length - 1].t) / 2)}</span>
        <span className="numeric text-[10px] text-tertiary">{dayLabel(points[points.length - 1].t)}</span>
      </div>
    </div>
  );
}
