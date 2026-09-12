// Fetches 30 days of hourly prices for every asset in the universe and writes
// them to app/public/data/history.json. A GitHub Action runs this hourly and
// publishes the result to the `data` branch; the app fetches that file and
// computes everything else in the browser, so there is no server to keep up.
//
// Usage: node scripts/refresh-history.mjs [--days 30] [--out path]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const universe = JSON.parse(fs.readFileSync(path.join(here, "..", "app", "data", "universe.json"), "utf-8"));

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const DAYS = Number(flag("days", 30));
const OUT = flag("out", path.join(here, "..", "app", "public", "data", "history.json"));
const SPACING_MS = Number(process.env.COINGECKO_SPACING_MS ?? 2500);
const API_KEY = process.env.COINGECKO_API_KEY ?? "";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchChart(id, attempt = 0) {
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${DAYS}`;
  const res = await fetch(url, { headers: API_KEY ? { "x-cg-demo-api-key": API_KEY } : {} });
  if (res.status === 429 && attempt < 4) {
    const wait = Number(res.headers.get("retry-after") ?? 0) * 1000 || 15_000 * (attempt + 1);
    console.warn(`  429 for ${id}; waiting ${wait / 1000}s`);
    await sleep(wait);
    return fetchChart(id, attempt + 1);
  }
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
  const body = await res.json();
  return (body.prices ?? [])
    .filter(([t, p]) => Number.isFinite(t) && Number.isFinite(p) && p > 0)
    // Round the timestamp to the hour and the price to six significant
    // figures: the feed's own precision, a third of the bytes.
    .map(([t, p]) => [Math.round(t / 3_600_000) * 3_600_000, Number(p.toPrecision(6))]);
}

// Keep whatever the previous file had for an asset whose request fails, so
// one rate limit degrades a series' freshness rather than removing it.
let previous = {};
try {
  previous = JSON.parse(fs.readFileSync(OUT, "utf-8")).assets ?? {};
} catch {}

const assets = {};
const failed = [];
let requests = 0;

for (const asset of universe) {
  if (requests > 0) await sleep(SPACING_MS);
  requests++;
  try {
    const points = await fetchChart(asset.coingeckoId);
    if (points.length < 24) throw new Error(`${asset.symbol}: only ${points.length} points`);
    assets[asset.symbol] = { coingeckoId: asset.coingeckoId, fetchedAt: Date.now(), points };
    console.log(`  ${asset.symbol.padEnd(7)} ${points.length} points`);
  } catch (err) {
    failed.push(asset.symbol);
    if (previous[asset.symbol]) {
      assets[asset.symbol] = previous[asset.symbol];
      console.warn(`  ${asset.symbol}: ${err.message} — kept previous series`);
    } else {
      console.warn(`  ${asset.symbol}: ${err.message} — no series`);
    }
  }
}

const out = { generatedAt: Date.now(), days: DAYS, assets };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB, ${Object.keys(assets).length}/${universe.length} assets` + (failed.length ? `, failed: ${failed.join(", ")}` : "") + ")");
if (Object.keys(assets).length === 0) process.exit(1);
