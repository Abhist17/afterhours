// The lending side of the on-chain record: a subscriber to the program's
// SnapshotRecorded events. Every snapshot an owner signs under a policy
// carries `breached` — score over the limit, or drift past the band, by
// the owner's own reading — and this is the process a credit protocol
// would run: listen, and act when a book leaves its stated policy.
//
//   node scripts/watch-breaches.mjs                 # follow devnet live
//   node scripts/watch-breaches.mjs --history 50    # replay the last 50 program transactions
//   node scripts/watch-breaches.mjs --owner <pubkey> --webhook https://…   # one wallet, POST each breach
//
// RPC_URL selects the cluster (default devnet). Nothing here signs anything.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "..", "app", "package.json"));
const anchor = require("@coral-xyz/anchor");
const { Connection, PublicKey } = require("@solana/web3.js");

const IDL = JSON.parse(fs.readFileSync(path.join(here, "..", "app", "lib", "idl", "afterhours.json"), "utf-8"));
const PROGRAM_ID = new PublicKey(IDL.address);

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1] ?? true;
};
const historyArg = flag("history");
const HISTORY = historyArg === null ? 0 : historyArg === true ? 25 : Number(historyArg);
const OWNER = flag("owner") ? new PublicKey(flag("owner")) : null;
const WEBHOOK = typeof flag("webhook") === "string" ? flag("webhook") : null;
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";

const connection = new Connection(RPC_URL, "confirmed");
const parser = new anchor.EventParser(PROGRAM_ID, new anchor.BorshCoder(IDL));

const usd = (cents) => `$${(Number(cents) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const when = (ts) => new Date(Number(ts) * 1000).toISOString().replace("T", " ").slice(0, 16) + "Z";

/** Decode every SnapshotRecorded in a transaction's logs. */
function eventsIn(logs) {
  const out = [];
  for (const ev of parser.parseLogs(logs ?? [])) {
    if (ev.name !== "SnapshotRecorded") continue;
    // The raw coder keeps the IDL's snake_case; the typed client would not.
    const d = ev.data;
    const get = (camel, snake) => (d[camel] !== undefined ? d[camel] : d[snake]);
    out.push({
      owner: d.owner.toBase58(),
      timestamp: Number(d.timestamp),
      score: d.score,
      valueUsdCents: get("valueUsdCents", "value_usd_cents"),
      varUsdCents: get("varUsdCents", "var_usd_cents"),
      driftBps: get("driftBps", "drift_bps"),
      equityBps: get("equityBps", "equity_bps"),
      marketOpen: get("marketOpen", "market_open"),
      riskLimit: get("riskLimit", "risk_limit") ?? null,
      driftBandBps: get("driftBandBps", "drift_band_bps") ?? null,
      breached: d.breached,
    });
  }
  return out;
}

function describe(e) {
  const policy =
    e.riskLimit === null ? "no policy" : `limit ${e.riskLimit} · band ${(e.driftBandBps / 100).toFixed(0)}pp`;
  const why =
    !e.breached ? "" : e.riskLimit !== null && e.score > e.riskLimit ? ` — score ${e.score} > ${e.riskLimit}` : ` — drift ${(e.driftBps / 100).toFixed(1)}pp > ${(e.driftBandBps / 100).toFixed(0)}pp`;
  return (
    `${e.breached ? "BREACH " : "ok     "} ${when(e.timestamp)}  ${e.owner.slice(0, 4)}…${e.owner.slice(-4)}  ` +
    `score ${String(e.score).padStart(3)}  book ${usd(e.valueUsdCents)}  VaR ${usd(e.varUsdCents)}  ` +
    `drift ${(e.driftBps / 100).toFixed(1)}pp  stocks ${(e.equityBps / 100).toFixed(0)}%  NYSE ${e.marketOpen ? "open  " : "closed"}  (${policy})${why}`
  );
}

async function notify(e, signature) {
  if (!WEBHOOK || !e.breached) return;
  try {
    await fetch(WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "SnapshotRecorded", breached: true, signature, cluster: RPC_URL, ...e }),
    });
  } catch (err) {
    console.error(`  webhook failed: ${err.message}`);
  }
}

function handle(logs, signature) {
  for (const e of eventsIn(logs)) {
    if (OWNER && e.owner !== OWNER.toBase58()) continue;
    console.log(describe(e), signature ? ` ${signature.slice(0, 8)}…` : "");
    void notify(e, signature);
  }
}

console.log(`program ${PROGRAM_ID.toBase58()} on ${RPC_URL}${OWNER ? ` · owner ${OWNER.toBase58()}` : ""}${WEBHOOK ? " · webhook set" : ""}`);

if (HISTORY > 0) {
  // Replay: the program's most recent transactions, oldest first.
  const address = OWNER ?? PROGRAM_ID;
  const sigs = await connection.getSignaturesForAddress(address, { limit: HISTORY });
  console.log(`${sigs.length} transaction${sigs.length === 1 ? "" : "s"} for ${OWNER ? "the owner" : "the program"}\n`);
  let seen = 0;
  for (const s of sigs.reverse()) {
    if (s.err) continue;
    // The public endpoint is shared; a beat between reads keeps it civil.
    await new Promise((r) => setTimeout(r, 250));
    const tx = await connection.getTransaction(s.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    const events = eventsIn(tx?.meta?.logMessages);
    seen += events.length;
    handle(tx?.meta?.logMessages, s.signature);
  }
  console.log(`\n${seen} snapshot${seen === 1 ? "" : "s"} recorded`);
  process.exit(0);
}

// Live: every log the program emits, as it lands.
console.log("listening…\n");
connection.onLogs(
  PROGRAM_ID,
  (entry) => {
    if (entry.err) return;
    handle(entry.logs, entry.signature);
  },
  "confirmed"
);
