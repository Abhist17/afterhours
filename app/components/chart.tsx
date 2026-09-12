"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

/**
 * What every chart on the desk shares: a measured width so SVG draws in
 * real pixels, a readout that follows the pointer, nice axis ticks, and
 * one set of type sizes. Colour comes from the data (risk ramp, sleeves),
 * never from the chart.
 */

export const AXIS_FONT = 10;
export const PAD = { top: 12, right: 12, bottom: 22, left: 40 };

/** Measures the element's own width so the chart draws in real pixels. */
export function useMeasuredWidth<T extends Element>(fallback: number) {
  const [width, setWidth] = useState(fallback);
  const nodeRef = useRef<T | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const ref = useCallback((node: T | null) => {
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

/** Round tick values: 1, 2, 5 × 10ⁿ steps covering the range. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [min];
  const span = max - min;
  const rough = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/** Floating readout inside a `relative` container, kept inside its edges. */
export function Readout({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const flip = x > width * 0.62;
  return (
    <div
      className="readout"
      style={{ left: flip ? undefined : x + 12, right: flip ? width - x + 12 : undefined, top: Math.max(0, y - 8) }}
      role="status"
    >
      {children}
    </div>
  );
}

/** A polyline through values, for a table cell. */
export function Sparkline({
  values,
  width = 72,
  height = 20,
  color = "var(--text-secondary)",
  baseline,
  minSpan = 0,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  /** A value drawn as a faint reference line, e.g. the last close. */
  baseline?: number;
  /** Smallest vertical range to draw, so noise in a flat series is not blown up. */
  minSpan?: number;
}) {
  if (values.length < 2) return <span className="inline-block" style={{ width, height }} aria-hidden="true" />;
  let lo = Math.min(...values, baseline ?? Infinity);
  let hi = Math.max(...values, baseline ?? -Infinity);
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const range = hi - lo || 1;
  const x = (i: number) => (i / (values.length - 1)) * (width - 2) + 1;
  const y = (v: number) => height - 2 - ((v - lo) / range) * (height - 4);
  const d = values.map((v, i) => `${i ? "L" : "M"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="inline-block align-middle">
      {baseline !== undefined && (
        <line x1={1} x2={width - 1} y1={y(baseline)} y2={y(baseline)} stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="2 3" />
      )}
      <path d={d} fill="none" stroke={color} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(last)} r={1.8} fill={color} />
    </svg>
  );
}

/** Horizontal gridline with a left label. */
export function GridLine({ y, x1, x2, label }: { y: number; x1: number; x2: number; label?: string }) {
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke="var(--border)" strokeWidth={1} />
      {label !== undefined && (
        <text x={x1 - 8} y={y + 3} textAnchor="end" fontSize={AXIS_FONT} fill="var(--text-tertiary)" className="numeric">
          {label}
        </text>
      )}
    </g>
  );
}

/** Index of the point nearest an x pixel, for hover. */
export function nearestIndex(xs: number[], target: number): number {
  let best = 0;
  let dist = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const d = Math.abs(xs[i] - target);
    if (d < dist) {
      dist = d;
      best = i;
    }
  }
  return best;
}
