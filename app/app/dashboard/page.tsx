"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadHistoryProgressive, lastPrices, type History } from "@/lib/history";
import { fetchLivePrices, type Quotes } from "@/lib/prices";
import { readBalances, isValidAddress, resolveRpcUrl, setRpcUrl, usingPublicRpc, type Balances } from "@/lib/balances";
import { analyse } from "@/lib/portfolio";
import { SAMPLES, REAL_BOOK } from "@/lib/samples";
import { marketStatus } from "@/lib/market-hours";
import { useNow, useMounted } from "@/lib/hooks";
import { useTheme } from "@/lib/theme";
import { useShortcuts, scrollToPanel } from "@/lib/shortcuts";
import { shortAddress, timeAgo } from "@/lib/format";
import type { Target } from "@/lib/quant";
import { TopBar, ThemeToggle } from "@/components/TopBar";
import { Tape } from "@/components/Tape";
import { SectionNav, Rail, type Section } from "@/components/SectionNav";
import { Stress } from "@/components/Stress";
import { RiskMap } from "@/components/RiskMap";
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
import { Panel, PanelHeader, Button, Input, Notice, Skeleton, Tag, CopyLink } from "@/components/ui";

type Source =
  | { kind: "sample"; key: string; amounts: Record<string, number> }
  | { kind: "wallet"; balances: Balances; real?: boolean };

const ADDRESS_KEY = "afterhours-address";
const RECENT_KEY = "afterhours-recent";
const RECENT_MAX = 5;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string" && isValidAddress(x)) : [];
  } catch {
    return [];
  }
}

function remember(address: string): string[] {
  const next = [address, ...readRecent().filter((a) => a !== address)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

/** The desk in reading order; the nav, the panel numbers and the number keys all follow it. */
const SECTIONS: Section[] = [
  { id: "holdings", number: "01", title: "What you hold" },
  { id: "overnight", number: "02", title: "Without the market" },
  { id: "sleeves", number: "03", title: "Where the risk is" },
  { id: "backtest", number: "04", title: "Thirty days" },
  { id: "correlation", number: "05", title: "Correlation" },
  { id: "whatif", number: "06", title: "What if" },
  { id: "stress", number: "07", title: "Stress" },
  { id: "drift", number: "08", title: "Target and drift" },
  { id: "onchain", number: "09", title: "On Solana" },
  { id: "riskmap", number: "10", title: "Risk and return" },
];

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
  const [recent, setRecent] = useState<string[]>([]);
  const now = useNow(60_000);
  const mounted = useMounted();
  const { toggle: toggleTheme } = useTheme();
  const addressInput = useRef<HTMLInputElement>(null);

  // Keys: / to the address, ? for help, t for theme, 1–9 and 0 to a panel.
  const shortcuts = useMemo(() => {
    const jump = (i: number) => () => scrollToPanel(SECTIONS[i]?.id ?? "");
    const map: Record<string, () => void> = {
      "/": () => addressInput.current?.focus(),
      "?": () => setHelpOpen((o) => !o),
      t: () => toggleTheme(),
      Escape: () => setHelpOpen(false),
    };
    SECTIONS.forEach((_, i) => {
      map[String((i + 1) % 10)] = jump(i);
    });
    return map;
  }, [toggleTheme]);
  useShortcuts(shortcuts);

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

  // Only the latest read may speak: a slower earlier one must not paint an
  // error, or an older book, over a newer answer.
  const readSeq = useRef(0);
  const loadWallet = useCallback(async (value: string, real = false): Promise<boolean> => {
    const trimmed = value.trim();
    if (!isValidAddress(trimmed)) {
      setWalletError("That is not a Solana address.");
      return false;
    }
    const seq = ++readSeq.current;
    setLoadingWallet(true);
    setWalletError(null);
    try {
      const balances = await readBalances(trimmed);
      if (seq !== readSeq.current) return false;
      setSource({ kind: "wallet", balances, real });
      setAddress(trimmed);
      if (!real) setRecent(remember(trimmed));
      try {
        localStorage.setItem(ADDRESS_KEY, trimmed);
        const url = new URL(window.location.href);
        url.searchParams.set("address", trimmed);
        url.searchParams.delete("book");
        window.history.replaceState(null, "", url);
      } catch {}
      return true;
    } catch (err) {
      if (seq !== readSeq.current) return false;
      const message = err instanceof Error ? err.message : String(err);
      const host = safeHost(resolveRpcUrl());
      setWalletError(
        usingPublicRpc() && /403|forbidden|429/i.test(message)
          ? `${host} refused the read. Public endpoints do that under load — try again in a moment, set your own RPC below, or open a sample book.`
          : `Could not read ${shortAddress(trimmed)} from ${host}: ${message}`
      );
      return false;
    } finally {
      if (seq === readSeq.current) setLoadingWallet(false);
    }
  }, []);

  // A link can name the book (?address= or ?book=), a returning viewer
  // gets their last address back, and a new one gets the first sample —
  // so the desk is never empty, and a judge can be sent straight to a
  // real wallet.
  useEffect(() => {
    setRecent(readRecent());
    const params = new URLSearchParams(window.location.search);
    const linked = params.get("address");
    const book = params.get("book");
    // A wallet that cannot be read right now still leaves a desk to look
    // at: the first sample, under the error that says why.
    const orSample = (ok: boolean) => {
      if (!ok) setSource((s) => s ?? { kind: "sample", key: SAMPLES[0].key, amounts: SAMPLES[0].amounts });
    };
    if (linked && isValidAddress(linked)) {
      setAddress(linked);
      void loadWallet(linked, linked === REAL_BOOK.address).then(orSample);
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
        void loadWallet(stored, stored === REAL_BOOK.address).then(orSample);
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
    if (!history || !quotes || !source) return null;
    return analyse(amounts, quotes.prices, history, now);
  }, [history, quotes, amounts, now, source]);

  // A link that names a panel (#stress) lands on it once the panels exist.
  const landed = useRef(false);
  useEffect(() => {
    if (!analysis || landed.current) return;
    landed.current = true;
    const id = window.location.hash.slice(1);
    if (id && SECTIONS.some((s) => s.id === id)) setTimeout(() => scrollToPanel(id), 50);
  }, [analysis]);

  const market = useMemo(() => marketStatus(now), [now]);
  const sample = source?.kind === "sample" ? SAMPLES.find((s) => s.key === source.key) : null;
  const viewing = source?.kind === "wallet" ? source.balances.address : null;

  return (
    <div className="flex min-h-screen">
      <Rail
        sections={SECTIONS}
        onOpenHelp={() => setHelpOpen(true)}
        footer={
          <div className="mt-1 flex items-center justify-between px-2 py-1.5">
            <span>Theme</span>
            <ThemeToggle />
          </div>
        }
      />

      <div className="min-w-0 flex-1">
        <TopBar
          market={market}
          onOpenHelp={() => setHelpOpen(true)}
          connect={<ConnectButton onConnected={(addr) => void loadWallet(addr)} />}
          rail
        />
        <HowItWorks open={helpOpen} onClose={() => setHelpOpen(false)} />
        {analysis && <SectionNav sections={SECTIONS} />}

        {/* ── The command strip: whose book to read ───────────────── */}
        <div className="print-hide border-b border-border bg-bg-subtle">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6">
            <form
              className="flex min-w-0 flex-1 basis-[320px] items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void loadWallet(address);
              }}
            >
              <Input
                ref={addressInput}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Paste a Solana address holding xStocks"
                spellCheck={false}
                autoComplete="off"
                aria-label="Solana wallet address"
                className="numeric !h-9 max-w-xl !text-[12.5px]"
              />
              <Button type="submit" variant="primary" size="md" disabled={loadingWallet || !address.trim()} className="shrink-0">
                {loadingWallet ? "Reading…" : "Read"}
              </Button>
            </form>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-tertiary">
              <span className="mr-0.5 hidden sm:inline">or open</span>
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

            <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-tertiary">
              {recent.filter((r) => r !== REAL_BOOK.address).length > 0 && (
                <span className="flex items-center gap-1.5">
                  <span>recent</span>
                  {recent
                    .filter((r) => r !== REAL_BOOK.address)
                    .map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => void loadWallet(r)}
                        disabled={loadingWallet}
                        className={`numeric rounded-md border px-1.5 py-0.5 transition-colors hover:text-text ${viewing === r ? "border-brand text-text" : "border-border"}`}
                        title={r}
                      >
                        {shortAddress(r, 4)}
                      </button>
                    ))}
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        localStorage.removeItem(RECENT_KEY);
                      } catch {}
                      setRecent([]);
                    }}
                    className="underline decoration-border-strong underline-offset-2 hover:text-text"
                  >
                    forget
                  </button>
                </span>
              )}
              {!rpcOpen && (
                <button
                  type="button"
                  onClick={() => setRpcOpen(true)}
                  className="underline decoration-border-strong underline-offset-2 hover:text-text"
                  title={mounted ? `Balances are read from mainnet via ${safeHost(resolveRpcUrl())}` : undefined}
                >
                  RPC · <span className="numeric">{mounted ? safeHost(resolveRpcUrl()) : ""}</span>
                </button>
              )}
            </div>
          </div>

          {rpcOpen && (
            <form
              className="flex flex-col gap-2 border-t border-border px-4 py-2.5 text-[11px] text-tertiary sm:flex-row sm:items-center sm:px-6"
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
                className="numeric !h-8 !text-xs sm:max-w-md"
              />
              <Button type="submit" size="sm" variant="secondary" disabled={!/^https?:\/\//.test(rpcDraft.trim())}>Use this RPC</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setRpcUrl(null); setRpcOpen(false); }}>Reset</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setRpcOpen(false)}>Cancel</Button>
              <span>Stored in this browser only.</span>
            </form>
          )}

          {walletError && (
            <div className="px-4 pb-2.5 sm:px-6">
              <Notice tone="error">{walletError}</Notice>
            </div>
          )}
        </div>

        <Tape history={history} prices={quotes?.prices ?? null} market={market} />

        <main className="px-4 py-5 sm:px-6">
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
                <span className="ml-auto flex items-center gap-3">
                  <span>
                    quotes {quotes?.stale ? "from history" : "live"} · history {history?.source === "live" ? "hourly" : "bundled"}, {timeAgo(history?.generatedAt ?? 0)}
                  </span>
                  <CopyLink />
                </span>
              </div>

              <div className="mb-4">
                <Summary a={analysis} />
              </div>

              {/* Left column is the reading; right column is the acting. The
                  numbers run down the left then the right, so a single-column
                  phone reads 01 to 10 in order too. */}
              <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-4">
                  <Panel delay={40} id="holdings">
                    <PanelHeader
                      number="01"
                      title="What you hold"
                      caption="Every position the desk can price, with its share of value beside its share of risk. They differ. Click one for its thirty days."
                      meta={`${analysis.holdings.length} priced`}
                    />
                    <Holdings a={analysis} history={history!} />
                  </Panel>

                  <Panel delay={80} id="overnight">
                    <PanelHeader
                      number="02"
                      title="Trading without the market"
                      caption="While the NYSE is closed, each stock's token keeps moving. This is what the market will open to — and what it has opened to, close after close."
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
                      caption="The current shape of the book through the last thirty days: its risk score at every hour, its value, its drawdown — and the model marked against what happened."
                    />
                    <Backtest a={analysis} />
                  </Panel>

                  <Panel delay={200} id="correlation">
                    <PanelHeader
                      number="05"
                      title="How they move together"
                      caption="Thirty days of hourly returns. Pairs near 1.00 are one bet wearing two names."
                      meta={`${analysis.correlation.symbols.length} assets`}
                    />
                    <CorrelationGrid correlation={analysis.correlation} held={analysis.holdings.map((h) => h.symbol)} />
                  </Panel>
                </div>

                <div className="min-w-0 space-y-4">
                  <Panel delay={40} id="whatif">
                    <PanelHeader
                      number="06"
                      title="What if"
                      caption="Move a share of any position into any other asset and re-score the whole book, here, now."
                    />
                    <WhatIf amounts={amounts} history={history!} quotes={quotes!} now={now} />
                  </Panel>

                  <Panel delay={80} id="stress">
                    <PanelHeader
                      number="07"
                      title="If the market gaps"
                      caption="The book under shocks the last thirty days may never have shown — and under the worst day and worst close they actually had."
                    />
                    <Stress a={analysis} />
                  </Panel>

                  <Panel delay={120} id="drift">
                    <PanelHeader
                      number="08"
                      title="What you meant it to be"
                      caption="State the allocation you intended. See the drift, and the trades that put it back — each quoted live on Jupiter."
                    />
                    <Drift
                      a={analysis}
                      prices={quotes!.prices}
                      storageKey={source?.kind === "wallet" ? source.balances.address : `sample:${source?.key}`}
                      onTargetsChange={setTargets}
                    />
                  </Panel>

                  <Panel delay={160} id="onchain">
                    <PanelHeader
                      number="09"
                      title="Your record on Solana"
                      caption="Declare the policy on-chain and record snapshots of the book — signed by the wallet that owns it."
                    />
                    <OnChain a={analysis} viewing={viewing} targets={targets} />
                  </Panel>

                  <Panel delay={200} id="riskmap">
                    <PanelHeader
                      number="10"
                      title="Risk and return, name by name"
                      caption="Every asset the desk knows, placed by its volatility and its thirty-day return. What is held is solid; the book is the ring."
                      meta={`${analysis.riskReturn.length} assets`}
                    />
                    <RiskMap a={analysis} />
                  </Panel>
                </div>
              </div>

              <footer className="mt-10 border-t border-border pt-5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-tertiary">
                  <a href="https://github.com/Abhist17/afterhours" target="_blank" rel="noopener noreferrer" className="underline decoration-border-strong underline-offset-2 hover:text-text">Source</a>
                  <button type="button" onClick={() => setHelpOpen(true)} className="underline decoration-border-strong underline-offset-2 hover:text-text">How the numbers are made</button>
                  <button type="button" onClick={() => window.print()} className="underline decoration-border-strong underline-offset-2 hover:text-text">Print this desk</button>
                  <a href="https://github.com/Abhist17/afterhours/blob/main/docs/SUBMISSION.md" target="_blank" rel="noopener noreferrer" className="underline decoration-border-strong underline-offset-2 hover:text-text">Submission notes</a>
                  <span className="hidden items-center gap-1 sm:inline-flex">
                    <kbd className="numeric rounded border border-border px-1 text-[10px]">/</kbd> address
                    <kbd className="numeric ml-2 rounded border border-border px-1 text-[10px]">1</kbd>–<kbd className="numeric rounded border border-border px-1 text-[10px]">0</kbd> panels
                    <kbd className="numeric ml-2 rounded border border-border px-1 text-[10px]">?</kbd> help
                    <kbd className="numeric ml-2 rounded border border-border px-1 text-[10px]">t</kbd> theme
                  </span>
                  <Link href="/" className="ml-auto underline decoration-border-strong underline-offset-2 hover:text-text">About Afterhours</Link>
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
    </div>
  );
}

function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading the desk">
      <Skeleton className="mb-3 h-5 w-64" />
      <Skeleton className="mb-4 h-[174px]" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Skeleton className="h-[420px]" />
          <Skeleton className="h-[520px]" />
          <Skeleton className="h-64" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-52" />
          <Skeleton className="h-[460px]" />
          <Skeleton className="h-80" />
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
