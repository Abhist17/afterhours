"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { loadHistoryProgressive, lastPrices, type History } from "@/lib/history";
import { fetchLivePrices, type Quotes } from "@/lib/prices";
import { isValidAddress } from "@/lib/balances";
import { marketStatus } from "@/lib/market-hours";
import { useNow } from "@/lib/hooks";
import { SAMPLES, REAL_BOOK, REAL_PRESTOCKS_BOOK } from "@/lib/samples";
import { ASSETS } from "@/lib/universe";
import { Logo, Mark } from "@/components/Logo";
import { ThemeToggle } from "@/components/TopBar";
import { SessionRing } from "@/components/SessionRing";
import { Tape } from "@/components/Tape";
import { Typewriter } from "@/components/Typewriter";
import { Button, Input } from "@/components/ui";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
const PROGRAM = "3hqhzG55EkCjhUYmmCxHWyNGkXi3XJSTEWimkTzVifri";
const EXPLORER = `https://explorer.solana.com/address/${PROGRAM}?cluster=devnet`;

/** The ten panels, in the order the desk reads them. */
const PANELS: { id: string; number: string; title: string; line: string }[] = [
  { id: "holdings", number: "01", title: "What you hold", line: "Every position with its share of value beside its share of risk. They differ." },
  { id: "overnight", number: "02", title: "Trading without the market", line: "Each stock's token move since the last official print, summed: the market opens to this." },
  { id: "sleeves", number: "03", title: "Where the risk really is", line: "Stocks, crypto and cash by value and by risk, and the crypto that is called a stock." },
  { id: "backtest", number: "04", title: "Thirty days", line: "The book scored at every hour with what was known then, and the model marked against what happened." },
  { id: "correlation", number: "05", title: "How they move together", line: "Thirty days of hourly returns. Pairs near 1.00 are one bet wearing two names." },
  { id: "whatif", number: "06", title: "What if", line: "Move a share of any position into any other asset and re-score the whole book, instantly." },
  { id: "stress", number: "07", title: "If the market gaps", line: "S&P −5%, crypto −30%, and the window's own worst day, each position by its beta." },
  { id: "drift", number: "08", title: "Target and drift", line: "State the allocation you meant. See the drift and the orders back, each quoted live on Jupiter." },
  { id: "onchain", number: "09", title: "Your record on Solana", line: "Declare the policy on-chain and record snapshots, signed by the wallet that owns the book." },
  { id: "riskmap", number: "10", title: "Risk and return", line: "Every asset the desk knows, placed by volatility and thirty-day return." },
];

const STEPS = [
  { n: "1", title: "Paste an address, or connect", body: "The page reads the wallet's token accounts from Solana mainnet, Token-2022 and the classic program, with no key and no custody." },
  { n: "2", title: "Scored in your browser", body: "Thirty days of hourly prices for the whole universe are already in the tab. VaR, beta, drift, stress: every figure is computed where you can see it." },
  { n: "3", title: "Recorded on Solana, by you", body: "Save the targets as an on-chain policy and record snapshots, each one an account owned and signed by your wallet. A breach is an event anyone can subscribe to." },
];

export default function Landing() {
  const router = useRouter();
  const [history, setHistory] = useState<History | null>(null);
  const [quotes, setQuotes] = useState<Quotes | null>(null);
  const [address, setAddress] = useState("");
  const now = useNow(60_000);
  const market = useMemo(() => marketStatus(now), [now]);
  const equities = useMemo(() => ASSETS.filter((a) => a.class === "equity").length, []);

  // Old links named the book on the root page; they still land on it.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("address") || url.searchParams.has("book")) {
      router.replace(`/dashboard/${url.search}${url.hash}`);
    }
  }, [router]);

  // The tape wants history and quotes; the same progressive load the desk uses.
  useEffect(() => {
    let cancelled = false;
    let asked = false;
    const stop = loadHistoryProgressive({
      onHistory: (h) => {
        setHistory(h);
        if (asked) return;
        asked = true;
        void fetchLivePrices(lastPrices(h)).then((q) => {
          if (!cancelled) setQuotes(q);
        });
      },
      onError: () => {},
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  const open = (query: string) => router.push(`/dashboard/${query}`);

  return (
    <div className="min-h-screen">
      {/* ── Nav ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-3 px-4 sm:px-6">
          <Logo />
          <nav className="ml-6 hidden items-center gap-5 text-[12.5px] text-secondary md:flex" aria-label="Site">
            <a href="#panels" className="hover:text-text">The desk</a>
            <a href="#how" className="hover:text-text">How it works</a>
            <a href="#solana" className="hover:text-text">On Solana</a>
            <a href="https://github.com/Abhist17/afterhours" target="_blank" rel="noopener noreferrer" className="hover:text-text">Source</a>
          </nav>
          <span className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link href="/dashboard/" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-text hover:opacity-90">
              Open the desk <span aria-hidden="true">→</span>
            </Link>
          </span>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="hero-glow border-b border-border">
        <div className="mx-auto grid max-w-[1200px] items-center gap-x-10 gap-y-8 px-4 pb-12 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_auto] lg:pb-16">
          <div className="min-w-0">
            <p className="hero-enter label mb-4 flex items-center gap-2" style={{ color: "var(--brand)" }}>
              <Mark size={14} />
              The risk desk for tokenized stocks on Solana
            </p>
            <h1 className="hero-enter display max-w-[16ch] text-[44px] leading-[1] text-text sm:text-[68px]" style={{ animationDelay: "100ms" }}>
              Markets close.
              <em className="text-secondary">
                <Typewriter text="Your book doesn’t." />
              </em>
            </h1>
            <p className="hero-enter mt-5 max-w-[56ch] text-[15px] leading-relaxed text-secondary sm:text-[16px]" style={{ animationDelay: "220ms" }}>
              An xStock trades every hour of every day. The share behind it trades 9:30 to 4:00, New York. Afterhours reads
              any wallet holding xStocks and says what it can lose tomorrow, what it has done since the last bell, and how far it
              has drifted from what you meant it to be, scored in your browser, recorded on-chain by you.
            </p>

            <form
              className="hero-enter mt-8 flex flex-col gap-2 sm:flex-row sm:items-center"
              style={{ animationDelay: "340ms" }}
              onSubmit={(e) => {
                e.preventDefault();
                const a = address.trim();
                if (isValidAddress(a)) open(`?address=${a}`);
              }}
            >
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Paste a Solana address holding xStocks"
                spellCheck={false}
                autoComplete="off"
                aria-label="Solana wallet address"
                className="numeric !h-12 !text-[13px] sm:max-w-lg"
              />
              <Button type="submit" variant="primary" size="lg" disabled={!isValidAddress(address.trim())} className="!h-12">
                Read wallet
              </Button>
            </form>

            <div className="hero-enter mt-3 flex flex-wrap items-center gap-1.5 text-[12px] text-tertiary" style={{ animationDelay: "440ms" }}>
              <span className="mr-1">or open</span>
              <Button size="sm" variant="secondary" onClick={() => open(`?address=${REAL_BOOK.address}`)} title={REAL_BOOK.blurb}>
                {REAL_BOOK.label}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => open(`?address=${REAL_PRESTOCKS_BOOK.address}`)} title={REAL_PRESTOCKS_BOOK.blurb}>
                {REAL_PRESTOCKS_BOOK.label}
              </Button>
              {SAMPLES.map((s) => (
                <Button key={s.key} size="sm" variant="secondary" onClick={() => open(`?book=${s.key}`)} title={s.blurb}>
                  {s.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="hero-enter hidden justify-self-center lg:block" style={{ animationDelay: "160ms" }}>
            <SessionRing market={market} now={now} />
          </div>
        </div>
      </section>
      <Tape history={history} prices={quotes?.prices ?? null} market={market} />

      {/* ── The desk, as a picture ──────────────────────────────── */}
      <section className="mx-auto max-w-[1200px] px-4 pt-14 sm:px-6 sm:pt-20">
        <div className="card overflow-hidden shadow-md">
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
            <span className="h-2 w-2 rounded-full bg-border-strong" />
            <span className="h-2 w-2 rounded-full bg-border-strong" />
            <span className="h-2 w-2 rounded-full bg-border-strong" />
            <span className="numeric ml-3 text-[10px] text-tertiary">afterhours · a real $21M xStocks wallet on mainnet</span>
          </div>
          <Link href={`/dashboard/?address=${REAL_BOOK.address}`} title="Open this wallet on the desk">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE}/desk.jpg`} alt="The Afterhours desk reading a real xStocks wallet: risk score, book, one-day VaR, beta, the move since the close, and the holdings." width={1280} height={800} className="block w-full" />
          </Link>
        </div>
        <p className="mt-3 text-center text-[12px] text-tertiary">
          A real wallet, not ours, found through the largest SPYx token accounts. MSTRx is 18% of its value and 51% of its risk.
        </p>
      </section>

      {/* ── Ten panels ──────────────────────────────────────────── */}
      <section id="panels" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 pt-16 sm:px-6 sm:pt-24">
        <p className="label" style={{ color: "var(--brand)" }}>The desk</p>
        <h2 className="display mt-2 text-[30px] leading-[1.05] text-text sm:text-[40px]">Ten panels. One book.</h2>
        <p className="mt-3 max-w-[60ch] text-[14px] leading-relaxed text-secondary">
          A brokerage app shows what you have. None shows what you stand to lose, and none has ever had to price a
          share after the bell. Each panel answers one question; number keys jump between them.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {PANELS.map((p) => (
            <Link key={p.id} href={`/dashboard/#${p.id}`} className="card group flex flex-col gap-2 p-4 transition-colors hover:bg-surface-hover">
              <span className="figure text-[18px]" style={{ color: "var(--brand)" }}>{p.number}</span>
              <span className="text-[13px] font-semibold text-text">{p.title}</span>
              <span className="text-[12px] leading-snug text-tertiary">{p.line}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────── */}
      <section id="how" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 pt-16 sm:px-6 sm:pt-24">
        <p className="label" style={{ color: "var(--brand)" }}>How it works</p>
        <h2 className="display mt-2 text-[30px] leading-[1.05] text-text sm:text-[40px]">Nothing to run.</h2>
        <p className="mt-3 max-w-[60ch] text-[14px] leading-relaxed text-secondary">
          One static page. Balances from mainnet in the browser, history refreshed hourly by a workflow, every figure computed in
          the tab, every on-chain write signed by the viewer. Nothing sleeps, nothing cold-starts.
        </p>
        <ol className="mt-8 grid gap-3 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="card p-5">
              <span className="figure text-[28px] leading-none" style={{ color: "var(--brand)" }}>{s.n}</span>
              <p className="mt-3 text-[14px] font-semibold text-text">{s.title}</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-tertiary">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Where Solana is load-bearing ────────────────────────── */}
      <section id="solana" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 pt-16 sm:px-6 sm:pt-24">
        <p className="label" style={{ color: "var(--brand)" }}>On Solana</p>
        <h2 className="display mt-2 text-[30px] leading-[1.05] text-text sm:text-[40px]">Where the chain is load-bearing.</h2>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          <div className="card p-5">
            <p className="text-[14px] font-semibold text-text">Reads</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-tertiary">
              xStocks are Token-2022 mints on mainnet. The page reads any wallet&rsquo;s token accounts under both token
              programs. Every one of the {equities} mints was verified on-chain, alongside eight{" "}
              <a href="https://prestocks.com" target="_blank" rel="noopener noreferrer" className="text-secondary underline decoration-border-strong underline-offset-2 hover:text-text">PreStocks</a>
              {" "}pre-IPO tokens, read the same way: no key, no custody, held or not.
            </p>
          </div>
          <div className="card p-5">
            <p className="text-[14px] font-semibold text-text">Writes</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-tertiary">
              An Anchor program with a <span className="text-secondary">Policy</span> (targets in bps, a risk limit, a drift band) and
              immutable <span className="text-secondary">Snapshots</span>, both owned by the wallet they describe. Every snapshot emits{" "}
              <span className="numeric text-secondary">SnapshotRecorded {"{ breached }"}</span> — not a price to watch, but an
              event a lending protocol could act on directly: this book left its owner&rsquo;s own stated policy.
            </p>
            <a href={EXPLORER} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-[12px] underline decoration-border-strong underline-offset-2 hover:text-text" style={{ color: "var(--brand)" }}>
              Program on Explorer ↗
            </a>
          </div>
          <div className="card p-5">
            <p className="text-[14px] font-semibold text-text">Quotes</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-tertiary">
              Every rebalance order is quoted live on Jupiter for its exact size, what the swap fetches now, its price
              impact and route, and links out by mint.
            </p>
          </div>
        </div>

        <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-border bg-border md:grid-cols-5">
          {[
            [String(equities), "xStocks, every mint verified"],
            ["5", "program instructions"],
            ["1", "event: SnapshotRecorded"],
            ["99", "tests in CI, app + program"],
            ["0", "servers"],
          ].map(([n, l]) => (
            <div key={l} className="bg-surface px-5 py-5">
              <dt className="figure text-[32px] leading-none text-text">{n}</dt>
              <dd className="mt-1.5 text-[11.5px] text-tertiary">{l}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── Closing CTA ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1200px] px-4 pt-16 sm:px-6 sm:pt-24">
        <div className="hero-glow card flex flex-col items-start gap-5 p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div>
            <h2 className="display text-[28px] leading-[1.05] text-text sm:text-[36px]">
              Open the desk.
            </h2>
            <p className="mt-2 max-w-[48ch] text-[13.5px] text-secondary">A sample book is loaded before you paste anything. Devnet for the on-chain part, so trying it costs nobody real SOL.</p>
          </div>
          <Link href="/dashboard/" className="inline-flex h-12 shrink-0 items-center gap-2 rounded-lg bg-primary px-6 text-[14px] font-medium text-primary-text hover:opacity-90">
            Open the desk <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <footer className="mx-auto max-w-[1200px] px-4 pb-10 pt-14 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-5 text-[11px] text-tertiary">
          <Logo size={16} />
          <a href="https://github.com/Abhist17/afterhours" target="_blank" rel="noopener noreferrer" className="underline decoration-border-strong underline-offset-2 hover:text-text">Source</a>
          <a href="https://github.com/Abhist17/afterhours/blob/main/docs/SUBMISSION.md" target="_blank" rel="noopener noreferrer" className="underline decoration-border-strong underline-offset-2 hover:text-text">Submission notes</a>
          <a href={EXPLORER} target="_blank" rel="noopener noreferrer" className="underline decoration-border-strong underline-offset-2 hover:text-text">Program</a>
          <span className="ml-auto">Built for Stocklana · by the author of Sentra</span>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-tertiary">
          Balances are read from Solana mainnet by your browser; prices and thirty days of hourly history come from CoinGecko;
          every figure is computed on the page. Value at Risk is a model estimate, not a prediction and not investment advice.
          xStocks are issued by Backed Finance; PreStocks tokens by PreStocks; Afterhours is unaffiliated with either.
        </p>
      </footer>
    </div>
  );
}
