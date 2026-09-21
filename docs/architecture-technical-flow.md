# Afterhours — architecture & technical flow (for the demo videos)

One diagram, one numbered flow. Both videos narrate a subset of this; nothing
in either script claims a step that isn't here.

## Architecture

```
                              +-------------------------------+
                              |        Browser (client)        |
                              |  Next.js static export         |
                              |  /            (landing)        |
                              |  /dashboard/  (the desk)        |
                              +----------------+----------------+
                                                |
      +--------------------+------------------+------------------+--------------------+
      |                    |                  |                  |                    |
      v                    v                  v                  v                    v
Solana mainnet RPC   Price feed(s)     Bundled 30-day      Jupiter API         Wallet adapter
(token accounts,     xStocks feed +    hourly history      (quote + swap)      (Phantom, etc.)
Token-2022 + legacy) PreStocks API     (GH Action ->            |                    |
      |              (pre-IPO tokens)   data branch)            |                    |
      v                    v                  |                 v                    v
 Balances per mint    Live prices             |          Rebalance quotes     Signs: swap tx,
 (35 xStocks +        (xStocks +              |          (price impact,      Policy account,
 SOL/cbBTC/stables +  PreStocks; history       |           route, size)      Snapshot account
 8 PreStocks tokens)  fallback if feed down)   |                 |                    |
      +--------------------+------------------+                 |                    |
                            |                                    |                    |
                            v                                    v                    v
                 In-browser risk engine                  "Sign and swap"      Afterhours program
                 (score, VaR/ES, beta,                    builds + sends tx    (devnet)
                 correlation, drift, shocks)               on mainnet          Policy / Snapshot
                            |                                    |             accounts, owned by
                            v                                    v             the connected wallet
                  Ten dashboard panels             Desk re-reads book                |
                                                     on confirmation                  v
                                                                              SnapshotRecorded
                                                                              { breached } event
                                                                                       |
                                                                                       v
                                                                         scripts/watch-breaches.mjs
                                                                         (subscribes, decodes,
                                                                          optional webhook ->
                                                                          Discord/Slack/Telegram)

  Separate, always-on loop (no browser involved):
  GitHub Action daily-snapshot.yml, after every NYSE close
    -> scores the fixed sample book live
    -> signs with the dedicated recorder keypair
    -> writes a Snapshot to the same devnet program
    -> this is "the desk's own record" panel shows with no wallet connected
```

## Technical flow (numbered, maps 1:1 to narration)

1. **Read.** An address (typed, linked via `?address=`, or a connected
   wallet) is read with `getTokenAccountsByOwner` against both the legacy
   Token Program and Token-2022, summed per verified mint — 35 xStocks,
   8 PreStocks tokens, SOL, cbBTC, stablecoins. No API key, no custody.
2. **Price.** Live prices come from the xStocks feed and, for the 8
   PreStocks tokens, PreStocks' own API. Thirty days of hourly history is
   refreshed by an hourly GitHub Action onto a `data` branch and bundled
   as a fallback if a feed is down.
3. **Score.** Every panel — score, VaR/ES (parametric + historical), beta
   to SPYx, correlation, the 30-day backtest, closed-hours variance share —
   is computed in the browser from that data. Zero servers in this path.
4. **Drift → orders.** A stated Policy (target weights) compared to the
   live book produces buy/sell orders, each quoted live on Jupiter for its
   exact size (price impact, route).
5. **Sign and swap** *(only if the connected wallet owns the book on
   screen)*: Jupiter builds the transaction, the wallet signs, it confirms
   on mainnet, the desk re-reads the book. This is the only step that
   moves money.
6. **Record on Solana** *(only with a connected wallet)*: the wallet signs
   writes to the Afterhours Anchor program on devnet — a `Policy` account
   (targets in bps, risk limit, drift band) and immutable `Snapshot`
   accounts (score, value, VaR, drift, timestamp). Every snapshot recorded
   under a policy emits `SnapshotRecorded { breached }`.
7. **Subscribe.** `scripts/watch-breaches.mjs` follows or replays that
   event, decodes it, prints `BREACH`/`ok`, and can POST to a webhook —
   the credit-primitive path, independent of the browser.
8. **The desk's own record.** Separately, `daily-snapshot.yml` runs after
   every NYSE close, scores a fixed sample book exactly as the page would,
   signs with a keypair that exists only for this, and writes a Snapshot
   to the same devnet program — proof the on-chain loop runs unattended,
   shown on the page with no wallet connected.

PreStocks tokens go through steps 1–3 only, on purpose (see video 2,
1:05–1:35): no public listing means no 30-day series, so they're priced
and shown, never scored into VaR.
