# Afterhours, Stocklana submission notes

*The two-minute version of the [README](../README.md), for judges.*

## One line

The risk desk for tokenized stocks on Solana: what your xStocks can lose
tomorrow, what they've done since Wall Street closed, and how far your
book has drifted from what you meant it to be, read from your wallet,
scored in your browser, recorded on-chain by you.

## Track

**Infrastructure → analytics**, with an Investing edge: the desk turns
drift into rebalance orders with Jupiter prefilled, and the on-chain
policy + breach event is a primitive for **Credit**, a protocol lending
against a stock portfolio can subscribe to "this book left its owner's
stated policy" instead of watching a price.

Also entered for the **PreStocks bounty** ("Best Use of PreStocks"): the
desk reads any wallet's [PreStocks](https://prestocks.com) pre-IPO tokens
(OpenAI, SpaceX, Anthropic, Anduril, Neuralink, Figure AI, Kalshi,
Polymarket) the same way it reads xStocks, no key and no custody, and
prices them live from PreStocks' own API. They sit beside the risk-scored
book, not inside it, on purpose: a private company has no public listing,
so there is no thirty-day series to score it against, and folding it into
the VaR would be a number dressed up past what it knows. Open **A real
PreStocks wallet** to see it on a live mainnet book: five PreStocks tokens,
SOL and USDC, found through the largest holders of the SpaceX token.

## The problem, and why it is a stocks problem

A tokenized share trades 24/7. The share it tracks trades 9:30 to 4:00 ET
on trading days. Between the close and the open the token's price is a
forecast of the reopen, and the holder carries that gap with nobody on
the other side. Brokerage apps show *what you have*; none shows *what you
stand to lose*, and none has ever had to price a share after the bell.

## What a judge will see in sixty seconds

1. Open https://afterhours-v0dr.onrender.com/, the premise, a ring of the
   New York day (the NYSE session as a short bright arc, the rest the hours
   the tokens trade with no market behind them), and the tape: every xStock's
   move since the last close. **Open the desk** lands on a sample book with
   live prices, in an app shell with the ten panels down the left.
2. **Since the close**: each stock's token move since the last official
   print, summed, *the market opens to this*. Under it, every close of
   the last month as a bar, and the share of the book's variance that
   happened while the NYSE was closed.
3. Click **MSTRx** in the holdings: its thirty days with the closed hours
   shaded, every move inside the shading happened with nobody able to
   trade the share.
4. **Stocks, crypto, cash** by share of value vs share of risk, and the
   line "COINx, MSTRx, HOODx, CRCLx are equity on paper … 60% of the book
   is riding crypto beta whatever the sector labels say".
5. **If the market gaps**: S&P −5%, crypto −30%, and the window's own
   worst day and worst close, each position by its beta.
6. **What if**: move half of TSLAx into SPYx, watch the score, VaR, beta
   and effective assets move, instantly, no server.
7. **Target and drift**: pick 60/40, see the drift and the exact sell/buy
   orders, each quoted live on Jupiter with price impact and route. With
   the book's own wallet connected, **Sign and swap** sends the order:
   Jupiter builds it, the wallet signs, mainnet confirms, the desk re-reads.
8. **Your record on Solana**: connect Phantom, save the targets as an
   on-chain policy, record a snapshot; each one an account on devnet.
   Without a wallet, the panel shows the desk's own record: a policy and
   a snapshot a day, written by a workflow after each New York close, one
   of them a breach, drawn against the limit, so the accounts are real
   either way. The bell beside the book's name watches it: a browser
   notification when the move since the close or the risk score crosses
   a line you set.

Paste any address holding xStocks to run it on a real book, or click "A
real xStocks wallet", a $21M mainnet book found through the largest SPYx
token accounts. Every view is a link, with a button to copy it. Number
keys jump between the ten panels; `?` opens the sheet that explains every
figure.

## Where Solana is load-bearing

- Reads: xStocks are Token-2022 mints on mainnet; the page reads any
  wallet's token accounts under both token programs, no custody.
- Writes: the [Afterhours program](https://explorer.solana.com/address/3hqhzG55EkCjhUYmmCxHWyNGkXi3XJSTEWimkTzVifri?cluster=devnet)
`Policy` (targets in bps summing to 10,000, risk limit, drift band)
  and immutable `Snapshot` accounts (score, value, VaR, drift, equity
  share, NYSE open, timestamp), both owned and signed by the wallet they
  describe; `SnapshotRecorded { breached }` on every snapshot under a
  policy.
- Rebalance orders are quoted live on Jupiter for their exact size, what
  the swap fetches on-chain now, its price impact and route, and link to
  Jupiter by mint.

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
- Unpriced holdings are listed, not dropped. A position the feed quotes
  but the model has no series for stays in the book and is named as
  uncovered, with the model's coverage printed beside the VaR. Quotes
  that come from history rather than the feed say so.
- Thinly traded names, where a stale print can sit for hours as a 40%
  jump, are flagged, clipped at ±8% an hour inside the estimators, and
  named on the page. Prices are shown as the feed gave them.
- The VaR is marked against what happened: the page says how many days
  the loss exceeded the forecast, against how many it should have.

## Numbers

- 35 xStocks (every mint verified on mainnet: Token-2022, 8 decimals) +
  SOL, cbBTC, USDC, USDT, USDG · 5 program instructions · 1 event
- 87 app tests (quant, session split, stress, NYSE calendar, universe
  integrity, history loading, Jupiter quotes, portfolio assembly, on-chain
  encoding) + 12 program tests on a local validator, all in CI
- One static page; one hourly Action; one event subscriber; zero servers

## What's next

- Mainnet deployment of the program: one `anchor deploy` from a funded
  keypair, documented in the README. It stays on devnet for judging so
  trying it costs nobody real SOL.
- Dividends and corporate actions, once an issuer feed exists to read.
- The rest of the xStocks catalogue as liquidity arrives, Backed lists
  several hundred; the desk carries the thirty-five with real turnover, and
  a new one is one verified row.

## What is already there that a reader might not expect

- The lending side: `scripts/watch-breaches.mjs` subscribes to the
  program's `SnapshotRecorded` events, decodes them, prints `BREACH` when a
  book leaves its owner's policy, and can POST each one to a webhook when
  `--webhook` or `ALERT_WEBHOOK_URL` names one. The desk's own record
  grows by a snapshot a day from a workflow; no webhook is configured for
  it right now, so that step is proven by the script, not running live.
  Not a one-off test either way: replaying the program's history turns up
  9 real snapshots and 2 real breaches over five days, transcript in the README.
- Sign and swap: a rebalance order executed from the panel, Jupiter's
  transaction signed by the wallet on mainnet.
- Watch this book: browser notifications on a move since the close or a
  risk score past a line.
- Live Jupiter quotes on every proposed rebalance order.
- A print stylesheet: the desk prints as a one-column report.
- Keyboard: `/` address, `1`-`0` panels, `?` help, `t` theme.

## Links

- Site: https://afterhours-v0dr.onrender.com/ · Desk: https://afterhours-v0dr.onrender.com/dashboard/
  (mirror: https://abhist17.github.io/afterhours/)
- Repository: https://github.com/Abhist17/afterhours
- Program (devnet): `3hqhzG55EkCjhUYmmCxHWyNGkXi3XJSTEWimkTzVifri`,
  IDL account `EAtJ4QbGP352arvb6u7J19TF8rRei2uKtoCuFAMARuHh`
- The desk's own record: https://afterhours-v0dr.onrender.com/dashboard/?address=HKer2StnsJ5vrNrk8KTSm3VoroqoGbNAGNStNWGJBndp
- Built by the author of [Sentra](https://github.com/Abhist17/sentra), whose
  estimators this shares (MIT).
