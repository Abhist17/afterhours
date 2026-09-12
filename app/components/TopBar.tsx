"use client";

import type { MarketStatus } from "@/lib/market-hours";
import { formatEastern } from "@/lib/market-hours";
import { untilTime } from "@/lib/format";
import { useMounted, useNow } from "@/lib/hooks";
import { useTheme } from "@/lib/theme";
import { Button, Dot } from "./ui";

function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="8.5" stroke="var(--text-secondary)" strokeWidth="1.2" fill="none" />
        {/* A clock past the close: the hands say 4:00 and the tick keeps going. */}
        <path d="M10 10 V5.5 M10 10 H13.6" stroke="var(--text)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        <circle cx="10" cy="10" r="1" fill="var(--text)" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight text-text">Afterhours</span>
    </span>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const mounted = useMounted();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      aria-label={mounted && theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
      className="!px-2"
    >
      <span className="block h-3.5 w-3.5">
        {mounted &&
          (theme === "light" ? (
            <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
              <path d="M11.5 8.6A5 5 0 0 1 5.4 2.5 5 5 0 1 0 11.5 8.6Z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
              <circle cx="7" cy="7" r="2.9" fill="currentColor" />
              <path d="M7 .8v1.6M7 11.6v1.6M13.2 7h-1.6M2.4 7H.8M11.4 2.6l-1.1 1.1M3.7 10.3l-1.1 1.1M11.4 11.4l-1.1-1.1M3.7 3.7 2.6 2.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          ))}
      </span>
    </Button>
  );
}

/**
 * The status that frames everything below: whether the shares behind the
 * tokens are trading right now. Green means the underlying market is open;
 * the amber closed state is not an error, it is the product's premise.
 */
export function MarketPill({ market }: { market: MarketStatus }) {
  const mounted = useMounted();
  useNow(30_000);
  const reason = market.reason === "weekend" ? "weekend" : market.reason === "holiday" ? "holiday" : "overnight";

  return (
    <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-border px-2 py-1 sm:gap-2 sm:px-2.5">
      <Dot color={market.open ? "var(--calm)" : "var(--watch)"} pulse={market.open} />
      <span className="text-[11px] font-medium text-secondary">
        {market.open ? "NYSE open" : "NYSE closed"}
        <span className="hidden sm:inline">{market.open ? "" : ` · ${reason}`}</span>
      </span>
      {mounted && (
        <span className="numeric hidden text-[11px] text-tertiary sm:inline">
          {market.open
            ? `closes in ${untilTime(market.nextClose)}`
            : `opens ${formatEastern(market.nextOpen)} · in ${untilTime(market.nextOpen)}`}
        </span>
      )}
    </span>
  );
}

export function TopBar({
  market,
  onOpenHelp,
  connect,
}: {
  market: MarketStatus | null;
  onOpenHelp: () => void;
  connect?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Logo />
        <span className="ml-auto flex items-center gap-2 sm:gap-3">
          {market && <MarketPill market={market} />}
          {connect}
          <Button variant="ghost" size="sm" onClick={onOpenHelp} className="shrink-0">
            <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
              <circle cx="7" cy="7" r="5.9" stroke="currentColor" strokeWidth="1.2" fill="none" />
              <path d="M5.3 5.2a1.75 1.75 0 1 1 2.3 1.7c-.4.2-.6.5-.6.9v.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
              <circle cx="7" cy="10.3" r="0.75" fill="currentColor" />
            </svg>
            <span className="hidden sm:inline">How it works</span>
          </Button>
          <ThemeToggle />
        </span>
      </div>
    </header>
  );
}
