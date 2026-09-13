"use client";

import { useEffect, useState } from "react";

/**
 * A line that types itself in, holds, backspaces away and types again,
 * on repeat. The cursor is only there while letters are moving; the
 * finished sentence stands on its own. The full text is laid out
 * invisibly from the first paint so nothing under it moves while the
 * letters come and go; the visible prefix is drawn over it with the
 * same metrics, so the wrapping matches. Screen readers get the whole
 * sentence at once, and so does anyone who asked for reduced motion.
 */
type Phase = "typing" | "hold" | "deleting" | "pause";

export function Typewriter({
  text,
  speed = 60,
  eraseSpeed = 32,
  delay = 500,
  hold = 2600,
  pause = 700,
  className = "",
}: {
  text: string;
  speed?: number;
  eraseSpeed?: number;
  delay?: number;
  hold?: number;
  pause?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(0);
  const [phase, setPhase] = useState<Phase>("pause");
  const [still, setStill] = useState(false);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(text.length);
      setStill(true);
      return;
    }
    const t = window.setTimeout(() => setPhase("typing"), delay);
    return () => window.clearTimeout(t);
  }, [text, delay]);

  useEffect(() => {
    if (still) return;
    let t: number;
    if (phase === "typing") {
      if (shown >= text.length) {
        t = window.setTimeout(() => setPhase("hold"), 0);
      } else {
        t = window.setTimeout(() => setShown((n) => n + 1), speed);
      }
    } else if (phase === "hold") {
      t = window.setTimeout(() => setPhase("deleting"), hold);
    } else if (phase === "deleting") {
      if (shown <= 0) {
        t = window.setTimeout(() => setPhase("pause"), 0);
      } else {
        t = window.setTimeout(() => setShown((n) => n - 1), eraseSpeed);
      }
    } else {
      t = window.setTimeout(() => setPhase("typing"), pause);
    }
    return () => window.clearTimeout(t);
  }, [phase, shown, still, text, speed, eraseSpeed, hold, pause]);

  // The last word and the cursor stay together, in both layers, so the
  // final line breaks where the reserved one did.
  const split = (s: string) => {
    const cut = s.lastIndexOf(" ");
    return cut >= 0 ? [s.slice(0, cut + 1), s.slice(cut + 1)] : ["", s];
  };
  const [fullHead, fullLast] = split(text);
  const [head, last] = split(text.slice(0, shown));
  const moving = !still && (phase === "typing" || phase === "deleting");

  return (
    <span className={`relative block ${className}`}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="invisible">
        {fullHead}
        <span className="whitespace-nowrap">
          {fullLast}
          <span className="cursor" />
        </span>
      </span>
      <span aria-hidden="true" className="absolute inset-0">
        {head}
        <span className="whitespace-nowrap">
          {last}
          {moving && <span className="cursor cursor-solid" />}
        </span>
      </span>
    </span>
  );
}
