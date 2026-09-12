"use client";

import { useState } from "react";
import type { OnChainSnapshot } from "@/lib/onchain";
import { riskBand, usd, dayLabel, clockTime } from "@/lib/format";
import { useMeasuredWidth, Readout } from "./chart";

const H = 88;
const PAD = { top: 10, right: 10, bottom: 14, left: 26 };

/**
 * The owner's snapshots on a line of time, each a dot coloured by its
 * band, against the policy's risk limit. A breach is a dot above the
 * line — the picture a lender subscribed to the event would be drawing.
 */
export function SnapshotChart({ snapshots, riskLimit }: { snapshots: OnChainSnapshot[]; riskLimit: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useMeasuredWidth<HTMLDivElement>(400);
  const pts = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);
  if (pts.length < 2) return null;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const t0 = pts[0].timestamp;
  const span = Math.max(1, pts[pts.length - 1].timestamp - t0);
  const x = (t: number) => PAD.left + ((t - t0) / span) * innerW;
  const y = (s: number) => PAD.top + innerH - (Math.min(100, Math.max(0, s)) / 100) * innerH;
  const active = hover !== null ? pts[hover] : null;

  return (
    <div ref={ref} className="relative mt-2" onPointerLeave={() => setHover(null)}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label="Recorded risk scores over time against the policy limit">
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill="var(--text-tertiary)" className="numeric">
              {v}
            </text>
          </g>
        ))}
        {riskLimit !== null && (
          <g>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(riskLimit)} y2={y(riskLimit)} stroke="var(--severe)" strokeWidth={1} strokeDasharray="3 4" opacity={0.7} />
            <text x={W - PAD.right} y={y(riskLimit) - 3} textAnchor="end" fontSize={9} fill="var(--severe)" className="numeric" opacity={0.9}>
              limit {riskLimit}
            </text>
          </g>
        )}
        <path
          d={pts.map((p, i) => `${i ? "L" : "M"} ${x(p.timestamp).toFixed(1)} ${y(p.score).toFixed(1)}`).join(" ")}
          fill="none"
          stroke="var(--text-tertiary)"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
        {pts.map((p, i) => (
          <g key={p.address} onPointerEnter={() => setHover(i)} onPointerMove={() => setHover(i)}>
            <circle cx={x(p.timestamp)} cy={y(p.score)} r={9} fill="transparent" />
            <circle cx={x(p.timestamp)} cy={y(p.score)} r={hover === i ? 4.5 : 3.5} fill={riskBand(p.score).color} stroke="var(--surface)" strokeWidth={1.5} />
          </g>
        ))}
      </svg>
      {active && (
        <Readout x={x(active.timestamp)} y={y(active.score)} width={W}>
          <div className="numeric text-text">
            score {active.score} · {usd(active.valueUsd)}
          </div>
          <div className="numeric text-tertiary">
            {dayLabel(active.timestamp * 1000)} {clockTime(active.timestamp * 1000)} · NYSE {active.marketOpen ? "open" : "closed"}
          </div>
        </Readout>
      )}
    </div>
  );
}
