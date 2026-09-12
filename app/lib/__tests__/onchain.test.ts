import { describe, expect, it } from "vitest";
import { targetsToBps, mintOf, symbolOfMint, WSOL_MINT, policyPda, snapshotPda, explorerUrl, PROGRAM_ID } from "../onchain";
import { PublicKey } from "@solana/web3.js";

describe("targetsToBps", () => {
  it("always sums to exactly 10,000, whatever the percentages were", () => {
    const rows = targetsToBps([
      { symbol: "SPYx", weight: 1 / 3 },
      { symbol: "TSLAx", weight: 1 / 3 },
      { symbol: "USDC", weight: 1 / 3 },
    ]);
    expect(rows.reduce((s, r) => s + r.weightBps, 0)).toBe(10_000);
    // The remainder went to the largest line; here they tie, so the first.
    expect(rows.map((r) => r.weightBps).sort()).toEqual([3333, 3333, 3334]);
  });

  it("normalises a list that does not sum to one and drops zero lines", () => {
    const rows = targetsToBps([
      { symbol: "SPYx", weight: 0.3 },
      { symbol: "GLDx", weight: 0.1 },
      { symbol: "USDC", weight: 0 },
    ]);
    expect(rows.length).toBe(2);
    expect(rows[0].weightBps).toBe(7500);
    expect(rows[1].weightBps).toBe(2500);
  });

  it("identifies SOL by the wrapped-SOL mint and rejects unknown symbols", () => {
    expect(mintOf("SOL")?.toBase58()).toBe(WSOL_MINT);
    expect(mintOf("SPYx")?.toBase58()).toBe("XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W");
    expect(mintOf("DOGE")).toBeNull();
    expect(targetsToBps([{ symbol: "DOGE", weight: 1 }])).toEqual([]);
    expect(symbolOfMint(WSOL_MINT)).toBe("SOL");
    expect(symbolOfMint("XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB")).toBe("TSLAx");
  });
});

describe("addresses", () => {
  const owner = new PublicKey("4u8ckM2U1GBpizKKDVdnb6wfGtenUECDZCbcLMiBHpFc");

  it("derives the same seeds the program uses", () => {
    const [policy] = PublicKey.findProgramAddressSync([Buffer.from("policy"), owner.toBuffer()], PROGRAM_ID);
    expect(policyPda(owner).toBase58()).toBe(policy.toBase58());

    const le = Buffer.alloc(8);
    le.writeBigInt64LE(BigInt(1_800_000_000));
    const [snap] = PublicKey.findProgramAddressSync([Buffer.from("snapshot"), owner.toBuffer(), le], PROGRAM_ID);
    expect(snapshotPda(owner, 1_800_000_000).toBase58()).toBe(snap.toBase58());
    expect(snapshotPda(owner, 1_800_000_001).toBase58()).not.toBe(snap.toBase58());
  });

  it("links to the explorer on named clusters only", () => {
    expect(explorerUrl("address", "abc", "devnet")).toBe("https://explorer.solana.com/address/abc?cluster=devnet");
    expect(explorerUrl("tx", "abc", "mainnet-beta")).toBe("https://explorer.solana.com/tx/abc");
    expect(explorerUrl("tx", "abc", "localnet")).toBeNull();
    expect(explorerUrl("tx", "", "devnet")).toBeNull();
  });
});
