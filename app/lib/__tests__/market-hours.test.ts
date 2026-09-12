import { describe, expect, it } from "vitest";
import {
  eastern,
  easternClock,
  isMarketOpen,
  marketStatus,
  moveSinceClose,
  isTradingDay,
} from "../market-hours";

// Instants chosen in UTC and checked against what New York's clock says,
// across both sides of a DST change.
const T = {
  // Wed 2026-09-16 15:00 UTC = 11:00 EDT — mid-session
  midSession: Date.UTC(2026, 8, 16, 15, 0),
  // Wed 2026-09-16 20:30 UTC = 16:30 EDT — just after the close
  afterClose: Date.UTC(2026, 8, 16, 20, 30),
  // Sat 2026-09-19 12:00 UTC — weekend
  weekend: Date.UTC(2026, 8, 19, 12, 0),
  // Mon 2026-09-07 15:00 UTC — Labor Day, 11:00 EDT, closed
  laborDay: Date.UTC(2026, 8, 7, 15, 0),
  // Fri 2026-11-27 18:30 UTC = 13:30 EST — after an early close
  earlyCloseDay: Date.UTC(2026, 10, 27, 18, 30),
  // Tue 2026-01-20 14:35 UTC = 09:35 EST — just after the open, in winter
  winterOpen: Date.UTC(2026, 0, 20, 14, 35),
  // Tue 2026-01-20 14:25 UTC = 09:25 EST — pre-market
  winterPre: Date.UTC(2026, 0, 20, 14, 25),
};

describe("eastern", () => {
  it("reads New York wall time on both sides of daylight saving", () => {
    expect(eastern(T.midSession)).toEqual({ date: "2026-09-16", weekday: 3, minutes: 11 * 60 });
    expect(eastern(T.winterOpen)).toEqual({ date: "2026-01-20", weekday: 2, minutes: 9 * 60 + 35 });
  });
});

describe("isMarketOpen", () => {
  it("knows the regular session", () => {
    expect(isMarketOpen(T.midSession)).toBe(true);
    expect(isMarketOpen(T.afterClose)).toBe(false);
    expect(isMarketOpen(T.winterOpen)).toBe(true);
    expect(isMarketOpen(T.winterPre)).toBe(false);
  });

  it("knows weekends, holidays and early closes", () => {
    expect(isMarketOpen(T.weekend)).toBe(false);
    expect(isMarketOpen(T.laborDay)).toBe(false);
    expect(isTradingDay(eastern(T.laborDay))).toBe(false);
    // 13:30 on the day after Thanksgiving: the 13:00 close has passed.
    expect(isMarketOpen(T.earlyCloseDay)).toBe(false);
  });
});

describe("marketStatus", () => {
  it("names why the market is closed and how long the token has traded alone", () => {
    const weekend = marketStatus(T.weekend);
    expect(weekend.open).toBe(false);
    expect(weekend.reason).toBe("weekend");
    // Friday 2026-09-18 16:00 EDT = 20:00 UTC
    expect(weekend.lastClose).toBe(Date.UTC(2026, 8, 18, 20, 0));
    // Monday 2026-09-21 09:30 EDT = 13:30 UTC
    expect(weekend.nextOpen).toBe(Date.UTC(2026, 8, 21, 13, 30));
    expect(weekend.hoursClosed).toBeCloseTo(16, 5);

    const overnight = marketStatus(T.afterClose);
    expect(overnight.reason).toBe("overnight");
    expect(overnight.lastClose).toBe(Date.UTC(2026, 8, 16, 20, 0));
    expect(overnight.nextOpen).toBe(Date.UTC(2026, 8, 17, 13, 30));

    const holiday = marketStatus(T.laborDay);
    expect(holiday.reason).toBe("holiday");
    // The Friday before Labor Day closed at 16:00 EDT.
    expect(holiday.lastClose).toBe(Date.UTC(2026, 8, 4, 20, 0));
    expect(holiday.nextOpen).toBe(Date.UTC(2026, 8, 8, 13, 30));
  });

  it("reports the current session's close while open", () => {
    const open = marketStatus(T.midSession);
    expect(open.open).toBe(true);
    expect(open.reason).toBeNull();
    expect(open.hoursClosed).toBe(0);
    expect(open.nextClose).toBe(Date.UTC(2026, 8, 16, 20, 0));
    // Yesterday's close is the last one.
    expect(open.lastClose).toBe(Date.UTC(2026, 8, 15, 20, 0));
  });

  it("uses the early close on the day after Thanksgiving", () => {
    const s = marketStatus(T.earlyCloseDay);
    // 13:00 EST = 18:00 UTC
    expect(s.lastClose).toBe(Date.UTC(2026, 10, 27, 18, 0));
  });

  it("flags a session that ends at one o'clock", () => {
    // Fri 2026-11-27 16:00 UTC = 11:00 EST — inside the half-day session
    expect(marketStatus(Date.UTC(2026, 10, 27, 16, 0)).earlyClose).toBe(true);
    expect(marketStatus(T.midSession).earlyClose).toBe(false);
    // Thanksgiving evening: the next session is the early one.
    expect(marketStatus(Date.UTC(2026, 10, 27, 2, 0)).earlyClose).toBe(true);
    // A Friday night looking at Monday: a full session.
    expect(marketStatus(T.weekend).earlyClose).toBe(false);
  });
});

describe("easternClock", () => {
  it("prints the New York wall clock in twelve-hour form", () => {
    expect(easternClock(T.midSession)).toEqual({ minutes: 11 * 60, label: "11:00 AM" });
    expect(easternClock(T.afterClose)).toEqual({ minutes: 16 * 60 + 30, label: "4:30 PM" });
    // Midnight and noon are 12, not 0.
    expect(easternClock(Date.UTC(2026, 8, 16, 4, 0)).label).toBe("12:00 AM");
    expect(easternClock(Date.UTC(2026, 8, 16, 16, 5)).label).toBe("12:05 PM");
  });
});

describe("moveSinceClose", () => {
  const close = Date.UTC(2026, 8, 18, 20, 0);
  const series = [
    { t: close - 3_600_000, price: 100 },
    { t: close, price: 102 },
    { t: close + 3_600_000, price: 103 },
    { t: close + 2 * 3_600_000, price: 101 },
  ];

  it("compares the latest price with the last print at or before the close", () => {
    const m = moveSinceClose(series, close, 101);
    expect(m).toEqual({ atClose: 102, now: 101, changePct: expect.closeTo(-0.98, 2) });
  });

  it("takes the last observation before the close when none lands on it", () => {
    const m = moveSinceClose(series, close - 60_000, 104);
    expect(m?.atClose).toBe(100);
  });

  it("is null without a usable print", () => {
    expect(moveSinceClose([], close, 100)).toBeNull();
    expect(moveSinceClose(series, close - 10 * 3_600_000, 100)).toBeNull();
    expect(moveSinceClose(series, close, 0)).toBeNull();
  });
});
