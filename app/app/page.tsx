"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadHistory, lastPrices, type History } from "@/lib/history";
import { fetchLivePrices, type Quotes } from "@/lib/prices";
import { readBalances, isValidAddress, resolveRpcUrl, setRpcUrl, usingPublicRpc, type Balances } from "@/lib/balances";
import { analyse } from "@/lib/portfolio";
import { SAMPLES } from "@/lib/samples";
import { marketStatus } from "@/lib/market-hours";
import { useNow, useMounted } from "@/lib/hooks";
import { shortAddress, timeAgo } from "@/lib/format";
import { TopBar } from "@/components/TopBar";
import { Summary } from "@/components/Summary";
import { Holdings } from "@/components/Holdings";
import { Sleeves } from "@/components/Sleeves";
import { Overnight } from "@/components/Overnight";
import { Backtest } from "@/components/Backtest";
import { CorrelationGrid } from "@/components/CorrelationGrid";
import { Drift } from "@/components/Drift";
import { WhatIf } from "@/components/WhatIf";
import { HowItWorks } from "@/components/HowItWorks";
import { OnChain } from "@/components/OnChain";
import { WalletContext, ConnectButton } from "@/components/Wallet";
import type { Target } from "@/lib/quant";
import { Panel, PanelHeader, Button, Input, Notice, Skeleton, Tag } from "@/components/ui";

type Source =
  | { kind: "sample"; key: string; amounts: Record<string, number> }
  | { kind: "wallet"; balances: Balances };

const ADDRESS_KEY = "afterhours-address";

export default function Page() {
  return (
    <WalletContext>
      <Desk />
    </WalletContext>
  );
}

function Desk() {
  const [history, setHistory] = useState<History | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<Quotes | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [address, setAddress] = useState("");
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [targets, setTargets] = useState<Target[]>([]);
  const [rpcOpen, setRpcOpen] = useState(false);
  const [rpcDraft, setRpcDraft] = useState("");
  const now = useNow(60_000);
  const mounted = useMounted();

  // History once, quotes on a timer. Quotes fall back to the last point of
  // the history and say so; nothing here waits on a server.
  useEffect(() => {
    let cancelled = false;
    loadHistory()
      .then(async (h) => {
        if (cancelled) return;
        setHistory(h);
        setQuotes(await fetchLivePrices(lastPrices(h)));
      })
      .catch((err) => {
        if (!cancelled) setHistoryError(err instanceof Error ? err.message : "Could not load price history");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!history) return;
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      setQuotes(await fetchLivePrices(lastPrices(history)));
    }, 60_000);
    return () => clearInterval(timer);
  }, [history]);

  // Remember the last address per browser; a returning viewer should not
  // have to paste it again.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(ADDRESS_KEY);
      if (stored && isValidAddress(stored)) {
        setAddress(stored);
        void loadWallet(stored);
        return;
      }
    } catch {}
    setSource({ kind: "sample", key: SAMPLES[0].key, amounts: SAMPLES[0].amounts });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadWallet = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!isValidAddress(trimmed)) {
      setWalletError("That is not a Solana address.");
      return;
    }
    setLoadingWallet(true);
    setWalletError(null);
    try {
      const balances = await readBalances(trimmed);
      setSource({ kind: "wallet", balances });
      try {
        localStorage.setItem(ADDRESS_KEY, trimmed);
      } catch {}
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const host = (() => {
        try {
          return new URL(resolveRpcUrl()).host;
        } catch {
          return "the RPC";
        }
      })();
      setWalletError(
        usingPublicRpc() && /403|forbidden|429/i.test(message)
          ? `${host} refuses balance reads from a browser. This build has no RPC key; set one below (a free Helius key works), or try a sample book.`
          : `Could not read ${shortAddress(trimmed)} from ${host}: ${message}`
      );
      if (usingPublicRpc()) setRpcOpen(true);
    } finally {
      setLoadingWallet(false);
    }
  }, []);

  function pickSample(key: string) {
    const s = SAMPLES.find((x) => x.key === key) ?? SAMPLES[0];
    setSource({ kind: "sample", key: s.key, amounts: s.amounts });
    setWalletError(null);
  }

  const amounts = source?.kind === "wallet" ? source.balances.amounts : source?.amounts ?? {};

  const analysis = useMemo(() => {
    if (!history || !quotes) return null;
    return analyse(amounts, quotes.prices, history, now);
  }, [history, quotes, amounts, now]);

  const market = useMemo(() => marketStatus(now), [now]);

  const sample = source?.kind === "sample" ? SAMPLES.find((s) => s.key === source.key) : null;

  return (
    <div className="min-h-screen">
      <TopBar market={market} onOpenHelp={() => setHelpOpen(true)} />
      <HowItWorks open={helpOpen} onClose={() => setHelpOpen(false)} />

      <main className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
        {/* ── Whose book ────────────────────────────────────── */}
        <section className="card enter mb-4 px-4 py-3">
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
            onSubmit={(e) => {
              e.preventDefault();
              void loadWallet(address);
            }}
          >
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Paste a Solana address holding xStocks"
              spellCheck={false}
              autoComplete="off"
              aria-label="Solana wallet address"
              className="numeric !text-xs sm:max-w-md"
            />
            <Button type="submit" variant="primary" size="md" disabled={loadingWallet || !address.trim()}>
              {loadingWallet ? "Reading…" : "Read wallet"}
            </Button>
            <span className="hidden text-[11px] text-tertiary sm:inline">or</span>
            <ConnectButton
              onConnected={(addr) => {
                setAddress(addr);
                void loadWallet(addr);
              }}
            />
            <span className="hidden text-[11px] text-tertiary sm:inline">or</span>
            <span className="flex flex-wrap gap-1.5">
              {SAMPLES.map((s) => (
                <Button
                  key={s.key}
                  size="sm"
                  variant={sample?.key === s.key ? "primary" : "secondary"}
                  onClick={() => pickSample(s.key)}
                  title={s.blurb}
                >
                  {s.label}
                </Button>
              ))}
            </span>
          </form>
          {walletError && (
            <div className="mt-2">
              <Notice tone="error">{walletError}</Notice>
            </div>
          )}
          {rpcOpen && (
            <form
              className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center"
              onSubmit={(e) => {
                e.preventDefault();
                if (!/^https?:\/\//.test(rpcDraft.trim())) return;
                setRpcUrl(rpcDraft.trim());
                setRpcOpen(false);
                setWalletError(null);
                if (address.trim()) void loadWallet(address);
              }}
            >
              <Input
                value={rpcDraft}
                onChange={(e) => setRpcDraft(e.target.value)}
                placeholder="https://mainnet.helius-rpc.com/?api-key=…"
                spellCheck={false}
                autoComplete="off"
                aria-label="Mainnet RPC endpoint"
                className="numeric !text-xs sm:max-w-md"
              />
              <Button type="submit" size="md" variant="secondary" disabled={!/^https?:\/\//.test(rpcDraft.trim())}>
                Use this RPC
              </Button>
              <Button type="button" size="md" variant="ghost" onClick={() => setRpcOpen(false)}>
                Cancel
              </Button>
              <span className="text-[11px] text-tertiary">Stored in this browser only.</span>
            </form>
          )}
          {!rpcOpen && (
            <p className="mt-2 text-[11px] text-tertiary">
              Reads go to <span className="numeric">{mounted ? safeHost(resolveRpcUrl()) : ""}</span>.{" "}
              <button type="button" onClick={() => setRpcOpen(true)} className="underline decoration-border-strong underline-offset-2 hover:text-text">
                Change RPC
              </button>
            </p>
          )}
        </section>

        {historyError ? (
          <Notice tone="error">Price history could not be loaded: {historyError}</Notice>
        ) : !analysis ? (
          <Loading />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-tertiary">
              {source?.kind === "wallet" ? (
                <>
                  <span className="text-secondary">
                    Wallet <span className="numeric">{shortAddress(source.balances.address, 6)}</span>
                  </span>
                  <span>read from mainnet {timeAgo(source.balances.readAt)}</span>
                  {source.balances.unpricedMints.length > 0 && (
                    <span>· {source.balances.unpricedMints.length} other token{source.balances.unpricedMints.length === 1 ? "" : "s"} not priced</span>
                  )}
                </>
              ) : (
                <>
                  <Tag>sample</Tag>
                  <span>{sample?.blurb} Synthetic holdings, real prices.</span>
                </>
              )}
              <span className="ml-auto">
                quotes {quotes?.stale ? "from history" : "live"} · history {history?.source === "live" ? "hourly" : "bundled"}, {timeAgo(history?.generatedAt ?? 0)}
              </span>
            </div>

            <div className="mb-4">
              <Summary a={analysis} />
            </div>

            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <div className="min-w-0 space-y-4">
                <Panel delay={40}>
                  <PanelHeader title="Holdings" meta={`${analysis.holdings.length} priced`} />
                  <Holdings a={analysis} />
                </Panel>

                <Panel delay={80}>
                  <PanelHeader
                    title="Risk of this allocation, last 30 days"
                    meta="as if held throughout"
                  />
                  <Backtest points={analysis.backtest} />
                </Panel>

                <Panel delay={120}>
                  <PanelHeader title="Target and drift" meta="rebalance orders" />
                  <Drift
                    a={analysis}
                    storageKey={source?.kind === "wallet" ? source.balances.address : `sample:${source?.key}`}
                    onTargetsChange={setTargets}
                  />
                </Panel>

                <Panel delay={160}>
                  <PanelHeader title="Your record on Solana" meta="policy and snapshots, signed by you" />
                  <OnChain
                    a={analysis}
                    viewing={source?.kind === "wallet" ? source.balances.address : null}
                    targets={targets}
                  />
                </Panel>
              </div>

              <div className="min-w-0 space-y-4">
                <Panel delay={40}>
                  <PanelHeader title="Trading without the market" meta={analysis.market.open ? "NYSE open" : "NYSE closed"} />
                  <Overnight a={analysis} />
                </Panel>

                <Panel delay={80}>
                  <PanelHeader title="Stocks, crypto, cash" meta="value vs risk" />
                  <Sleeves a={analysis} />
                </Panel>

                <Panel delay={120}>
                  <PanelHeader title="What if" meta="re-scored in your browser" />
                  <WhatIf amounts={amounts} history={history!} quotes={quotes!} now={now} />
                </Panel>

                <Panel delay={160}>
                  <PanelHeader title="Correlation" meta={`30d · ${analysis.correlation.symbols.length} assets`} />
                  <CorrelationGrid correlation={analysis.correlation} held={analysis.holdings.map((h) => h.symbol)} />
                </Panel>
              </div>
            </div>

            <footer className="mt-8 border-t border-border pt-4">
              <p className="text-[11px] leading-relaxed text-tertiary">
                Balances are read from Solana mainnet by your browser; prices and 30 days of hourly history come from
                CoinGecko; every figure is computed on this page. Value at Risk is a model estimate, not a prediction and
                not investment advice. xStocks are issued by Backed Finance; Afterhours is unaffiliated.
              </p>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

function Loading() {
  return (
    <div>
      <Skeleton className="mb-4 h-[174px]" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-[280px]" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
        </div>
      </div>
    </div>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
