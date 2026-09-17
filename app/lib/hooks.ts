"use client";

import { useEffect, useRef, useState } from "react";

/** Eases a number toward its target; a hard jump reads as a glitch. */
export function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(target);
  const currentRef = useRef(target);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    const from = currentRef.current;
    if (from === target) return;
    // A viewer who asked for less motion gets the number, not the tween.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      currentRef.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      const next = from + (target - from) * eased;
      currentRef.current = next;
      setValue(next);
      if (t < 1) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration]);

  return value;
}

/** Re-renders on a timer so relative times and countdowns stay honest. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/**
 * Closes an open popover on a pointer down outside it or on Escape.
 * Attach the returned ref to the popover's positioning wrapper (the
 * element that also contains the toggle button), so a click on the
 * toggle itself is "inside" and left to its own onClick to handle.
 */
export function useDismiss<T extends HTMLElement>(open: boolean, onDismiss: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onDismiss]);
  return ref;
}
