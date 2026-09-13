import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import IDL from "./idl/afterhours.json";
import type { Afterhours } from "./idl/afterhours";
import { BY_SYMBOL, BY_MINT } from "./universe";
import type { Target } from "./quant";

/**
 * The program, from the browser, signed by whoever is connected. The
 * cluster for writes is separate from the one balances are read on:
 * balances live on mainnet, the record on devnet until the program moves.
 */

export const PROGRAM_RPC_URL = process.env.NEXT_PUBLIC_PROGRAM_RPC_URL || "https://api.devnet.solana.com";
export const PROGRAM_ID = new PublicKey((IDL as { address: string }).address);

export type ClusterName = "mainnet-beta" | "devnet" | "testnet" | "localnet" | "custom";

export function clusterOf(url: string = PROGRAM_RPC_URL): ClusterName {
  const l = url.toLowerCase();
  if (/localhost|127\.0\.0\.1/.test(l)) return "localnet";
  if (l.includes("devnet")) return "devnet";
  if (l.includes("testnet")) return "testnet";
  if (l.includes("mainnet")) return "mainnet-beta";
  return "custom";
}

export function explorerUrl(kind: "address" | "tx", id: string, cluster = clusterOf()): string | null {
  if (!id || cluster === "localnet" || cluster === "custom") return null;
  const suffix = cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`;
  return `https://explorer.solana.com/${kind}/${encodeURIComponent(id)}${suffix}`;
}

/** Native SOL is identified on-chain by the wrapped-SOL mint. */
export const WSOL_MINT = "So11111111111111111111111111111111111111112";

export function mintOf(symbol: string): PublicKey | null {
  const a = BY_SYMBOL[symbol];
  if (!a) return null;
  return new PublicKey(a.mint ?? WSOL_MINT);
}

export function symbolOfMint(mint: string): string {
  if (mint === WSOL_MINT) return "SOL";
  return BY_MINT[mint]?.symbol ?? `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

export function connection(): Connection {
  return new Connection(PROGRAM_RPC_URL, "confirmed");
}

/** A read-only program needs no signer; writes need the connected wallet. */
export function program(wallet?: AnchorWallet): anchor.Program<Afterhours> {
  const conn = connection();
  const provider = wallet
    ? new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" })
    : new anchor.AnchorProvider(conn, { publicKey: PublicKey.default, signTransaction: async (t) => t, signAllTransactions: async (t) => t } as AnchorWallet, { commitment: "confirmed" });
  return new anchor.Program<Afterhours>(IDL as Afterhours, provider);
}

export function policyPda(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("policy"), owner.toBuffer()], PROGRAM_ID)[0];
}

export function snapshotPda(owner: PublicKey, timestamp: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("snapshot"), owner.toBuffer(), new anchor.BN(timestamp).toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  )[0];
}

export interface OnChainPolicy {
  address: string;
  riskLimit: number;
  driftBandBps: number;
  targets: Target[];
  updatedAt: number;
}

export interface OnChainSnapshot {
  address: string;
  timestamp: number;
  score: number;
  valueUsd: number;
  varUsd: number;
  driftBps: number;
  equityBps: number;
  marketOpen: boolean;
}

export async function fetchPolicy(owner: PublicKey): Promise<OnChainPolicy | null> {
  const pda = policyPda(owner);
  const account = await program().account.policy.fetchNullable(pda);
  if (!account) return null;
  return {
    address: pda.toBase58(),
    riskLimit: account.riskLimit,
    driftBandBps: account.driftBandBps,
    targets: account.targets.map((t) => ({ symbol: symbolOfMint(t.mint.toBase58()), weight: t.weightBps / 10_000 })),
    updatedAt: account.updatedAt.toNumber(),
  };
}

export async function fetchSnapshots(owner: PublicKey): Promise<OnChainSnapshot[]> {
  const all = await program().account.snapshot.all([{ memcmp: { offset: 8, bytes: owner.toBase58() } }]);
  return all
    .map(({ publicKey, account }) => ({
      address: publicKey.toBase58(),
      timestamp: account.timestamp.toNumber(),
      score: account.score,
      valueUsd: account.valueUsdCents.toNumber() / 100,
      varUsd: account.varUsdCents.toNumber() / 100,
      driftBps: account.driftBps,
      equityBps: account.equityBps,
      marketOpen: account.marketOpen,
    }))
    .sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Targets as the program wants them: mints and basis points that sum to
 * exactly 10,000. Rounding puts the remainder on the largest line so the
 * sum is exact whatever the percentages were.
 */
export function targetsToBps(targets: Target[]): { mint: PublicKey; weightBps: number }[] {
  const usable = targets.filter((t) => t.weight > 0 && mintOf(t.symbol));
  const total = usable.reduce((s, t) => s + t.weight, 0);
  if (!usable.length || total <= 0) return [];
  const rows = usable.map((t) => ({ mint: mintOf(t.symbol)!, weightBps: Math.round((t.weight / total) * 10_000) }));
  const sum = rows.reduce((s, r) => s + r.weightBps, 0);
  const largest = rows.reduce((a, b) => (b.weightBps > a.weightBps ? b : a));
  largest.weightBps += 10_000 - sum;
  return rows;
}

export async function savePolicy(
  wallet: AnchorWallet,
  riskLimit: number,
  driftBandBps: number,
  targets: Target[]
): Promise<string> {
  const p = program(wallet);
  const rows = targetsToBps(targets);
  if (!rows.length || rows.length > 12) throw new Error("A policy needs between one and twelve targets");
  const existing = await p.account.policy.fetchNullable(policyPda(wallet.publicKey));
  const method = existing
    ? p.methods.updatePolicy(riskLimit, driftBandBps, rows)
    : p.methods.createPolicy(riskLimit, driftBandBps, rows);
  return method.accounts({ owner: wallet.publicKey }).rpc();
}

export async function closePolicy(wallet: AnchorWallet): Promise<string> {
  return program(wallet).methods.closePolicy().accounts({ owner: wallet.publicKey }).rpc();
}

export async function recordSnapshot(
  wallet: AnchorWallet,
  reading: { score: number; valueUsd: number; varUsd: number; driftBps: number; equityBps: number; marketOpen: boolean },
  hasPolicy: boolean
): Promise<{ signature: string; address: string; timestamp: number }> {
  const p = program(wallet);
  const timestamp = Math.floor(Date.now() / 1000);
  const cents = (usd: number) => new anchor.BN(Math.round(Math.max(0, usd) * 100).toString());
  const clampBps = (v: number) => Math.max(0, Math.min(10_000, Math.round(v)));
  // `null` is how the client spells "no account" for an optional, the
  // program id goes in its place and the program reads it as None.
  const accounts = { owner: wallet.publicKey, policy: hasPolicy ? policyPda(wallet.publicKey) : null };
  const signature = await p.methods
    .recordSnapshot(
      new anchor.BN(timestamp),
      Math.max(0, Math.min(100, Math.round(reading.score))),
      cents(reading.valueUsd),
      cents(reading.varUsd),
      clampBps(reading.driftBps),
      clampBps(reading.equityBps),
      reading.marketOpen
    )
    .accountsPartial(accounts)
    .rpc();
  return { signature, address: snapshotPda(wallet.publicKey, timestamp).toBase58(), timestamp };
}

export async function closeSnapshot(wallet: AnchorWallet, address: string): Promise<string> {
  return program(wallet)
    .methods.closeSnapshot()
    .accountsPartial({ snapshot: new PublicKey(address), owner: wallet.publicKey })
    .rpc();
}
