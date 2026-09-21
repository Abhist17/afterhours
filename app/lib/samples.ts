/**
 * Sample books, for a visitor with no xStocks yet, or a reviewer. Labelled
 * synthetic everywhere they appear. They are chosen to make the product's
 * argument: the first looks diversified across seven tickers and is mostly
 * one bet on crypto beta; the second is fewer names and less risk; the
 * last is a single new listing carrying a third of a book.
 */
export interface SampleBook {
  key: string;
  label: string;
  blurb: string;
  amounts: Record<string, number>;
}

export const SAMPLES: SampleBook[] = [
  {
    key: "degen-desk",
    label: "Seven tickers, one bet",
    blurb: "Tesla, NVIDIA and four crypto-linked stocks beside a SOL stack.",
    amounts: { TSLAx: 14, NVDAx: 22, COINx: 18, MSTRx: 9, HOODx: 40, CRCLx: 25, SOL: 60, USDC: 1_800 },
  },
  {
    key: "index-and-gold",
    label: "Index, gold, cash",
    blurb: "An S&P 500 core with gold and a cash buffer.",
    amounts: { SPYx: 9, QQQx: 4, GLDx: 12, USDC: 3_500 },
  },
  {
    key: "mag-seven",
    label: "Magnificent seven",
    blurb: "The seven mega-caps, equal-ish dollars, nothing else.",
    amounts: { AAPLx: 12, MSFTx: 8, GOOGLx: 12, AMZNx: 16, METAx: 6, NVDAx: 18, TSLAx: 11 },
  },
  {
    key: "spacex-and-index",
    label: "SpaceX, index, cash",
    blurb: "The summer's IPO beside the S&P 500 and a cash buffer.",
    amounts: { SPCXx: 30, SPYx: 6, USDC: 2_000 },
  },
];

/**
 * A real book on mainnet, not ours: an active xStocks wallet found through
 * the largest SPYx token accounts. Read live each time, never cached.
 */
export const REAL_BOOK = {
  address: "2Z7zhqp1eddmHNmEqexftST6DFPWmoL4QqfgiG5uJMJx",
  label: "A real xStocks wallet",
  blurb: "An active mainnet wallet holding tokenized stocks, crypto and stablecoins, read live, not ours.",
};

/**
 * A real book on mainnet, found through the largest holders of a PreStocks
 * mint: five pre-IPO tokens beside SOL and USDC, not ours, read live.
 */
export const REAL_PRESTOCKS_BOOK = {
  address: "6GJbPKBtovsrMEEMcic5KMi5tswh9qSyT5ZYLMqEwNgt",
  label: "A real PreStocks wallet",
  blurb: "An active mainnet wallet holding five PreStocks pre-IPO tokens, SOL and USDC, read live, not ours.",
};

/**
 * The author's wallet, which keeps a policy and a few snapshots on the
 * program's cluster. Shown read-only when the book on screen is a sample,
 * so the on-chain accounts are real before anyone has signed anything.
 */
export const EXAMPLE_RECORD = {
  address: "HKer2StnsJ5vrNrk8KTSm3VoroqoGbNAGNStNWGJBndp",
  label: "the desk's own book, recorded daily by a workflow",
};
