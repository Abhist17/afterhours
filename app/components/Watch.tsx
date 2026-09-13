"use client";

import { useEffect, useRef, useState } from "react";
import type { Analysis } from "@/lib/portfolio";
import { ARMED, DEFAULT_WATCH, evaluateWatch, type WatchSettings, type WatchState } from "@/lib/alerts";
import { useMounted } from "@/lib/hooks";
import { Button } from "./ui";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

/**
 * The desk keeps an eye on the book while the tab is open: a browser
 * notification when the stocks move past a line since the close, or the
 * risk score crosses one. Quotes refresh every minute; this reads each
 * refresh. Settings live in this browser, per book.
 */
export function Watch({
  a,
  book,
  storageKey,
  onWatching,
}: {
  a: Analysis;
  book: string;
  storageKey: string;
  onWatching?: (watching: boolean) => void;
}) {
  const mounted = useMounted();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [settings, setSettings] = useState<WatchSettings>(DEFAULT_WATCH);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [last, setLast] = useState<string | null>(null);
  const state = useRef<WatchState>(ARMED);
  const key = `afterhours-watch:${storageKey}`;

  useEffect(() => {
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw) as { enabled: boolean; settings: WatchSettings };
        setEnabled(!!saved.enabled);
        setSettings({ ...DEFAULT_WATCH, ...saved.settings });
      } else {
        setEnabled(false);
        setSettings(DEFAULT_WATCH);
      }
    } catch {}
    state.current = ARMED;
    setLast(null);
  }, [key]);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify({ enabled, settings }));
    } catch {}
    onWatching?.(enabled && permission === "granted");
  }, [enabled, settings, permission, key, onWatching]);

  // Every reading the desk makes goes past the lines.
  useEffect(() => {
    if (!enabled || permission !== "granted") return;
    const reading = { movePct: a.market.open ? null : a.overnight.movePct, score: a.score, book };
    const { alerts, state: next } = evaluateWatch(reading, settings, state.current);
    state.current = next;
    for (const alert of alerts) {
      try {
        new Notification(alert.title, { body: alert.body, icon: `${BASE}/icon-192.png`, tag: `${storageKey}:${alert.title}` });
      } catch {}
      setLast(alert.title);
    }
  }, [a, enabled, permission, settings, book, storageKey]);

  async function enable() {
    if (typeof Notification === "undefined") return;
    let p = Notification.permission;
    if (p === "default") p = await Notification.requestPermission();
    setPermission(p);
    if (p === "granted") setEnabled(true);
  }

  if (!mounted || permission === "unsupported") return null;
  const watching = enabled && permission === "granted";

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-wide transition-colors hover:text-text ${watching ? "border-brand text-text" : "border-border text-tertiary hover:border-border-strong"}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M6 1.2a3 3 0 0 0-3 3v2.3L1.9 8.2h8.2L9 6.5V4.2a3 3 0 0 0-3-3ZM4.8 9.6a1.2 1.2 0 0 0 2.4 0" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
        {watching ? "Watching" : "Watch"}
      </button>
      {open && (
        <div role="dialog" aria-label="Watch this book" className="absolute right-0 top-full z-20 mt-1.5 w-[300px] rounded-xl border border-border-strong bg-surface p-3 text-[11px] shadow-md">
          <p className="text-[12px] font-semibold text-text">Watch this book</p>
          <p className="mt-1 leading-snug text-tertiary">
            A browser notification while this tab is open, once per crossing, when:
          </p>
          <label className="mt-2.5 flex items-center justify-between gap-2 text-secondary">
            <span>the stocks move more than</span>
            <span className="numeric flex items-center gap-1 text-text">
              <input
                type="number"
                min={0.25}
                step={0.25}
                value={settings.movePct}
                onChange={(e) => setSettings((s) => ({ ...s, movePct: Math.max(0.25, Number(e.target.value) || 0) }))}
                className="numeric h-7 w-16 rounded-md border border-border bg-bg-subtle px-1.5 text-right text-[11px] text-text focus:border-focus focus:outline-none"
                aria-label="Move since the close, percent"
              />
              % since the close
            </span>
          </label>
          <label className="mt-2 flex items-center justify-between gap-2 text-secondary">
            <span>the risk score reaches</span>
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              value={settings.scoreLimit}
              onChange={(e) => setSettings((s) => ({ ...s, scoreLimit: Math.max(1, Math.min(100, Number(e.target.value) || 0)) }))}
              className="numeric h-7 w-16 rounded-md border border-border bg-bg-subtle px-1.5 text-right text-[11px] text-text focus:border-focus focus:outline-none"
              aria-label="Risk score limit"
            />
          </label>
          <div className="mt-3 flex items-center gap-2">
            {watching ? (
              <Button size="sm" variant="secondary" onClick={() => setEnabled(false)}>
                Stop watching
              </Button>
            ) : (
              <Button size="sm" variant="primary" onClick={() => void enable()} disabled={permission === "denied"}>
                Start watching
              </Button>
            )}
            {watching && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  try {
                    new Notification(`${book}: this is what a notification looks like`, { body: "The desk will say when the book crosses a line.", icon: `${BASE}/icon-192.png` });
                  } catch {}
                }}
              >
                Test
              </Button>
            )}
          </div>
          {permission === "denied" && <p className="mt-2 text-tertiary">Notifications are blocked for this site in the browser.</p>}
          {last && <p className="mt-2 truncate text-tertiary">Last: {last}</p>}
          <p className="mt-2 leading-snug text-tertiary">
            Now: {a.market.open ? "NYSE open, no move to read" : `${a.overnight.movePct >= 0 ? "+" : "−"}${Math.abs(a.overnight.movePct).toFixed(2)}% since the close`} · score {a.score.toFixed(0)}.
          </p>
        </div>
      )}
    </span>
  );
}
