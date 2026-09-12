"use client";

import type { ReactNode } from "react";

/* ── Surfaces ─────────────────────────────────────────────────── */

export function Panel({ children, className = "", delay, id }: { children: ReactNode; className?: string; delay?: number; id?: string }) {
  return (
    <section id={id} className={`card enter overflow-hidden ${className}`} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
      {children}
    </section>
  );
}

/**
 * Every panel opens with a number, a title, and one sentence saying what
 * to look for — the desk reads as a sequence, not a grid of widgets.
 */
export function PanelHeader({
  number,
  title,
  caption,
  meta,
  action,
}: {
  number?: string;
  title: string;
  caption?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="border-b border-border px-5 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2.5">
          {number && <span className="numeric text-[11px] text-brand">{number}</span>}
          <h2 className="shrink-0 text-[13px] font-semibold tracking-tight text-text">{title}</h2>
          {meta && <span className="truncate text-[11px] text-tertiary">{meta}</span>}
        </div>
        {action}
      </div>
      {caption && <p className="mt-0.5 text-[12px] leading-snug text-tertiary">{caption}</p>}
    </div>
  );
}

/* ── Controls ─────────────────────────────────────────────────── */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};

export function Button({ variant = "secondary", size = "md", className = "", ...props }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45";
  const sizes = { sm: "h-7 px-2.5 text-xs", md: "h-9 px-3.5 text-[13px]", lg: "h-11 px-5 text-[14px]" };
  const variants = {
    primary: "bg-primary text-primary-text hover:opacity-90",
    secondary: "border border-border-strong bg-surface text-text hover:bg-surface-hover",
    ghost: "text-secondary hover:bg-surface-hover hover:text-text",
    danger: "border border-transparent text-tertiary hover:border-severe/40 hover:text-severe",
  };
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props} />;
}

export function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-9 w-full rounded-lg border border-border bg-bg-subtle px-3 text-[13px] text-text transition-colors placeholder:text-tertiary hover:border-border-strong focus:border-focus focus:outline-none ${className}`}
      {...props}
    />
  );
}

/* ── Indicators ───────────────────────────────────────────────── */

export function Tag({ children, color, subtle = false }: { children: ReactNode; color?: string; subtle?: boolean }) {
  if (!color) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-tertiary">
        {children}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide"
      style={{
        color,
        backgroundColor: subtle ? "transparent" : `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

export function Dot({ color, pulse = false }: { color: string; pulse?: boolean }) {
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${pulse ? "breathe" : ""}`} style={{ backgroundColor: color }} />;
}

/* ── States ───────────────────────────────────────────────────── */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function EmptyState({ title, body, action, compact = false }: { title: string; body: string; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 text-center ${compact ? "py-8" : "py-14"}`}>
      <p className="text-[13px] font-medium text-text">{title}</p>
      <p className="mt-1 max-w-[36ch] text-xs leading-relaxed text-tertiary">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "success"; children: ReactNode }) {
  const colors = { info: "var(--text-tertiary)", warn: "var(--watch)", error: "var(--severe)", success: "var(--calm)" };
  const color = colors[tone];
  return (
    <div
      className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-snug"
      style={{
        color: tone === "info" ? "var(--text-secondary)" : color,
        backgroundColor: `color-mix(in srgb, ${color} 9%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 22%, transparent)`,
      }}
      role={tone === "error" ? "alert" : undefined}
    >
      {children}
    </div>
  );
}
