/**
 * The desk's own record, kept daily. A workflow runs this after the New
 * York close: it scores the "Index, gold, cash" sample book with live
 * prices and the hourly history, exactly as the page would, and records
 * the reading as a Snapshot account on devnet, signed by a keypair that
 * exists only for this. If the reading leaves the policy the account
 * says so, the program emits SnapshotRecorded { breached: true }, and, if
 * ALERT_WEBHOOK_URL is set, a message goes out. Discord, Slack and
 * Telegram bot URLs all accept the body it sends.
 *
 * Bundled with esbuild so it can use the app's own quant:
 *   npm run record            (from app/)
 *
 * Env: RECORDER_KEYPAIR (JSON array) or RECORDER_KEYPAIR_PATH,
 *      ALERT_WEBHOOK_URL (optional), ALERT_ALWAYS=1 to post every day,
 *      RECORD_DRY_RUN=1 to score and print without writing anything.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { parseHistory, lastPrices, type HistoryFile } from "@/lib/history";
import { fetchLivePrices } from "@/lib/prices";
import { analyse } from "@/lib/portfolio";
import { driftAgainst, type Target } from "@/lib/quant";
import { SAMPLES } from "@/lib/samples";
import { fetchPolicy, policyPda, recordSnapshot, savePolicy, explorerUrl, targetsToBps } from "@/lib/onchain";

const LIVE_HISTORY = "https://raw.githubusercontent.com/Abhist17/afterhours/data/history.json";
const BUNDLED_HISTORY = path.join(process.cwd(), "public", "data", "history.json");

/**
 * The policy the desk keeps for its own book: the shape the sample had
 * on 14 September 2026, when the record began, so it starts inside the
 * band and leaves it only when prices move it five points from there.
 */
const BOOK = "index-and-gold";
const TARGETS: Target[] = [
  { symbol: "SPYx", weight: 38 },
  { symbol: "QQQx", weight: 16 },
  { symbol: "GLDx", weight: 27 },
  { symbol: "USDC", weight: 19 },
];
const RISK_LIMIT = 30;
const DRIFT_BAND_BPS = 500;

function loadKeypair(): Keypair {
  const inline = process.env.RECORDER_KEYPAIR;
  const file = process.env.RECORDER_KEYPAIR_PATH || path.join(os.homedir(), ".config", "solana", "afterhours-recorder.json");
  const raw = inline ?? fs.readFileSync(file, "utf-8");
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(raw)));
}

async function loadHistory(): Promise<HistoryFile> {
  try {
    const res = await fetch(LIVE_HISTORY, { signal: AbortSignal.timeout(15_000) });
    if (res.ok) return (await res.json()) as HistoryFile;
  } catch {}
  return JSON.parse(fs.readFileSync(BUNDLED_HISTORY, "utf-8")) as HistoryFile;
}

async function notify(text: string): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: text, text }),
  });
  console.log(`webhook ${res.status}`);
}

async function main() {
  const owner = loadKeypair();
  const wallet = new anchor.Wallet(owner);
  const sample = SAMPLES.find((s) => s.key === BOOK)!;

  const history = parseHistory(await loadHistory(), "live");
  const quotes = await fetchLivePrices(lastPrices(history));
  const now = Date.now();
  const a = analyse(sample.amounts, quotes.prices, history, now);

  // The on-chain policy follows this file: created once, updated if the
  // targets, limit or band here have changed since.
  const policy = await fetchPolicy(owner.publicKey);
  if (process.env.RECORD_DRY_RUN === "1") console.log("dry run: nothing will be written");
  const key = (targets: Target[]) => targetsToBps(targets).map((t) => `${t.mint.toBase58()}:${t.weightBps}`).sort().join(",");
  const wanted = key(TARGETS);
  const onChain = policy ? key(policy.targets) : "";
  if (process.env.RECORD_DRY_RUN !== "1" && (!policy || onChain !== wanted || policy.riskLimit !== RISK_LIMIT || policy.driftBandBps !== DRIFT_BAND_BPS)) {
    const sig = await savePolicy(wallet, RISK_LIMIT, DRIFT_BAND_BPS, TARGETS);
    console.log(policy ? "policy updated" : "policy created", policyPda(owner.publicKey).toBase58(), sig);
  }

  const drift = driftAgainst(Object.fromEntries(a.holdings.map((h) => [h.symbol, h.value])), TARGETS);
  const reading = {
    score: a.score,
    valueUsd: a.total,
    varUsd: a.risk.headlineVarUsd,
    driftBps: Math.round(drift.maxDrift * 10_000),
    equityBps: Math.round(a.sleeves[0].valueShare * 10_000),
    marketOpen: a.market.open,
  };
  const breached = reading.score > RISK_LIMIT || reading.driftBps > DRIFT_BAND_BPS;
  const dry = process.env.RECORD_DRY_RUN === "1";

  const { signature, address } = dry ? { signature: "(dry run)", address: "(dry run)" } : await recordSnapshot(wallet, reading, true);
  const line =
    `${breached ? "BREACH" : "in policy"} · ${sample.label} · score ${a.score.toFixed(1)} (limit ${RISK_LIMIT}) · ` +
    `drift ${(reading.driftBps / 100).toFixed(1)}pp (band ${DRIFT_BAND_BPS / 100}) · book $${a.total.toFixed(0)} · VaR $${a.risk.headlineVarUsd.toFixed(0)} · ` +
    `NYSE ${a.market.open ? "open" : "closed"} · quotes ${quotes.stale ? "from history" : "live"}`;
  console.log("owner   ", owner.publicKey.toBase58());
  console.log("snapshot", address, signature);
  console.log(line);

  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) fs.appendFileSync(summary, `### Afterhours daily snapshot\n\n${line}\n\n[${address}](${explorerUrl("address", address)})\n`);

  if (!dry && (breached || process.env.ALERT_ALWAYS === "1")) {
    await notify(`Afterhours · ${line}\n${explorerUrl("address", address)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
