import { describe, expect, it } from "vitest";
import { quoteUrl, quoteSwap, quoteVersusMark, toRaw, fromRaw, mintFor } from "../jupiter";
import { BY_SYMBOL } from "../universe";

describe("jupiter", () => {
  it("spells amounts in the units the chain counts", () => {
    expect(toRaw("SPCXx", 30)).toBe(3_000_000_000n);
    expect(toRaw("USDC", 1.5)).toBe(1_500_000n);
    expect(toRaw("SOL", 0.25)).toBe(250_000_000n);
    expect(fromRaw("USDC", "4502069626")).toBeCloseTo(4502.069626, 9);
    expect(mintFor("SOL")).toBe("So11111111111111111111111111111111111111112");
    expect(mintFor("SPYx")).toBe(BY_SYMBOL.SPYx.mint);
    expect(mintFor("NOPE")).toBeNull();
  });

  it("builds a quote URL by mint, and refuses what it cannot route", () => {
    const url = new URL(quoteUrl("SPCXx", "USDC", 30)!);
    expect(url.origin + url.pathname).toBe("https://lite-api.jup.ag/swap/v1/quote");
    expect(url.searchParams.get("inputMint")).toBe(BY_SYMBOL.SPCXx.mint);
    expect(url.searchParams.get("outputMint")).toBe(BY_SYMBOL.USDC.mint);
    expect(url.searchParams.get("amount")).toBe("3000000000");
    expect(quoteUrl("SPCXx", "USDC", 0)).toBeNull();
    expect(quoteUrl("NOPE", "USDC", 1)).toBeNull();
  });

  it("parses a quote and measures it against the mark", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          inAmount: "3000000000",
          outAmount: "4470000000",
          priceImpactPct: "0.0025",
          routePlan: [{ swapInfo: { label: "Scorch" } }, { swapInfo: { label: "Deriverse" } }, { swapInfo: { label: "Scorch" } }],
        }),
      }) as Response) as typeof fetch;
    const q = await quoteSwap("SPCXx", "USDC", 30);
    globalThis.fetch = originalFetch;
    expect(q.amountIn).toBe(30);
    expect(q.amountOut).toBeCloseTo(4470, 9);
    expect(q.priceImpact).toBeCloseTo(0.0025, 9);
    expect(q.route).toEqual(["Scorch", "Deriverse"]);
    const v = quoteVersusMark(q, { SPCXx: 150, USDC: 1 });
    expect(v.usdIn).toBe(4500);
    expect(v.usdOut).toBeCloseTo(4470, 9);
    expect(v.shortfall).toBeCloseTo(30 / 4500, 9);
  });
});

describe("swapRequest", () => {
  it("hands Jupiter its own quote back with the payer and SOL wrapping", async () => {
    const { swapRequest } = await import("../jupiter");
    const raw = { inAmount: "1", outAmount: "2", priceImpactPct: "0" };
    const body = swapRequest(
      { from: "MSTRx", to: "USDC", amountIn: 1, amountOut: 2, priceImpact: 0, route: [], fetchedAt: 0, raw },
      "4u8ckM2U1GBpizKKDVdnb6wfGtenUECDZCbcLMiBHpFc"
    );
    expect(body.quoteResponse).toBe(raw);
    expect(body.userPublicKey).toBe("4u8ckM2U1GBpizKKDVdnb6wfGtenUECDZCbcLMiBHpFc");
    expect(body.wrapAndUnwrapSol).toBe(true);
  });
});
