"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { scrollToPanel } from "@/lib/shortcuts";
import { Logo } from "./Logo";

export interface Section {
  id: string;
  number: string;
  title: string;
}

/**
 * Which panel is in view. The panel showing the most of itself, in
 * pixels, wins; a ratio would let a short panel beside a tall one win
 * at the top.
 */
function useActiveSection(sections: Section[]): string {
  const [active, setActive] = useState<string>(sections[0]?.id ?? "");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
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
  return active;
}

function go(e: React.MouseEvent, id: string) {
  e.preventDefault();
  scrollToPanel(id);
  history.replaceState(null, "", `#${id}`);
}

/**
 * The desk's table of contents on a phone or a narrow window: one pill
 * per panel under the top bar, scrolling sideways, the one in view lit.
 */
export function SectionNav({ sections }: { sections: Section[] }) {
  const active = useActiveSection(sections);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(`nav[aria-label="Sections"] a[href="#${active}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <nav aria-label="Sections" className="sticky top-14 z-10 border-b border-border bg-bg/85 backdrop-blur-md lg:hidden">
      <div className="thin-scroll flex gap-1 overflow-x-auto px-4 py-1.5">
        {sections.map((s) => {
          const on = s.id === active;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => go(e, s.id)}
              className={`flex shrink-0 items-baseline gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] transition-colors ${on ? "bg-surface-active text-text" : "text-tertiary hover:bg-surface-hover hover:text-text"}`}
              aria-current={on ? "location" : undefined}
            >
              <span className="display text-[11px]" style={{ color: on ? "var(--brand)" : undefined }}>{s.number}</span>
              {s.title}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * The same contents as a rail down the left of a wide window: the mark
 * at the top, ten numbered rows, the one in view lit with a bar of
 * signal green, and the ways out at the bottom.
 */
export function Rail({
  sections,
  onOpenHelp,
  footer,
}: {
  sections: Section[];
  onOpenHelp: () => void;
  footer?: React.ReactNode;
}) {
  const active = useActiveSection(sections);
  return (
    <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r border-border bg-bg-subtle lg:flex print-hide">
      <div className="flex h-14 items-center border-b border-border px-5">
        <Link href="/" title="Afterhours — home" className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-focus">
          <Logo />
        </Link>
      </div>
      <nav aria-label="Sections" className="thin-scroll flex-1 overflow-y-auto px-3 py-3">
        <p className="label px-2 pb-2">The desk</p>
        {sections.map((s) => {
          const on = s.id === active;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => go(e, s.id)}
              className={`relative flex items-baseline gap-2.5 rounded-md px-2 py-[7px] text-[12.5px] transition-colors ${on ? "bg-surface-active text-text" : "text-secondary hover:bg-surface-hover hover:text-text"}`}
              aria-current={on ? "location" : undefined}
            >
              {on && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-brand" aria-hidden="true" />}
              <span className="display w-[22px] shrink-0 text-[12px]" style={{ color: on ? "var(--brand)" : "var(--text-tertiary)" }}>{s.number}</span>
              <span className="truncate">{s.title}</span>
            </a>
          );
        })}
      </nav>
      <div className="border-t border-border px-3 py-3 text-[11px] text-tertiary">
        <button type="button" onClick={onOpenHelp} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-hover hover:text-text">
          How the numbers are made
          <kbd className="numeric rounded border border-border px-1 text-[10px]">?</kbd>
        </button>
        <a href="https://github.com/Abhist17/afterhours" target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-surface-hover hover:text-text">
          Source
          <span aria-hidden="true">↗</span>
        </a>
        {footer}
      </div>
    </aside>
  );
}
