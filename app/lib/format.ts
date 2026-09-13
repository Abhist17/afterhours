/** Formatting shared by every panel. Figures never reflow: tabular, monospace. */

export function usd(value: number, opts?: { compact?: boolean }): string {
  if (!Number.isFinite(value)) return "n/a";
  const compact = opts?.compact ?? Math.abs(value) >= 1_000_000;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    minimumFractionDigits: compact ? 0 : Math.abs(value) < 1000 ? 2 : 0,
    maximumFractionDigits: compact ? 2 : Math.abs(value) < 1000 ? 2 : 0,
  }).format(value);
}

export function signedUsd(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${usd(Math.abs(value))}`;
}

export function price(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  if (value === 0) return "$0.00";
  if (value < 0.001) return `$${value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "")}`;
  if (value < 1) return `$${value.toFixed(4)}`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

export function amount(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  if (value === 0) return "0";
  if (value >= 1_000_000) {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: value < 1 ? 4 : 2 });
}

export function pct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "n/a";
  return `${value.toFixed(digits)}%`;
}

export function signedPct(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "n/a";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}%`;
}

export function shortAddress(address: string, size = 4): string {
  if (address.length <= size * 2 + 1) return address;
  return `${address.slice(0, size)}…${address.slice(-size)}`;
}

export function timeAgo(timestamp: number): string {
  if (!timestamp) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function untilTime(timestamp: number): string {
  const seconds = Math.max(0, Math.round((timestamp - Date.now()) / 1000));
  if (seconds < 60) return "under a minute";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours}h ${rest}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function clockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function dayLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString([], { month: "short", day: "numeric" });
}

// ── Risk ramp ────────────────────────────────────────────────────

export type BandKey = "calm" | "watch" | "elevated" | "severe";

export interface RiskBand {
  key: BandKey;
  label: string;
  color: string;
  description: string;
}

// The score is annualised volatility plus concentration, so the bands are
// kinds of book: an index fund, a single stock, a crypto allocation, and
// leverage or a memecoin.
const BANDS: Record<BandKey, RiskBand> = {
  calm: { key: "calm", label: "Calm", color: "var(--calm)", description: "Index-fund volatility" },
  watch: { key: "watch", label: "Watch", color: "var(--watch)", description: "Single-stock volatility" },
  elevated: { key: "elevated", label: "Elevated", color: "var(--elevated)", description: "Crypto-grade volatility" },
  severe: { key: "severe", label: "Severe", color: "var(--severe)", description: "Leverage or memecoin territory" },
};

/** Banded on the score as printed (one decimal), so "25.0" is never Calm. */
export function riskBand(score: number): RiskBand {
  const s = Math.round(score * 10) / 10;
  if (s >= 70) return BANDS.severe;
  if (s >= 45) return BANDS.elevated;
  if (s >= 25) return BANDS.watch;
  return BANDS.calm;
}

export const BAND_THRESHOLDS: { at: number; band: RiskBand }[] = [
  { at: 0, band: BANDS.calm },
  { at: 25, band: BANDS.watch },
  { at: 45, band: BANDS.elevated },
  { at: 70, band: BANDS.severe },
];

// ── Asset colour ─────────────────────────────────────────────────
// Colour by sleeve, not by ticker: with forty assets a per-ticker
// palette would be noise, and the question the page asks, stocks, crypto
// or cash?, is what the eye should be able to answer at a glance.

export function sleeveColor(cls: "equity" | "crypto" | "cash"): string {
  switch (cls) {
    case "equity":
      return "var(--asset-1)";
    case "crypto":
      return "var(--asset-2)";
    default:
      return "var(--asset-4)";
  }
}

/** Crypto-linked equities get their own tone: a stock in name, crypto in motion. */
export function sectorColor(sector: string, cls: "equity" | "crypto" | "cash"): string {
  if (sector === "crypto-linked equity") return "var(--asset-3)";
  return sleeveColor(cls);
}
