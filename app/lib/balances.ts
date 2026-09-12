import { Connection, PublicKey } from "@solana/web3.js";
import { ASSETS, BY_MINT } from "./universe";

/**
 * Real balances, read from mainnet by the browser. xStocks are Token-2022
 * mints; USDC and USDT are classic Token mints; SOL is native. All three
 * are read, and the same mint spread across several token accounts is
 * summed. Nothing here signs anything — an address is enough.
 */

const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

/**
 * The mainnet RPC used for balance reads. The public endpoint refuses
 * browser-origin token-account queries outright, so a build should carry
 * a key (a free Helius one, restricted to the site's domain) — and a
 * viewer can always paste their own, kept in this browser only.
 */
const BUILD_RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "";
const PUBLIC_RPC_URL = "https://api.mainnet-beta.solana.com";
const RPC_KEY = "afterhours-rpc";

export function resolveRpcUrl(): string {
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(RPC_KEY);
      if (stored && /^https?:\/\//.test(stored)) return stored;
    } catch {}
  }
  return BUILD_RPC_URL || PUBLIC_RPC_URL;
}

export function setRpcUrl(url: string | null): void {
  try {
    if (url) window.localStorage.setItem(RPC_KEY, url.trim());
    else window.localStorage.removeItem(RPC_KEY);
  } catch {}
}

/** True when the read would go to the public endpoint, which blocks browsers. */
export function usingPublicRpc(): boolean {
  return resolveRpcUrl() === PUBLIC_RPC_URL;
}

export const RPC_URL = BUILD_RPC_URL || PUBLIC_RPC_URL;

export interface Balances {
  address: string;
  /** Token amount per symbol in the universe, only where held. */
  amounts: Record<string, number>;
  /** Mints held that the universe cannot price. */
  unpricedMints: string[];
  readAt: number;
}

export function isValidAddress(value: string): boolean {
  try {
    const key = new PublicKey(value.trim());
    return key.toBase58() === value.trim();
  } catch {
    return false;
  }
}

export async function readBalances(address: string, rpcUrl = resolveRpcUrl()): Promise<Balances> {
  const owner = new PublicKey(address.trim());
  const connection = new Connection(rpcUrl, "confirmed");

  const amounts: Record<string, number> = {};
  const unpriced = new Set<string>();

  const lamports = await connection.getBalance(owner);
  if (lamports > 0) amounts.SOL = lamports / 1e9;

  for (const programId of [TOKEN_2022_PROGRAM, TOKEN_PROGRAM]) {
    const accounts = await connection.getParsedTokenAccountsByOwner(owner, { programId });
    for (const { account } of accounts.value) {
      const info = (account.data as { parsed?: { info?: Record<string, unknown> } }).parsed?.info;
      const mint = info?.mint as string | undefined;
      const amount = (info?.tokenAmount as { uiAmount?: number } | undefined)?.uiAmount;
      if (!mint || !Number.isFinite(amount) || !amount || amount <= 0) continue;
      const asset = BY_MINT[mint];
      if (asset) amounts[asset.symbol] = (amounts[asset.symbol] ?? 0) + amount;
      else unpriced.add(mint);
    }
  }

  return { address: owner.toBase58(), amounts, unpricedMints: [...unpriced], readAt: Date.now() };
}

/** Assets the universe prices, for building sample books and target lists. */
export const SYMBOLS = ASSETS.map((a) => a.symbol);
