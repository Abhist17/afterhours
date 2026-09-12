// Writes an example record — a policy and a few snapshots — from the CLI
// keypair, so the desk has real accounts on devnet to show a visitor who
// has not connected a wallet. Run once after deploying; safe to re-run.
//
//   node scripts/example-record.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "..", "app", "package.json"));
const anchor = require("@coral-xyz/anchor");
const { Connection, Keypair, PublicKey } = require("@solana/web3.js");

const IDL = JSON.parse(fs.readFileSync(path.join(here, "..", "app", "lib", "idl", "afterhours.json"), "utf-8"));
const universe = JSON.parse(fs.readFileSync(path.join(here, "..", "app", "data", "universe.json"), "utf-8"));
const mintOf = (symbol) => new PublicKey(universe.find((a) => a.symbol === symbol)?.mint ?? "So11111111111111111111111111111111111111112");

const keypairPath = process.env.SOLANA_KEYPAIR_PATH || path.join(os.homedir(), ".config", "solana", "id.json");
const owner = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, "utf-8"))));
const connection = new Connection(process.env.RPC_URL || "https://api.devnet.solana.com", "confirmed");
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(owner), { commitment: "confirmed" });
const program = new anchor.Program(IDL, provider);

const [policyPda] = PublicKey.findProgramAddressSync([Buffer.from("policy"), owner.publicKey.toBuffer()], program.programId);

console.log("owner  ", owner.publicKey.toBase58());
console.log("program", program.programId.toBase58());

// An index-and-gold policy: 40% S&P, 20% Nasdaq, 15% gold, 25% cash.
const targets = [
  { mint: mintOf("SPYx"), weightBps: 4000 },
  { mint: mintOf("QQQx"), weightBps: 2000 },
  { mint: mintOf("GLDx"), weightBps: 1500 },
  { mint: mintOf("USDC"), weightBps: 2500 },
];
const existing = await program.account.policy.fetchNullable(policyPda);
const sig = existing
  ? await program.methods.updatePolicy(30, 500, targets).accounts({ owner: owner.publicKey }).rpc()
  : await program.methods.createPolicy(30, 500, targets).accounts({ owner: owner.publicKey }).rpc();
console.log(existing ? "policy updated" : "policy created", policyPda.toBase58(), sig);

// Three readings, a few seconds apart: two inside policy, one breach.
const readings = [
  { score: 22, value: 14_650, var: 265, drift: 180, equity: 7400, open: false },
  { score: 27, value: 14_910, var: 312, drift: 240, equity: 7500, open: true },
  { score: 34, value: 14_380, var: 402, drift: 610, equity: 7700, open: false },
];
for (const r of readings) {
  const timestamp = Math.floor(Date.now() / 1000);
  const [snapshotPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("snapshot"), owner.publicKey.toBuffer(), new anchor.BN(timestamp).toArrayLike(Buffer, "le", 8)],
    program.programId
  );
  const s = await program.methods
    .recordSnapshot(new anchor.BN(timestamp), r.score, new anchor.BN(r.value * 100), new anchor.BN(r.var * 100), r.drift, r.equity, r.open)
    .accountsPartial({ owner: owner.publicKey, policy: policyPda })
    .rpc();
  console.log(`snapshot ${r.score}`, snapshotPda.toBase58(), s);
  await new Promise((res) => setTimeout(res, 1500));
}

const all = await program.account.snapshot.all([{ memcmp: { offset: 8, bytes: owner.publicKey.toBase58() } }]);
console.log(`${all.length} snapshot(s) on chain for ${owner.publicKey.toBase58()}`);
