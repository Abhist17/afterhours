<div align="center">

# Afterhours

**The risk desk for tokenized stocks on Solana.**
**Markets close; your book doesn't.**

[**Open the desk →**](https://afterhours-v0dr.onrender.com/dashboard/) ·
[About](https://afterhours-v0dr.onrender.com/) ·
[Program on devnet](https://explorer.solana.com/address/3hqhzG55EkCjhUYmmCxHWyNGkXi3XJSTEWimkTzVifri?cluster=devnet) ·
[Submission notes](docs/SUBMISSION.md)

[![CI](https://github.com/Abhist17/afterhours/actions/workflows/ci.yml/badge.svg)](https://github.com/Abhist17/afterhours/actions/workflows/ci.yml)
[![Refresh history](https://github.com/Abhist17/afterhours/actions/workflows/refresh-history.yml/badge.svg)](https://github.com/Abhist17/afterhours/actions/workflows/refresh-history.yml)
[![Deploy](https://github.com/Abhist17/afterhours/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/Abhist17/afterhours/actions/workflows/deploy-pages.yml)

</div>

![The Afterhours desk reading a real $21M xStocks wallet on mainnet: a rail of ten numbered panels, the tape of every xStock's move since the close, risk score, book, one-day VaR, beta to the S&P 500, the move since the last NYSE close, holdings with each position's share of risk beside its weight, a what-if moving half of MSTRx into SPYx, and the book under an S&P 500 −2% shock, position by position](docs/desk.png)

<div align="center">
<sub>A real wallet, not ours — eleven xStocks, cbBTC and stablecoins, read live. MSTRx is 18% of its value and 51% of its risk.</sub>
</div>

---

## The premise

An xStock is a Solana token that tracks a share. The token trades every hour
of every day. The share trades 9:30 to 4:00, New York, on trading days.

Between the close and the next open, the token's price is a forecast of where
the stock will reopen — and the gap between the two is risk the holder carries
with nobody on the other side of the book. On a Friday night, a wallet of
tokenized stocks is a book of positions its underlying market cannot price
until Monday.

Every brokerage app shows *what you have*. None shows *what you stand to
lose* — and none of them has ever had to think about a share that keeps
trading after the bell. Afterhours is the risk desk for that book.

## What it does

Paste a Solana address, or connect a wallet. The desk reads its balances
from mainnet — thirty-five xStocks, plus the SOL, cbBTC and stablecoins that
sit next to them — and scores the book in the browser:

| Panel | What it says |
|:--|:--|
| **Score** | Annualised volatility plus a concentration penalty, 0–100. An index book runs near 18; a single large-cap 30–45; a crypto-heavy book past 60. Every figure on the page is computed in the tab from thirty days of hourly prices. |
| **Value at Risk** | The 95% one-day loss in dollars, with Expected Shortfall — parametric and historical, the more conservative one headlines. |
| **Beta to the S&P 500** | For the book and for every position, on the same estimator, against SPYx. |
| **What you hold** | Every position with a thirty-day sparkline, its share of value beside its share of risk, and — on a click — its full thirty days with the hours the NYSE was closed shaded. |
| **Trading without the market** | While the NYSE is closed: each stock's token move since the last official print, and the sum — *the market opens to this*. Then every close the window had, as bars; then the share of the book's variance that fell in closed hours, per stock, with the per-hour comparison. |
| **Stocks, crypto, cash** | Each sleeve's share of value beside its share of risk. Then the sentence a sector label hides: COIN, MSTR, HOOD, CRCL and the coin-treasury companies (STRC, BMNR, DFDV) are equity on paper and crypto beta in practice, and the desk says what share of the book is really riding crypto. |
| **Thirty days** | The current shape of the book scored at every hour of the window with an estimator that has seen only what was known by then; its value and drawdown on the same axis; and the model marked against what happened — how many days the loss exceeded the VaR. |
| **Correlation** | Thirty days of hourly returns across what is held, plus the index. The most correlated held pair is named. |
| **What if** | Move a quarter, a half or all of any position into any other asset and re-score the whole book, instantly. |
| **If the market gaps** | The book under an S&P 500 or crypto shock, every position by its beta to the factor — and under the worst day and the worst close-to-open the window actually had. A custom shock with two sliders. |
| **Target and drift** | State the allocation you meant to hold. See the drift from it, and the trades that put it back — each one quoted live on Jupiter for its exact size, with price impact, route, and the gap to the feed. |
| **Your record on Solana** | Declare the policy on-chain. Record a snapshot. Both signed by the wallet that owns the book. The snapshots draw as a line against the limit. |
| **Risk and return, name by name** | Every asset the desk knows on a volatility-versus-return map; what is held is solid and sized by weight, the book is the ring, thin names are dashed. |

Four sample books are built in for anyone without xStocks yet, labelled
synthetic, priced live — and one real mainnet wallet, found through the
largest SPYx token accounts and labelled as not ours. Any view is a link:
`?address=<wallet>` or `?book=<sample>`, with `&theme=light` or `dark` if
it matters, and there is a button to copy it.

Above it all sits a ring of the New York day: the six and a half hours the
NYSE is open as a short bright arc, the other seventeen and a half — and
every weekend — as the time the tokens trade with no market behind them,
and a dot for now. A section bar under the top bar names the ten panels
and lights the one in view; the number keys jump to them, `/` goes to the
address, `?` opens the sheet that explains every figure, and every term
on the page carries its definition on hover.

## Where Solana is load-bearing

**Reads.** xStocks are Token-2022 mints on mainnet. The page reads a wallet's
token accounts under both token programs, sums a mint across accounts, and
prices what it recognises. Nothing is custodied; an address is enough.

**Writes.** The [Afterhours program](https://explorer.solana.com/address/3hqhzG55EkCjhUYmmCxHWyNGkXi3XJSTEWimkTzVifri?cluster=devnet)
keeps two accounts per wallet, both owned by that wallet:

| Account | What it holds | Who writes it |
|:--|:--|:--|
| `Policy` | Target weights per mint (basis points, must sum to exactly 10,000), a risk limit, a drift band | The owner |
| `Snapshot` | Score, book value, VaR, drift from policy, share in tokenized stocks, whether the NYSE was open, timestamp — immutable | The owner |

A snapshot recorded under a policy emits `SnapshotRecorded { breached }`. That
event is the primitive a credit protocol lending against a stock portfolio
would subscribe to: not "the price moved" but "this book left its own stated
policy, by its owner's own reading". The subscriber exists:
[`scripts/watch-breaches.mjs`](scripts/watch-breaches.mjs) follows the
program's logs live, or replays its history, decodes every event, and can
POST each breach to a webhook — the margin-call bot, as a hundred lines.

```
$ node scripts/watch-breaches.mjs --history 30
ok      2026-09-12 12:17Z  4u8c…HpFc  score  22  book $14,650  VaR $265  drift 1.8pp  stocks 74%  NYSE closed  (limit 30 · band 5pp)
ok      2026-09-12 12:17Z  4u8c…HpFc  score  27  book $14,910  VaR $312  drift 2.4pp  stocks 75%  NYSE open    (limit 30 · band 5pp)
BREACH  2026-09-12 12:17Z  4u8c…HpFc  score  34  book $14,380  VaR $402  drift 6.1pp  stocks 77%  NYSE closed  (limit 30 · band 5pp) — score 34 > 30
```

The page prepares each transaction; the wallet signs; the page submits it to
the program's cluster. A wallet pointed at the wrong network cannot send it
anywhere else. Only the owner can create, update or close their own record.

The program is deployed on devnet with its IDL published, so Explorer decodes
every account. The author's own wallet keeps an
[example record](https://abhist17.github.io/afterhours/?address=4u8ckM2U1GBpizKKDVdnb6wfGtenUECDZCbcLMiBHpFc)
there — one policy, three snapshots, one of them a breach — written by
[`scripts/example-record.mjs`](scripts/example-record.mjs) through the same
client the page uses.

```
instructions
  create_policy(risk_limit, drift_band_bps, targets[])
  update_policy(risk_limit, drift_band_bps, targets[])
  close_policy()
  record_snapshot(timestamp, score, value_usd_cents, var_usd_cents, drift_bps, equity_bps, market_open)
  close_snapshot()
```

Timestamps are client-chosen so a snapshot's address is derivable before the
write, and checked against the cluster clock (±15 minutes) so nobody can
backfill a flattering history.

## Nothing to run

There is no server. The site is a static export on GitHub Pages, and the
same export serves from a domain root on Render via [`render.yaml`](render.yaml):

- **Balances** — read from mainnet by the browser.
- **Prices** — one request to the feed, every minute, from the browser.
- **History** — thirty days of hourly prices for the whole universe, refreshed
  on the hour by a [GitHub Action](.github/workflows/refresh-history.yml)
  and published as one file on the `data` branch. A copy is bundled with the
  build and paints first; the hourly file takes over when it lands, filled
  from the bundle for anything it lacks, so a first paint never waits on a
  third party and a new listing never sits outside the model.
- **Arithmetic** — every figure on the page is computed in the tab.
- **Quotes for trades** — from Jupiter's public quote endpoint, one request
  per proposed order, from the browser.
- **On-chain** — signed by the viewer's own wallet.

Nothing sleeps, nothing has a cold start, and nothing about a book leaves the
browser except what its owner chooses to sign.

> **On RPCs.** Solana's public mainnet endpoint refuses browser-origin
> token-account queries with a 403, and most keyless alternatives gate them.
> [Solana Vibe Station](https://solanavibestation.com)'s public endpoint
> answers them with CORS open, so it is the default; a build can carry its
> own key as `NEXT_PUBLIC_RPC_URL` (a free [Helius](https://helius.dev) key,
> restricted to the site's domain), and any viewer can paste an endpoint,
> kept in their browser. Each failure falls through to the next.

## The universe

Thirty-five xStocks and five neighbours, in [one table](app/data/universe.json)
that both the app and the refresh script read. Backed lists several hundred
xStocks; these are the ones with real float and turnover on Solana, chosen
from CoinGecko's xStocks category by market cap and volume, so every series
has thirty days of hourly prices behind it. Every mint was checked against
CoinGecko's Solana platform entry and then against the account on mainnet —
owner program and decimals. That found every xStock to be a Token-2022 mint
with 8 decimals, and CoinGecko listing AMDx with 18. A test keeps every row
to that shape.

| Sector | Tickers |
|:--|:--|
| Index | SPYx, QQQx, VTIx |
| Mega-cap tech | AAPLx, MSFTx, GOOGLx, AMZNx, METAx |
| Software | ORCLx, PLTRx, NFLXx |
| Semis | NVDAx, AVGOx, AMDx, INTCx, TSMx, MRVLx, SNDKx |
| EV · aerospace | TSLAx · SPCXx |
| Crypto-linked equity | COINx, MSTRx, HOODx, CRCLx, STRCx, BMNRx, DFDVx |
| Consumer | MCDx, KOx, GMEx |
| Healthcare | LLYx, UNHx |
| Financials · energy | BRK.Bx · XOMx |
| Commodity | GLDx |
| Crypto · cash | SOL, cbBTC · USDC, USDT, USDG |

A wallet's other tokens are counted and named, not priced. A position the
feed quotes but the thirty-day file does not yet cover is kept in the book
at its value and reported as outside the risk model, with the share of the
book the model does cover printed beside the VaR. Adding an xStock is one
verified row.

## How the numbers are made

- **Returns** are hourly, from thirty days of prices; the sampling interval
  is measured from the data's own timestamps, not assumed.
- **Covariance** is exponentially weighted with the RiskMetrics decay,
  rescaled so its memory is seventeen *days* on hourly data rather than
  seventeen hours.
- **VaR** is reported two ways — normal-curve on that covariance, and
  historical simulation on compounded one-day returns — and the larger
  headlines. Expected Shortfall is the mean loss beyond it.
- **Attribution** is Euler allocation: component VaRs sum exactly to the
  total, so "COINx is 15% of value and 22% of risk" is a decomposition, not a
  heuristic.
- **Beta** is covariance with SPYx over its variance, on the same estimator.
- **The score** is annualised volatility — over the 365-day calendar the
  token keeps, since the daily sigma is measured over every calendar day —
  plus a continuous concentration penalty for a dominant position or too few
  effective names. Bands: Calm below 25 (index-fund volatility), Watch to 45
  (a single stock), Elevated to 70 (crypto-grade), Severe above. The page,
  the help sheet and this file all describe the same formula.
- **The backtest** seeds its recursive covariance from the first week's
  sample covariance, so the chart is the book's risk, not the estimator
  filling its memory.
- **Where the moves happen**: every hourly return is sorted by whether the
  NYSE was open in the middle of that hour, and the squared returns in each
  class are summed. The share that fell in closed hours is the premise as a
  number; the per-hour comparison is the fair one, since closed hours
  outnumber open ones nearly three to one. Gaps are the move from the last
  print before a close to the first after the next open.
- **Stress** moves every position by its beta to the shocked factor — SPYx
  or SOL — on the same estimator. The worst day is the current weights
  applied to each asset's actual one-day returns; the worst gap is the
  deepest close-to-open the equities carried.
- **The model check** marks each day's VaR forecast against the book's move
  over the day that followed, in non-overlapping days. About one in twenty
  should breach at 95%.
- **Thin names**: a series in which more than 1% of hours move more than 8%
  is flagged as thinly traded — a stale print can sit for hours as a 40%
  jump — and its hourly returns are clipped at ±8% inside every estimator.
  Prices are never altered, and the page says which names were clipped.
- **Market hours** are computed in `America/New_York` through `Intl`, with
  NYSE holidays and early closes through 2027, so daylight saving is the
  platform's problem.

The estimators share their design with the author's earlier engine,
[Sentra](https://github.com/Abhist17/sentra) (MIT). Beta, the backtest, drift,
market hours and everything about stocks are new here.

## Development

```bash
git clone https://github.com/Abhist17/afterhours
cd afterhours/app
npm install
npm run dev                 # http://localhost:3000
npm test                    # 82 tests: quant, sessions, scenarios, market hours, universe, history, Jupiter, portfolio, on-chain
npm run build               # static export to out/

cd ..
node scripts/refresh-history.mjs   # rebuild app/public/data/history.json
anchor test                        # 12 program tests on a local validator
anchor build && anchor deploy --provider.cluster devnet   # ~1.1 SOL of rent
node scripts/example-record.mjs    # a policy and three snapshots from ~/.config/solana/id.json
node scripts/watch-breaches.mjs    # follow SnapshotRecorded live; --history N replays; --webhook URL alerts
```

### Going to mainnet

The program is cluster-agnostic and `Anchor.toml` names the same id for
localnet, devnet and mainnet, so the move is one deploy from a funded
keypair — about 1.1 SOL of rent for the program account, plus a few cents
per policy or snapshot for whoever writes them:

```bash
anchor build && anchor deploy --provider.cluster mainnet
anchor idl init --provider.cluster mainnet -f target/idl/afterhours.json 3hqhzG55EkCjhUYmmCxHWyNGkXi3XJSTEWimkTzVifri
```

Then point the site at it by setting `NEXT_PUBLIC_PROGRAM_RPC_URL` to a
mainnet endpoint in the deploy workflow; the page reads the cluster from
the URL, labels it, and sends nothing anywhere else. It stays on devnet
for the hackathon so that trying it costs nobody real SOL.

| Layer | Technology |
|:--|:--|
| App | Next.js 16 static export · React 19 · Tailwind 4 · Geist, Geist Mono, Pixelify Sans · hand-rolled SVG · a landing page at `/` and the desk at `/dashboard/` |
| Wallet | Wallet Standard via `@solana/wallet-adapter-react` |
| Program | Rust · Anchor 0.32 |
| Data | Solana mainnet RPC · CoinGecko · Jupiter quote API · GitHub Actions |

## Not investment advice

Every figure is a model estimate built from thirty days of prices. Value at
Risk assumes tomorrow rhymes with the recent past; a model that has never
seen a crash cannot price one. xStocks are issued by Backed Finance;
Afterhours is unaffiliated with them, with the exchanges, and with the
companies whose shares the tokens track.
