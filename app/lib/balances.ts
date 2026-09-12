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

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://api.mainnet-beta.solana.com";

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

export async function readBalances(address: string, rpcUrl = RPC_URL): Promise<Balances> {
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
