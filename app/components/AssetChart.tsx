"use client";

import { useMemo, useState } from "react";
import type { PricePoint } from "@/lib/quant";
import { closedPeriods, type SessionSplit } from "@/lib/sessions";
import { price as fmtPrice, signedPct, dayLabel, clockTime, pct } from "@/lib/format";
import { useMeasuredWidth, Readout, GridLine, niceTicks, nearestIndex, AXIS_FONT } from "./chart";

const H = 200;
const PAD = { top: 14, right: 12, bottom: 22, left: 52 };

/**
 * A token's thirty days with the hours its market was closed shaded. The
 * shaded stretches are the premise made visible: every move inside one
 * happened with nobody on the other side of the stock. The readout names
 * the hour and whether the NYSE was open in it.
 */
export function AssetChart({
  symbol,
  series,
  color,
  split,
  underlying,
}: {
  symbol: string;
  series: PricePoint[];
  color: string;
  split?: SessionSplit | null;
  underlying?: string | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [svgRef, W, svgNode] = useMeasuredWidth<SVGSVGElement>(800);

  const model = useMemo(() => {
    if (series.length < 3) return null;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const t0 = series[0].t;
    const t1 = series[series.length - 1].t;
    const span = Math.max(1, t1 - t0);
    const prices = series.map((p) => p.price);
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    const padY = (hi - lo || lo * 0.02) * 0.08;
    const min = lo - padY;
    const max = hi + padY;
    const range = max - min || 1;
    const x = (t: number) => PAD.left + ((t - t0) / span) * innerW;
    const y = (v: number) => PAD.top + innerH - ((v - min) / range) * innerH;
    const xs = series.map((p) => x(p.t));
    const line = series.map((p, i) => `${i ? "L" : "M"} ${xs[i].toFixed(2)} ${y(p.price).toFixed(2)}`).join(" ");
    const closed = closedPeriods(t0, t1).map((c) => ({ x1: x(c.start), x2: x(c.end), weekend: c.end - c.start > 40 * 3_600_000 }));
    const ticks = niceTicks(min, max, 3).map((v) => ({ v, y: y(v) }));
    const days = niceDays(t0, t1).map((t) => ({ t, x: x(t) }));
    return { x, y, xs, line, closed, ticks, days, innerH, first: series[0].price };
  }, [series, W]);

  if (!model) return <p className="px-4 py-3 text-[11px] text-tertiary">No thirty-day series for {symbol} yet.</p>;

  const idx = hover ?? series.length - 1;
  const active = series[idx];
  const changeFromStart = (active.price / model.first - 1) * 100;

  function locate(clientX: number) {
    const rect = svgNode.current?.getBoundingClientRect();
    if (!rect) return;
    setHover(nearestIndex(model!.xs, clientX - rect.left));
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1 pb-1">
        <span className="flex items-baseline gap-2">
          <span className="numeric text-[15px] font-medium text-text">{fmtPrice(active.price)}</span>
          <span className="numeric text-[11px]" style={{ color: changeFromStart < 0 ? "var(--severe)" : changeFromStart > 0 ? "var(--calm)" : "var(--text-tertiary)" }}>
            {signedPct(changeFromStart)} over the window
          </span>
        </span>
        {split && (
          <span className="text-[11px] text-tertiary">
            <span className="numeric text-secondary">{pct(split.closedShare * 100, 0)}</span> of its variance came while the NYSE was closed
            {split.closedVolPerHour > 0 && split.openVolPerHour > 0 && (
              <> · per hour it moves <span className="numeric text-secondary">{(split.closedVolPerHour / split.openVolPerHour).toFixed(2)}×</span> as much closed as open</>
            )}
          </span>
        )}
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
        aria-label={`${symbol} price over thirty days, with the hours the NYSE was closed shaded`}
      >
        <defs>
          <pattern id={`closed-${symbol}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--watch)" strokeWidth="1" opacity="0.28" />
          </pattern>
        </defs>
        {model.closed.map((c, i) => (
          <rect key={i} x={c.x1} y={PAD.top} width={Math.max(0.5, c.x2 - c.x1)} height={model.innerH} fill={c.weekend ? `url(#closed-${symbol})` : "var(--watch)"} opacity={c.weekend ? 1 : 0.07} />
        ))}
        {model.ticks.map((t) => (
          <GridLine key={t.v} y={t.y} x1={PAD.left} x2={W - PAD.right} label={fmtPrice(t.v)} />
        ))}
        {model.days.map((d) => (
          <text key={d.t} x={d.x} y={H - 6} textAnchor="middle" fontSize={AXIS_FONT} fill="var(--text-tertiary)" className="numeric">
            {dayLabel(d.t)}
          </text>
        ))}
        <path d={model.line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hover !== null && <line x1={model.xs[hover]} y1={PAD.top} x2={model.xs[hover]} y2={PAD.top + model.innerH} stroke="var(--text-tertiary)" strokeWidth={1} />}
        <circle cx={model.xs[idx]} cy={model.y(active.price)} r={3} fill={color} stroke="var(--surface)" strokeWidth={2} />
      </svg>
      {hover !== null && (
        <Readout x={model.xs[hover]} y={model.y(active.price)} width={W}>
          <div className="numeric text-text">{fmtPrice(active.price)}</div>
          <div className="numeric text-tertiary">
            {dayLabel(active.t)} {clockTime(active.t)}
          </div>
          <div className="text-tertiary">
            {isClosedAt(model.closed, model.xs[hover]) ? (
              <span style={{ color: "var(--watch)" }}>NYSE closed{underlying ? ` · ${underlying} not trading` : ""}</span>
            ) : (
              <span style={{ color: "var(--calm)" }}>NYSE open</span>
            )}
          </div>
        </Readout>
      )}
      <p className="mt-1 px-1 text-[10px] leading-snug text-tertiary">
        Shaded: hours the NYSE was closed — hatched for weekends and holidays. Every move inside them is the token pricing a share nobody could trade.
      </p>
    </div>
  );
}

function isClosedAt(closed: { x1: number; x2: number }[], x: number): boolean {
  return closed.some((c) => x >= c.x1 && x <= c.x2);
}

/** Day boundaries to label: every ~5 days across the window. */
function niceDays(t0: number, t1: number): number[] {
  const day = 86_400_000;
  const start = Math.ceil(t0 / day) * day;
  const days = Math.max(1, Math.round((t1 - t0) / day));
  const every = days > 20 ? 5 : days > 10 ? 3 : 1;
  const out: number[] = [];
  for (let t = start; t <= t1; t += day * every) out.push(t);
  return out;
}
