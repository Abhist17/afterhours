import { describe, expect, it } from "vitest";
import { ARMED, DEFAULT_WATCH, evaluateWatch } from "../alerts";

const book = "Sample book";

describe("evaluateWatch", () => {
  it("says nothing inside the lines", () => {
    const r = evaluateWatch({ movePct: -1.2, score: 30, book }, DEFAULT_WATCH, ARMED);
    expect(r.alerts).toHaveLength(0);
    expect(r.state).toEqual(ARMED);
  });

  it("fires once on a move past the line, then stays quiet until it re-arms", () => {
    const first = evaluateWatch({ movePct: -2.4, score: 30, book }, DEFAULT_WATCH, ARMED);
    expect(first.alerts).toHaveLength(1);
    expect(first.alerts[0].title).toContain("−2.40% since the close");
    const again = evaluateWatch({ movePct: -3.1, score: 30, book }, DEFAULT_WATCH, first.state);
    expect(again.alerts).toHaveLength(0);
    const calm = evaluateWatch({ movePct: -0.5, score: 30, book }, DEFAULT_WATCH, again.state);
    expect(calm.state.moveFired).toBe(false);
    const back = evaluateWatch({ movePct: 2.0, score: 30, book }, DEFAULT_WATCH, calm.state);
    expect(back.alerts).toHaveLength(1);
    expect(back.alerts[0].title).toContain("+2.00%");
  });

  it("does not read a move while the NYSE is open", () => {
    const r = evaluateWatch({ movePct: null, score: 30, book }, DEFAULT_WATCH, ARMED);
    expect(r.alerts).toHaveLength(0);
  });

  it("fires on the score line independently of the move", () => {
    const r = evaluateWatch({ movePct: -2.5, score: 61, book }, { movePct: 2, scoreLimit: 60 }, ARMED);
    expect(r.alerts.map((a) => a.title)).toEqual([`${book}: −2.50% since the close`, `${book}: risk score 61`]);
    expect(r.state).toEqual({ moveFired: true, scoreFired: true });
  });
});
