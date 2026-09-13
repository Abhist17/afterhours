"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { PROGRAM_RPC_URL } from "@/lib/onchain";
import { shortAddress } from "@/lib/format";
import { Button } from "./ui";

/**
 * Wallet plumbing. An empty adapter list lets the provider discover
 * whatever Wallet Standard wallets the browser has, Phantom, Solflare,
 * Backpack, without shipping an adapter per brand. The connection here is
 * the program's cluster (devnet), used only to submit what the wallet has
 * signed; balances are read from mainnet elsewhere.
 */
export function WalletContext({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [], []);
  return (
    <ConnectionProvider endpoint={PROGRAM_RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}

export function ConnectButton({ onConnected }: { onConnected?: (address: string) => void }) {
  const { wallets, wallet, select, connect, disconnect, connecting, connected, publicKey } = useWallet();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Connecting by hand reads that wallet's book straight away. A silent
  // reconnect on load does not, so a link to someone else's address is
  // not overwritten by whatever wallet happens to be installed.
  const readOnConnect = useRef(false);
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;
  useEffect(() => {
    if (!connected || !publicKey || !readOnConnect.current) return;
    readOnConnect.current = false;
    onConnectedRef.current?.(publicKey.toBase58());
  }, [connected, publicKey]);

  const detected = wallets.filter(
    (w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable
  );

  async function pick(name: string) {
    setError(null);
    readOnConnect.current = true;
    try {
      select(name as never);
      // Selecting is asynchronous; connect on the next tick so the adapter
      // has switched before it is asked to open.
      await new Promise((r) => setTimeout(r, 0));
      await connect();
      setOpen(false);
    } catch (err) {
      readOnConnect.current = false;
      setError(err instanceof Error ? err.message : "Could not connect");
    }
  }

  if (connected && publicKey) {
    const address = publicKey.toBase58();
    return (
      <span className="flex items-center gap-1.5">
        <Button size="sm" variant="secondary" onClick={() => onConnected?.(address)} title="Read this wallet's book">
          <span className="numeric">{shortAddress(address)}</span>
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void disconnect()} aria-label="Disconnect wallet">
          ×
        </Button>
      </span>
    );
  }

  return (
    <span className="relative">
      <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)} disabled={connecting} className="shrink-0 whitespace-nowrap">
        {connecting ? "Connecting…" : <span>Connect<span className="hidden sm:inline"> wallet</span></span>}
      </Button>
      {open && (
        <span className="card absolute right-0 top-full z-30 mt-1 flex min-w-44 flex-col gap-0.5 p-1.5 shadow-lg">
          {detected.length === 0 ? (
            <span className="px-2 py-1.5 text-[11px] leading-snug text-tertiary">
              No Solana wallet found in this browser. Install Phantom or Solflare, then reload.
            </span>
          ) : (
            detected.map((w) => (
              <button
                key={w.adapter.name}
                type="button"
                onClick={() => void pick(w.adapter.name)}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-text hover:bg-surface-hover ${wallet?.adapter.name === w.adapter.name ? "bg-surface-active" : ""}`}
              >
                {w.adapter.icon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.adapter.icon} alt="" width={16} height={16} className="rounded-sm" />
                )}
                {w.adapter.name}
              </button>
            ))
          )}
          {error && <span className="px-2 py-1 text-[11px]" style={{ color: "var(--severe)" }}>{error}</span>}
        </span>
      )}
    </span>
  );
}
