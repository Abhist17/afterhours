"use client";

import type { MarketStatus } from "@/lib/market-hours";
import { easternClock, formatEastern } from "@/lib/market-hours";
import { untilTime } from "@/lib/format";
import { useMounted } from "@/lib/hooks";

/**
 * A day in New York as a ring. The NYSE session — 9:30 to 4:00, six and
 * a half hours — is the short bright arc; the rest of the ring is the
 * seventeen and a half hours a day the tokens trade without their
 * shares. The dot is now. On a weekend or holiday the whole ring is
 * afterhours, and the caption says so.
 */
const SIZE = 236;
const R = 96;
const CX = SIZE / 2;
const CY = SIZE / 2;
const MINUTES = 24 * 60;

// Coordinates are rounded to two decimals so the server and the client
// print the same string: a floating-point tail that differs in the last
// digit is a hydration mismatch, not a pixel.
function polar(minutes: number, r = R) {
  // Midnight at the top, clockwise.
  const angle = (minutes / MINUTES) * 2 * Math.PI - Math.PI / 2;
  return { x: Number((CX + r * Math.cos(angle)).toFixed(2)), y: Number((CY + r * Math.sin(angle)).toFixed(2)) };
}

function arc(from: number, to: number, r = R) {
  const a = polar(from, r);
  const b = polar(to, r);
  const large = to - from > MINUTES / 2 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
}

export function SessionRing({ market, now }: { market: MarketStatus; now: number }) {
  const mounted = useMounted();
  const clock = easternClock(now);
  const minute = clock.minutes;
  const sessionOpen = 9 * 60 + 30;
  const sessionClose = market.earlyClose ? 13 * 60 : 16 * 60;
  const tradingDay = market.open || market.reason === "overnight";
  const dot = polar(minute);
  const openPt = polar(sessionOpen, R + 14);
  const closePt = polar(sessionClose, R + 14);

  return (
    <figure className="relative m-0 flex flex-col items-center" aria-label={market.open ? "NYSE is open" : `NYSE closed, ${market.reason}`}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="block">
        <defs>
          <radialGradient id="ring-glow" cx="50%" cy="50%" r="50%">
            <stop offset="55%" stopColor="var(--brand)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.16" />
          </radialGradient>
        </defs>
        <circle cx={CX} cy={CY} r={R + 26} fill="url(#ring-glow)" />

        {/* Hour ticks: heavier at 0, 6, 12, 18. */}
        {Array.from({ length: 24 }, (_, h) => {
          const a = polar(h * 60, R - 12);
          const b = polar(h * 60, h % 6 === 0 ? R - 20 : R - 16);
          return <line key={h} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--border-strong)" strokeWidth={h % 6 === 0 ? 1.5 : 1} />;
        })}

        {/* The afterhours: everything that is not the session. */}
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border)" strokeWidth={7} />
        {tradingDay ? (
          <path d={arc(sessionOpen, sessionClose)} fill="none" stroke="var(--calm)" strokeWidth={7} strokeLinecap="butt" />
        ) : (
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--watch)" strokeWidth={7} opacity={0.55} strokeDasharray="2 6" />
        )}

        {/* Session bounds. */}
        {tradingDay && (
          <>
            <text x={openPt.x} y={openPt.y + 3} textAnchor="middle" fontSize="9.5" fill="var(--text-tertiary)" className="numeric">9:30</text>
            <text x={closePt.x} y={closePt.y + 3} textAnchor="middle" fontSize="9.5" fill="var(--text-tertiary)" className="numeric">{market.earlyClose ? "1:00" : "4:00"}</text>
          </>
        )}

        {/* Now. */}
        {mounted && (
          <>
            <circle cx={dot.x} cy={dot.y} r={9} fill={market.open ? "var(--calm)" : "var(--watch)"} opacity={0.25} className={market.open ? "" : "breathe"} />
            <circle cx={dot.x} cy={dot.y} r={4.5} fill={market.open ? "var(--calm)" : "var(--watch)"} stroke="var(--bg)" strokeWidth={2} />
          </>
        )}

        {/* Reading. */}
        <text x={CX} y={CY - 18} textAnchor="middle" fontSize="10.5" fill="var(--text-tertiary)" style={{ letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
          New York
        </text>
        <text x={CX} y={CY + 8} textAnchor="middle" fontSize="26" fill="var(--text)" className="numeric" style={{ fontWeight: 500, letterSpacing: "-0.02em" }}>
          {mounted ? clock.label : "--:--"}
        </text>
        <text x={CX} y={CY + 28} textAnchor="middle" fontSize="11" fill={market.open ? "var(--calm)" : "var(--watch)"} style={{ fontWeight: 600 }}>
          {market.open ? "NYSE open" : `NYSE closed · ${market.reason}`}
        </text>
      </svg>
      <figcaption className="numeric mt-1 text-center text-[11px] text-tertiary">
        {mounted
          ? market.open
            ? `closes in ${untilTime(market.nextClose)} · then ${((market.nextOpen - market.nextClose) / 3_600_000).toFixed(1)}h on Solana alone`
            : `${market.hoursClosed.toFixed(0)}h without a market · opens ${formatEastern(market.nextOpen)}`
          : " "}
      </figcaption>
    </figure>
  );
}
