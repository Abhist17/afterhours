"use client";

import { useEffect } from "react";

/**
 * Scroll a panel under the sticky bars. Smooth where the platform will
 * animate it; if nothing has moved a beat later, some embedders and
 * background tabs refuse, jump instead, so a key always lands.
 */
export function scrollToPanel(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - 96);
  const from = window.scrollY;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
  if (!reduced) {
    setTimeout(() => {
      if (Math.abs(window.scrollY - from) < 4 && Math.abs(top - from) >= 4) window.scrollTo({ top, behavior: "auto" });
    }, 250);
  }
}

/**
 * Keys for people who live in the desk. Never fires while typing in a
 * field, and never steals a browser shortcut.
 */
export function useShortcuts(handlers: Record<string, () => void>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        if (e.key === "Escape") (target as HTMLElement).blur();
        return;
      }
      const fn = handlers[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers]);
}
