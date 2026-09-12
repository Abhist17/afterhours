"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadHistoryProgressive, lastPrices, type History } from "@/lib/history";
import { fetchLivePrices, type Quotes } from "@/lib/prices";
import { readBalances, isValidAddress, resolveRpcUrl, setRpcUrl, usingPublicRpc, type Balances } from "@/lib/balances";
import { analyse } from "@/lib/portfolio";
import { SAMPLES, REAL_BOOK } from "@/lib/samples";
import { marketStatus } from "@/lib/market-hours";
import { useNow, useMounted } from "@/lib/hooks";
import { shortAddress, timeAgo } from "@/lib/format";
import type { Target } from "@/lib/quant";
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
import { Panel, PanelHeader, Button, Input, Notice, Skeleton, Tag } from "@/components/ui";

type Source =
  | { kind: "sample"; key: string; amounts: Record<string, number> }
  | { kind: "wallet"; balances: Balances; real?: boolean };

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

  // History paints from the bundled copy and upgrades to the hourly file;
  // quotes are asked for once the first history is in, then on a timer.
  // Quotes fall back to the last point of the history and say so; nothing
  // here waits on a server.
  useEffect(() => {
    let cancelled = false;
    let quotesRequested = false;
    const stop = loadHistoryProgressive({
      onHistory: (h) => {
        setHistory(h);
        if (quotesRequested) return;
        quotesRequested = true;
        void fetchLivePrices(lastPrices(h)).then((q) => {
          if (!cancelled) setQuotes(q);
        });
      },
      onError: (message) => setHistoryError(message),
    });
    return () => {
      cancelled = true;
      stop();
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

  const loadWallet = useCallback(async (value: string, real = false) => {
    const trimmed = value.trim();
    if (!isValidAddress(trimmed)) {
      setWalletError("That is not a Solana address.");
      return;
    }
    setLoadingWallet(true);
    setWalletError(null);
    try {
      const balances = await readBalances(trimmed);
      setSource({ kind: "wallet", balances, real });
      setAddress(trimmed);
      try {
        localStorage.setItem(ADDRESS_KEY, trimmed);
        const url = new URL(window.location.href);
        url.searchParams.set("address", trimmed);
        url.searchParams.delete("book");
        window.history.replaceState(null, "", url);
      } catch {}
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const host = safeHost(resolveRpcUrl());
      setWalletError(
        usingPublicRpc() && /403|forbidden|429/i.test(message)
          ? `${host} refused the read. Public endpoints do that under load — try again in a moment, set your own RPC below, or open a sample book.`
          : `Could not read ${shortAddress(trimmed)} from ${host}: ${message}`
      );
    } finally {
      setLoadingWallet(false);
    }
  }, []);

  // A link can name the book (?address= or ?book=), a returning viewer
  // gets their last address back, and a new one gets the first sample —
  // so the desk is never empty, and a judge can be sent straight to a
  // real wallet.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linked = params.get("address");
    const book = params.get("book");
    if (linked && isValidAddress(linked)) {
      setAddress(linked);
      void loadWallet(linked, linked === REAL_BOOK.address);
      return;
    }
    if (book && SAMPLES.some((s) => s.key === book)) {
      pickSample(book);
      return;
    }
    try {
      const stored = localStorage.getItem(ADDRESS_KEY);
      if (stored && isValidAddress(stored)) {
        setAddress(stored);
        void loadWallet(stored, stored === REAL_BOOK.address);
        return;
      }
    } catch {}
    setSource({ kind: "sample", key: SAMPLES[0].key, amounts: SAMPLES[0].amounts });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickSample(key: string) {
    const s = SAMPLES.find((x) => x.key === key) ?? SAMPLES[0];
    setSource({ kind: "sample", key: s.key, amounts: s.amounts });
    setWalletError(null);
    try {
      localStorage.removeItem(ADDRESS_KEY);
      const url = new URL(window.location.href);
      url.searchParams.set("book", s.key);
      url.searchParams.delete("address");
      window.history.replaceState(null, "", url);
    } catch {}
  }

  const amounts = source?.kind === "wallet" ? source.balances.amounts : source?.amounts ?? {};

  const analysis = useMemo(() => {
    if (!history || !quotes) return null;
    return analyse(amounts, quotes.prices, history, now);
  }, [history, quotes, amounts, now]);

  const market = useMemo(() => marketStatus(now), [now]);
  const sample = source?.kind === "sample" ? SAMPLES.find((s) => s.key === source.key) : null;
  const viewing = source?.kind === "wallet" ? source.balances.address : null;

  return (
    <div className="min-h-screen">
      <TopBar
        market={market}
        onOpenHelp={() => setHelpOpen(true)}
        connect={<ConnectButton onConnected={(addr) => void loadWallet(addr)} />}
      />
      <HowItWorks open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* ── Hero: the premise and the ways in ──────────────────── */}
      <section className="hero-glow border-b border-border">
        <div className="mx-auto max-w-[1500px] px-4 pb-8 pt-10 sm:px-6 sm:pt-14">
          <p className="label mb-3" style={{ color: "var(--brand)" }}>The risk desk for tokenized stocks on Solana</p>
          <h1 className="max-w-[22ch] text-[28px] font-semibold leading-[1.1] tracking-tight text-text sm:text-[40px]">
            Markets close. <span className="text-secondary">Your book doesn&rsquo;t.</span>
          </h1>
          <p className="mt-4 max-w-[58ch] text-[14px] leading-relaxed text-secondary sm:text-[15px]">
            An xStock trades every hour of every day. The share behind it trades 9:30 to 4:00, New York. What your
            tokens can lose tomorrow, what they&rsquo;ve done since the last bell, and how far your book has drifted
            from what you meant it to be &mdash; read from your wallet, scored in your browser, recorded on-chain by you.
          </p>

          <form
            className="mt-7 flex flex-col gap-2 sm:flex-row sm:items-center"
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
              className="numeric !h-11 !text-[13px] sm:max-w-lg"
            />
            <Button type="submit" variant="primary" size="lg" disabled={loadingWallet || !address.trim()}>
              {loadingWallet ? "Reading…" : "Read wallet"}
            </Button>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px] text-tertiary">
            <span className="mr-1">or open</span>
            <Button
              size="sm"
              variant={viewing === REAL_BOOK.address ? "primary" : "secondary"}
              onClick={() => void loadWallet(REAL_BOOK.address, true)}
              title={REAL_BOOK.blurb}
              disabled={loadingWallet}
            >
              {REAL_BOOK.label}
            </Button>
            {SAMPLES.map((s) => (
              <Button key={s.key} size="sm" variant={sample?.key === s.key ? "primary" : "secondary"} onClick={() => pickSample(s.key)} title={s.blurb}>
                {s.label}
              </Button>
            ))}
          </div>

          {walletError && (
            <div className="mt-3 max-w-2xl">
              <Notice tone="error">{walletError}</Notice>
            </div>
          )}

          <div className="mt-3 text-[11px] text-tertiary">
            {rpcOpen ? (
              <form
                className="flex flex-col gap-2 sm:flex-row sm:items-center"
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
                <Button type="submit" size="md" variant="secondary" disabled={!/^https?:\/\//.test(rpcDraft.trim())}>Use this RPC</Button>
                <Button type="button" size="md" variant="ghost" onClick={() => { setRpcUrl(null); setRpcOpen(false); }}>Reset</Button>
                <Button type="button" size="md" variant="ghost" onClick={() => setRpcOpen(false)}>Cancel</Button>
                <span>Stored in this browser only.</span>
              </form>
            ) : (
              <>
                Balances are read from mainnet by this page via <span className="numeric">{mounted ? safeHost(resolveRpcUrl()) : ""}</span>.{" "}
                <button type="button" onClick={() => setRpcOpen(true)} className="underline decoration-border-strong underline-offset-2 hover:text-text">
                  Use your own RPC
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
        {historyError ? (
          <Notice tone="error">Price history could not be loaded: {historyError}</Notice>
        ) : !analysis ? (
          <Loading />
        ) : (
          <>
            {/* ── Whose book, and how fresh ────────────────────── */}
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-tertiary">
              {source?.kind === "wallet" ? (
                <>
                  {source.real && <Tag color="var(--brand)">real wallet · not ours</Tag>}
                  <span className="text-secondary">
                    <span className="numeric">{shortAddress(source.balances.address, 6)}</span>
                  </span>
                  <span>read from mainnet {timeAgo(source.balances.readAt)}</span>
                  {source.balances.unpricedMints.length > 0 && (
                    <span>· {source.balances.unpricedMints.length} other token{source.balances.unpricedMints.length === 1 ? "" : "s"} the desk does not price</span>
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

            {/* Left column is the reading; right column is the acting. The
                numbers run down the left then the right, so a single-column
                phone reads 01 to 08 in order too. */}
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <div className="min-w-0 space-y-4">
                <Panel delay={40} id="holdings">
                  <PanelHeader
                    number="01"
                    title="What you hold"
                    caption="Every position the desk can price, with its share of value beside its share of risk. They differ."
                    meta={`${analysis.holdings.length} priced`}
                  />
                  <Holdings a={analysis} />
                </Panel>

                <Panel delay={80} id="overnight">
                  <PanelHeader
                    number="02"
                    title="Trading without the market"
                    caption="While the NYSE is closed, each stock's token keeps moving. This is what the market will open to."
                    meta={analysis.market.open ? "NYSE open" : "NYSE closed"}
                  />
                  <Overnight a={analysis} />
                </Panel>

                <Panel delay={120} id="sleeves">
                  <PanelHeader
                    number="03"
                    title="Where the risk really is"
                    caption="Stocks, crypto and cash by value and by risk — and the crypto that is called a stock."
                  />
                  <Sleeves a={analysis} />
                </Panel>

                <Panel delay={160} id="backtest">
                  <PanelHeader
                    number="04"
                    title="What this allocation has been"
                    caption="The current shape of the book, scored at every hour of the last thirty days as if held throughout."
                  />
                  <Backtest points={analysis.backtest} />
                </Panel>
              </div>

              <div className="min-w-0 space-y-4">
                <Panel delay={40} id="whatif">
                  <PanelHeader
                    number="05"
                    title="What if"
                    caption="Move a share of any position into any other asset and re-score the whole book, here, now."
                  />
                  <WhatIf amounts={amounts} history={history!} quotes={quotes!} now={now} />
                </Panel>

                <Panel delay={80} id="drift">
                  <PanelHeader
                    number="06"
                    title="What you meant it to be"
                    caption="State the allocation you intended. See the drift, and the trades that put it back."
                  />
                  <Drift
                    a={analysis}
                    storageKey={source?.kind === "wallet" ? source.balances.address : `sample:${source?.key}`}
                    onTargetsChange={setTargets}
                  />
                </Panel>

                <Panel delay={120} id="onchain">
                  <PanelHeader
                    number="07"
                    title="Your record on Solana"
                    caption="Declare the policy on-chain and record snapshots of the book — signed by the wallet that owns it."
                  />
                  <OnChain a={analysis} viewing={viewing} targets={targets} />
                </Panel>

                <Panel delay={160} id="correlation">
                  <PanelHeader
                    number="08"
                    title="How they move together"
                    caption="Thirty days of hourly returns. Pairs near 1.00 are one bet wearing two names."
                    meta={`${analysis.correlation.symbols.length} assets`}
                  />
                  <CorrelationGrid correlation={analysis.correlation} held={analysis.holdings.map((h) => h.symbol)} />
                </Panel>
              </div>
            </div>

            <footer className="mt-10 border-t border-border pt-5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-tertiary">
                <a href="https://github.com/Abhist17/afterhours" target="_blank" rel="noopener noreferrer" className="underline decoration-border-strong underline-offset-2 hover:text-text">Source</a>
                <button type="button" onClick={() => setHelpOpen(true)} className="underline decoration-border-strong underline-offset-2 hover:text-text">How the numbers are made</button>
                <span className="ml-auto">Built for Stocklana · by the author of Sentra</span>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-tertiary">
                Balances are read from Solana mainnet by your browser; prices and thirty days of hourly history come from
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
