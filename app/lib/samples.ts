/**
 * Sample books, for a visitor with no xStocks yet — or a reviewer. Labelled
 * synthetic everywhere they appear. The two are chosen to make the
 * product's argument: the first looks diversified across seven tickers and
 * is mostly one bet on crypto beta; the second is fewer names and less risk.
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
];
