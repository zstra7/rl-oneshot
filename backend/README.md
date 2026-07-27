# Space Carball — Online Multiplayer Control Plane (N4)

The serverless control plane for online 1v1, per
`plan/ONLINE_MULTIPLAYER_PLAN.md` §4.4. It is **control-only**: no game
state is ever simulated here. Gameplay is peer-to-peer deterministic
lockstep between the two browsers (N2/N3); this Worker only does room
codes, matchmaking, WebRTC signaling relay, and TURN credential minting.

## Architecture

- **`worker.ts`** — a stateless router:
  - `GET /room?code=XXXXX[&create=1]` → the `RoomDO` for that code (WS upgrade)
  - `GET /matchmaking` → the single global `MatchmakingDO` (WS upgrade)
  - `GET /turn-cred` → `{ iceServers }` (STUN always; TURN when configured)
- **`RoomDO`** — one Durable Object per room code. Relays signaling between
  the two peers and starts the match when both send a compatible handshake.
  Thin adapter over the pure **`RoomCore`**.
- **`MatchmakingDO`** — one global Durable Object. FIFO queue that pairs the
  two longest-waiting players and hands them a room code. Thin adapter over
  the pure **`MatchmakingCore`**.
- **`turn.ts`** — mints Cloudflare Realtime TURN credentials server-side
  (falls back to STUN-only when unconfigured).

All room/queue **logic** lives in the pure cores (`RoomCore`,
`MatchmakingCore`, `../src/netcode/lobbyProtocol.ts`) and is covered by the
main repo's vitest suite (`tests/unit/{roomCore,matchmakingCore,lobbyProtocol,turnCred}.spec.ts`).
The Durable Object classes are Cloudflare plumbing, typechecked by
`backend/tsconfig.json`. WebSocket **hibernation** (`acceptWebSocket`) means
idle rooms and the idle queue cost nothing.

### Local integration test (miniflare)

The pure cores are fully unit-tested in the main suite. A full miniflare /
`wrangler dev` integration pass (real WS upgrade, DO routing, relay
round-trip) requires the Cloudflare toolchain and is run locally:

```
cd backend && npm install && npx wrangler dev
# then drive /room and /matchmaking with two WebSocket clients
```

## Free-tier sizing (why this is $0 at friend scale)

Per `plan/ONLINE_MULTIPLAYER_PLAN.md` §3.3–§3.4 / §7:

| Component | Free allowance | Usage @ ~100 matches/day | Cost |
|---|---|---|---|
| Workers requests | 100k/day | a few thousand | $0 |
| Durable Objects | 100k req + 313k GB-s/day, WS hibernation | few thousand req, ~0 duration (idle rooms hibernate) | $0 |
| STUN (`stun.cloudflare.com`) | unlimited | every connection attempt | $0 |
| TURN (Cloudflare Realtime) | 1,000 GB/month | ~15 MB × ~15% of matches ≈ <1 GB/mo | $0 |

Signaling for one match is a few dozen messages; even 1,000 matches/day is
~2 orders of magnitude inside the free tier. First paid step, if ever
needed: Workers Paid, $5/month.

## Deploy runbook (one-time, ~15 min)

1. Create a free Cloudflare account; `npm i -g wrangler && wrangler login`.
2. `cd backend && npm install && wrangler deploy` (Workers free plan; the
   SQLite-backed DO classes are free-plan eligible).
3. (Optional TURN) Enable Cloudflare Realtime in the dashboard, then:
   ```
   wrangler secret put TURN_KEY_ID
   wrangler secret put TURN_API_TOKEN
   ```
   Without these, `/turn-cred` serves STUN-only — still playable for the
   majority of pairings.
4. Point the game client at the deployed Worker via `VITE_MP_CONTROL_URL`
   (N8), or serve the SPA from the same Worker (Workers Assets, also free)
   so it's same-origin `/api`.
