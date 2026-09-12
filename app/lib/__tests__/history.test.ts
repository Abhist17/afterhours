import { describe, expect, it } from "vitest";
import { loadHistoryProgressive, mergeHistoryFiles, missingFrom, parseHistory, type History, type HistoryFile } from "../history";
import { ASSETS } from "../universe";

function file(symbols: string[], generatedAt: number, price = 100): HistoryFile {
  const assets: HistoryFile["assets"] = {};
  for (const s of symbols) {
    assets[s] = {
      coingeckoId: s,
      fetchedAt: generatedAt,
      points: [0, 1, 2, 3].map((i) => [generatedAt - (3 - i) * 3_600_000, price + i]),
    };
  }
  return { generatedAt, days: 30, assets };
}

const everything = ASSETS.map((a) => a.symbol);

describe("history", () => {
  it("names the universe symbols a file has no series for", () => {
    expect(missingFrom(file(everything, 1))).toEqual([]);
    const short = file(everything.filter((s) => s !== "SPCXx" && s !== "USDG"), 1);
    expect(missingFrom(short)).toEqual(["SPCXx", "USDG"]);
    // Two points is not a series.
    short.assets.SPYx.points = short.assets.SPYx.points.slice(0, 2);
    expect(missingFrom(short)).toContain("SPYx");
  });

  it("fills a stale live file from the bundled copy without touching what it has", () => {
    const live = file(everything.filter((s) => s !== "SPCXx"), 2, 200);
    const bundled = file(everything, 1, 100);
    const merged = mergeHistoryFiles(live, bundled);
    expect(merged.generatedAt).toBe(2);
    expect(merged.assets.SPCXx.points[0][1]).toBe(100);
    expect(merged.assets.SPYx.points[0][1]).toBe(200);
    expect(missingFrom(merged)).toEqual([]);
  });

  it("measures the sampling interval from the data", () => {
    const h = parseHistory(file(everything, 10 * 3_600_000), "live");
    expect(h.periodsPerDay).toBe(24);
    expect(h.source).toBe("live");
    expect(Object.keys(h.series).length).toBe(everything.length);
  });
});

describe("loadHistoryProgressive", () => {
  function fetchFor(routes: Record<string, { body?: unknown; delay?: number; status?: number }>) {
    return async (url: string) => {
      const r = routes[url];
      if (!r) throw new Error(`unrouted ${url}`);
      await new Promise((res) => setTimeout(res, r.delay ?? 0));
      if (r.status && r.status >= 400) return { ok: false, status: r.status, json: async () => ({}) } as Response;
      return { ok: true, status: 200, json: async () => r.body } as Response;
    };
  }
  const urls = { live: "https://live/history.json", bundled: "/data/history.json" };
  const originalFetch = globalThis.fetch;

  it("paints from the bundle first, then upgrades to the live file filled from it", async () => {
    const bundled = file(everything, 1, 100);
    const live = file(everything.filter((s) => s !== "SPCXx"), 2, 200);
    globalThis.fetch = fetchFor({ [urls.bundled]: { body: bundled }, [urls.live]: { body: live, delay: 30 } }) as typeof fetch;
    const seen: History["source"][] = [];
    let last: History | null = null;
    await new Promise<void>((done) => {
      loadHistoryProgressive({
        urls,
        onHistory: (h) => {
          seen.push(h.source);
          last = h;
          if (seen.length === 2) done();
        },
        onError: () => done(),
      });
    });
    globalThis.fetch = originalFetch;
    expect(seen).toEqual(["bundled", "live"]);
    expect(last!.generatedAt).toBe(2);
    expect(last!.series.SPCXx[0].price).toBe(100);
    expect(last!.series.SPYx[0].price).toBe(200);
  });

  it("does not paint the stale bundle after the live file has already landed", async () => {
    globalThis.fetch = fetchFor({ [urls.bundled]: { body: file(everything, 1), delay: 30 }, [urls.live]: { body: file(everything, 2) } }) as typeof fetch;
    const seen: History["source"][] = [];
    await new Promise<void>((done) => {
      loadHistoryProgressive({ urls, onHistory: (h) => seen.push(h.source), onError: () => done() });
      setTimeout(done, 80);
    });
    globalThis.fetch = originalFetch;
    expect(seen).toEqual(["live"]);
  });

  it("waits for the bundle when a short live file lands first, and paints once", async () => {
    const live = file(everything.filter((s) => s !== "SPCXx"), 2, 200);
    globalThis.fetch = fetchFor({ [urls.bundled]: { body: file(everything, 1, 100), delay: 30 }, [urls.live]: { body: live } }) as typeof fetch;
    const seen: History[] = [];
    await new Promise<void>((done) => {
      loadHistoryProgressive({ urls, onHistory: (h) => seen.push(h), onError: () => done() });
      setTimeout(done, 80);
    });
    globalThis.fetch = originalFetch;
    expect(seen.map((h) => h.source)).toEqual(["live"]);
    expect(seen[0].series.SPCXx[0].price).toBe(100);
  });

  it("falls back to the bundle when the live file fails after it", async () => {
    globalThis.fetch = fetchFor({ [urls.bundled]: { body: file(everything, 1) }, [urls.live]: { status: 500, delay: 30 } }) as typeof fetch;
    const seen: History["source"][] = [];
    await new Promise<void>((done) => {
      loadHistoryProgressive({ urls, onHistory: (h) => seen.push(h.source), onError: () => done() });
      setTimeout(done, 80);
    });
    globalThis.fetch = originalFetch;
    expect(seen).toEqual(["bundled"]);
  });

  it("reports an error only when both files fail", async () => {
    globalThis.fetch = fetchFor({ [urls.bundled]: { status: 404 }, [urls.live]: { status: 500 } }) as typeof fetch;
    const message = await new Promise<string>((done) => {
      loadHistoryProgressive({ urls, onHistory: () => done("painted"), onError: done });
    });
    globalThis.fetch = originalFetch;
    expect(message).toMatch(/neither/);
  });
});
