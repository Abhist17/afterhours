/**
 * A rebalance order, executed: quote it fresh, have Jupiter build the
 * transaction, have the wallet sign and send it on mainnet, wait for the
 * chain to confirm. This is the only path in the desk that moves money,
 * and every step reports back so the panel can say where it is.
 */

import { Connection, VersionedTransaction } from "@solana/web3.js";
import { resolveRpcUrl } from "./balances";
import { buildSwap, quoteSwap, QUOTE_MAX_AGE_MS, type SwapQuote } from "./jupiter";

export type TradeStage = "quoting" | "building" | "signing" | "confirming" | "done";

export interface TradeWallet {
  publicKey: { toBase58(): string };
  sendTransaction(tx: VersionedTransaction, connection: Connection, options?: { maxRetries?: number }): Promise<string>;
}

export interface TradeResult {
  signature: string;
  quote: SwapQuote;
}

export function mainnetExplorerTx(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}`;
}

/** Waits for a signature to confirm, or throws with the chain's reason. */
export async function confirmSignature(connection: Connection, signature: string, timeoutMs = 75_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status) {
      if (status.err) throw new Error(`The chain rejected the transaction: ${JSON.stringify(status.err)}`);
      if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") return;
    }
    await new Promise((r) => setTimeout(r, 1_500));
  }
  throw new Error("The transaction was sent but has not confirmed yet. Check the explorer link before retrying.");
}

export async function executeTrade({
  from,
  to,
  amountIn,
  wallet,
  quote,
  onStage,
}: {
  from: string;
  to: string;
  amountIn: number;
  wallet: TradeWallet;
  /** A quote already on screen; re-fetched if it has gone stale. */
  quote?: SwapQuote | null;
  onStage?: (stage: TradeStage) => void;
}): Promise<TradeResult> {
  onStage?.("quoting");
  const fresh = quote && Date.now() - quote.fetchedAt < QUOTE_MAX_AGE_MS ? quote : await quoteSwap(from, to, amountIn);

  onStage?.("building");
  const bytes = await buildSwap(fresh, wallet.publicKey.toBase58());
  const tx = VersionedTransaction.deserialize(bytes);

  onStage?.("signing");
  const connection = new Connection(resolveRpcUrl(), "confirmed");
  const signature = await wallet.sendTransaction(tx, connection, { maxRetries: 3 });

  onStage?.("confirming");
  await confirmSignature(connection, signature);
  onStage?.("done");
  return { signature, quote: fresh };
}
