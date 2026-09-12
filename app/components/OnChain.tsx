"use client";

import { useCallback, useEffect, useState } from "react";
import { useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import type { Analysis } from "@/lib/portfolio";
import type { Target } from "@/lib/quant";
import { driftAgainst } from "@/lib/quant";
import {
  PROGRAM_ID,
  clusterOf,
  explorerUrl,
  fetchPolicy,
  fetchSnapshots,
  savePolicy,
  recordSnapshot,
  closeSnapshot,
  type OnChainPolicy,
  type OnChainSnapshot,
} from "@/lib/onchain";
import { usd, pct, riskBand, shortAddress, timeAgo, clockTime, dayLabel } from "@/lib/format";
import { useMounted } from "@/lib/hooks";
import { Button, Notice, Tag } from "./ui";
import { PublicKey } from "@solana/web3.js";

/**
 * The owner's record on Solana: a policy stating what the book was meant
 * to be, and snapshots of what it was. Both are written by the owner's
 * own wallet — the page prepares, the wallet signs, nobody else can — so
 * the record is theirs, and a lending protocol reading it knows whose
 * word it is taking.
 */
export function OnChain({
  a,
  viewing,
  targets,
}: {
  a: Analysis;
  /** Address whose book is on screen; null for a sample. */
  viewing: string | null;
  /** The targets from the drift panel, to save as policy. */
  targets: Target[];
}) {
  const wallet = useAnchorWallet();
  const { connected } = useWallet();
  const mounted = useMounted();
  const cluster = clusterOf();

  const [policy, setPolicy] = useState<OnChainPolicy | null | undefined>(undefined);
  const [snapshots, setSnapshots] = useState<OnChainSnapshot[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [riskLimit, setRiskLimit] = useState(45);
  const [driftBand, setDriftBand] = useState(500);

  // Whose record: the address on screen, if it is a real one.
  const subject = viewing && isKey(viewing) ? new PublicKey(viewing) : null;
  const isOwner = !!wallet && !!subject && wallet.publicKey.equals(subject);

  const load = useCallback(async () => {
    if (!subject) {
      setPolicy(null);
      setSnapshots([]);
      return;
    }
    try {
      const [p, s] = await Promise.all([fetchPolicy(subject), fetchSnapshots(subject)]);
      setPolicy(p);
      setSnapshots(s);
      if (p) {
        setRiskLimit(p.riskLimit);
        setDriftBand(p.driftBandBps);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the chain");
    }
  }, [subject?.toBase58()]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPolicy(undefined);
    setSnapshots(null);
    setError(null);
    void load();
  }, [load]);

  // What a snapshot would say right now.
  const driftNow = policy ? driftAgainst(Object.fromEntries(a.holdings.map((h) => [h.symbol, h.value])), policy.targets) : null;
  const reading = {
    score: a.score,
    valueUsd: a.total,
    varUsd: a.risk.headlineVarUsd,
    driftBps: driftNow ? Math.round(driftNow.maxDrift * 10_000) : 0,
    equityBps: Math.round(a.sleeves[0].valueShare * 10_000),
    marketOpen: a.market.open,
  };
  const wouldBreach = policy ? reading.score > policy.riskLimit || reading.driftBps > policy.driftBandBps : false;

  async function run(label: string, fn: () => Promise<string>) {
    if (!wallet) return;
    setBusy(label);
    setError(null);
    try {
      const sig = await fn();
      setLastTx(sig);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const programLink = explorerUrl("address", PROGRAM_ID.toBase58(), cluster);

  return (
    <div className="px-4 py-3.5">
      {error && (
        <div className="mb-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      {!subject ? (
        <p className="text-xs leading-relaxed text-tertiary">
          A sample book has no owner, so nothing here can be signed. Read a wallet — or connect yours — and the policy and snapshots for that address appear.
        </p>
      ) : policy === undefined || snapshots === null ? (
        <p className="text-xs text-tertiary">Reading {cluster}…</p>
      ) : (
        <>
          {/* ── Policy ── */}
          <div className="flex items-baseline justify-between">
            <span className="label">Policy</span>
            {policy ? (
              <span className="numeric text-[11px] text-tertiary">
                {mounted ? `set ${timeAgo(policy.updatedAt * 1000)}` : ""}
              </span>
            ) : (
              <span className="text-[11px] text-tertiary">none declared</span>
            )}
          </div>
          {policy ? (
            <div className="mt-1.5 text-[12px] text-text">
              <span className="numeric">
                {policy.targets.map((t) => `${t.symbol} ${(t.weight * 100).toFixed(0)}%`).join(" · ")}
              </span>
              <p className="mt-1 text-[11px] text-tertiary">
                Breach at score &gt; {policy.riskLimit} or drift &gt; {(policy.driftBandBps / 100).toFixed(0)}pp.
                {driftNow && (
                  <>
                    {" "}Now: score {a.score.toFixed(0)}, drift {(driftNow.maxDrift * 100).toFixed(1)}pp —{" "}
                    <span style={{ color: wouldBreach ? "var(--severe)" : "var(--calm)" }}>{wouldBreach ? "in breach" : "within policy"}</span>.
                  </>
                )}
              </p>
            </div>
          ) : (
            <p className="mt-1.5 text-[11px] leading-snug text-tertiary">
              Declare the allocation this book is meant to hold, a risk limit and a drift band. Drift is then measured against intent, and a snapshot can say &ldquo;in breach&rdquo; on-chain.
            </p>
          )}

          {isOwner && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-tertiary">
              <label className="flex items-center gap-1">
                limit
                <input type="number" min={0} max={100} value={riskLimit} onChange={(e) => setRiskLimit(Math.max(0, Math.min(100, Number(e.target.value))))} className="numeric h-6 w-14 rounded-md border border-border bg-bg-subtle px-1.5 text-[11px] text-text focus:border-focus focus:outline-none" aria-label="Risk limit" />
              </label>
              <label className="flex items-center gap-1">
                band
                <input type="number" min={0} max={100} value={driftBand / 100} onChange={(e) => setDriftBand(Math.max(0, Math.min(10_000, Number(e.target.value) * 100)))} className="numeric h-6 w-14 rounded-md border border-border bg-bg-subtle px-1.5 text-[11px] text-text focus:border-focus focus:outline-none" aria-label="Drift band in percentage points" />
                pp
              </label>
              <Button size="sm" variant="primary" className="!h-6 !px-2 !text-[11px]" disabled={!!busy || targets.length === 0} onClick={() => run("policy", () => savePolicy(wallet!, riskLimit, driftBand, targets))}>
                {busy === "policy" ? "Signing…" : policy ? "Update policy from targets" : "Save targets as policy"}
              </Button>
            </div>
          )}

          {/* ── Snapshots ── */}
          <div className="mt-4 flex items-baseline justify-between border-t border-border pt-3">
            <span className="label">Snapshots</span>
            <span className="numeric text-[11px] text-tertiary">{snapshots.length} on {cluster}</span>
          </div>

          {isOwner && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="primary" className="!h-6 !px-2 !text-[11px]" disabled={!!busy || a.total <= 0} onClick={() => run("snapshot", async () => (await recordSnapshot(wallet!, reading, !!policy)).signature)}>
                {busy === "snapshot" ? "Signing…" : "Record this reading"}
              </Button>
              <span className="text-[11px] text-tertiary">
                score {a.score.toFixed(0)} · {usd(a.total)} · VaR {usd(a.risk.headlineVarUsd)} · {pct(a.sleeves[0].valueShare * 100, 0)} stocks · NYSE {a.market.open ? "open" : "closed"}
                {policy && <> · <span style={{ color: wouldBreach ? "var(--severe)" : "var(--calm)" }}>{wouldBreach ? "breach" : "in policy"}</span></>}
              </span>
            </div>
          )}

          {lastTx && (
            <p className="mt-2 text-[11px] text-tertiary">
              Landed:{" "}
              {explorerUrl("tx", lastTx, cluster) ? (
                <a href={explorerUrl("tx", lastTx, cluster)!} target="_blank" rel="noopener noreferrer" className="numeric text-secondary underline decoration-border-strong underline-offset-2 hover:text-text">{shortAddress(lastTx, 6)}↗</a>
              ) : (
                <span className="numeric">{shortAddress(lastTx, 6)}</span>
              )}
            </p>
          )}

          {snapshots.length === 0 ? (
            <p className="mt-2 text-[11px] leading-snug text-tertiary">
              {isOwner ? "Nothing recorded yet. The first snapshot is one signature away." : "Nothing recorded for this address."}
            </p>
          ) : (
            <ol className="mt-2 space-y-2" role="list">
              {snapshots.slice(0, 8).map((s) => {
                const band = riskBand(s.score);
                const breached = policy ? s.score > policy.riskLimit || s.driftBps > policy.driftBandBps : false;
                const link = explorerUrl("address", s.address, cluster);
                return (
                  <li key={s.address} className="flex items-baseline gap-3">
                    <span className="numeric w-8 shrink-0 text-[15px] font-medium" style={{ color: band.color }}>{s.score}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="numeric text-[12px] text-text">{dayLabel(s.timestamp * 1000)} {clockTime(s.timestamp * 1000)}</span>
                        <span className="text-[11px] text-tertiary">NYSE {s.marketOpen ? "open" : "closed"}</span>
                        {breached && <Tag color="var(--severe)">breach</Tag>}
                      </span>
                      <span className="numeric block text-[11px] text-tertiary">
                        {usd(s.valueUsd)} book · {usd(s.varUsd)} at risk · {(s.equityBps / 100).toFixed(0)}% stocks · drift {(s.driftBps / 100).toFixed(1)}pp
                      </span>
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2 text-[11px]">
                      {link ? (
                        <a href={link} target="_blank" rel="noopener noreferrer" className="text-secondary underline decoration-border-strong underline-offset-2 hover:text-text">account↗</a>
                      ) : (
                        <span className="text-tertiary">account</span>
                      )}
                      {isOwner && (
                        <button type="button" onClick={() => run("close", () => closeSnapshot(wallet!, s.address))} disabled={!!busy} className="text-tertiary hover:text-severe" aria-label="Close this snapshot and reclaim its rent">
                          close
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          {!connected && (
            <p className="mt-3 text-[11px] leading-snug text-tertiary">
              Connect the wallet that owns {shortAddress(subject.toBase58())} to declare a policy or record a snapshot.
            </p>
          )}
          {connected && !isOwner && (
            <p className="mt-3 text-[11px] leading-snug text-tertiary">
              The connected wallet is not this address, so this record is read-only here.
            </p>
          )}
        </>
      )}

      <dl className="mt-4 space-y-1 border-t border-border pt-3 text-xs">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-tertiary">Program</dt>
          <dd className="numeric text-text">
            {programLink ? (
              <a href={programLink} target="_blank" rel="noopener noreferrer" className="underline decoration-border-strong underline-offset-2 hover:text-text">{shortAddress(PROGRAM_ID.toBase58(), 6)}↗</a>
            ) : (
              shortAddress(PROGRAM_ID.toBase58(), 6)
            )}
            <span className="ml-1.5 text-tertiary">{cluster}</span>
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-[10px] leading-snug text-tertiary">
        Every account here was signed by the wallet it describes. The page prepares the transaction and submits it; only the owner can create, update or close their own record.
      </p>
    </div>
  );
}

function isKey(value: string): boolean {
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}
