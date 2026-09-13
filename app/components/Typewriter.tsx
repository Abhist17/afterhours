"use client";

import { useEffect, useState } from "react";

/**
 * A line that types itself in, then leaves the cursor blinking. The full
 * text is laid out invisibly from the first paint so nothing under it
 * moves while the letters arrive; the typed prefix is drawn over it with
 * the same metrics, so the wrapping matches. Screen readers get the whole
 * sentence at once, and so does anyone who asked for reduced motion.
 */
export function Typewriter({
  text,
  speed = 60,
  delay = 500,
  className = "",
}: {
  text: string;
  speed?: number;
  delay?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(text.length);
      setDone(true);
      return;
    }
    let i = 0;
    let tick: number | undefined;
    const start = window.setTimeout(() => {
      tick = window.setInterval(() => {
        i += 1;
        setShown(i);
        if (i >= text.length) {
          window.clearInterval(tick);
          setDone(true);
        }
      }, speed);
    }, delay);
    return () => {
      window.clearTimeout(start);
      if (tick) window.clearInterval(tick);
    };
  }, [text, speed, delay]);

  // The last word and the cursor stay together, in both layers, so the
  // final line breaks where the reserved one did.
  const split = (s: string) => {
    const cut = s.lastIndexOf(" ");
    return cut >= 0 ? [s.slice(0, cut + 1), s.slice(cut + 1)] : ["", s];
  };
  const [fullHead, fullLast] = split(text);
  const [head, last] = split(text.slice(0, shown));

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
          <span className={`cursor ${done ? "" : "cursor-solid"}`} />
        </span>
      </span>
    </span>
  );
}
