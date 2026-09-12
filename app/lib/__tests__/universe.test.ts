import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { ASSETS, BY_MINT, BY_SYMBOL, MARKET_SYMBOL, jupiterSwapUrl } from "../universe";
import { SAMPLES } from "../samples";

// The universe is data, so the invariants the code relies on are checked
// here rather than trusted: one row per symbol and per mint, a real base58
// key for every mint, and the shape every xStock on mainnet turned out to
// have when it was verified — Token-2022, eight decimals.
describe("universe", () => {
  it("has unique symbols and mints", () => {
    const symbols = ASSETS.map((a) => a.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
    const mints = ASSETS.filter((a) => a.mint).map((a) => a.mint);
    expect(new Set(mints).size).toBe(mints.length);
  });

  it("carries a valid mainnet key for every mint, and only SOL is native", () => {
    for (const a of ASSETS) {
      if (a.mint === null) {
        expect(a.symbol).toBe("SOL");
        expect(a.program).toBe("native");
        continue;
      }
      expect(new PublicKey(a.mint).toBase58()).toBe(a.mint);
      expect(BY_MINT[a.mint]).toBe(a);
    }
  });

  it("describes every xStock the way mainnet does", () => {
    const equities = ASSETS.filter((a) => a.class === "equity");
    expect(equities.length).toBeGreaterThanOrEqual(35);
    for (const a of equities) {
      expect(a.symbol.endsWith("x")).toBe(true);
      expect(a.underlying).toBeTruthy();
      expect(a.program).toBe("token-2022");
      expect(a.decimals).toBe(8);
      expect(a.coingeckoId).toMatch(/xstock/);
      expect(a.sector).not.toBe("crypto");
      expect(a.sector).not.toBe("cash");
    }
  });

  it("keeps the crypto-linked sleeve to the names whose price is a coin", () => {
    const linked = ASSETS.filter((a) => a.sector === "crypto-linked equity").map((a) => a.symbol);
    expect(linked).toEqual(["COINx", "MSTRx", "HOODx", "CRCLx", "STRCx", "BMNRx", "DFDVx"]);
  });

  it("prices the index every beta is measured against", () => {
    expect(BY_SYMBOL[MARKET_SYMBOL]?.sector).toBe("index");
  });

  it("routes Jupiter by mint, with SOL spelled as SOL", () => {
    expect(jupiterSwapUrl("USDC", "SPYx")).toBe(`https://jup.ag/swap/${BY_SYMBOL.USDC.mint}-${BY_SYMBOL.SPYx.mint}`);
    expect(jupiterSwapUrl("SOL", "SPCXx")).toBe(`https://jup.ag/swap/SOL-${BY_SYMBOL.SPCXx.mint}`);
  });

  it("builds every sample book from priced symbols", () => {
    for (const s of SAMPLES) {
      for (const symbol of Object.keys(s.amounts)) expect(BY_SYMBOL[symbol], `${s.key} holds ${symbol}`).toBeDefined();
    }
  });
});

describe("riskBand", () => {
  it("bands the score as it is printed, so 24.97 reads as 25.0 Watch", async () => {
    const { riskBand } = await import("../format");
    expect(riskBand(24.97).key).toBe("watch");
    expect(riskBand(24.94).key).toBe("calm");
    expect(riskBand(44.96).key).toBe("elevated");
    expect(riskBand(69.99).key).toBe("severe");
    expect(riskBand(0).key).toBe("calm");
  });
});
