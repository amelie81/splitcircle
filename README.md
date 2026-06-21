# SplitCircle

Shared group expenses for Circles. Track who paid for what on a trip or in a
flat, see a minimal "who owes whom" plan, and (soon) settle every debt with a
single real CRC transfer routed over your Circles trust graph.

This is an **embedded** Circles Mini App — it runs in an iframe inside the
Circles host and signs settlement transfers with the host wallet (no QR, no new
wallet).

## Status

Built in phases (see the build spec). Implemented:

- **Phase A — skeleton & host bridge.** Vite + React + TS app, the Mini App SDK
  wired behind a single bridge module, wallet state reactive to `onWalletChange`.
- **Phase B — domain model.** Net balances, weighted largest-remainder splitting
  (no lost micro-units), and the greedy minimal-settlement algorithm. Fully unit
  tested.
- **Phase C — persistence.** A small Hono backend with a swappable JSON store,
  group/expense/member CRUD, a server-computed balances + settlement plan, and
  HMAC-signed settlement intents.
- **Phase D — on-chain settle.** A debt is cleared with one real CRC transfer
  routed through the trust graph: the Pathfinder finds capacity, the transfer is
  encoded as a Hub V2 flow matrix carrying the signed intent, the host wallet
  signs it, and the backend matcher confirms it by finding that exact intent in
  an on-chain transfer event — never on the frontend's say-so.
- **Phase E — design pass.** "Dusk ledger" type and colour system (Inter +
  Fraunces, light/dark), an animated settlement-graph that shows value travelling
  from you through your Circles connections to the payee, reduced-motion support,
  and live-region accessibility on every async state.

Remaining: **Phase F** — submission polish (this README, the demo script below).

## Run it

```bash
npm install
cp .env.example .env        # set SPLITCIRCLE_HMAC_KEY to a 32-byte hex string
npm test                    # unit tests (35, all green)

npm run server              # backend on :8787
npm run dev                 # frontend on :5190
```

Then open the Circles Mini App Playground and point it at your app:

```
https://circles.gnosis.io/playground
```

The playground is served over HTTPS, so it can only embed an HTTPS app URL — a
plain `http://localhost` dev server is blocked as mixed content. Serve the dev
server over HTTPS (or deploy it) and give the playground that URL.

Opened directly (outside the host) the app shows an "open inside Circles" notice —
that is expected, because the wallet only connects through the host.

## Demo script

A two-minute walk-through for judges, inside the Circles host:

1. **Connect.** Open SplitCircle in the host and tap *Connect* — the host wallet
   authorises the account; no new wallet, no seed phrase.
2. **Create a group** ("Lisbon trip") and **copy the invite link**. Open it as a
   second member to join the same group.
3. **Add expenses.** "Dinner, 30 CRC, paid by Alice, split 3 ways", then "Taxi,
   12 CRC, paid by Bob". The balance card updates to show where each person
   stands, and the *Settle up* card collapses everything into the fewest possible
   transfers.
4. **Settle.** As a debtor, tap *Settle up*. Watch the settlement graph animate as
   the Pathfinder finds a route, the host wallet signs, and the dots travel from
   you to the payee. The leg flips to **Settled** only once the backend matcher
   has found the transfer on-chain — the source of truth is the chain, not the UI.
5. **Refresh** to show the confirmed settlement has cleared the debt from the plan.

## Architecture

- `src/host/bridge.ts` — the **only** module that imports the Mini App SDK.
  Everything else depends on the bridge, never the SDK, which keeps the domain
  logic testable in plain Node.
- `src/domain/` — pure, chain-free, fully tested money math and debt algorithms.
  All amounts are integer micro-CRC (`bigint`, 1 CRC = 1e6 µCRC).
- `src/chain/` — Pathfinder routing and the Hub V2 flow-matrix encoder that turns
  a routed path into an `operateFlowMatrix` call, with the signed intent embedded
  in the transfer `data`. The encoder is isolated and unit tested.
- `server/` — backend store, HMAC intents, and the indexer matcher that is the
  trust boundary: a debt is only marked paid when a matching on-chain transfer is
  found, never on the frontend's say-so. `server/app.ts` builds the Hono app;
  `server/index.ts` serves it locally and `api/index.ts` runs it as a Vercel
  function so the same code powers both.
- `server/store.ts` — swappable persistence: a JSON file locally, Upstash Redis
  (Vercel KV) when its REST credentials are present, behind one async interface.

## Deploy

The whole app runs on Vercel as one origin — the Vite frontend plus the backend
as a serverless function under `/api`, so the client calls it same-origin (no
CORS, no mixed content in the playground).

Required environment variables on the deployment:

| Variable | Purpose |
|---|---|
| `SPLITCIRCLE_HMAC_KEY` | 32-byte hex; signs settlement and invite intents. |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Upstash Redis (Vercel KV) — persists groups. |
| `CIRCLES_RPC_URL` | Circles indexer RPC (defaults to the public node). |
| `PATHFINDER_RPC_URL` | Pathfinder RPC (defaults to the public node). |

Then point the [Circles Playground](https://circles.gnosis.io/playground) at the
deployed HTTPS URL.

## License

MIT — see [LICENSE](LICENSE).
