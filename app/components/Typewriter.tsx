"use client";

import { useEffect, useState } from "react";

/**
 * A line that types itself in, holds, backspaces away and types again,
 * on repeat. Every character is in the layout from the first paint, the
 * ones not yet typed simply invisible, so the line wraps exactly where
 * the finished sentence will and nothing moves while letters come and
 * go. The cursor hangs off the last visible letter and takes no room of
 * its own; it is only there while letters are moving. Screen readers get
 * the whole sentence at once, and so does anyone who asked for reduced
 * motion.
 */
type Phase = "typing" | "hold" | "deleting" | "pause";

function Cursor() {
  return <span className="tw-cursor" />;
}

export function Typewriter({
  text,
  speed = 130,
  eraseSpeed = 60,
  delay = 1200,
  hold = 4000,
  pause = 1200,
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
  const chars = Array.from(text);
  const [shown, setShown] = useState(0);
  const [phase, setPhase] = useState<Phase>("pause");
  const [still, setStill] = useState(false);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(chars.length);
      setStill(true);
      return;
    }
    const t = window.setTimeout(() => setPhase("typing"), delay);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, delay]);

  useEffect(() => {
    if (still) return;
    let t: number;
    if (phase === "typing") {
      t = shown >= chars.length ? window.setTimeout(() => setPhase("hold"), 0) : window.setTimeout(() => setShown((n) => n + 1), speed);
    } else if (phase === "hold") {
      t = window.setTimeout(() => setPhase("deleting"), hold);
    } else if (phase === "deleting") {
      t = shown <= 0 ? window.setTimeout(() => setPhase("pause"), 0) : window.setTimeout(() => setShown((n) => n - 1), eraseSpeed);
    } else {
      t = window.setTimeout(() => setPhase("typing"), pause);
    }
    return () => window.clearTimeout(t);
  }, [phase, shown, still, chars.length, speed, eraseSpeed, hold, pause]);

  const moving = !still && (phase === "typing" || phase === "deleting");

  return (
    <span className={`tw block ${className}`}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        <span className="relative">{moving && shown === 0 && <Cursor />}</span>
        {chars.map((ch, i) => (
          <span key={i} className={i < shown ? "relative" : "invisible"}>
            {ch}
            {moving && i === shown - 1 && <Cursor />}
          </span>
        ))}
      </span>
    </span>
  );
}
