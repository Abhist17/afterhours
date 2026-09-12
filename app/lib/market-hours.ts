/**
 * NYSE hours, from the point of view of a token that never closes.
 *
 * An xStock trades on Solana at 3am on a Sunday. The share it represents
 * does not. Between the close and the next open, the token's price is a
 * forecast of where the stock will reopen — and the gap between the two is
 * risk the holder carries with nobody on the other side of the book. So the
 * app needs to know, at any instant, whether the underlying market is open,
 * when it next opens, and where the token has drifted since the last print.
 *
 * All times are computed in America/New_York via Intl, so DST is handled by
 * the platform rather than by a table.
 */

import type { PricePoint } from "./quant";

const ZONE = "America/New_York";

/** Full-day NYSE closures. Extend each December. */
const HOLIDAYS = new Set([
  // 2025
  "2025-01-01", "2025-01-09", "2025-01-20", "2025-02-17", "2025-04-18",
  "2025-05-26", "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27",
  "2025-12-25",
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
  "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);

/** Sessions that end at 13:00 instead of 16:00. */
const EARLY_CLOSES = new Set([
  "2025-07-03", "2025-11-28", "2025-12-24",
  "2026-11-27", "2026-12-24",
  "2027-11-26",
]);

const OPEN_MINUTES = 9 * 60 + 30;
const CLOSE_MINUTES = 16 * 60;
const EARLY_CLOSE_MINUTES = 13 * 60;

interface EasternTime {
  /** YYYY-MM-DD in New York. */
  date: string;
  /** 0 = Sunday. */
  weekday: number;
  /** Minutes since midnight in New York. */
  minutes: number;
}

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function eastern(at: Date | number): EasternTime {
  const parts = formatter.formatToParts(new Date(at));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: WEEKDAYS.indexOf(get("weekday")),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

export function isTradingDay(et: EasternTime): boolean {
  return et.weekday !== 0 && et.weekday !== 6 && !HOLIDAYS.has(et.date);
}

export function closeMinutesFor(date: string): number {
  return EARLY_CLOSES.has(date) ? EARLY_CLOSE_MINUTES : CLOSE_MINUTES;
}

export function isMarketOpen(at: Date | number = Date.now()): boolean {
  const et = eastern(at);
  return isTradingDay(et) && et.minutes >= OPEN_MINUTES && et.minutes < closeMinutesFor(et.date);
}

/** Days since the epoch for a YYYY-MM-DD, for date arithmetic without zones. */
function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/**
 * Wall-clock instant of a New York local time, found by fixed-point search
 * rather than offset arithmetic so DST transitions cannot be got wrong: the
 * platform says what time it is in New York at a guess, and the guess moves
 * by the difference until they agree.
 */
function instantOf(date: string, minutes: number): number {
  const [y, m, d] = date.split("-").map(Number);
  let guess = Date.UTC(y, m - 1, d, 12);
  for (let i = 0; i < 4; i++) {
    const et = eastern(guess);
    const diff = (dayNumber(date) - dayNumber(et.date)) * 1440 + (minutes - et.minutes);
    if (diff === 0) break;
    guess += diff * 60_000;
  }
  return guess;
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

export interface MarketStatus {
  open: boolean;
  /** Next session open, as a wall-clock instant. */
  nextOpen: number;
  /** Most recent session close at or before `at`. */
  lastClose: number;
  /** Close of the current session when open, else the next session's close. */
  nextClose: number;
  /** Hours the token has been trading without the underlying. */
  hoursClosed: number;
  /** "weekend" | "holiday" | "overnight" | null when open. */
  reason: "weekend" | "holiday" | "overnight" | null;
  /** True when the session in view ends at 1:00 rather than 4:00. */
  earlyClose: boolean;
}

export function marketStatus(at: Date | number = Date.now()): MarketStatus {
  const now = typeof at === "number" ? at : at.getTime();
  const et = eastern(now);
  const open = isMarketOpen(now);

  // Last close: today's if we are past it, else the previous trading day's.
  let lastCloseDate = et.date;
  if (!(isTradingDay(et) && et.minutes >= closeMinutesFor(et.date))) {
    do {
      lastCloseDate = shiftDate(lastCloseDate, -1);
    } while (!isTradingDay(eastern(instantOf(lastCloseDate, 12 * 60))));
  }
  const lastClose = instantOf(lastCloseDate, closeMinutesFor(lastCloseDate));

  // Next open: today's if before it on a trading day, else the next trading day's.
  let nextOpenDate = et.date;
  if (!(isTradingDay(et) && et.minutes < OPEN_MINUTES)) {
    do {
      nextOpenDate = shiftDate(nextOpenDate, 1);
    } while (!isTradingDay(eastern(instantOf(nextOpenDate, 12 * 60))));
  }
  const nextOpen = instantOf(nextOpenDate, OPEN_MINUTES);
  const nextClose = open
    ? instantOf(et.date, closeMinutesFor(et.date))
    : instantOf(nextOpenDate, closeMinutesFor(nextOpenDate));

  let reason: MarketStatus["reason"] = null;
  if (!open) {
    if (et.weekday === 0 || et.weekday === 6) reason = "weekend";
    else if (HOLIDAYS.has(et.date)) reason = "holiday";
    else reason = "overnight";
  }

  return {
    open,
    nextOpen,
    lastClose,
    nextClose,
    hoursClosed: open ? 0 : Math.max(0, (now - lastClose) / 3_600_000),
    reason,
    earlyClose: closeMinutesFor(open ? et.date : nextOpenDate) === EARLY_CLOSE_MINUTES,
  };
}

/**
 * Where the token has moved since the underlying last printed. The price at
 * the close is the last observation at or before it; the move is what the
 * market will open to, or what the holder is carrying without a hedge.
 */
export function moveSinceClose(
  series: PricePoint[],
  lastClose: number,
  latest: number
): { atClose: number; now: number; changePct: number } | null {
  if (!series.length || !(latest > 0)) return null;
  let atClose: number | null = null;
  for (const p of series) {
    if (p.t <= lastClose) atClose = p.price;
    else break;
  }
  if (atClose === null || !(atClose > 0)) return null;
  return { atClose, now: latest, changePct: ((latest - atClose) / atClose) * 100 };
}

/** The New York wall clock: minutes since midnight and a label to print. */
export function easternClock(at: number): { minutes: number; label: string } {
  const et = eastern(at);
  const h = Math.floor(et.minutes / 60);
  const m = et.minutes % 60;
  const label = `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  return { minutes: et.minutes, label };
}

export function formatEastern(at: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(at));
}
