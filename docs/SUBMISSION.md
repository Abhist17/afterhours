# Afterhours — Stocklana submission notes

*The two-minute version of the [README](../README.md), for judges.*

## One line

The risk desk for tokenized stocks on Solana: what your xStocks can lose
tomorrow, what they've done since Wall Street closed, and how far your
book has drifted from what you meant it to be — read from your wallet,
scored in your browser, recorded on-chain by you.

## Track

**Infrastructure → analytics**, with an Investing edge: the desk turns
drift into rebalance orders with Jupiter prefilled, and the on-chain
policy + breach event is a primitive for **Credit** — a protocol lending
against a stock portfolio can subscribe to "this book left its owner's
stated policy" instead of watching a price.

## The problem, and why it is a stocks problem

A tokenized share trades 24/7. The share it tracks trades 9:30–4:00 ET
on trading days. Between the close and the open the token's price is a
forecast of the reopen, and the holder carries that gap with nobody on
the other side. Brokerage apps show *what you have*; none shows *what you
stand to lose*, and none has ever had to price a share after the bell.

## What a judge will see in sixty seconds

1. Open https://abhist17.github.io/afterhours/ — a sample book, live prices,
   the NYSE status pill saying closed/open and when that changes.
2. **Since the close**: each stock's token move since the last official
   print, summed — *the market opens to this*.
3. **Stocks, crypto, cash** by share of value vs share of risk, and the
   line "COINx, MSTRx, HOODx, CRCLx are equity on paper … 60% of the book
   is riding crypto beta whatever the sector labels say".
4. **What if**: move half of TSLAx into SPYx, watch the score, VaR, beta
   and effective assets move — instantly, no server.
5. **Target and drift**: pick 60/40, see the drift and the exact sell/buy
   orders with Jupiter links.
6. **Your record on Solana**: connect Phantom, save the targets as an
   on-chain policy, record a snapshot; each one an account on devnet.
   Without a wallet, the panel shows the author's own record — a policy
   and three snapshots, one in breach — so the accounts are real either way.

Paste any address holding xStocks to run it on a real book.

## Where Solana is load-bearing

- Reads: xStocks are Token-2022 mints on mainnet; the page reads any
  wallet's token accounts under both token programs, no custody.
- Writes: the [Afterhours program](https://explorer.solana.com/address/3hqhzG55EkCjhUYmmCxHWyNGkXi3XJSTEWimkTzVifri?cluster=devnet)
  — `Policy` (targets in bps summing to 10,000, risk limit, drift band)
  and immutable `Snapshot` accounts (score, value, VaR, drift, equity
  share, NYSE open, timestamp), both owned and signed by the wallet they
  describe; `SnapshotRecorded { breached }` on every snapshot under a
  policy.
- Rebalance orders link to Jupiter by mint.

## Architecture: nothing to run

A static export on GitHub Pages. Balances from mainnet in the browser;
prices from the feed; thirty days of hourly history refreshed by a
GitHub Action to a `data` branch and bundled as a fallback; every figure
computed in the tab; on-chain writes signed by the viewer's wallet.
Nothing sleeps, nothing cold-starts.

## What is honest about it

- The sampling interval is measured from the data, the EWMA decay is
  rescaled to it, and both loss models are shown with the larger on top.
- The score is annualised volatility over the calendar the *token* keeps
  (365 days), because that is what the holder is exposed to.
- The backtest is labelled as the current allocation's history, not the
  wallet's; the wallet's record is what it anchors on-chain.
- Every xStock mint was verified on mainnet, which caught a data-source
  error in one token's decimals.
- Unpriced holdings are listed, not dropped. Quotes that come from
  history rather than the feed say so.

## Numbers

- 16 xStocks + SOL, USDC, USDT · 5 program instructions · 1 event
- 39 app tests (quant, NYSE calendar, portfolio assembly, on-chain encoding)
  + 12 program tests on a local validator, all in CI
- One static page; one hourly Action; zero servers

## What's next

- Mainnet deployment of the program (one `anchor deploy`).
- Dividends and corporate actions from the issuer's feed.
- A lending-side consumer of `SnapshotRecorded` — the margin-call bot the
  event was designed for.
- The rest of the xStocks catalogue as liquidity arrives.

## Links

- Desk: https://abhist17.github.io/afterhours/
- Repository: https://github.com/Abhist17/afterhours
- Program (devnet): `3hqhzG55EkCjhUYmmCxHWyNGkXi3XJSTEWimkTzVifri`,
  IDL account `EAtJ4QbGP352arvb6u7J19TF8rRei2uKtoCuFAMARuHh`
- Example record: https://abhist17.github.io/afterhours/?address=4u8ckM2U1GBpizKKDVdnb6wfGtenUECDZCbcLMiBHpFc
- Built by the author of [Sentra](https://github.com/Abhist17/sentra), whose
  estimators this shares (MIT).
