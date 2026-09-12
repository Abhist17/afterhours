"use client";

import { useEffect, useState } from "react";
import { scrollToPanel } from "@/lib/shortcuts";

export interface Section {
  id: string;
  number: string;
  title: string;
}

/**
 * The desk's table of contents, pinned under the top bar: one pill per
 * panel, the one in view lit. On a phone it scrolls sideways. Number keys
 * jump to the same places.
 */
export function SectionNav({ sections }: { sections: Section[] }) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? "");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    // The panel showing the most of itself, in pixels, is the one in view;
    // a ratio would let a short panel beside a tall one win at the top.
    const seen = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set((e.target as HTMLElement).id, e.isIntersecting ? e.intersectionRect.height : 0);
        let best = "";
        let area = 0;
        for (const s of sections) {
          const h = seen.get(s.id) ?? 0;
          if (h > area) {
            area = h;
            best = s.id;
          }
        }
        if (best) setActive(best);
      },
      { rootMargin: "-96px 0px -40% 0px", threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] }
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  // On a phone the bar scrolls sideways; the lit pill stays in view.
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(`nav[aria-label="Sections"] a[href="#${active}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <nav aria-label="Sections" className="sticky top-14 z-10 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="thin-scroll mx-auto flex max-w-[1500px] gap-1 overflow-x-auto px-4 py-1.5 sm:px-6">
        {sections.map((s) => {
          const on = s.id === active;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => {
                e.preventDefault();
                scrollToPanel(s.id);
                history.replaceState(null, "", `#${s.id}`);
              }}
              className={`flex shrink-0 items-baseline gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] transition-colors ${on ? "bg-surface-active text-text" : "text-tertiary hover:bg-surface-hover hover:text-text"}`}
              aria-current={on ? "location" : undefined}
            >
              <span className="numeric text-[10px]" style={{ color: on ? "var(--brand)" : undefined }}>{s.number}</span>
              {s.title}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
