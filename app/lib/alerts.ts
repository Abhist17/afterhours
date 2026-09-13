/**
 * When the desk should speak up. Two conditions a holder actually cares
 * about while they are not looking: the book has moved more than they
 * would accept since the last close, and the risk score has crossed a
 * line. Each fires once when it becomes true and re-arms when it stops
 * being true, so a book sitting at −3% all night is one notification,
 * not sixty.
 */

export interface WatchSettings {
  /** Absolute move since the close, in percent, that is worth a word. */
  movePct: number;
  /** Risk score at or above which the desk speaks. */
  scoreLimit: number;
}

export const DEFAULT_WATCH: WatchSettings = { movePct: 2, scoreLimit: 45 };

export interface WatchReading {
  /** Signed move since the last close in percent, or null while the NYSE is open. */
  movePct: number | null;
  score: number;
  /** The book's label for the notification. */
  book: string;
}

export interface WatchState {
  moveFired: boolean;
  scoreFired: boolean;
}

export const ARMED: WatchState = { moveFired: false, scoreFired: false };

export interface Alert {
  title: string;
  body: string;
}

/** What to say now, and the state to carry forward. */
export function evaluateWatch(reading: WatchReading, settings: WatchSettings, state: WatchState): { alerts: Alert[]; state: WatchState } {
  const alerts: Alert[] = [];
  const next = { ...state };

  const moveOver = reading.movePct !== null && Math.abs(reading.movePct) >= settings.movePct;
  if (moveOver && !state.moveFired) {
    const sign = reading.movePct! < 0 ? "−" : "+";
    alerts.push({
      title: `${reading.book}: ${sign}${Math.abs(reading.movePct!).toFixed(2)}% since the close`,
      body: "The stocks in this book have moved past your line while the NYSE is closed. The market opens to this.",
    });
  }
  next.moveFired = moveOver;

  const scoreOver = reading.score >= settings.scoreLimit;
  if (scoreOver && !state.scoreFired) {
    alerts.push({
      title: `${reading.book}: risk score ${reading.score.toFixed(0)}`,
      body: `The score has reached ${settings.scoreLimit} or more. Open the desk to see what is carrying it.`,
    });
  }
  next.scoreFired = scoreOver;

  return { alerts, state: next };
}
